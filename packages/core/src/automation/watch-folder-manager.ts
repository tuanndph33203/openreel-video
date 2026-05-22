
/**
 * Watches a user‑selected directory for newly added video files.
 * It polls the directory every `pollIntervalMs` (default 3000 ms) and
 * invokes the provided `onNewFile` callback for each unprocessed file.
 *
 * The manager keeps an internal Set of processed file identifiers
 * (`fileHandle.name + fileHandle.lastModified`) to avoid duplicate work.
 */
export class WatchFolderManager {
  private readonly dirHandle: FileSystemDirectoryHandle;
  private readonly onNewFile: (fileHandle: FileSystemFileHandle) => void;
  private readonly pollIntervalMs: number;
  private timerId: any = null;
  private processed: Set<string> = new Set();
  private permissionGranted = false;
  private isFirstCheck = true;

  constructor(
    dirHandle: FileSystemDirectoryHandle,
    onNewFile: (fileHandle: FileSystemFileHandle) => void,
    pollIntervalMs: number = 3000,
  ) {
    this.dirHandle = dirHandle;
    this.onNewFile = onNewFile;
    this.pollIntervalMs = pollIntervalMs;
  }

  /** Start polling the directory. */
  start() {
    if (this.timerId !== null) return; // already running
    this.timerId = setInterval(() => this.checkDirectory(), this.pollIntervalMs);
    // Immediate first check
    this.checkDirectory();
  }

  /** Stop polling. */
  stop() {
    if (this.timerId !== null) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  /** Check if permission is currently granted. */
  isPermissionGranted(): boolean {
    return this.permissionGranted;
  }

  /** Request readwrite permission from the user (requires user gesture). */
  async requestPermission(): Promise<boolean> {
    try {
      const state = await (this.dirHandle as any).requestPermission({ mode: 'readwrite' });
      this.permissionGranted = (state === 'granted');
      return this.permissionGranted;
    } catch (e) {
      console.warn('[WatchFolderManager] requestPermission error', e);
      return false;
    }
  }

  private async checkDirectory() {
    try {
      // Check query permission first
      const state = await (this.dirHandle as any).queryPermission({ mode: 'readwrite' });
      this.permissionGranted = (state === 'granted');
      if (!this.permissionGranted) {
        return;
      }

      for await (const entry of (this.dirHandle as any).values()) {
        if (entry.kind !== 'file') continue;
        // Only consider common video extensions
        const lower = entry.name.toLowerCase();
        if (!lower.endsWith('.mp4') && !lower.endsWith('.mov') && !lower.endsWith('.avi') && !lower.endsWith('.mkv')) {
          continue;
        }

        // Ignore edited output videos to avoid infinite feedback loops
        if (lower.endsWith('_edited.mp4')) {
          continue;
        }

        let lastModified = 0;
        try {
          const file = await (entry as FileSystemFileHandle).getFile();
          lastModified = file.lastModified;
        } catch {
          // Fallback to 0 if permission issues or other file errors occur
        }
        const id = `${entry.name}-${lastModified}`;
        if (this.processed.has(id)) continue;
        this.processed.add(id);

        // Skip execution for pre-existing files during the first scan
        if (this.isFirstCheck) {
          continue;
        }

        this.onNewFile(entry as FileSystemFileHandle);
      }

      this.isFirstCheck = false;
    } catch (e) {
      console.warn('[WatchFolderManager] error while checking directory', e);
    }
  }
}
