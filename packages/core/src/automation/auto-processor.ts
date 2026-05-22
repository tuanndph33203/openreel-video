import { ExportEngine } from '../export/export-engine';
import type { Project, MediaItem } from '../types/project';
import type { Clip } from '../types/timeline';

export interface AutomationCallbacks {
  generateCaptions?: (mediaItem: MediaItem, project: Project) => Promise<any[]>;
  generateTTS?: (subtitles: any[], project: Project) => Promise<any[]>;
  onProgress?: (projectId: string, phase: string, progress: number) => void;
}

/**
 * Handles a FIFO queue of video files for a single project.
 * For each file it:
 *   1. Clones the current project.
 *   2. Finds the longest video clip in the timeline.
 *   3. Replaces that clip's MediaItem with the new file.
 *   4. Calls ExportEngine to render the video to a user‑chosen location.
 */
export class AutoProcessor {
  private readonly project: Project;
  private readonly folderHandle: FileSystemDirectoryHandle;
  private readonly exportEngine: ExportEngine;
  private readonly callbacks?: AutomationCallbacks;
  private queue: FileSystemFileHandle[] = [];
  private processing = false;
  private currentPhase = "";
  private currentProgress = 0;

  constructor(
    project: Project,
    folderHandle: FileSystemDirectoryHandle,
    exportEngine: ExportEngine,
    callbacks?: AutomationCallbacks,
  ) {
    this.project = project;
    this.folderHandle = folderHandle;
    this.exportEngine = exportEngine;
    this.callbacks = callbacks;
  }

  /** Enqueue a new file to be processed. */
  enqueue(fileHandle: FileSystemFileHandle) {
    this.queue.push(fileHandle);
    this.runQueue();
  }

  /** Return current queue length. */
  getQueueLength(): number {
    return this.queue.length;
  }

  /** Return whether a job is currently being processed. */
  isProcessing(): boolean {
    return this.processing;
  }
  
  getProgressState(): { phase: string; percent: number } {
    return { phase: this.currentPhase, percent: this.currentProgress };
  }

