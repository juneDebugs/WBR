'use client'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <>
      <header className="h-14 bg-white border-b border-hairline flex items-center px-6 flex-shrink-0">
        <h1 className="text-base font-semibold text-ink">Error</h1>
      </header>
      <main className="flex-1 p-6">
        <div className="bg-white border border-hairline rounded-xl p-8 text-center max-w-md mx-auto mt-12">
          <p className="text-ink font-medium mb-2">Something went wrong</p>
          <p className="text-sm text-ink-2 mb-4">{error.message}</p>
          <button
            onClick={reset}
            className="btn-primary"
          >
            Try again
          </button>
        </div>
      </main>
    </>
  )
}
