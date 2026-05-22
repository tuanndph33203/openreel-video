import { useState, useCallback, useEffect } from "react";
import {
  Clock,
  Layers,
  ArrowRight,
  Smartphone,
  Monitor,
  Square,
  FolderOpen,
} from "lucide-react";
import { Button, Label, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, Input } from "@openreel/ui";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { autoSaveManager } from "../../services/auto-save";
import { SOCIAL_MEDIA_PRESETS, type SocialMediaCategory } from "@openreel/core";
import { TemplateGallery } from "./TemplateGallery";
import { RecentProjects } from "./RecentProjects";
import { useRouter } from "../../hooks/use-router";
import { useEditorPreload } from "../../hooks/useEditorPreload";
import { useAnalytics, AnalyticsEvents } from "../../hooks/useAnalytics";

interface FormatOption {
  id: string;
  preset: SocialMediaCategory;
  label: string;
  description: string;
  dimensions: string;
  icon: React.ElementType;
  gradient: string;
}

const FORMAT_OPTIONS: FormatOption[] = [
  {
    id: "vertical",
    preset: "tiktok",
    label: "Vertical",
    description: "TikTok, Reels, Shorts",
    dimensions: "1080 × 1920",
    icon: Smartphone,
    gradient: "from-violet-500/20 to-fuchsia-500/20",
  },
  {
    id: "horizontal",
    preset: "youtube-video",
    label: "Horizontal",
    description: "YouTube, Vimeo, Web",
    dimensions: "1920 × 1080",
    icon: Monitor,
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  {
    id: "square",
    preset: "instagram-post",
    label: "Square",
    description: "Instagram, Facebook",
    dimensions: "1080 × 1080",
    icon: Square,
    gradient: "from-orange-500/20 to-rose-500/20",
  },
];

const OpenReelLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg
    viewBox="0 0 490 490"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M245 24.5C123.223 24.5 24.5 123.223 24.5 245s98.723 220.5 220.5 220.5 220.5-98.723 220.5-220.5S366.777 24.5 245 24.5Z"
      stroke="currentColor"
      strokeWidth="30.625"
    />
    <g>
      <path
        d="M245 98v73.5"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
      <path
        d="M392 245h-73.5"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
      <path
        d="M245 392v-73.5"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
      <path
        d="M98 245h73.5"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
      <path
        d="m348.941 141.059-51.965 51.965"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
      <path
        d="m348.941 348.941-51.965-51.965"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
      <path
        d="m141.059 348.941 51.965-51.965"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
      <path
        d="m141.059 141.059 51.965 51.965"
        stroke="currentColor"
        strokeWidth="24.5"
        strokeLinecap="round"
      />
    </g>
    <path
      d="M294 245a49 49 0 0 1-49 49 49 49 0 0 1-49-49 49 49 0 0 1 98 0"
      fill="currentColor"
    />
  </svg>
);

type ViewMode = "home" | "templates" | "recent";

