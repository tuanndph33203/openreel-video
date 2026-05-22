import { useEffect } from "react";
import { AutomationManager } from "@openreel/core";
import { useAutomationCallbacks } from "../components/editor/hooks/useAutomationCallbacks";
import { loadDirectoryHandle } from "../services/media-storage";
import { checkForRecovery, autoSaveManager } from "../services/auto-save";

export function useWatchFolderAutoResume() {
  const automationCallbacks = useAutomationCallbacks();

  useEffect(() => {
    let active = true;

    async function resumeWatchFolders() {
      try {
        const saves = await checkForRecovery();
        
        if (!active) return;

        // Deduplicate saves by projectId to find the latest save for each project
        const projectMap = new Map<string, string>();
        for (const save of saves) {
          if (!projectMap.has(save.projectId)) {
            projectMap.set(save.projectId, save.id);
          }
        }

        for (const [projectId, saveId] of projectMap.entries()) {
          try {
            const project = await autoSaveManager.recover(saveId);
            if (!project || !active) continue;

            const watchName = project.settings?.automationConfig?.watchFolderName;
            if (watchName) {
              // Check if already registered
              const statusList = AutomationManager.getInstance().getStatus();
              const isAlreadyWatched = statusList.some(s => s.projectId === project.id);
              
              if (!isAlreadyWatched) {
                const dirInfo = await loadDirectoryHandle(project.id);
                if (dirInfo?.handle && active) {
                  await AutomationManager.getInstance().registerProject(
                    project, 
                    dirInfo.handle, 
                    automationCallbacks
                  );
                  console.info(`[WatchFolderAutoResume] Resumed watching folder "${dirInfo.folderName}" for project "${project.name}"`);
                }
              }
            }
          } catch (err) {
            console.warn(`[WatchFolderAutoResume] Failed to resume watch folder for project ID: ${projectId}`, err);
          }
        }
      } catch (err) {
        console.error("[WatchFolderAutoResume] Failed to load projects from storage", err);
      }
    }

    resumeWatchFolders();

    return () => {
      active = false;
    };
  }, [automationCallbacks]);
}

