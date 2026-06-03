import React, { useEffect, useState } from 'react';
import { AutomationManager, type AutomationJob } from '@openreel/core';
import { useRouter } from '../hooks/use-router';
import { SettingsDialog } from '../components/editor/settings/SettingsDialog';
import { useSettingsStore } from '../stores/settings-store';
import { Settings, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { useTranslation } from '../hooks/use-translation';

export const AutomationQueues: React.FC = () => {
  const { t, language } = useTranslation();
  const [statusData, setStatusData] = useState<{
    watchedProjects: Array<{
      projectId: string;
      projectName: string;
      watchFolderName?: string;
      permissionGranted: boolean;
    }>;
    queue: AutomationJob[];
  }>({ watchedProjects: [], queue: [] });

  const { navigate } = useRouter();

  useEffect(() => {
    const refresh = () => {
      setStatusData(AutomationManager.getInstance().getStatus());
    };
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => clearInterval(interval);
  }, []);

  const { watchedProjects, queue } = statusData;

  return (
    <div className="min-h-screen bg-background p-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">{t('automation_queues.title')}</h1>
          <div className="flex gap-3">
            <button
              onClick={() => useSettingsStore.getState().openSettings("api-keys")}
              className="flex items-center gap-2 px-4 py-2 bg-background-secondary text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition"
            >
              <Settings size={16} />
              {t('automation_queues.settings_btn')}
            </button>
            <button
              onClick={() => navigate('welcome')}
              className="px-4 py-2 bg-background-secondary text-text-primary border border-border rounded-lg hover:bg-background-tertiary transition"
            >
              {t('automation_queues.back_home')}
            </button>
          </div>
        </div>

        {/* Watched Projects Section */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">{t('automation_queues.watched_folders')}</h2>
          {watchedProjects.length === 0 ? (
            <div className="p-8 text-center bg-background-secondary border border-border rounded-lg text-text-muted">
              <p>{t('automation_queues.no_watched_folders')}</p>
              <p className="mt-2 text-sm">{t('automation_queues.watch_folder_hint')}</p>
            </div>
          ) : (
            <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-background-tertiary border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm">{t('automation_queues.table_project_name')}</th>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm">{t('automation_queues.table_status')}</th>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm">{t('automation_queues.table_folder')}</th>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm">{t('automation_queues.table_action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {watchedProjects.map(status => (
                    <tr key={status.projectId} className="hover:bg-background-tertiary/50 transition">
                      <td className="px-6 py-4 font-medium text-text-primary">{status.projectName || (language === 'vi' ? 'Dự án chưa đặt tên' : 'Untitled Project')}</td>
                      <td className="px-6 py-4">
                        {!status.permissionGranted ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-500 font-medium">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            {t('automation_queues.status_needs_auth')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-green-500 font-medium">
                            <span className="w-2 h-2 rounded-full bg-green-500" />
                            {t('automation_queues.status_watching')}
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
                                  setStatusData(AutomationManager.getInstance().getStatus());
                                }
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white font-medium rounded-md transition-colors shadow-sm"
                            >
                              {t('automation_queues.btn_authorize')}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              AutomationManager.getInstance().unregisterProject(status.projectId);
                              setStatusData(AutomationManager.getInstance().getStatus());
                            }}
                            className="text-red-500 hover:text-red-400 font-medium transition-colors"
                          >
                            {t('automation_queues.btn_remove')}
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

        {/* Global Queue Section */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-4 tracking-tight">{t('automation_queues.processing_queue')}</h2>
          {queue.length === 0 ? (
            <div className="p-8 text-center bg-background-secondary border border-border rounded-lg text-text-muted">
              <p>{t('automation_queues.queue_empty')}</p>
              <p className="mt-2 text-sm">{t('automation_queues.queue_empty_desc')}</p>
            </div>
          ) : (
            <div className="bg-background-secondary border border-border rounded-lg overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-background-tertiary border-b border-border">
                  <tr>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm">{t('automation_queues.table_file_name')}</th>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm">{t('automation_queues.table_target_project')}</th>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm">{t('automation_queues.table_time_added')}</th>
                    <th className="px-6 py-3 font-medium text-text-secondary text-sm w-1/4">{t('automation_queues.table_status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {queue.map(job => (
                    <tr key={job.id} className="hover:bg-background-tertiary/50 transition">
                      <td className="px-6 py-4 font-medium text-text-primary truncate max-w-[200px]" title={job.fileName}>
                        {job.fileName}
                      </td>
                      <td className="px-6 py-4 text-text-secondary">
                        {job.projectName}
                      </td>
                      <td className="px-6 py-4 text-text-secondary">
                        {new Date(job.addedAt).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4">
                        {job.status === 'queued' && (
                          <span className="inline-flex items-center gap-1.5 text-text-muted font-medium">
                            <Clock size={16} />
                            {t('automation_queues.status_queued')}
                          </span>
                        )}
                        {job.status === 'processing' && (
                          <div className="flex flex-col gap-1.5 w-full">
                            <span className="inline-flex items-center gap-1.5 text-primary font-medium">
                              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                              {job.phase || t('automation_queues.status_processing')}
                            </span>
                            {job.progress > 0 && (
                              <div className="h-1.5 w-full bg-background-tertiary rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${job.progress}%` }} />
                              </div>
                            )}
                          </div>
                        )}
                        {job.status === 'done' && (
                          <span className="inline-flex items-center gap-1.5 text-green-500 font-medium">
                            <CheckCircle size={16} />
                            {t('automation_queues.status_complete')}
                          </span>
                        )}
                        {job.status === 'error' && (
                          <span className="inline-flex items-center gap-1.5 text-red-500 font-medium" title={job.phase}>
                            <AlertCircle size={16} />
                            {t('automation_queues.status_error', { error: job.phase })}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <SettingsDialog />
    </div>
  );
};
