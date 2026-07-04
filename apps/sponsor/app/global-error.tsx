'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html>
      <body style={{ padding: 40, fontFamily: 'system-ui', background: '#1a1a2e', color: '#fff' }}>
        <h2>Something went wrong</h2>
        <pre style={{ color: '#f87171', whiteSpace: 'pre-wrap', fontSize: 14 }}>
          {error.message}
        </pre>
        {error.digest && (
          <p style={{ color: '#9ca3af', fontSize: 13 }}>Digest: {error.digest}</p>
        )}
        <button
          onClick={reset}
          style={{
            marginTop: 16,
            padding: '10px 20px',
            background: '#6366f1',
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  )
}