  private async runQueue() {
    if (this.processing) return; // already working
    if (this.queue.length === 0) return;

    this.processing = true;
    const fileHandle = this.queue.shift()!;
    try {
      const clonedProject = structuredClone(this.project) as Project;
      const config = clonedProject.settings.automationConfig;

      const reportProgress = (phase: string, progress: number) => {
        this.currentPhase = phase;
        this.currentProgress = progress;
        if (this.callbacks?.onProgress) {
          this.callbacks.onProgress(clonedProject.id, phase, progress);
        }
      };

      reportProgress("Processing Video", 10);
      
      let newMediaItem;
      try {
        newMediaItem = await this.replaceMainClip(clonedProject, fileHandle);
      } catch (err) {
        console.error("[AutoProcessor] Error in replaceMainClip:", err);
        throw new Error(`[replaceMainClip] ${(err as Error).message}\nStack: ${(err as Error).stack}`);
      }

      // AI Pipeline
      let newSubtitles: any[] = [];
      if (config?.autoCaption && this.callbacks?.generateCaptions) {
        reportProgress("Generating Captions", 30);
        try {
          newSubtitles = await this.callbacks.generateCaptions(newMediaItem, clonedProject);
          if (!(clonedProject.timeline as any).subtitles) {
            (clonedProject.timeline as any).subtitles = [];
          }
          (clonedProject.timeline as any).subtitles.push(...newSubtitles);
        } catch (err) {
          console.error("[AutoProcessor] Error in generateCaptions:", err);
          throw new Error(`[generateCaptions] ${(err as Error).message}\nStack: ${(err as Error).stack}`);
        }
      }

      if (config?.tts && this.callbacks?.generateTTS && newSubtitles.length > 0) {
        reportProgress("Synthesizing Voice", 60);
        try {
          await this.callbacks.generateTTS(newSubtitles, clonedProject);
        } catch (err) {
          console.error("[AutoProcessor] Error in generateTTS:", err);
          throw new Error(`[generateTTS] ${(err as Error).message}\nStack: ${(err as Error).stack}`);
        }
      }

      reportProgress("Exporting", 80);

      // Automatically save to the watched folder (under an "output" directory or directly in the folder)
      let outputDirHandle: FileSystemDirectoryHandle;
      try {
        outputDirHandle = await this.folderHandle.getDirectoryHandle("output", { create: true });
      } catch (e) {
        // Fallback to saving directly in the watched folder
        outputDirHandle = this.folderHandle;
      }
      
      // Determine output name from original input file name
      const originalName = fileHandle.name.substring(0, fileHandle.name.lastIndexOf('.')) || fileHandle.name;
      const outputFilename = `${originalName}_edited.mp4`;
      
      const saveHandle = await outputDirHandle.getFileHandle(outputFilename, { create: true });
      const writable = await (saveHandle as any).createWritable();
      
      // Initialize export engine if needed (loads WASM/ffmpeg/mediabunny etc.)
      try {
        if (!this.exportEngine.isInitialized()) {
          await this.exportEngine.initialize();
        }
      } catch (err) {
        console.error("[AutoProcessor] Error in exportEngine.initialize:", err);
        throw new Error(`[initializeExportEngine] ${(err as Error).message}\nStack: ${(err as Error).stack}`);
      }

      // Sanitize clonedProject timeline to prevent Infinity/NaN values crashing the AudioEngine
      if (clonedProject.timeline && clonedProject.timeline.tracks) {
        const fallbackDuration = (typeof newMediaItem?.metadata?.duration === 'number' && Number.isFinite(newMediaItem.metadata.duration) && newMediaItem.metadata.duration > 0) ? newMediaItem.metadata.duration : 10;
        
        if (!Number.isFinite(clonedProject.timeline.duration)) {
          (clonedProject.timeline as any).duration = fallbackDuration;
        }

        clonedProject.timeline.tracks.forEach(track => {
          if (track.clips) {
            track.clips.forEach(clip => {
              if (!Number.isFinite(clip.duration)) {
                (clip as any).duration = fallbackDuration;
              }
              if (!Number.isFinite(clip.startTime)) {
                (clip as any).startTime = 0;
              }
              if (!Number.isFinite(clip.inPoint)) {
                (clip as any).inPoint = 0;
              }
            });
          }
        });
      }

      // Run export (generator) and write to the stream
      let exportGen;
      try {
        exportGen = this.exportEngine.exportVideo(clonedProject, {}, writable);
      } catch (err) {
        console.error("[AutoProcessor] Error starting exportVideo:", err);
        throw new Error(`[createExportVideoGenerator] ${(err as Error).message}\nStack: ${(err as Error).stack}`);
      }
      
      let finalResult: any = undefined;
      try {
        while (true) {
          const { value, done } = await exportGen.next();
          if (done) {
            finalResult = value;
            break;
          }
          if (value) {
            const percent = 80 + (value.progress ?? 0) * 20;
            reportProgress("Exporting", percent);
          }
        }

        if (finalResult && !finalResult.success) {
          throw new Error(finalResult.error?.message || "Export failed");
        }
      } catch (err) {
        console.error("[AutoProcessor] Error running exportVideo generator:", err);
        try {
          await writable.abort();
        } catch (_) {}
        throw new Error(`[runExportVideoGenerator] ${(err as Error).message}\nStack: ${(err as Error).stack}`);
      }
    } catch (e) {
      console.error('[AutoProcessor] processing error', e);
      this.currentPhase = `Error: ${(e as Error).message}`;
      
      // Send error to the terminal via dev server proxy
      try {
        fetch("/api/log-error", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: `[AutoProcessor ${this.project.id}] Lỗi: ${(e as Error).message}`,
            stack: (e as Error).stack,
          }),
        }).catch(() => {});
      } catch (_) {}

      if (this.callbacks?.onProgress) {
        this.callbacks.onProgress(this.project.id, this.currentPhase, 0);
      }
    } finally {
      this.processing = false;
      this.currentPhase = "";
      this.currentProgress = 0;
      // continue with next items
      if (this.queue.length > 0) this.runQueue();
    }
  }

  /** Find the longest video clip and replace its mediaItem with the new file. */
  private async replaceMainClip(project: Project, fileHandle: FileSystemFileHandle) {
    // Build a new MediaItem from the incoming file
    const newMediaItem: MediaItem = await createMediaItemFromFileHandle(fileHandle);
    
    // Ensure project's media library and items list exists
    if (!project.mediaLibrary) {
      (project as any).mediaLibrary = { items: [] };
    } else if (!project.mediaLibrary.items) {
      (project.mediaLibrary as any).items = [];
    }

    // Add to project's media library
    project.mediaLibrary.items.push(newMediaItem);

    // Ensure timeline and tracks exist
    if (!project.timeline) {
      (project as any).timeline = { tracks: [], subtitles: [], duration: 0, markers: [] };
    }
    if (!project.timeline.tracks) {
      (project.timeline as any).tracks = [];
    }
    if (!project.timeline.subtitles) {
      (project.timeline as any).subtitles = [];
    }

    // Find the longest video clip across all video tracks
    let longestClip: Clip | null = null;
    let longestDuration = 0;
    for (const track of project.timeline.tracks) {
      if (track.type !== 'video') continue;
      if (!track.clips) {
        (track as any).clips = [];
      }
      for (const clip of track.clips) {
        const media = (project.mediaLibrary?.items || []).find(m => m.id === clip.mediaId);
        if (!media) continue;
        const duration = Number.isFinite(media.metadata.duration) ? media.metadata.duration : (media.metadata.duration ?? 0);
        if (duration > longestDuration) {
          longestDuration = duration;
          longestClip = clip;
        }
      }
    }
    if (!longestClip) {
      // Find or create the first video track
      let videoTrack = project.timeline.tracks.find(t => t.type === 'video');
      if (!videoTrack) {
        videoTrack = {
          id: `track-video-${Date.now()}`,
          type: 'video',
          name: 'Video 1',
          clips: [],
          transitions: [],
          locked: false,
          hidden: false,
          muted: false,
          solo: false,
        };
        (project.timeline.tracks as any[]).push(videoTrack);
      }

      // Create a new clip on that track at startTime 0
      const extractedDuration = newMediaItem.metadata.duration;
      const duration = (extractedDuration && Number.isFinite(extractedDuration)) ? extractedDuration : 10;
      const newClip: Clip = {
        id: `clip-auto-${Date.now()}`,
        mediaId: newMediaItem.id,
        trackId: videoTrack.id,
        startTime: 0,
        duration: duration,
        inPoint: 0,
        outPoint: duration,
        effects: [],
        audioEffects: [],
        transform: {
          position: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          rotation: 0,
          anchor: { x: 0.5, y: 0.5 },
          opacity: 1,
        },
        volume: 1,
        keyframes: [],
      };
      (videoTrack.clips as any[]).push(newClip);
      longestClip = newClip;
    }
    // Replace the mediaId on the selected clip
    (longestClip as any).mediaId = newMediaItem.id;

    // Cleanup old automation data
    // Remove auto-generated subtitles
    if (project.timeline.subtitles) {
      (project.timeline as any).subtitles = project.timeline.subtitles.filter(
        (sub: any) => !sub.id.startsWith('auto-caption-') && !sub.id.endsWith('-translated')
      );
    }

    // Remove old TTS clips
    const ttsTrack = project.timeline.tracks.find((t: any) => t.type === 'audio' && t.name === 'TTS');
    if (ttsTrack) {
      (ttsTrack as any).clips = [];
    }

    return newMediaItem;
  }
}

