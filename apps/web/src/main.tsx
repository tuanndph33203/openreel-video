import React from "react";
import ReactDOM from "react-dom/client";
import posthog from "posthog-js";
import { PostHogProvider } from "posthog-js/react";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./services/service-worker";

const POSTHOG_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_PUBLIC_POSTHOG_HOST;

if (POSTHOG_KEY && POSTHOG_HOST) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
  });
}

registerServiceWorker().then((registration) => {
  if (registration) {
  }
});

if (import.meta.env.DEV) {
  window.addEventListener("error", (event) => {
    const error = event.error;
    const message = error ? error.message : event.message;
    const stack = error ? error.stack : `at ${event.filename}:${event.lineno}:${event.colno}`;
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[BROWSER UNCAUGHT ERROR] ${message}`,
        stack: stack,
      }),
    }).catch(() => {});
  });

  window.addEventListener("unhandledrejection", (event) => {
    const error = event.reason;
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    fetch("/api/log-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: `[BROWSER UNHANDLED REJECTION] ${message}`,
        stack: stack,
      }),
    }).catch(() => {});
  });
}

const root = document.getElementById("root")!;

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    {POSTHOG_KEY && POSTHOG_HOST ? (
      <PostHogProvider client={posthog}>
        <App />
      </PostHogProvider>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
