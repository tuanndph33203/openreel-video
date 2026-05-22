import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@openreel/ui";

interface YouTubeExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (metadata: { title: string; description: string; privacy: string }, apiKey: string) => void;
  defaultTitle?: string;
  initialApiKey?: string;
}

export const YouTubeExportDialog: React.FC<YouTubeExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  defaultTitle = "My Video",
  initialApiKey = "",
}) => {
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("private");
  const [apiKey, setApiKey] = useState(initialApiKey);

  const handleExport = () => {
    onExport({ title, description, privacy }, apiKey);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[425px] bg-background-secondary border-border text-text-primary">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Upload to YouTube</DialogTitle>
          <DialogDescription className="text-text-secondary mt-1.5">
            Enter the details for your YouTube video. You can provide an API Key/Token to skip Google Sign-In.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <label htmlFor="apiKey" className="text-sm font-medium">
              YouTube API Key / OAuth Token (Optional)
            </label>
            <input
              id="apiKey"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="Paste token to bypass authentication..."
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="title" className="text-sm font-medium">
              Title
            </label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
              placeholder="My awesome video"
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="description" className="text-sm font-medium">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-24 bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
              placeholder="Description..."
            />
          </div>
          <div className="grid gap-2">
            <label htmlFor="privacy" className="text-sm font-medium">
              Privacy Status
            </label>
            <select
              id="privacy"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              className="w-full bg-background-tertiary border border-border rounded-lg px-3 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="public">Public</option>
              <option value="unlisted">Unlisted</option>
              <option value="private">Private</option>
            </select>
          </div>
        </div>

        <DialogFooter className="mt-6 border-t border-border pt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text-primary hover:bg-background-tertiary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleExport}
            disabled={!title.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {apiKey.trim() ? "Upload directly" : "Sign in & Upload"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
