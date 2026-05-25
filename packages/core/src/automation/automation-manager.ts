import { WatchFolderManager } from './watch-folder-manager';
import { AutoProcessor, type AutomationCallbacks } from './auto-processor';
import { ExportEngine } from '../export/export-engine';
import type { Project } from '../types/project';

export interface AutomationJob {
  id: string;
  projectId: string;
  projectName: string;
  fileHandle: FileSystemFileHandle;
  fileName: string;
  addedAt: number;
  status: 'queued' | 'processing' | 'done' | 'error';
  phase: string;
  progress: number;
}

/**
 * Singleton that manages automation for all projects.
 * Implements a Global Queue to process files sequentially across all watched projects.
 */
export class AutomationManager {
  private projectMap: Map<string, { project: Project; folderHandle: FileSystemDirectoryHandle; watcher: WatchFolderManager; callbacks?: AutomationCallbacks }> = new Map();
  private exportEngine: ExportEngine;
  private globalQueue: AutomationJob[] = [];
  private isProcessingGlobal = false;

  private constructor() {
    this.exportEngine = new ExportEngine();
  }

  public static getInstance(): AutomationManager {
    const globalObj = typeof window !== 'undefined' ? window : global;
    if (!(globalObj as any).__automationManagerInstance) {
      (globalObj as any).__automationManagerInstance = new AutomationManager();
    }
    return (globalObj as any).__automationManagerInstance;
  }

  /** Register a project with a folder to watch. */
  async registerProject(project: Project, folderHandle: FileSystemDirectoryHandle, callbacks?: AutomationCallbacks) {
    // If already registered, stop previous watcher
    const existing = this.projectMap.get(project.id);
    if (existing) {
      existing.watcher.stop();
    }
    const watcher = new WatchFolderManager(folderHandle, (fileHandle) => {
      this.enqueueGlobal(project, fileHandle);
    });
    watcher.start();
    this.projectMap.set(project.id, { project, folderHandle, watcher, callbacks });
  }

  private enqueueGlobal(project: Project, fileHandle: FileSystemFileHandle) {
    const jobId = `${project.id}-${fileHandle.name}-${Date.now()}`;
    this.globalQueue.push({
      id: jobId,
      projectId: project.id,
      projectName: project.name,
      fileHandle,
      fileName: fileHandle.name,
      addedAt: Date.now(),
      status: 'queued',
      phase: 'Queued',
      progress: 0,
    });
    this.processNextGlobal();
  }

  private async processNextGlobal() {
    if (this.isProcessingGlobal) return;
    const nextJob = this.globalQueue.find(job => job.status === 'queued');
    if (!nextJob) return;

    this.isProcessingGlobal = true;
    nextJob.status = 'processing';
    nextJob.phase = 'Starting...';

    const projectEntry = this.projectMap.get(nextJob.projectId);
    if (!projectEntry) {
      nextJob.status = 'error';
      nextJob.phase = 'Project not found or no longer watched';
      this.isProcessingGlobal = false;
      this.processNextGlobal();
      return;
    }

    // Intercept callbacks to update job progress in real-time
    const originalCallbacks = projectEntry.callbacks;
    const jobCallbacks: AutomationCallbacks = {
      ...originalCallbacks,
      onProgress: (projectId, phase, progress) => {
        nextJob.phase = phase;
        nextJob.progress = progress;
        if (originalCallbacks?.onProgress) {
          originalCallbacks.onProgress(projectId, phase, progress);
        }
      }
    };

    const processor = new AutoProcessor(
      projectEntry.project,
      projectEntry.folderHandle,
      this.exportEngine,
      jobCallbacks
    );

    try {
      await processor.processJob(nextJob.fileHandle);
      nextJob.status = 'done';
      nextJob.phase = 'Complete';
      nextJob.progress = 100;
    } catch (e) {
      console.error('[AutomationManager] Job failed', e);
      nextJob.status = 'error';
      nextJob.phase = `Error: ${(e as Error).message}`;
    } finally {
      this.isProcessingGlobal = false;
      this.processNextGlobal();
    }
  }

  /** Unregister a project (stop watching). */
  unregisterProject(projectId: string) {
    const entry = this.projectMap.get(projectId);
    if (entry) {
      entry.watcher.stop();
      this.projectMap.delete(projectId);
    }
  }

  /** Request directory permission. Must be called from a user gesture handler. */
  async requestPermission(projectId: string): Promise<boolean> {
    const entry = this.projectMap.get(projectId);
    if (entry) {
      const granted = await entry.watcher.requestPermission();
      if (granted) {
        entry.watcher.start();
      }
      return granted;
    }
    return false;
  }

  /** Get status for UI rendering */
  getStatus() {
    const watchedProjects: Array<{ 
      projectId: string; 
      projectName: string; 
      watchFolderName?: string;
      permissionGranted: boolean;
    }> = [];

    for (const [id, entry] of this.projectMap.entries()) {
      const config = entry.project.settings.automationConfig as any;
      watchedProjects.push({
        projectId: id,
        projectName: entry.project.name,
        watchFolderName: config?.watchFolderName,
        permissionGranted: entry.watcher.isPermissionGranted(),
      });
    }

    return {
      watchedProjects,
      queue: [...this.globalQueue] // Return shallow copy to prevent direct mutations
    };
  }
}
