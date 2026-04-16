import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { initialiseSentry } from "./services/sentryService";

// Initialise Sentry only if the user opted in (stored in settings).
// We read the setting directly from localStorage here to avoid waiting for the
// full Zustand store to hydrate before crash reporting is active.
try {
  const raw = window.localStorage.getItem('mph_settings_v1');
  if (raw) {
    const settings = JSON.parse(raw) as { privacy?: { sendCrashReports?: boolean } };
    if (settings.privacy?.sendCrashReports === true) {
      void initialiseSentry();
    }
  }
} catch {
  // If settings can't be read, stay silent — don't block app startup.
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Show the Tauri window only after the first browser paint.
// This avoids revealing a blank WebView before React has actually rendered.
