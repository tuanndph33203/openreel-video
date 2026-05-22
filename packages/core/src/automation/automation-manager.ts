import { WatchFolderManager } from './watch-folder-manager';
import { AutoProcessor, type AutomationCallbacks } from './auto-processor';
import { ExportEngine } from '../export/export-engine';
import type { Project } from '../types/project';

/**
 * Singleton that manages automation for all projects.
 * It holds a map of projectId -> { processor, watcher }.
 */
export class AutomationManager {
  private projectMap: Map<string, { processor: AutoProcessor; watcher: WatchFolderManager }> = new Map();
  private exportEngine: ExportEngine;

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
    const processor = new AutoProcessor(project, folderHandle, this.exportEngine, callbacks);
    const watcher = new WatchFolderManager(folderHandle, (fileHandle) => {
      processor.enqueue(fileHandle);
    });
    watcher.start();
    this.projectMap.set(project.id, { processor, watcher });
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
    const result: Array<{ 
      projectId: string; 
      projectName: string; 
      processing: boolean; 
      queueLength: number;
      phase: string;
      progress: number;
      watchFolderName?: string;
      permissionGranted: boolean;
    }> = [];
    for (const [id, { processor, watcher }] of this.projectMap.entries()) {
      const proj = (processor as any).project as Project; // unsafe cast, but works for UI
      const { phase, percent } = processor.getProgressState();
      const config = proj.settings.automationConfig as any;
      result.push({
        projectId: id,
        projectName: proj.name,
        processing: processor.isProcessing(),
        queueLength: processor.getQueueLength(),
        phase,
        progress: percent,
        watchFolderName: config?.watchFolderName,
        permissionGranted: watcher.isPermissionGranted(),
      });
    }
    return result;
  }
}
