import { GlobalSearch } from './GlobalSearch'

interface Props {
  title: string
}

export function AdminHeader({ title }: Props) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-6 gap-4 flex-shrink-0">
      <h1 className="text-base font-semibold text-gray-900">{title}</h1>
      <div className="ml-auto">
        <GlobalSearch />
      </div>
    </header>
  )
}
