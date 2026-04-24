type RecentActivityBlockProps = {
  markdown: string;
  loading: boolean;
  error: string | null;
};

export function RecentActivityBlock({
  markdown,
  loading,
  error,
}: RecentActivityBlockProps) {
  if (!markdown && !loading && !error) {
    return null;
  }

  return (
    <section
      aria-live="polite"
      style={{
        marginTop: '12px',
        padding: '12px',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.12)',
        background: 'rgba(255, 255, 255, 0.04)',
      }}
    >
      <div
        style={{
          marginBottom: '10px',
          fontSize: '0.72rem',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255, 255, 255, 0.6)',
        }}
      >
        What changed recently
      </div>

      {loading ? (
        <div
          style={{
            marginBottom: markdown ? '10px' : 0,
            fontSize: '0.9rem',
            color: 'rgba(255, 255, 255, 0.7)',
          }}
        >
          Refreshing recent activity...
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          style={{
            marginBottom: markdown ? '10px' : 0,
            fontSize: '0.9rem',
            color: '#ff9b9b',
          }}
        >
          {error}
        </div>
      ) : null}

      {markdown ? (
        <pre
          style={{
            margin: 0,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            fontFamily:
              'ui-monospace, SFMono-Regular, SF Mono, Consolas, Liberation Mono, Menlo, monospace',
            fontSize: '0.9rem',
            lineHeight: 1.5,
            color: 'inherit',
          }}
        >
          {markdown}
        </pre>
      ) : null}
    </section>
  );
}
