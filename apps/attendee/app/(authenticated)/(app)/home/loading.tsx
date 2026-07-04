export default function HomeLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="w-full md:max-w-2xl mx-auto">
        {/* Hero skeleton */}
        <div className="bg-fill-2 h-64" style={{ borderRadius: '0 0 28px 28px' }} />
        {/* Stats bar */}
        <div className="px-5 py-4 flex items-center justify-between border-b border-hairline">
          <div className="h-4 w-24 bg-fill-2 rounded" />
          <div className="h-3 w-40 bg-fill-2 rounded" />
        </div>
        {/* Tiles skeleton */}
        <div className="px-4 pt-5 grid grid-cols-2 gap-3">
          <div className="col-span-2 h-32 bg-fill-2 rounded-2xl" />
          <div className="aspect-square bg-fill-2 rounded-2xl" />
          <div className="aspect-square bg-fill-2 rounded-2xl" />
          <div className="aspect-square bg-fill-2 rounded-2xl" />
          <div className="aspect-square bg-fill-2 rounded-2xl" />
        </div>
      </div>
    </div>
  )
}
