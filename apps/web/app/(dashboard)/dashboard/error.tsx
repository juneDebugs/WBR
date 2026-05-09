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
      <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 flex-shrink-0">
        <h1 className="text-base font-semibold text-gray-900">Error</h1>
      </header>
      <main className="flex-1 p-6">
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center max-w-md mx-auto mt-12">
          <p className="text-gray-900 font-medium mb-2">Something went wrong</p>
          <p className="text-sm text-gray-500 mb-4">{error.message}</p>
          <button
            onClick={reset}
            className="px-4 py-2 bg-primary text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
        </div>
      </main>
    </>
  )
}
