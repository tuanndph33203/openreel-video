import React, { useState, useEffect, useCallback } from "react";
import {
  Key,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ExternalLink,
  Shield,
  KeyRound,
} from "lucide-react";
import { Input } from "@openreel/ui";
import { Button } from "@openreel/ui";
import { useSettingsStore, SERVICE_REGISTRY } from "../../../stores/settings-store";
import {
  isMasterPasswordSet,
  isSessionUnlocked,
  setupMasterPassword,
  unlockSession,
  lockSession,
  saveSecret,
  getSecret,
  deleteSecret,
  listSecrets,
  changeMasterPassword,
} from "../../../services/secure-storage";
import { MasterPasswordDialog } from "./MasterPasswordDialog";
import { toast } from "../../../stores/notification-store";
import { useTranslation } from "../../../hooks/use-translation";
import {
  NVIDIA_OPENAI_BASE_URL,
  NVIDIA_QWEN3_NEXT_MODEL,
} from "../../../utils/ai-config";

export const ApiKeysPanel: React.FC = () => {
  const {
    addConfiguredService,
    removeConfiguredService,
    customOpenAiBaseUrl,
    customAnthropicBaseUrl,
    customGeminiBaseUrl,
    customOpenAiModel,
    customAnthropicModel,
    customGeminiModel,
    setCustomOpenAiBaseUrl,
    setCustomAnthropicBaseUrl,
    setCustomGeminiBaseUrl,
    setCustomOpenAiModel,
    setCustomAnthropicModel,
    setCustomGeminiModel,
  } = useSettingsStore();

  const { t } = useTranslation();

  const [passwordSet, setPasswordSet] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [passwordDialogMode, setPasswordDialogMode] = useState<
    "setup" | "unlock" | "change" | null
  >(null);
  const [storedKeys, setStoredKeys] = useState<
    Array<{ id: string; label: string; createdAt: number; updatedAt: number }>
  >([]);
  const [addingService, setAddingService] = useState<string | null>(null);
  const [newKeyValue, setNewKeyValue] = useState("");
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});

  const refreshState = useCallback(async () => {
    const isSet = await isMasterPasswordSet();
    setPasswordSet(isSet);
    setUnlocked(isSessionUnlocked());

    if (isSessionUnlocked()) {
      const keys = await listSecrets();
      setStoredKeys(keys);
    }
  }, []);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const handlePasswordSubmit = useCallback(
    async (password: string, newPassword?: string): Promise<boolean> => {
      if (passwordDialogMode === "setup") {
        await setupMasterPassword(password);
        setPasswordDialogMode(null);
        await refreshState();
        toast.success(t("api_keys.toasts.setup_success"), t("api_keys.toasts.setup_success_desc"));
        return true;
      }

      if (passwordDialogMode === "unlock") {
        const success = await unlockSession(password);
        if (success) {
          setPasswordDialogMode(null);
          await refreshState();
          toast.success(t("api_keys.toasts.unlock_success"), t("api_keys.toasts.unlock_success_desc"));
        }
        return success;
      }

      if (passwordDialogMode === "change" && newPassword) {
        const success = await changeMasterPassword(password, newPassword);
        if (success) {
          setPasswordDialogMode(null);
          await refreshState();
          toast.success(t("api_keys.toasts.change_success"), t("api_keys.toasts.change_success_desc"));
        }
        return success;
      }

      return false;
    },
    [passwordDialogMode, refreshState],
  );

  const handleSaveKey = useCallback(
    async (serviceId: string) => {
      if (!newKeyValue.trim()) return;

      const service = SERVICE_REGISTRY.find((s) => s.id === serviceId);
      if (!service) return;

      try {
        await saveSecret(serviceId, service.label, newKeyValue.trim());
        addConfiguredService(serviceId);
        setNewKeyValue("");
        setAddingService(null);
        await refreshState();
        toast.success(t("api_keys.toasts.save_success", { name: service.label }), t("api_keys.toasts.save_success_desc"));
      } catch (err) {
        toast.error(t("api_keys.toasts.save_failed"), err instanceof Error ? err.message : "Unknown error");
      }
    },
    [newKeyValue, addConfiguredService, refreshState],
  );

  const handleDeleteKey = useCallback(
    async (serviceId: string) => {
      const service = SERVICE_REGISTRY.find((s) => s.id === serviceId);
      try {
        await deleteSecret(serviceId);
        removeConfiguredService(serviceId);
        setRevealedKeys((prev) => {
          const next = { ...prev };
          delete next[serviceId];
          return next;
        });
        await refreshState();
        toast.success(t("api_keys.toasts.delete_success", { name: service?.label ?? serviceId }));
      } catch (err) {
        toast.error(t("api_keys.toasts.delete_failed"), err instanceof Error ? err.message : "Unknown error");
      }
    },
    [removeConfiguredService, refreshState],
  );

  const handleRevealKey = useCallback(async (serviceId: string) => {
    if (revealedKeys[serviceId]) {
      setShowKey((prev) => ({ ...prev, [serviceId]: !prev[serviceId] }));
      return;
    }

    try {
      const value = await getSecret(serviceId);
      if (value) {
        setRevealedKeys((prev) => ({ ...prev, [serviceId]: value }));
        setShowKey((prev) => ({ ...prev, [serviceId]: true }));
      }
    } catch (err) {
      toast.error(t("api_keys.toasts.decrypt_failed"), err instanceof Error ? err.message : "Unknown error");
    }
  }, [revealedKeys]);

  const handleLock = useCallback(() => {
    lockSession();
    setUnlocked(false);
    setStoredKeys([]);
    setRevealedKeys({});
    setShowKey({});
  }, []);

  const availableServices = SERVICE_REGISTRY.filter(
    (s) => !storedKeys.some((k) => k.id === s.id),
  );

  // Not set up yet
  if (!passwordSet) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
          <Shield size={32} className="text-primary" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          {t("api_keys.title")}
        </h3>
        <p className="text-sm text-text-muted mb-6 max-w-sm">
          {t("api_keys.desc")}
        </p>
        <Button onClick={() => setPasswordDialogMode("setup")}>
          <KeyRound size={16} className="mr-2" />
          {t("api_keys.btn_setup")}
        </Button>

        {passwordDialogMode && (
          <MasterPasswordDialog
            isOpen={!!passwordDialogMode}
            onClose={() => setPasswordDialogMode(null)}
            mode={passwordDialogMode}
            onSubmit={handlePasswordSubmit}
          />
        )}
      </div>
    );
  }

  // Locked
  if (!unlocked) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 rounded-full bg-amber-500/10 flex items-center justify-center mb-4">
          <Lock size={32} className="text-amber-500" />
        </div>
        <h3 className="text-lg font-medium text-text-primary mb-2">
          {t("api_keys.locked_title")}
        </h3>
        <p className="text-sm text-text-muted mb-6 max-w-sm">
          {t("api_keys.locked_desc")}
        </p>
        <Button onClick={() => setPasswordDialogMode("unlock")}>
          <Unlock size={16} className="mr-2" />
          {t("api_keys.btn_unlock")}
        </Button>

        {passwordDialogMode && (
          <MasterPasswordDialog
            isOpen={!!passwordDialogMode}
            onClose={() => setPasswordDialogMode(null)}
            mode={passwordDialogMode}
            onSubmit={handlePasswordSubmit}
          />
        )}
      </div>
    );
  }

  // Unlocked — full management UI
  return (
    <div className="space-y-6">
      {/* Header actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Shield size={14} className="text-primary" />
          <span>
            {t("api_keys.stored_count", { count: storedKeys.length, plural: storedKeys.length !== 1 ? "s" : "" })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPasswordDialogMode("change")}
          >
            <Key size={14} className="mr-1" />
            {t("api_keys.btn_change")}
          </Button>
          <Button variant="outline" size="sm" onClick={handleLock}>
            <Lock size={14} className="mr-1" />
            {t("api_keys.btn_lock")}
          </Button>
        </div>
      </div>

      {/* Stored keys list */}
      <div className="space-y-3">
        {storedKeys.map((stored) => {
          const service = SERVICE_REGISTRY.find((s) => s.id === stored.id);
          const isRevealed = showKey[stored.id] && revealedKeys[stored.id];

          return (
            <div
              key={stored.id}
              className="border border-border rounded-lg p-4 bg-background-secondary"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Key size={14} className="text-primary" />
                  <span className="text-sm font-medium text-text-primary">
                    {service?.label ?? stored.label}
                  </span>
                  {service?.docsUrl && (
                    <a
                      href={service.docsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted hover:text-primary transition-colors"
                    >
                      <ExternalLink size={12} />
                    </a>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRevealKey(stored.id)}
                    className="p-1.5 rounded hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
                    title={isRevealed ? t("api_keys.hide_key") : t("api_keys.show_key")}
                  >
                    {isRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                  <button
                    onClick={() => handleDeleteKey(stored.id)}
                    className="p-1.5 rounded hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                    title={t("api_keys.delete_key")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {service && (
                <p className="text-xs text-text-muted mb-2">
                  {service.description}
                </p>
              )}

              <div className="font-mono text-xs bg-background rounded px-3 py-2 text-text-secondary">
                {isRevealed
                  ? revealedKeys[stored.id]
                  : "••••••••••••••••••••••••••••••••"}
              </div>

              {stored.id === "openai" && (
                <div className="mt-3 space-y-3">
                  <div className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-background-secondary/40 px-3 py-2">
                    <div className="text-[10px] text-text-muted">
                      NVIDIA Qwen preset for subtitle translation
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => {
                        setCustomOpenAiBaseUrl(NVIDIA_OPENAI_BASE_URL);
                        setCustomOpenAiModel(NVIDIA_QWEN3_NEXT_MODEL);
                        toast.success("Applied NVIDIA Qwen preset");
                      }}
                    >
                      Use preset
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-text-secondary">
                      {t("api_keys.custom_endpoint_base")}
                    </label>
                    <Input
                      type="text"
                      value={customOpenAiBaseUrl}
                      onChange={(e) => setCustomOpenAiBaseUrl(e.target.value)}
                      placeholder="e.g. https://api.openai.com/v1, https://integrate.api.nvidia.com/v1"
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-text-muted">
                      {t("api_keys.custom_endpoint_base_desc")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-text-secondary">
                      {t("api_keys.custom_model")}
                    </label>
                    <Input
                      type="text"
                      value={customOpenAiModel}
                      onChange={(e) => setCustomOpenAiModel(e.target.value)}
                      placeholder="e.g. mimo-v2.5, qwen/qwen3-next-80b-a3b-instruct, deepseek-chat"
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-text-muted">
                      {t("api_keys.custom_model_desc")}
                    </p>
                  </div>
                </div>
              )}

              {stored.id === "anthropic" && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-text-secondary">
                      {t("api_keys.custom_endpoint_base")}
                    </label>
                    <Input
                      type="text"
                      value={customAnthropicBaseUrl}
                      onChange={(e) => setCustomAnthropicBaseUrl(e.target.value)}
                      placeholder="e.g. https://api.anthropic.com/v1 or custom proxy endpoint"
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-text-muted">
                      {t("api_keys.custom_endpoint_base_desc")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-text-secondary">
                      {t("api_keys.custom_model")}
                    </label>
                    <Input
                      type="text"
                      value={customAnthropicModel}
                      onChange={(e) => setCustomAnthropicModel(e.target.value)}
                      placeholder="e.g. claude-3-5-sonnet-20241022 (default: claude-3-5-haiku-20241022)"
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-text-muted">
                      {t("api_keys.custom_model_desc")}
                    </p>
                  </div>
                </div>
              )}

              {stored.id === "gemini" && (
                <div className="mt-3 space-y-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-text-secondary">
                      {t("api_keys.custom_endpoint_base")}
                    </label>
                    <Input
                      type="text"
                      value={customGeminiBaseUrl}
                      onChange={(e) => setCustomGeminiBaseUrl(e.target.value)}
                      placeholder="e.g. https://generativelanguage.googleapis.com/v1beta or custom proxy endpoint"
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-text-muted">
                      {t("api_keys.custom_endpoint_base_desc")}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-text-secondary">
                      {t("api_keys.custom_model")}
                    </label>
                    <Input
                      type="text"
                      value={customGeminiModel}
                      onChange={(e) => setCustomGeminiModel(e.target.value)}
                      placeholder="e.g. gemini-1.5-flash, gemini-1.5-pro, gemini-2.0-flash (default: gemini-1.5-flash)"
                      className="font-mono text-xs"
                    />
                    <p className="text-[10px] text-text-muted">
                      {t("api_keys.custom_model_desc")}
                    </p>
                  </div>
                </div>
              )}

              <div className="text-[10px] text-text-muted mt-2">
                Added {new Date(stored.createdAt).toLocaleDateString()} &middot;
                Updated {new Date(stored.updatedAt).toLocaleDateString()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add new key */}
      {addingService ? (
        <div className="border border-primary/30 rounded-lg p-4 bg-primary/5">
          <div className="flex items-center gap-2 mb-3">
            <Plus size={14} className="text-primary" />
            <span className="text-sm font-medium text-text-primary">
              {t("api_keys.add_key_btn", {
                name: SERVICE_REGISTRY.find((s) => s.id === addingService)?.label ?? "",
              })}
            </span>
          </div>
          <Input
            type="password"
            value={newKeyValue}
            onChange={(e) => setNewKeyValue(e.target.value)}
            placeholder={t("api_keys.key_placeholder")}
            autoFocus
            className="mb-3 font-mono text-xs"
          />

          {addingService === "openai" && (
            <div className="mb-3 space-y-1 text-left">
              <label className="block text-[11px] font-medium text-text-secondary">
                {t("api_keys.custom_endpoint_base")}
              </label>
              <Input
                type="text"
                value={customOpenAiBaseUrl}
                onChange={(e) => setCustomOpenAiBaseUrl(e.target.value)}
                placeholder="e.g. https://api.openai.com/v1 or custom proxy endpoint"
                className="font-mono text-xs mb-1"
              />
              <p className="text-[10px] text-text-muted">
                {t("api_keys.custom_endpoint_base_desc")}
              </p>
            </div>
          )}

          {addingService === "anthropic" && (
            <div className="mb-3 space-y-1 text-left">
              <label className="block text-[11px] font-medium text-text-secondary">
                {t("api_keys.custom_endpoint_base")}
              </label>
              <Input
                type="text"
                value={customAnthropicBaseUrl}
                onChange={(e) => setCustomAnthropicBaseUrl(e.target.value)}
                placeholder="e.g. https://api.anthropic.com/v1 or custom proxy endpoint"
                className="font-mono text-xs mb-1"
              />
              <p className="text-[10px] text-text-muted">
                {t("api_keys.custom_endpoint_base_desc")}
              </p>
            </div>
          )}

          {addingService === "gemini" && (
            <div className="mb-3 space-y-1 text-left">
              <label className="block text-[11px] font-medium text-text-secondary">
                {t("api_keys.custom_endpoint_base")}
              </label>
              <Input
                type="text"
                value={customGeminiBaseUrl}
                onChange={(e) => setCustomGeminiBaseUrl(e.target.value)}
                placeholder="e.g. https://generativelanguage.googleapis.com/v1beta or custom proxy endpoint"
                className="font-mono text-xs mb-1"
              />
              <p className="text-[10px] text-text-muted">
                {t("api_keys.custom_endpoint_base_desc")}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setAddingService(null);
                setNewKeyValue("");
              }}
            >
              {t("api_keys.cancel_btn")}
            </Button>
            <Button
              size="sm"
              onClick={() => handleSaveKey(addingService)}
              disabled={!newKeyValue.trim()}
            >
              {t("api_keys.save_key_btn")}
            </Button>
          </div>
        </div>
      ) : availableServices.length > 0 ? (
        <div>
          <h4 className="text-sm font-medium text-text-secondary mb-3">
            {t("api_keys.add_key_title")}
          </h4>
          <div className="grid gap-2">
            {availableServices.map((service) => (
              <button
                key={service.id}
                onClick={() => setAddingService(service.id)}
                className="flex items-center gap-3 p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-left group"
              >
                <div className="p-2 rounded-lg bg-background-tertiary group-hover:bg-primary/10 transition-colors">
                  <Plus
                    size={14}
                    className="text-text-muted group-hover:text-primary transition-colors"
                  />
                </div>
                <div>
                  <div className="text-sm font-medium text-text-primary">
                    {service.label}
                  </div>
                  <div className="text-xs text-text-muted">
                    {service.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {passwordDialogMode && (
        <MasterPasswordDialog
          isOpen={!!passwordDialogMode}
          onClose={() => setPasswordDialogMode(null)}
          mode={passwordDialogMode}
          onSubmit={handlePasswordSubmit}
        />
      )}
    </div>
  );
};
