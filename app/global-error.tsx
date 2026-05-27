"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          fontFamily: "system-ui, sans-serif",
          color: "#fff",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 400, padding: "2rem" }}>
          <div style={{ fontSize: 48, marginBottom: "1rem" }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: "0 0 0.5rem" }}>
            Something went wrong
          </h1>
          <p style={{ color: "#888", margin: "0 0 1.5rem", lineHeight: 1.6 }}>
            An unexpected error occurred. Your account and funds are safe.
            Please refresh the page or contact support if this persists.
          </p>
          {error.digest && (
            <p style={{ fontSize: 11, color: "#555", marginBottom: "1.5rem" }}>
              Error ID: {error.digest}
            </p>
          )}
          <button
            onClick={reset}
            style={{
              background: "#10b981",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
