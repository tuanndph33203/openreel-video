import React, { useState, useEffect, useCallback } from "react";
import { Clock, Trash2, Film, Pencil } from "lucide-react";
import {
  checkForRecovery,
  autoSaveManager,
  type AutoSaveMetadata,
} from "../../services/auto-save";
import { useProjectStore } from "../../stores/project-store";
import { useAnalytics, AnalyticsEvents } from "../../hooks/useAnalytics";
import { useTranslation } from "../../hooks/use-translation";

interface RecentProject {
  id: string;
  saveId: string;
  name: string;
  lastModified: number;
}

interface RecentProjectsProps {
  onProjectSelected?: () => void;
}

export const RecentProjects: React.FC<RecentProjectsProps> = ({
  onProjectSelected,
}) => {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingProjectId, setLoadingProjectId] = useState<string | null>(null);
  const { project, createNewProject, recoverFromAutoSave } = useProjectStore();
  const { track } = useAnalytics();
  const { t } = useTranslation();

  useEffect(() => {
    async function loadProjects() {
      try {
        const saves = await checkForRecovery();
        const projectMap = new Map<string, AutoSaveMetadata>();

        for (const save of saves) {
          if (!projectMap.has(save.projectId)) {
            projectMap.set(save.projectId, save);
          }
        }

        const projects: RecentProject[] = Array.from(projectMap.values())
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 10)
          .map((save) => ({
            id: save.projectId,
            saveId: save.id,
            name: save.projectName,
            lastModified: save.timestamp,
          }));

        setRecentProjects(projects);
      } catch (error) {
        console.error("Failed to load recent projects:", error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProjects();
  }, []);

  const handleSelectProject = useCallback(
    async (project: RecentProject) => {
      setLoadingProjectId(project.id);
      try {
        const success = await recoverFromAutoSave(project.saveId);
        if (success) {
          track(AnalyticsEvents.PROJECT_OPENED, {
            source: "recent_projects",
          });
          onProjectSelected?.();
        }
      } catch (error) {
        console.error("Failed to load project:", error);
      } finally {
        setLoadingProjectId(null);
      }
    },
    [recoverFromAutoSave, onProjectSelected, track],
  );

  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const handleStartRename = useCallback((project: RecentProject, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingProjectId(project.id);
    setEditingName(project.name);
  }, []);

  const handleSaveRename = useCallback(async (projectId: string) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingProjectId(null);
      return;
    }
    
    const currentProj = recentProjects.find(p => p.id === projectId);
    if (currentProj && currentProj.name === trimmed) {
      setEditingProjectId(null);
      return;
    }

    const isDuplicate = recentProjects.some(
      (p) => p.id !== projectId && p.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      alert(t("recent_projects.rename_duplicate_error"));
      return;
    }

    try {
      await autoSaveManager.renameProjectSaves(projectId, trimmed);
      setRecentProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, name: trimmed } : p))
      );
      setEditingProjectId(null);
    } catch (error) {
      console.error("Failed to rename project saves:", error);
    }
  }, [editingName, recentProjects]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent, projectId: string) => {
    if (e.key === "Enter") {
      handleSaveRename(projectId);
    } else if (e.key === "Escape") {
      setEditingProjectId(null);
    }
  }, [handleSaveRename]);

  const handleRemoveProject = useCallback(
    async (projectId: string, event: React.MouseEvent) => {
      event.stopPropagation();
      const confirmDelete = window.confirm(t("recent_projects.delete_confirm"));
      if (!confirmDelete) return;

      try {
        await autoSaveManager.deleteProjectSaves(projectId);
        if (projectId === project.id) {
          createNewProject();
        }
        setRecentProjects((prev) => prev.filter((p) => p.id !== projectId));
      } catch (error) {
        console.error("Failed to delete project saves:", error);
      }
    },
    [project.id, createNewProject],
  );

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays === 0) return t("recent_projects.date.today");
    if (diffDays === 1) return t("recent_projects.date.yesterday");
    if (diffDays < 7) return t("recent_projects.date.days_ago", { count: diffDays });
    if (diffDays < 30) return t("recent_projects.date.weeks_ago", { count: Math.floor(diffDays / 7) });

    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mb-4" />
        <p className="text-sm text-text-secondary">
          {t("recent_projects.loading")}
        </p>
      </div>
    );
  }

  if (recentProjects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-background-tertiary flex items-center justify-center mb-4">
          <Clock size={24} className="text-text-muted" />
        </div>
        <h3 className="text-base font-medium text-text-primary mb-2">
          {t("recent_projects.no_projects")}
        </h3>
        <p className="text-sm text-text-muted text-center max-w-md">
          {t("recent_projects.no_projects_desc")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">
          {t("recent_projects.title_count", { count: recentProjects.length })}
        </h3>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        {recentProjects.map((project) => {
          const isLoadingThis = loadingProjectId === project.id;
          return (
            <div
              key={project.id}
              className="group relative flex flex-col bg-background-tertiary rounded-xl border border-border hover:border-primary/40 hover:bg-background-elevated transition-all overflow-hidden"
            >
              <button
                onClick={() => handleSelectProject(project)}
                disabled={isLoadingThis}
                className="flex flex-col flex-1 text-left disabled:opacity-70"
              >
                <div className="aspect-video w-full bg-background flex items-center justify-center border-b border-border">
                  {isLoadingThis ? (
                    <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  ) : (
                    <Film size={32} className="text-text-muted/50 group-hover:text-primary/50 transition-colors" />
                  )}
                </div>

                <div className="p-3 flex-1">
                  {editingProjectId === project.id ? (
                    <div className="mt-1" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => handleSaveRename(project.id)}
                        onKeyDown={(e) => handleRenameKeyDown(e, project.id)}
                        autoFocus
                        className="w-full text-xs px-2 py-1 bg-background border border-primary rounded text-text-primary focus:outline-none"
                      />
                    </div>
                  ) : (
                    <h4 className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                      {project.name}
                    </h4>
                  )}
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-text-muted">
                    <Clock size={11} />
                    <span>{formatDate(project.lastModified)}</span>
                  </div>
                </div>
              </button>

              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button
                  onClick={(e) => handleStartRename(project, e)}
                  className="p-1.5 text-text-muted hover:text-primary rounded-lg bg-background/80 hover:bg-primary/10 backdrop-blur-sm"
                  title={t("recent_projects.rename_tooltip")}
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={(e) => handleRemoveProject(project.id, e)}
                  className="p-1.5 text-text-muted hover:text-red-400 rounded-lg bg-background/80 hover:bg-red-500/10 backdrop-blur-sm"
                  title={t("recent_projects.delete_tooltip")}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-text-muted text-center">
        {t("recent_projects.footer_hint")}
      </p>
    </div>
  );
};

export default RecentProjects;