async function createMediaItemFromFileHandle(fileHandle: FileSystemFileHandle): Promise<MediaItem> {
  const file = await fileHandle.getFile();
  const blob = file; // A File object is a subclass of Blob, so we can use it directly without loading arrayBuffer in memory!

  // Generate a deterministic ID based on file name + lastModified
  const id = `${file.name}-${file.lastModified}`;

  // Attempt to get video metadata (duration, width, height, frameRate)
  let metadata: any = {
    duration: 0,
    width: 0,
    height: 0,
    frameRate: 30,
    codec: file.type,
    sampleRate: 0,
    channels: 0,
    fileSize: file.size,
  };

  if (file.type.startsWith('video/')) {
    try {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      video.src = url;
      await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', reject, { once: true });
      });
      metadata.duration = Number.isFinite(video.duration) ? video.duration : 0;
      metadata.width = video.videoWidth;
      metadata.height = video.videoHeight;
      metadata.frameRate = 30;
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Unable to extract video metadata', e);
    }
  }

  return {
    id,
    name: file.name,
    type: file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image',
    fileHandle,
    blob,
    metadata,
    thumbnailUrl: null,
    waveformData: null,
    filmstripThumbnails: undefined,
    isPlaceholder: false,
    originalUrl: null,
    sourceFile: {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    },
  } as any;
}

