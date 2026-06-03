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
import { useTranslation } from "../../hooks/use-translation";

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
  const { t } = useTranslation();
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
      const queuesCount = AutomationManager.getInstance().getStatus().watchedProjects.length;
      toast.success(t("watch_folder.toasts.set_success"), t("watch_folder.toasts.set_success_desc", { name: dirHandle.name, count: queuesCount }));
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
        toast.success(t("watch_folder.toasts.stop_success"), t("watch_folder.toasts.stop_success_desc"));
        onOpenChange(false);
      } catch (err) {
        console.error("Failed to stop watch folder", err);
        toast.error(t("watch_folder.toasts.stop_error"), t("watch_folder.toasts.stop_error_desc"));
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-background-secondary border-border text-text-primary">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Zap size={18} />
            {t("watch_folder.title")}
          </DialogTitle>
          <DialogDescription className="text-text-secondary text-xs">
            {t("watch_folder.desc")}
          </DialogDescription>
        </DialogHeader>
        
        <div className="py-4 space-y-4">
          {project?.settings.automationConfig?.watchFolderName && (
            <div className="flex items-start gap-2 p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-lg">
              <Zap size={16} className="text-indigo-400 mt-0.5 shrink-0" />
              <div className="text-xs text-text-primary">
                <span className="font-semibold text-indigo-400">{t("watch_folder.currently_watching")}</span>
                <p className="text-text-secondary mt-1 font-mono break-all">{project.settings.automationConfig.watchFolderName}</p>
              </div>
            </div>
          )}

          <div className="text-sm font-medium">{t("watch_folder.template_analysis")}</div>
          
          <div className="flex items-start gap-2 p-3 bg-primary/10 border border-primary/20 rounded-lg">
            <Zap size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="text-xs text-text-primary">
              <span className="font-semibold">{t("watch_folder.edits_preserved")}</span>
              <p className="text-text-muted mt-1">{t("watch_folder.edits_preserved_desc")}</p>
            </div>
          </div>
          
          <div className="space-y-3">
            {/* No toggles – auto caption & TTS are always enabled */}
          </div>
          
          <div className="flex items-start gap-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <AlertCircle size={14} className="text-amber-400 mt-0.5 shrink-0" />
            <span className="text-[10px] text-amber-300">
              {t("watch_folder.api_key_notice")}
            </span>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center w-full gap-2">
          {project?.settings.automationConfig?.watchFolderName ? (
            <button
              onClick={handleStopWatching}
              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold rounded-lg transition-colors border border-red-500/20 mr-auto"
            >
              {t("watch_folder.btn_stop")}
            </button>
          ) : null}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => onOpenChange(false)}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors"
            >
              {t("watch_folder.btn_cancel")}
            </button>
            <button
              onClick={handleSelectFolder}
              disabled={isSelecting}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50"
            >
              {isSelecting ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {project?.settings.automationConfig?.watchFolderName ? t("watch_folder.btn_change") : t("watch_folder.btn_select")}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
