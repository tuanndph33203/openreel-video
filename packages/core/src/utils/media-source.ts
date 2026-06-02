import { invoke } from "@tauri-apps/api/core";

export function isTauri(): boolean {
  return typeof window !== "undefined" && (window as any).__TAURI_INTERNALS__ !== undefined;
}

export function createMediaBunnySource(
  mediabunny: any,
  mediaItem: { filePath?: string; blob?: Blob | null; metadata?: { fileSize?: number } },
) {
  const { BlobSource, StreamSource } = mediabunny;

  if (isTauri() && mediaItem.filePath) {
    const filePath = mediaItem.filePath;
    const fileSize = mediaItem.metadata?.fileSize || mediaItem.blob?.size || 0;

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

  return new BlobSource(mediaItem.blob);
}
