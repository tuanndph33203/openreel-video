import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  Plus,
  FolderOpen,
  Clock,
  Check,
  Pencil,
  FileVideo,
  Trash2,
} from "lucide-react";
import { Button, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input, Label } from "@openreel/ui";
import { useProjectStore } from "../../stores/project-store";
import { autoSaveManager, type AutoSaveMetadata } from "../../services/auto-save";

function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60);
    return `${mins}m ago`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours}h ago`;
  }
  const days = Math.floor(seconds / 86400);
  return `${days}d ago`;
}

export const ProjectSwitcher: React.FC = () => {
  const { project, createNewProject, recoverFromAutoSave, renameProject } = useProjectStore();
  const [isOpen, setIsOpen] = useState(false);
  const [savedProjects, setSavedProjects] = useState<AutoSaveMetadata[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(project.name);
  const [isLoading, setIsLoading] = useState(false);
  const [editingOtherProjectId, setEditingOtherProjectId] = useState<string | null>(null);
  const [editingOtherName, setEditingOtherName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // States for creating project dialog with validation
  const [isNewProjectDialogOpen, setIsNewProjectDialogOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    const loadSavedProjects = async () => {
      try {
        await autoSaveManager.initialize();
        const saves = await autoSaveManager.checkForRecovery();
        const uniqueProjects = saves.reduce((acc, save) => {
          const existing = acc.find((s) => s.projectId === save.projectId);
          if (!existing || save.timestamp > existing.timestamp) {
            return [...acc.filter((s) => s.projectId !== save.projectId), save];
          }
          return acc;
        }, [] as AutoSaveMetadata[]);
        setSavedProjects(uniqueProjects.sort((a, b) => b.timestamp - a.timestamp));
      } catch (err) {
        console.warn("[ProjectSwitcher] Failed to load saved projects:", err);
      }
    };

    if (isOpen) {
      loadSavedProjects();
    }
  }, [isOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsEditing(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    setEditName(project.name);
  }, [project.name]);

  const handleSaveName = useCallback(async () => {
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setIsEditing(false);
      return;
    }
    if (trimmedName === project.name) {
      setIsEditing(false);
      return;
    }

    // Check duplicate in other saved projects
    const isDuplicate = savedProjects.some(
      (s) => s.projectId !== project.id && s.projectName.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      alert("Tên dự án đã tồn tại. Vui lòng chọn tên khác.");
      return;
    }

    await renameProject(trimmedName);
    setIsEditing(false);
  }, [editName, project.name, project.id, savedProjects, renameProject]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSaveName();
      } else if (e.key === "Escape") {
        setEditName(project.name);
        setIsEditing(false);
      }
    },
    [handleSaveName, project.name]
  );

  const handleNewProject = useCallback(async () => {
    try {
      const saves = await autoSaveManager.checkForRecovery();
      const existingNames = new Set(saves.map((s) => s.projectName.trim().toLowerCase()));
      
      const baseName = "Untitled Project";
      let uniqueName = baseName;
      let counter = 1;
      while (existingNames.has(uniqueName.toLowerCase())) {
        uniqueName = `${baseName} (${counter})`;
        counter++;
      }

      setNewProjectName(uniqueName);
      setNameError(null);
      setIsNewProjectDialogOpen(true);
    } catch (err) {
      console.error("[ProjectSwitcher] Failed to generate name for new project:", err);
      setNewProjectName("Untitled Project");
      setNameError(null);
      setIsNewProjectDialogOpen(true);
    }
  }, []);

  const handleConfirmCreateNewProject = useCallback(() => {
    const trimmed = newProjectName.trim();
    if (!trimmed) {
      setNameError("Tên dự án không được để trống.");
      return;
    }

    const isDuplicate = savedProjects.some(
      (s) => s.projectName.trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (isDuplicate) {
      setNameError("Tên dự án này đã được sử dụng.");
      return;
    }

    createNewProject(trimmed);
    setIsNewProjectDialogOpen(false);
    setIsOpen(false);
  }, [newProjectName, savedProjects, createNewProject]);

  const handleNewProjectNameChange = useCallback((value: string) => {
    setNewProjectName(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setNameError("Tên dự án không được để trống.");
      return;
    }

    const isDuplicate = savedProjects.some(
      (s) => s.projectName.trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (isDuplicate) {
      setNameError("Tên dự án này đã được sử dụng.");
    } else {
      setNameError(null);
    }
  }, [savedProjects]);

  const handleSwitchProject = useCallback(
    async (saveId: string) => {
      setIsLoading(true);
      try {
        await recoverFromAutoSave(saveId);
        setIsOpen(false);
      } catch (err) {
        console.error("[ProjectSwitcher] Failed to switch project:", err);
      } finally {
        setIsLoading(false);
      }
    },
    [recoverFromAutoSave]
  );

  const handleStartOtherRename = useCallback((save: AutoSaveMetadata, event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingOtherProjectId(save.projectId);
    setEditingOtherName(save.projectName);
  }, []);

  const handleSaveOtherRename = useCallback(async (projectId: string) => {
    const trimmed = editingOtherName.trim();
    if (!trimmed) {
      setEditingOtherProjectId(null);
      return;
    }

    const currentSave = savedProjects.find((s) => s.projectId === projectId);
    if (currentSave && currentSave.projectName === trimmed) {
      setEditingOtherProjectId(null);
      return;
    }

    // Check duplicate in current project's name AND other saved projects
    const isDuplicate =
      project.name.trim().toLowerCase() === trimmed.toLowerCase() ||
      savedProjects.some(
        (s) => s.projectId !== projectId && s.projectName.trim().toLowerCase() === trimmed.toLowerCase()
      );

    if (isDuplicate) {
      alert("Tên dự án đã tồn tại. Vui lòng chọn tên khác.");
      return;
    }

    try {
      await autoSaveManager.renameProjectSaves(projectId, trimmed);
      setSavedProjects((prev) =>
        prev.map((s) => (s.projectId === projectId ? { ...s, projectName: trimmed } : s))
      );
      setEditingOtherProjectId(null);
    } catch (error) {
      console.error("[ProjectSwitcher] Failed to rename project:", error);
    }
  }, [editingOtherName, savedProjects, project.name]);

  const handleOtherKeyDown = useCallback((e: React.KeyboardEvent, projectId: string) => {
    if (e.key === "Enter") {
      handleSaveOtherRename(projectId);
    } else if (e.key === "Escape") {
      setEditingOtherProjectId(null);
    }
  }, [handleSaveOtherRename]);

  const handleRemoveProject = useCallback(async (projectId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    const confirmDelete = window.confirm("Bạn có chắc chắn muốn xóa dự án này không?");
    if (!confirmDelete) return;

    try {
      await autoSaveManager.deleteProjectSaves(projectId);
      if (projectId === project.id) {
        createNewProject();
      }
      setSavedProjects((prev) => prev.filter((s) => s.projectId !== projectId));
    } catch (error) {
      console.error("[ProjectSwitcher] Failed to delete project saves:", error);
    }
  }, [project.id, createNewProject]);

  const otherProjects = savedProjects.filter((s) => s.projectId !== project.id);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-background-secondary transition-colors group max-w-[200px]"
      >
        <FileVideo className="w-4 h-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-text-primary truncate">
          {project.name}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-text-muted transition-transform duration-200 shrink-0 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-72 bg-background border border-border rounded-xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-3 border-b border-border">
            <div className="text-xs font-medium text-text-muted uppercase tracking-wider mb-2">
              Current Project
            </div>
            {isEditing ? (
              <div className="flex items-center gap-2">
                <Input
                  ref={inputRef}
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onBlur={handleSaveName}
                  onKeyDown={handleKeyDown}
                  className="flex-1 bg-background-secondary border-primary text-text-primary"
                />
                <button
                  onClick={handleSaveName}
                  className="p-2 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors"
                >
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 bg-background-secondary rounded-lg group">
                <FileVideo className="w-4 h-4 text-primary shrink-0" />
                <span className="flex-1 text-sm font-medium text-text-primary truncate">
                  {project.name}
                </span>
                <button
                  onClick={() => setIsEditing(true)}
                  className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-background-tertiary transition-colors opacity-0 group-hover:opacity-100"
                  title="Rename project"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="p-2">
            <button
              onClick={handleNewProject}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-background-secondary transition-colors text-left group"
            >
              <div className="p-1.5 bg-primary/10 rounded-md text-primary group-hover:bg-primary/20 transition-colors">
                <Plus className="w-4 h-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-medium text-text-primary">New Project</div>
                <div className="text-xs text-text-muted">Start fresh with a new canvas</div>
              </div>
            </button>
          </div>

          {otherProjects.length > 0 && (
            <>
              <div className="px-3 py-2 border-t border-border">
                <div className="text-xs font-medium text-text-muted uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  Recent Projects
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto px-2 pb-2">
                {otherProjects.map((save) => {
                  const isEditingThis = editingOtherProjectId === save.projectId;
                  
                  return (
                    <div
                      key={save.id}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-background-secondary/60 transition-colors group relative"
                    >
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 w-full">
                          <Input
                            type="text"
                            value={editingOtherName}
                            onChange={(e) => setEditingOtherName(e.target.value)}
                            onKeyDown={(e) => handleOtherKeyDown(e, save.projectId)}
                            className="flex-1 bg-background-secondary border-primary text-text-primary text-xs py-1 h-8"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveOtherRename(save.projectId)}
                            className="p-1.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors shrink-0"
                            title="Save"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingOtherProjectId(null)}
                            className="p-1.5 bg-background-tertiary text-text-muted rounded-lg hover:text-text-primary transition-colors shrink-0"
                            title="Cancel"
                          >
                            <span className="text-[10px] px-0.5">Esc</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => handleSwitchProject(save.id)}
                            disabled={isLoading}
                            className="flex-1 flex items-center gap-3 min-w-0 text-left disabled:opacity-50"
                          >
                            <div className="p-1.5 bg-background-tertiary rounded-md text-text-muted group-hover:text-text-secondary transition-colors shrink-0">
                              <FolderOpen className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-text-primary truncate group-hover:text-primary transition-colors">
                                {save.projectName}
                              </div>
                              <div className="text-xs text-text-muted">
                                {formatTimeAgo(save.timestamp)}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={(e) => handleStartOtherRename(save, e)}
                              className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-background-tertiary transition-colors"
                              title="Rename project"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => handleRemoveProject(save.projectId, e)}
                              className="p-1.5 rounded-md text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                              title="Delete project"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      <Dialog open={isNewProjectDialogOpen} onOpenChange={setIsNewProjectDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0 bg-background border-border overflow-hidden shadow-2xl">
          <DialogHeader className="p-5 border-b border-border flex flex-row items-center gap-3 space-y-0">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
              <Plus className="text-primary animate-pulse" size={20} />
            </div>
            <div>
              <DialogTitle className="text-lg font-semibold text-text-primary">
                Tạo dự án mới
              </DialogTitle>
              <DialogDescription className="text-xs text-text-muted mt-0.5">
                Khởi tạo một Canvas mới với bộ nhớ sạch hoàn toàn.
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-project-name-input" className="text-xs font-medium text-text-secondary">
                Tên dự án <span className="text-red-400">*</span>
              </Label>
              <Input
                id="new-project-name-input"
                type="text"
                value={newProjectName}
                onChange={(e) => handleNewProjectNameChange(e.target.value)}
                placeholder="Tên dự án..."
                className="bg-background-secondary border-border text-text-primary h-10 px-3 focus-visible:ring-1 focus-visible:ring-primary/50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !nameError && newProjectName.trim()) {
                    handleConfirmCreateNewProject();
                  }
                }}
              />
              {nameError ? (
                <p className="text-xs text-red-500 font-medium flex items-center gap-1 mt-1.5">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                  {nameError}
                </p>
              ) : (
                <p className="text-[10px] text-text-muted">
                  Tên này được sử dụng để quản lý dự án trong IndexedDB.
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="p-4 bg-background-secondary border-t border-border flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsNewProjectDialogOpen(false)}
              className="rounded-lg text-sm text-text-secondary hover:text-text-primary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreateNewProject}
              disabled={!!nameError || !newProjectName.trim()}
              className="rounded-lg text-sm font-medium px-4 h-9"
            >
              Create Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
