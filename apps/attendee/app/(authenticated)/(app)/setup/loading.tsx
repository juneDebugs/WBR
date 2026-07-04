export default function SetupLoading() {
  return (
    <div className="page-container animate-pulse">
      <div className="flex flex-col items-center mb-6">
        <div className="w-20 h-20 rounded-full bg-fill-2 mb-3" />
        <div className="h-5 w-32 bg-fill-2 rounded" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i}>
            <div className="h-3 w-16 bg-fill-2 rounded mb-2" />
            <div className="h-10 bg-fill-2 rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  )
}
