export default function MapLoading() {
  return (
    <div className="min-h-screen animate-pulse">
      <div className="px-4 pt-4 pb-3">
        <div className="h-7 w-32 bg-fill-2 rounded" />
      </div>
      <div className="px-4 flex gap-2">
        <div className="h-8 w-28 bg-fill-2 rounded-full" />
        <div className="h-8 w-28 bg-fill-2 rounded-full" />
        <div className="h-8 w-28 bg-fill-2 rounded-full" />
      </div>
      <div className="px-3 mt-3">
        <div className="aspect-[4/3] w-full bg-fill-2 rounded-xl" />
      </div>
    </div>
  )
}
