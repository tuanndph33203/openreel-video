import React, { useEffect, useState } from 'react';
import { AutomationManager } from '@openreel/core';
import { useProjectStore } from '../../../stores/project-store';

/**
 * Panel displayed inside the editor showing the current project's queue status.
 * It lists pending files and shows a simple progress indicator for the active job.
 */
export const AutoProcessQueuePanel: React.FC = () => {
  const project = useProjectStore((state: any) => state.project);
  const [queueLength, setQueueLength] = useState(0);
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!project) return;
    const refresh = () => {
      const manager = AutomationManager.getInstance();
      const status = manager.getStatus().find((s: any) => s.projectId === project.id);
      if (status) {
        setQueueLength(status.queueLength);
        setProcessing(status.processing);
      }
    };
    // Initial load
    refresh();
    // Poll every 2 seconds – UI is lightweight
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, [project?.id]);

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow-md mt-4">
      <h3 className="text-lg font-semibold mb-2">Automation Queue</h3>
      {processing ? (
        <p className="text-yellow-600">Processing current video…</p>
      ) : (
        <p className="text-green-600">Idle</p>
      )}
      <p className="mt-2">Pending jobs: <span className="font-mono">{queueLength}</span></p>
    </div>
  );
};
