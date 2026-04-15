import { useRegisterSW } from "virtual:pwa-register/react";

export function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      // Check for updates every 60 minutes
      if (registration) {
        setInterval(() => {
          registration.update();
        }, 60 * 60 * 1000);
      }
      console.log("[PWA] Service worker registered:", swUrl);
    },
    onRegisterError(error) {
      console.error("[PWA] Registration error:", error);
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1rem",
        right: "1rem",
        background: "#2d2d44",
        border: "1px solid #4a4a6a",
        borderRadius: "0.5rem",
        padding: "1rem",
        boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
        maxWidth: "300px",
      }}
    >
      <div style={{ color: "#fff", fontWeight: 500 }}>
        🎉 Update available!
      </div>
      <div style={{ color: "#aaa", fontSize: "0.875rem" }}>
        A new version of Memephant is ready. Refresh to get the latest features.
      </div>
      <div style={{ display: "flex", gap: "0.5rem" }}>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            background: "#6c5ce7",
            color: "#fff",
            border: "none",
            borderRadius: "0.375rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
            fontWeight: 500,
          }}
        >
          Update now
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          style={{
            background: "transparent",
            color: "#aaa",
            border: "1px solid #4a4a6a",
            borderRadius: "0.375rem",
            padding: "0.5rem 1rem",
            cursor: "pointer",
          }}
        >
          Later
        </button>
      </div>
    </div>
  );
}