import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { RecentProjects } from "./RecentProjects";

const { mockCheckForRecovery, mockRecoverFromAutoSave } = vi.hoisted(() => ({
  mockCheckForRecovery: vi.fn(),
  mockRecoverFromAutoSave: vi.fn(),
}));

vi.mock("../../services/auto-save", () => ({
  checkForRecovery: () => mockCheckForRecovery(),
  autoSaveManager: {
    deleteProjectSaves: vi.fn().mockResolvedValue(undefined),
    renameProjectSaves: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("../../stores/project-store", () => {
  const store = {
    project: { id: "test-project" },
    createNewProject: vi.fn(),
    recoverFromAutoSave: mockRecoverFromAutoSave,
  };
  return {
    useProjectStore: (selector?: (state: any) => any) =>
      selector ? selector(store) : store,
  };
});

describe("RecentProjects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockCheckForRecovery.mockReturnValue(new Promise(() => {}));
    render(<RecentProjects />);
    expect(screen.getByText("Loading recent projects...")).toBeInTheDocument();
  });

  it("shows empty state when no projects", async () => {
    mockCheckForRecovery.mockResolvedValue([]);
    render(<RecentProjects />);

    await waitFor(() => {
      expect(screen.getByText("No Recent Projects")).toBeInTheDocument();
    });
  });

  it("displays recent projects from auto-save", async () => {
    mockCheckForRecovery.mockResolvedValue([
      {
        id: "project-1-slot-0",
        projectId: "project-1",
        projectName: "My Video Project",
        timestamp: Date.now() - 3600000,
        slot: 0,
        isRecovery: true,
      },
      {
        id: "project-2-slot-0",
        projectId: "project-2",
        projectName: "Another Project",
        timestamp: Date.now() - 7200000,
        slot: 0,
        isRecovery: true,
      },
    ]);

    render(<RecentProjects />);

    await waitFor(() => {
      expect(screen.getByText("My Video Project")).toBeInTheDocument();
      expect(screen.getByText("Another Project")).toBeInTheDocument();
    });
  });

  it("deduplicates projects by projectId showing most recent", async () => {
    mockCheckForRecovery.mockResolvedValue([
      {
        id: "project-1-slot-1",
        projectId: "project-1",
        projectName: "Project v2",
        timestamp: Date.now(),
        slot: 1,
        isRecovery: true,
      },
      {
        id: "project-1-slot-0",
        projectId: "project-1",
        projectName: "Project v1",
        timestamp: Date.now() - 3600000,
        slot: 0,
        isRecovery: true,
      },
    ]);

    render(<RecentProjects />);

    await waitFor(() => {
      expect(screen.getByText("Recent Projects (1)")).toBeInTheDocument();
      expect(screen.getByText("Project v2")).toBeInTheDocument();
      expect(screen.queryByText("Project v1")).not.toBeInTheDocument();
    });
  });

  it("calls recoverFromAutoSave when project is selected", async () => {
    mockCheckForRecovery.mockResolvedValue([
      {
        id: "project-1-slot-0",
        projectId: "project-1",
        projectName: "Test Project",
        timestamp: Date.now(),
        slot: 0,
        isRecovery: true,
      },
    ]);
    mockRecoverFromAutoSave.mockResolvedValue(true);
    const onProjectSelected = vi.fn();

    render(<RecentProjects onProjectSelected={onProjectSelected} />);

    await waitFor(() => {
      expect(screen.getByText("Test Project")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Test Project"));

    await waitFor(() => {
      expect(mockRecoverFromAutoSave).toHaveBeenCalledWith("project-1-slot-0");
      expect(onProjectSelected).toHaveBeenCalled();
    });
  });

  it("removes project from list when delete is clicked", async () => {
    window.confirm = () => true;
    mockCheckForRecovery.mockResolvedValue([
      {
        id: "project-1-slot-0",
        projectId: "project-1",
        projectName: "Project to Remove",
        timestamp: Date.now(),
        slot: 0,
        isRecovery: true,
      },
    ]);

    render(<RecentProjects />);

    await waitFor(() => {
      expect(screen.getByText("Project to Remove")).toBeInTheDocument();
    });

    const removeButton = screen.getByTitle("Delete project");
    fireEvent.click(removeButton);

    await waitFor(() => {
      expect(screen.queryByText("Project to Remove")).not.toBeInTheDocument();
      expect(screen.getByText("No Recent Projects")).toBeInTheDocument();
    });
  });

  it("shows relative dates for timestamps", async () => {
    mockCheckForRecovery.mockResolvedValue([
      {
        id: "project-1-slot-0",
        projectId: "project-1",
        projectName: "Today Project",
        timestamp: Date.now() - 1000,
        slot: 0,
        isRecovery: true,
      },
    ]);

    render(<RecentProjects />);

    await waitFor(() => {
      expect(screen.getByText("Today")).toBeInTheDocument();
    });
  });
});
