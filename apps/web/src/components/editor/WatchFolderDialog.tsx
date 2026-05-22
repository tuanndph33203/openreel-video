import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@openreel/ui";
import { Zap, Loader2, AlertCircle } from "lucide-react";
import { useProjectStore } from "../../stores/project-store";
import { toast } from "../../stores/notification-store";
import { saveDirectoryHandle } from "../../services/media-storage";
import { AutomationManager } from "@openreel/core";

interface WatchFolderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (dirHandle: FileSystemDirectoryHandle) => void;
}

export const WatchFolderDialog: React.FC<WatchFolderDialogProps> = ({
  open,
  onOpenChange,
  onConfirm,
}) => {
  const project = useProjectStore((state) => state.project);
  const updateSettings = useProjectStore((state) => state.updateSettings);
  
  const [isSelecting, setIsSelecting] = useState(false);
  
  const handleSelectFolder = async () => {
    setIsSelecting(true);
    try {
      const dirHandle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
      
      if (project) {
        try {
          await saveDirectoryHandle(project.id, dirHandle);
        } catch (err) {
          console.warn("Failed to persist directory handle", err);
        }
      }

      // Save configuration to project settings
      await updateSettings({
        automationConfig: {
          autoCaption: true,
          tts: true,
          watchFolderName: dirHandle.name
        }
      });
      
      // Force save immediately to ensure it's persisted in "openreel-autosave"
      try {
        await useProjectStore.getState().forceSave();
      } catch (err) {
        console.warn("Failed to force save watch folder config", err);
      }
      
      onConfirm(dirHandle);
      onOpenChange(false);
      const queuesCount = AutomationManager.getInstance().getStatus().length;
      toast.success("Watch folder set!", `Folder "${dirHandle.name}" will be monitored. Active Queues: ${queuesCount}`);
    } catch (e) {
      console.error(e);
      // User cancelled
    } finally {
      setIsSelecting(false);
    }
  };

  const handleStopWatching = async () => {
    if (project) {
      try {
        AutomationManager.getInstance().unregisterProject(project.id);
        await updateSettings({
          automationConfig: undefined
        });
        try {
          await useProjectStore.getState().forceSave();
        } catch (err) {
          console.warn("Failed to force save watch folder stop", err);
        }
        toast.success("Watch folder stopped", "Folder monitoring has been deactivated.");
        onOpenChange(false);
      } catch (err) {
        console.error("Failed to stop watch folder", err);
        toast.error("Error", "Failed to stop watching folder.");
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-background-secondary border-border text-text-primary">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Zap size={18} />
            Watch Folder Setup
          </DialogTitle>
          <DialogDescription className="text-text-secondary text-xs">
            Selecting a folder will automatically enable Auto‑Caption and Text‑to‑Speech for every new video placed here. All existing timeline edits (effects, filters, texts, etc.) are preserved.
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {project?.settings.automationConfig?.watchFolderName && (
            <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <Zap size={16} className="text-indigo-400 mt-0.5 shrink-0" />
              <div className="text-xs text-text-primary">
                <span className="font-semibold text-indigo-400">Currently Watching:</span>
                <p className="text-text-secondary mt-1 font-mono break-all">{project.settings.automationConfig.watchFolderName}</p>
              </div>
            </div>
          )}

          <div className="text-sm font-medium">Template Analysis:</div>
          
          <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <Zap size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-text-primary">
              <span className="font-semibold">All timeline edits are preserved.</span>
              <p className="text-text-muted mt-1">Filters, blur effects, manual texts, and transformations applied to the video will be automatically applied to the new video.</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {/* No toggles – auto caption & TTS are always enabled */}
          </div>
          
          <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <span className="text-[10px] text-amber-300">
              AI generation requires API keys configured in your settings. Cost is determined by your provider.
            </span>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center w-full gap-2">
          {project?.settings.automationConfig?.watchFolderName ? (
            <button
              onClick={handleStopWatching}
              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition-colors border border-red-500/20 mr-auto"
            >
              Stop Watching
            </button>
          ) : null}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSelectFolder}
              disabled={isSelecting}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {isSelecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {project?.settings.automationConfig?.watchFolderName ? "Change Folder" : "Select Folder"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
