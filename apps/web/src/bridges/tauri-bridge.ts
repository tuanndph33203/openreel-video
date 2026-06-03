import { invoke, convertFileSrc } from "@tauri-apps/api/core";

/**
 * Checks if the application is running inside the Tauri native desktop wrapper.
 */
export function isTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
}

/**
 * Resolves the display source URL for a given media item.
 * Streams zero-copy from disk via Tauri's custom asset protocol in Tauri mode.
 */
export function getMediaSourceUrl(mediaItem: { filePath?: string; blob?: Blob | null; originalUrl?: string | null }): string | null {
  if (isTauri() && mediaItem.filePath) {
    return convertFileSrc(mediaItem.filePath);
  }
  if (mediaItem.blob) {
    return URL.createObjectURL(mediaItem.blob);
  }
  return mediaItem.originalUrl || null;
}

/**
 * Safe invoker for Tauri native commands.
 */
export async function invokeTauri<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (!isTauri()) {
    throw new Error("Tauri native environment not detected.");
  }
  return invoke<T>(cmd, args);
}

export interface ProcessedMedia {
  id: string;
  name: string;
  type: "video" | "audio" | "image";
  blob: Blob;
  metadata: {
    duration: number;
    width: number;
    height: number;
    frameRate: number;
    codec: string;
    sampleRate: number;
    channels: number;
    fileSize: number;
    hasVideo: boolean;
    hasAudio: boolean;
  };
  thumbnails: { timestamp: number; dataUrl: string }[];
  waveformData: { peaks: Float32Array; duration: number; samplesPerSecond: number } | null;
}

/**
 * High-performance native media importer.
 * Calls native FFmpeg / FFprobe backend to extract metadata, waveform peaks, and frame thumbnails
 * in under a second with ZERO-copy overhead, bypassing browser memory limitations entirely.
 */
export async function tauriImportMedia(filePath: string, fileName: string, fileSize: number, fileMimeType: string): Promise<ProcessedMedia> {
  const isImage = fileMimeType.startsWith("image/");
  
  let metadata: any = {
    duration: 0,
    width: 0,
    height: 0,
    frameRate: 0,
    codec: "",
    sampleRate: 0,
    channels: 0,
    fileSize,
    hasVideo: false,
    hasAudio: false,
  };
  
  let thumbnails: { timestamp: number; dataUrl: string }[] = [];
  let waveformData: any = null;
  
  if (isImage) {
    const imgUrl = convertFileSrc(filePath);
    const img = new Image();
    img.src = imgUrl;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image dimensions"));
    });
    metadata.width = img.naturalWidth;
    metadata.height = img.naturalHeight;
    metadata.hasVideo = false;
    metadata.hasAudio = false;
  } else {
    try {
      const probeData: any = await invokeTauri("extract_metadata", { path: filePath });
      const format = probeData.format || {};
      const streams = probeData.streams || [];
      const videoStream = streams.find((s: any) => s.codec_type === "video");
      const audioStream = streams.find((s: any) => s.codec_type === "audio");
      
      let frameRate = 30;
      if (videoStream && videoStream.r_frame_rate) {
        const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
        if (num && den) frameRate = num / den;
      }
      
      metadata = {
        duration: parseFloat(format.duration) || 0,
        width: videoStream ? videoStream.width : 0,
        height: videoStream ? videoStream.height : 0,
        frameRate,
        codec: videoStream ? videoStream.codec_name : (audioStream ? audioStream.codec_name : ""),
        sampleRate: audioStream ? parseInt(audioStream.sample_rate) : 0,
        channels: audioStream ? audioStream.channels : 0,
        fileSize: parseInt(format.size) || fileSize,
        hasVideo: !!videoStream,
        hasAudio: !!audioStream,
      };

      if (metadata.hasVideo) {
        try {
          const thumbB64 = await invokeTauri<string>("generate_thumbnail", {
            path: filePath,
            time: Math.min(metadata.duration * 0.1, 1.0),
            width: 160,
          });
          thumbnails.push({ timestamp: 0, dataUrl: thumbB64 });
        } catch (err) {
          console.warn("Failed to extract native thumbnail:", err);
        }
      }

      if (metadata.hasAudio) {
        try {
          const samplesPerSecond = 100;
          const peaks = await invokeTauri<number[]>("generate_waveform", {
            path: filePath,
            samplesPerSecond,
          });
          waveformData = {
            peaks: new Float32Array(peaks),
            duration: metadata.duration,
            samplesPerSecond,
          };
        } catch (err) {
          console.warn("Failed to extract native audio waveform:", err);
        }
      }
    } catch (err) {
      console.error("Native metadata extraction failed, falling back to basic metadata:", err);
    }
  }
  
  // For audio/video files, extract the audio track as WAV bytes using native FFmpeg.
  // This avoids loading the entire file into browser memory while giving the audio engine
  // real audio data it can decode via decodeAudioData().
  // Limit to files <= 10 minutes to avoid extracting very large WAV files for long videos.
  // Files over 10 minutes use the segmented audio decoder which streams from the filePath directly.
  const MAX_AUDIO_EXTRACT_DURATION = 600; // 10 minutes in seconds
  let fileBlob: Blob = new Blob([], { type: fileMimeType });
  if (!isImage && metadata.hasAudio && metadata.duration <= MAX_AUDIO_EXTRACT_DURATION) {
    try {
      const wavBytes: number[] = await invokeTauri<number[]>("extract_audio_as_wav", {
        path: filePath,
        audioTrackIndex: 0,
      });
      if (wavBytes && wavBytes.length > 0) {
        fileBlob = new Blob([new Uint8Array(wavBytes)], { type: "audio/wav" });
        console.log(`[tauriImportMedia] Extracted audio WAV blob: ${fileBlob.size} bytes for ${fileName}`);
      }
    } catch (err) {
      console.warn(`[tauriImportMedia] Native audio extraction failed, audio playback may not work:`, err);
    }
  } else if (!isImage && metadata.hasAudio && metadata.duration > MAX_AUDIO_EXTRACT_DURATION) {
    console.log(`[tauriImportMedia] File ${fileName} is ${metadata.duration.toFixed(0)}s (> ${MAX_AUDIO_EXTRACT_DURATION}s), using segmented audio decoding via filePath.`);
  }

  return {
    id: "",
    name: fileName,
    type: isImage ? "image" : (metadata.hasVideo ? "video" : "audio"),
    blob: fileBlob,
    metadata,
    thumbnails,
    waveformData,
  };
}

/**
 * Triggers proxy video generation for high resolution video.
 */
export async function tauriGenerateProxy(filePath: string, proxyPath: string): Promise<void> {
  if (!isTauri()) return;
  try {
    await invokeTauri("generate_proxy", { inputPath: filePath, outputPath: proxyPath });
    console.log(`[tauriGenerateProxy] Successfully generated proxy at ${proxyPath}`);
  } catch (err) {
    console.error(`[tauriGenerateProxy] Failed to generate proxy:`, err);
    throw err;
  }
}

