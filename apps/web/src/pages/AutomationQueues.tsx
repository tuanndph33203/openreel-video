import React, { useEffect, useState } from 'react';
import { AutomationManager } from '@openreel/core';
import { useRouter } from '../hooks/use-router';

/**
 * Global queue page showing the status of automation jobs across all projects.
 */
export const AutomationQueues: React.FC = () => {
  const [statuses, setStatuses] = useState<Array<{ 
    projectId: string; 
    projectName: string; 
    processing: boolean; 
    queueLength: number; 
    phase: string; 
    progress: number; 
    watchFolderName?: string;
    permissionGranted: boolean;
  }>>([]);
  const { navigate } = useRouter();

  useEffect(() => {
    const refresh = () => {
      setStatuses(AutomationManager.getInstance().getStatus());
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-text-primary">Automation Queues</h1>
          <button
            onClick={() => navigate('welcome')}
            className="px-4 py-2 bg-background-secondary text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition"
          >
            Back to Home
          </button>
        </div>

        {statuses.length === 0 ? (
          <div className="p-8 text-center bg-background-secondary border border-border rounded-lg text-text-muted">
            <p>No projects are currently being watched.</p>
            <p className="mt-2 text-sm">Open a project and click "Select Watch Folder" in the Automation settings to begin.</p>
          </div>
        ) : (
          <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
            <table className="w-full text-left">
              <thead className="bg-background-tertiary border-b border-border">
                <tr>
                  <th className="px-6 py-3 font-medium text-text-secondary">Project Name</th>
                  <th className="px-6 py-3 font-medium text-text-secondary">Status</th>
                  <th className="px-6 py-3 font-medium text-text-secondary">Folder</th>
                  <th className="px-6 py-3 font-medium text-text-secondary">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {statuses.map(status => (
                  <tr key={status.projectId} className="hover:bg-background-tertiary/50 transition">
                    <td className="px-6 py-4 font-medium text-text-primary">{status.projectName || 'Untitled Project'}</td>
                    <td className="px-6 py-4">
                      {!status.permissionGranted ? (
                        <span className="inline-flex items-center gap-1.5 text-amber-500 text-xs font-semibold">
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                          Needs Authorization
                        </span>
                      ) : status.processing ? (
                        <div className="flex flex-col gap-1 w-full max-w-[200px]">
                          <span className="inline-flex items-center gap-1.5 text-indigo-400 text-xs font-medium">
                            <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                            {status.phase || 'Processing...'}
                          </span>
                          {status.progress > 0 && (
                            <div className="h-1.5 w-full bg-background-elevated rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${status.progress}%` }} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-green-500">
                          <span className="w-2 h-2 rounded-full bg-green-500" />
                          Idle
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 font-mono text-text-secondary">{status.watchFolderName || '-'}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {!status.permissionGranted && (
                          <button
                            onClick={async () => {
                              const success = await AutomationManager.getInstance().requestPermission(status.projectId);
                              if (success) {
                                setStatuses(AutomationManager.getInstance().getStatus());
                              }
                            }}
                            className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors shadow-sm"
                          >
                            Authorize
                          </button>
                        )}
                        <button
                          onClick={() => {
                            AutomationManager.getInstance().unregisterProject(status.projectId);
                            // refresh after removal
                            setStatuses(prev => prev.filter(s => s.projectId !== status.projectId));
                          }}
                          className="text-sm text-red-500 hover:text-red-400 font-medium transition-colors"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

