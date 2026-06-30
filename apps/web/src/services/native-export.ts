import {
  DEFAULT_VIDEO_SETTINGS,
  getExportEngine,
  getVideoEngine,
  type ExportResult,
  type Project,
  type VideoExportSettings,
} from "@openreel/core";
import { invokeTauri, isTauri } from "../bridges/tauri-bridge";

export interface NativeExportProgress {
  phase: "preparing" | "rendering" | "encoding" | "muxing" | "complete";
  progress: number;
  detail?: string;
}

interface NativeVideoExportOptions {
  outputPath: string;
  project: Project;
  settings: Partial<VideoExportSettings>;
  signal?: AbortSignal;
  onProgress?: (progress: NativeExportProgress) => void;
}

interface ActiveFfmpegSession {
  finished: boolean;
  id: string;
}

const PRORES_PROFILE_MAP: Record<
  NonNullable<VideoExportSettings["proresProfile"]>,
  string
> = {
  proxy: "0",
  lt: "1",
  standard: "2",
  hq: "3",
  "4444": "4",
  "4444xq": "5",
};

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Native export cancelled", "AbortError");
  }
}

function reportProgress(
  callback: NativeVideoExportOptions["onProgress"],
  phase: NativeExportProgress["phase"],
  progress: number,
  detail?: string,
): void {
  callback?.({
    phase,
    progress: Math.max(0, Math.min(1, progress)),
    detail,
  });
}

function roundMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function logNativeExport(message: string, extra?: Record<string, unknown>): void {
  if (extra) {
    console.info(`[native-export] ${message}`, extra);
  } else {
    console.info(`[native-export] ${message}`);
  }
}

function calculateTimelineDuration(project: Project): number {
  let maxEndTime = 0;

  for (const track of project.timeline.tracks || []) {
    for (const clip of track.clips || []) {
      const endTime = clip.startTime + clip.duration;
      if (endTime > maxEndTime) {
        maxEndTime = endTime;
      }
    }
  }

  for (const textClip of project.textClips || []) {
    const endTime = textClip.startTime + textClip.duration;
    if (endTime > maxEndTime) {
      maxEndTime = endTime;
    }
  }

  for (const shapeClip of project.shapeClips || []) {
    const endTime = shapeClip.startTime + shapeClip.duration;
    if (endTime > maxEndTime) {
      maxEndTime = endTime;
    }
  }

  for (const svgClip of project.svgClips || []) {
    const endTime = svgClip.startTime + svgClip.duration;
    if (endTime > maxEndTime) {
      maxEndTime = endTime;
    }
  }

  for (const stickerClip of project.stickerClips || []) {
    const endTime = stickerClip.startTime + stickerClip.duration;
    if (endTime > maxEndTime) {
      maxEndTime = endTime;
    }
  }

  for (const subtitle of project.timeline.subtitles || []) {
    if (subtitle.endTime > maxEndTime) {
      maxEndTime = subtitle.endTime;
    }
  }

  return maxEndTime;
}

async function blobToBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function createFrameCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement | OffscreenCanvas; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create frame canvas context");
    }
    return { canvas, ctx };
  }

  if (typeof OffscreenCanvas !== "undefined") {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Failed to create offscreen frame canvas context");
    }
    return { canvas, ctx };
  }

  throw new Error("No canvas available for raw frame export");
}

function imageBitmapToRgbaBytes(
  image: ImageBitmap,
  width: number,
  height: number,
  frameCanvas: HTMLCanvasElement | OffscreenCanvas,
  frameCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
): Uint8Array {
  if (frameCanvas.width !== width) {
    frameCanvas.width = width;
  }
  if (frameCanvas.height !== height) {
    frameCanvas.height = height;
  }

  frameCtx.clearRect(0, 0, width, height);
  frameCtx.drawImage(image, 0, 0, width, height);

  const imageData = frameCtx.getImageData(0, 0, width, height);
  return new Uint8Array(imageData.data.buffer.slice(0));
}