interface WelcomeScreenProps {
  initialTab?: "templates" | "recent";
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ initialTab }) => {
  const skipWelcomeScreen = useUIStore((state) => state.skipWelcomeScreen);
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const { navigate } = useRouter();
  const { track } = useAnalytics();

  const [viewMode, setViewMode] = useState<ViewMode>(initialTab ?? "home");
  const [hoveredFormat, setHoveredFormat] = useState<string | null>(null);

  // States for creating project dialog with validation
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedOption, setSelectedOption] = useState<FormatOption | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [activeSaves, setActiveSaves] = useState<any[]>([]);

  useEditorPreload(true);

  const handleCreateProject = useCallback(
    async (option: FormatOption) => {
      let uniqueName = `New ${option.label} Video`;
      let saves: any[] = [];
      try {
        await autoSaveManager.initialize();
        saves = await autoSaveManager.checkForRecovery();
        const existingNames = new Set(saves.map((s) => s.projectName.trim().toLowerCase()));
        
        let counter = 1;
        while (existingNames.has(uniqueName.toLowerCase())) {
          uniqueName = `New ${option.label} Video (${counter})`;
          counter++;
        }
      } catch (err) {
        console.warn("Failed to check duplicate names during quick creation:", err);
      }

      setSelectedOption(option);
      setNewProjectName(uniqueName);
      setNameError(null);
      setActiveSaves(saves);
      setIsCreateDialogOpen(true);
    },
    []
  );

  const handleConfirmCreate = useCallback(() => {
    if (!selectedOption || !newProjectName.trim()) return;

    const trimmedName = newProjectName.trim();
    
    // Final check for duplicates
    const isDuplicate = activeSaves.some(
      (s) => s.projectName.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (isDuplicate) {
      setNameError("Tên dự án này đã được sử dụng.");
      return;
    }

    const preset = SOCIAL_MEDIA_PRESETS[selectedOption.preset];
    createNewProject(trimmedName, {
      width: preset.width,
      height: preset.height,
      frameRate: preset.frameRate,
    });
    track(AnalyticsEvents.PROJECT_CREATED, {
      preset: selectedOption.preset,
      width: preset.width,
      height: preset.height,
      frameRate: preset.frameRate ?? 30,
      source: "quick_start",
    });
    setIsCreateDialogOpen(false);
    navigate("editor");
  }, [selectedOption, newProjectName, activeSaves, createNewProject, track, navigate]);

  // Real-time duplicate check when user types
  const handleNameChange = useCallback((value: string) => {
    setNewProjectName(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setNameError("Tên dự án không được để trống.");
      return;
    }

    const isDuplicate = activeSaves.some(
      (s) => s.projectName.trim().toLowerCase() === trimmed.toLowerCase()
    );

    if (isDuplicate) {
      setNameError("Tên dự án này đã được sử dụng.");
    } else {
      setNameError(null);
    }
  }, [activeSaves]);

  const handleTemplateApplied = useCallback(() => {
    navigate("editor");
  }, [navigate]);

  const handleProjectSelected = useCallback(() => {
    navigate("editor");
  }, [navigate]);

  useEffect(() => {
    if (skipWelcomeScreen) {
      navigate("editor");
    }
  }, [skipWelcomeScreen, navigate]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (viewMode !== "home") {
          setViewMode("home");
        } else {
          navigate("editor");
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, viewMode]);

  if (viewMode === "templates") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("home")}
          >
            <ArrowRight className="rotate-180" size={16} />
            Back
          </Button>
          <h2 className="text-sm font-medium text-text-primary">Templates</h2>
          <div className="w-16" />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <TemplateGallery onTemplateApplied={handleTemplateApplied} />
        </div>
      </div>
    );
  }

  if (viewMode === "recent") {
    return (
      <div className="fixed inset-0 z-50 bg-background flex flex-col">
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setViewMode("home")}
          >
            <ArrowRight className="rotate-180" size={16} />
            Back
          </Button>
          <h2 className="text-sm font-medium text-text-primary">
            Recent Projects
          </h2>
          <div className="w-16" />
        </header>
        <div className="flex-1 overflow-y-auto p-6">
          <RecentProjects onProjectSelected={handleProjectSelected} />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(34,197,94,0.05),transparent_60%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,rgba(34,197,94,0.03),transparent_50%)]" />

      <div className="relative h-full flex flex-col items-center justify-center px-6">
        <div className="w-full max-w-3xl">
          <div className="flex flex-col items-center text-center mb-12">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 text-primary">
                <OpenReelLogo className="w-full h-full" />
              </div>
              <span className="text-xl font-semibold text-text-primary tracking-tight">
                Open Reel Video
              </span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-bold text-text-primary tracking-tight mb-3">
              From idea to export.
            </h1>
            <p className="text-xl text-text-secondary mb-8">
              In your browser.
            </p>
            <p className="text-base text-text-muted max-w-md">
              Pick a format and start creating. You can change this anytime.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-10">
            {FORMAT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isHovered = hoveredFormat === option.id;

              return (
                <button
                  key={option.id}
                  onClick={() => handleCreateProject(option)}
                  onMouseEnter={() => setHoveredFormat(option.id)}
                  onMouseLeave={() => setHoveredFormat(null)}
                  className={`
                    group relative flex flex-col items-center p-6 rounded-2xl
                    bg-background-secondary border border-border
                    hover:border-primary/40 hover:bg-background-tertiary
                    transition-all duration-200
                    ${isHovered ? "scale-[1.02] shadow-lg shadow-primary/5" : ""}
                  `}
                >
                  <div
                    className={`
                    absolute inset-0 rounded-2xl bg-gradient-to-br ${option.gradient}
                    opacity-0 group-hover:opacity-100 transition-opacity duration-300
                  `}
                  />

                  <div className="relative z-10 flex flex-col items-center">
                    <div
                      className={`
                      w-16 h-16 mb-4 rounded-xl flex items-center justify-center
                      bg-background-tertiary group-hover:bg-primary/10
                      transition-colors duration-200
                    `}
                    >
                      <Icon
                        size={28}
                        className="text-text-muted group-hover:text-primary transition-colors"
                      />
                    </div>

                    <h3 className="text-lg font-semibold text-text-primary mb-1">
                      {option.label}
                    </h3>
                    <p className="text-sm text-text-muted mb-3">
                      {option.description}
                    </p>
                    <span className="text-xs font-mono text-text-muted/70 bg-background-tertiary px-2 py-1 rounded">
                      {option.dimensions}
                    </span>
                  </div>

                  <div
                    className={`
                    absolute bottom-4 left-1/2 -translate-x-1/2
                    flex items-center gap-1 text-sm font-medium text-primary
                    opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0
                    transition-all duration-200
                  `}
                  >
                    Start creating
                    <ArrowRight size={14} />
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-3">
            <Button
              variant="outline"
              onClick={() => setViewMode("templates")}
              className="rounded-xl"
            >
              <Layers size={16} />
              Browse templates
            </Button>
            <Button
              variant="outline"
              onClick={() => setViewMode("recent")}
              className="rounded-xl"
            >
              <Clock size={16} />
              Recent projects
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("editor")}
              className="rounded-xl"
            >
              <FolderOpen size={16} />
              Open editor
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("automation-queues")}
              className="rounded-xl border-indigo-500/30 text-indigo-400 hover:bg-indigo-500/10 hover:border-indigo-500/50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              Automation Queues
            </Button>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
          <p className="text-xs text-text-muted/60">
            Press{" "}
            <kbd className="px-1.5 py-0.5 bg-background-tertiary border border-border rounded text-text-muted font-mono text-[10px]">
              Esc
            </kbd>{" "}
            to skip
          </p>
        </div>
      </div>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-md p-0 gap-0 bg-background border-border overflow-hidden shadow-2xl">
          <DialogHeader className="p-5 border-b border-border flex flex-row items-center gap-3 space-y-0">
            {selectedOption && (
              <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/10">
                {(() => {
                  const IconComponent = selectedOption.icon;
                  return <IconComponent className="text-primary animate-pulse" size={20} />;
                })()}
              </div>
            )}
            <div>
              <DialogTitle className="text-lg font-semibold text-text-primary">
                Tạo dự án mới
              </DialogTitle>
              <DialogDescription className="text-xs text-text-muted mt-0.5">
                Nhập tên để khởi tạo dự án định dạng {selectedOption?.label} ({selectedOption?.dimensions})
              </DialogDescription>
            </div>
          </DialogHeader>

          <div className="p-5 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name-input" className="text-xs font-medium text-text-secondary">
                Tên dự án <span className="text-red-400">*</span>
              </Label>
              <Input
                id="project-name-input"
                type="text"
                value={newProjectName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Tên dự án..."
                className="bg-background-secondary border-border text-text-primary h-10 px-3 focus-visible:ring-1 focus-visible:ring-primary/50"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !nameError && newProjectName.trim()) {
                    handleConfirmCreate();
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
              onClick={() => setIsCreateDialogOpen(false)}
              className="rounded-lg text-sm text-text-secondary hover:text-text-primary"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmCreate}
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

export default WelcomeScreen;
