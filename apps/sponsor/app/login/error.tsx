'use client'

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e] px-6">
      <div className="w-full max-w-md text-center">
        <h2 className="text-2xl font-bold text-white mb-3">Unable to load login</h2>
        <p className="text-gray-400 text-sm mb-6">{error.message}</p>
        <button
          onClick={reset}
          className="bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-6 rounded-xl transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  )
}