function createFfmpegSessionId(): string {
  return `openreel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getVideoCodecArgs(settings: VideoExportSettings): string[] {
  switch (settings.codec) {
    case "h265":
      return [
        "-c:v",
        "libx265",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-b:v",
        `${settings.bitrate}k`,
      ];
    case "vp8":
      return [
        "-c:v",
        "libvpx",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        `${settings.bitrate}k`,
      ];
    case "vp9":
      return [
        "-c:v",
        "libvpx-vp9",
        "-pix_fmt",
        "yuv420p",
        "-b:v",
        `${settings.bitrate}k`,
      ];
    case "av1":
      return [
        "-c:v",
        "libaom-av1",
        "-pix_fmt",
        "yuv420p",
        "-cpu-used",
        "4",
        "-b:v",
        `${settings.bitrate}k`,
      ];
    case "prores":
      return [
        "-c:v",
        "prores_ks",
        "-profile:v",
        PRORES_PROFILE_MAP[settings.proresProfile || "hq"],
        "-pix_fmt",
        "yuv422p10le",
      ];
    case "h264":
    default:
      return [
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-preset",
        "medium",
        "-b:v",
        `${settings.bitrate}k`,
      ];
  }
}

function getAudioArgs(settings: VideoExportSettings, hasAudio: boolean): string[] {
  if (!hasAudio) {
    return ["-an"];
  }

  if (settings.format === "webm") {
    return [
      "-c:a",
      "libopus",
      "-b:a",
      `${settings.audioSettings.bitrate}k`,
      "-ar",
      String(settings.audioSettings.sampleRate),
    ];
  }

  return [
    "-c:a",
    "aac",
    "-b:a",
    `${settings.audioSettings.bitrate}k`,
    "-ar",
    String(settings.audioSettings.sampleRate),
  ];
}

function getContainerArgs(settings: VideoExportSettings): string[] {
  if (settings.format === "mp4") {
    return ["-movflags", "+faststart"];
  }
  return [];
}

async function writeBytesToPath(path: string, bytes: Uint8Array): Promise<void> {
  await invokeTauri("write_binary_file", {
    path,
    bytes: Array.from(bytes),
  });
}

async function writeBlobToPath(path: string, blob: Blob): Promise<void> {
  await writeBytesToPath(path, await blobToBytes(blob));
}

async function exportAudioToTempWav(
  project: Project,
  tempDir: string,
  settings: VideoExportSettings,
  signal?: AbortSignal,
  onProgress?: NativeVideoExportOptions["onProgress"],
): Promise<string | null> {
  const exportEngine = getExportEngine();
  const generator = exportEngine.exportAudio(project, {
    format: "wav",
    sampleRate: settings.audioSettings.sampleRate,
    channels: settings.audioSettings.channels,
    bitDepth: settings.audioSettings.bitDepth,
  });

  let finalResult: ExportResult | undefined;
  while (true) {
    throwIfAborted(signal);
    const { value, done } = await generator.next();
    if (done) {
      finalResult = value;
      break;
    }
    reportProgress(onProgress, "preparing", value.progress * 0.15);
  }

  if (finalResult?.success && finalResult.blob) {
    const audioPath = `${tempDir}/audio.wav`;
    await writeBlobToPath(audioPath, finalResult.blob);
    return audioPath;
  }

  const message = finalResult?.error?.message || "";
  if (message.includes("No audio to export")) {
    return null;
  }

  throw new Error(finalResult?.error?.message || "Native audio preparation failed");
}

export async function exportVideoWithNativeBackend(
  options: NativeVideoExportOptions,
): Promise<void> {
  if (!isTauri()) {
    throw new Error("Native export backend is only available in Tauri.");
  }

  const { outputPath, project, signal, onProgress } = options;
  const settings: VideoExportSettings = {
    ...DEFAULT_VIDEO_SETTINGS,
    ...options.settings,
    audioSettings: {
      ...DEFAULT_VIDEO_SETTINGS.audioSettings,
      ...options.settings.audioSettings,
    },
  };

  const exportEngine = getExportEngine();
  const videoEngine = getVideoEngine();

  if (!exportEngine.isInitialized()) {
    await exportEngine.initialize();
  }
  if (!videoEngine.isInitialized()) {
    await videoEngine.initialize();
  }

  const timelineDuration = calculateTimelineDuration(project);
  if (timelineDuration <= 0) {
    throw new Error("Timeline is empty. Add clips before exporting.");
  }

  const totalFrames = Math.ceil(timelineDuration * settings.frameRate);
  const tempDir = await invokeTauri<string>("create_temp_dir", {
    prefix: "openreel-export",
  });
  const ffmpegSession: ActiveFfmpegSession = {
    finished: false,
    id: createFfmpegSessionId(),
  };
  const exportStart = performance.now();
  const frameLogInterval = Math.max(1, Math.round(settings.frameRate));
  let audioPrepMs = 0;
  let gpuInitMs = 0;
  let ffmpegStartMs = 0;
  let ffmpegFinalizeMs = 0;
  let renderTotalMs = 0;
  let rgbaTotalMs = 0;
  let writeTotalMs = 0;
  let renderMaxMs = 0;
  let rgbaMaxMs = 0;
  let writeMaxMs = 0;

  try {
    reportProgress(onProgress, "preparing", 0, "starting");
    logNativeExport("start", {
      outputPath,
      totalFrames,
      width: settings.width,
      height: settings.height,
      frameRate: settings.frameRate,
      codec: settings.codec,
      format: settings.format,
    });
    const audioPrepStart = performance.now();
    const audioPath = await exportAudioToTempWav(
      project,
      tempDir,
      settings,
      signal,
      onProgress,
    );
    audioPrepMs = performance.now() - audioPrepStart;
    logNativeExport("audio prepared", {
      hasAudio: Boolean(audioPath),
      ms: roundMs(audioPrepMs),
    });

    throwIfAborted(signal);
    const gpuInitStart = performance.now();
    await videoEngine.initializeGPUCompositor(settings.width, settings.height).catch(
      () => {},
    );
    gpuInitMs = performance.now() - gpuInitStart;
    videoEngine.resetExportState();
    videoEngine.exportMode = true;
    logNativeExport("gpu/export state ready", { ms: roundMs(gpuInitMs) });

    const ffmpegArgs = [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s:v",
      `${settings.width}x${settings.height}`,
      "-r",
      String(settings.frameRate),
      "-i",
      "pipe:0",
    ];

    if (audioPath) {
      ffmpegArgs.push("-i", audioPath);
    }

    ffmpegArgs.push(...getVideoCodecArgs(settings));
    ffmpegArgs.push(...getAudioArgs(settings, Boolean(audioPath)));

    if (audioPath) {
      ffmpegArgs.push("-shortest");
    }

    ffmpegArgs.push(...getContainerArgs(settings));
    ffmpegArgs.push(outputPath);

    const ffmpegStart = performance.now();
    await invokeTauri("start_ffmpeg_session", {
      sessionId: ffmpegSession.id,
      args: ffmpegArgs,
    });
    ffmpegStartMs = performance.now() - ffmpegStart;
    logNativeExport("ffmpeg session started", {
      sessionId: ffmpegSession.id,
      ms: roundMs(ffmpegStartMs),
    });

    const { canvas: frameCanvas, ctx: frameCtx } = createFrameCanvas(
      settings.width,
      settings.height,
    );

    for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
      throwIfAborted(signal);
      const time = frameIndex / settings.frameRate;
      const renderStart = performance.now();
      const rendered = await videoEngine.renderFrame(
        project,
        time,
        settings.width,
        settings.height,
      );
      const renderMs = performance.now() - renderStart;
      renderTotalMs += renderMs;
      renderMaxMs = Math.max(renderMaxMs, renderMs);

      try {
        let bytes: Uint8Array;
        let rgbaMs = 0;
        try {
          const rgbaStart = performance.now();
          bytes = imageBitmapToRgbaBytes(
            rendered.image,
            settings.width,
            settings.height,
            frameCanvas,
            frameCtx,
          );
          rgbaMs = performance.now() - rgbaStart;
          rgbaTotalMs += rgbaMs;
          rgbaMaxMs = Math.max(rgbaMaxMs, rgbaMs);
        } catch (error) {
          throw new Error(
            `Frame ${frameIndex + 1}/${totalFrames} RGBA conversion failed: ${formatErrorMessage(error)}`,
          );
        }

        let writeMs = 0;
        try {
          const writeStart = performance.now();
          await invokeTauri("write_ffmpeg_session_chunk", {
            sessionId: ffmpegSession.id,
            chunk: bytes,
          });
          writeMs = performance.now() - writeStart;
          writeTotalMs += writeMs;
          writeMaxMs = Math.max(writeMaxMs, writeMs);
        } catch (error) {
          throw new Error(
            `Frame ${frameIndex + 1}/${totalFrames} ffmpeg pipe write failed: ${formatErrorMessage(error)}`,
          );
        }

        if (
          frameIndex === 0 ||
          frameIndex === totalFrames - 1 ||
          (frameIndex + 1) % frameLogInterval === 0
        ) {
          const framesDone = frameIndex + 1;
          const avgRenderMs = renderTotalMs / framesDone;
          const avgRgbaMs = rgbaTotalMs / framesDone;
          const avgWriteMs = writeTotalMs / framesDone;
          const detail = `f ${framesDone}/${totalFrames} r ${roundMs(avgRenderMs)}ms rgba ${roundMs(avgRgbaMs)}ms pipe ${roundMs(avgWriteMs)}ms`;
          reportProgress(
            onProgress,
            "rendering",
            0.15 + (framesDone / totalFrames) * 0.75,
            detail,
          );
          logNativeExport("frame batch", {
            frame: framesDone,
            totalFrames,
            renderMs: roundMs(renderMs),
            rgbaMs: roundMs(rgbaMs),
            writeMs: roundMs(writeMs),
            avgRenderMs: roundMs(avgRenderMs),
            avgRgbaMs: roundMs(avgRgbaMs),
            avgWriteMs: roundMs(avgWriteMs),
          });
          continue;
        }
      } finally {
        rendered.image.close();
      }

      reportProgress(
        onProgress,
        "rendering",
        0.15 + ((frameIndex + 1) / totalFrames) * 0.75,
      );
    }

    throwIfAborted(signal);
    reportProgress(
      onProgress,
      "encoding",
      0.92,
      `avg render ${roundMs(renderTotalMs / totalFrames)}ms, pipe ${roundMs(writeTotalMs / totalFrames)}ms`,
    );

    reportProgress(onProgress, "muxing", 0.97, "finalizing ffmpeg");
    try {
      const ffmpegFinalizeStart = performance.now();
      await invokeTauri("finish_ffmpeg_session", {
        sessionId: ffmpegSession.id,
      });
      ffmpegFinalizeMs = performance.now() - ffmpegFinalizeStart;
      ffmpegSession.finished = true;
    } catch (error) {
      throw new Error(`FFmpeg encode failed: ${formatErrorMessage(error)}`);
    }
    const totalMs = performance.now() - exportStart;
    logNativeExport("complete", {
      totalMs: roundMs(totalMs),
      audioPrepMs: roundMs(audioPrepMs),
      gpuInitMs: roundMs(gpuInitMs),
      ffmpegStartMs: roundMs(ffmpegStartMs),
      ffmpegFinalizeMs: roundMs(ffmpegFinalizeMs),
      avgRenderMs: roundMs(renderTotalMs / totalFrames),
      avgRgbaMs: roundMs(rgbaTotalMs / totalFrames),
      avgWriteMs: roundMs(writeTotalMs / totalFrames),
      maxRenderMs: roundMs(renderMaxMs),
      maxRgbaMs: roundMs(rgbaMaxMs),
      maxWriteMs: roundMs(writeMaxMs),
    });
    reportProgress(
      onProgress,
      "complete",
      1,
      `done ${roundMs(totalMs / 1000)}s | render ${roundMs(renderTotalMs / totalFrames)}ms | pipe ${roundMs(writeTotalMs / totalFrames)}ms`,
    );
  } finally {
    videoEngine.exportMode = false;
    if (!ffmpegSession.finished) {
      try {
        await invokeTauri("abort_ffmpeg_session", {
          sessionId: ffmpegSession.id,
        });
      } catch (error) {
        console.warn("[native-export] Failed to abort ffmpeg session:", error);
      }
    }
    try {
      await invokeTauri("remove_path", { path: tempDir });
    } catch (error) {
      console.warn("[native-export] Failed to remove temp directory:", error);
    }
  }
}
