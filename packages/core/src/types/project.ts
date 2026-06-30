import type { Timeline } from './timeline';

export interface AutomationConfig {
  autoCaption: boolean;
  sourceLanguage?: string;
  targetLanguage?: string;
  translationMethod?: "google" | "ai";
  aiProvider?: "openai" | "anthropic" | "gemini";
  aiModel?: string;
  aiTone?: string;
  videoContext?: string;
  glossaryText?: string;
  animationStyle?: string;
  aiTemperature?: number;
  translationBranch?: "A" | "B";
  insightsAiProvider?: "openai" | "anthropic" | "gemini";
  insightsCustomModel?: string;
  insightsTemperature?: number;
  insightsSeoLanguages?: string[];
  
  tts: boolean;
  ttsProvider?: "piper" | "elevenlabs" | "vieneu";
  ttsVoiceId?: string;
  ttsTargetType?: "original" | "translated" | "auto";
  ttsSpeed?: number;
  watchFolderName?: string;
}

export interface ProjectSettings {
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly sampleRate: number;
  readonly channels: number;
  readonly youtubeApiKey?: string;
  // Transient fields – not persisted across reloads
  readonly watchFolderHandle?: any; // FileSystemDirectoryHandle (not serializable)
  readonly automationQueue?: string[]; // IDs of pending files (for UI only)
  readonly automationConfig?: AutomationConfig;
}

export interface Project {
  readonly id: string;
  readonly name: string;
  readonly createdAt: number;
  readonly modifiedAt: number;
  readonly settings: ProjectSettings;
  readonly mediaLibrary: MediaLibrary;
  readonly timeline: Timeline;
  readonly textClips?: any[];
  readonly shapeClips?: any[];
  readonly svgClips?: any[];
  readonly stickerClips?: any[];
}

// Rest of the file (MediaLibrary, MediaItem, etc.) remains unchanged – re‑export existing definitions
export interface MediaLibrary {
  readonly items: MediaItem[];
}

export interface MediaItem {
  readonly id: string;
  readonly name: string;
  readonly type: "video" | "audio" | "image";
  readonly fileHandle: FileSystemFileHandle | null;
  readonly filePath?: string;
  readonly proxyPath?: string;
  readonly hasProxy?: boolean;
  readonly blob: Blob | null;
  readonly metadata: MediaMetadata;
  readonly thumbnailUrl: string | null;
  readonly waveformData: Float32Array | null;
  readonly filmstripThumbnails?: any[];
  readonly isPlaceholder?: boolean;
  readonly originalUrl?: string;
  readonly sourceFile?: { name: string; size: number; lastModified: number; folder?: string };
  readonly isPending?: boolean;
  readonly kieaiError?: boolean;
  readonly kieaiTaskId?: string;
}

export interface MediaMetadata {
  readonly duration: number; // seconds
  readonly width: number;
  readonly height: number;
  readonly frameRate: number;
  readonly codec: string;
  readonly sampleRate: number;
  readonly channels: number;
  readonly fileSize: number;
  readonly audioTrackCount?: number;
}
