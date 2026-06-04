import { invoke } from "@tauri-apps/api/core";

export function isTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
}

export function createMediaBunnySource(
  mediabunny: any,
  mediaItem: { filePath?: string; blob?: Blob | null; metadata?: { fileSize?: number } } | Blob | File,
) {
  const { BlobSource, StreamSource } = mediabunny;

  if (!mediaItem) {
    return new BlobSource(null);
  }

  if (mediaItem instanceof Blob || (typeof (mediaItem as any).arrayBuffer === "function")) {
    return new BlobSource(mediaItem);
  }

  if (isTauri() && (mediaItem as any).filePath) {
    const filePath = (mediaItem as any).filePath;
    const fileSize = (mediaItem as any).metadata?.fileSize || (mediaItem as any).blob?.size || 0;

    return new StreamSource({
      getSize: () => fileSize,
      read: async (start: number, end: number) => {
        try {
          const chunk = await invoke<number[]>("read_file_chunk", {
            path: filePath,
            offset: start,
            length: end - start,
          });
          return new Uint8Array(chunk);
        } catch (error) {
          console.error(`[createMediaBunnySource] Native read_file_chunk failed:`, error);
          throw error;
        }
      },
    });
  }

  const blob = (mediaItem as any).blob !== undefined ? (mediaItem as any).blob : null;
  return new BlobSource(blob);
}
