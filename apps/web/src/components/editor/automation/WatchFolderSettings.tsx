import React, { useState } from 'react';
import { AutomationManager } from '@openreel/core';
import { useProjectStore } from '../../../stores/project-store';
import { useRouter } from '../../../hooks/use-router';

/**
 * UI panel that allows the user to select a folder to watch for a given project.
 * It registers the folder with the AutomationManager singleton.
 */
export const WatchFolderSettings: React.FC = () => {
  const project = useProjectStore((state: any) => state.project);
  const { navigate } = useRouter();
  const [folderName, setFolderName] = useState<string>('');
  const [watching, setWatching] = useState<boolean>(false);

  const selectFolder = async () => {
    try {
      if (!project) return;
      // Prompt the user to pick a directory
      const dirHandle = await (window as any).showDirectoryPicker();
      // Register this project with the selected folder
      await AutomationManager.getInstance().registerProject(project, dirHandle);
      setFolderName(dirHandle.name || 'Selected Folder');
      setWatching(true);
    } catch (e) {
      console.error('Folder selection cancelled or failed', e);
    }
  };

  const stopWatching = () => {
    if (!project) return;
    AutomationManager.getInstance().unregisterProject(project.id);
    setWatching(false);
    setFolderName('');
  };

  return (
    <div className="p-4 rounded-lg bg-white dark:bg-gray-800 shadow-md">
      <h3 className="text-lg font-semibold mb-2">Automation – Watch Folder</h3>
      {watching ? (
        <div className="flex items-center space-x-4">
          <span className="text-sm text-green-600">Watching: {folderName}</span>
          <button
            onClick={stopWatching}
            className="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition"
          >
            Stop
          </button>
        </div>
      ) : (
        <button
          onClick={selectFolder}
          className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition"
        >
          Select Watch Folder
        </button>
      )}
      <div className="mt-3">
        <button
          onClick={() => navigate('automation-queues')}
          className="text-sm underline text-blue-500 hover:text-blue-700"
        >
          View all automation queues
        </button>
      </div>
    </div>
  );
};
