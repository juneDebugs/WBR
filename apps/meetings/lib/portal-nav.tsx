'use client'

import { createContext, useContext } from 'react'

export interface PortalNavContextValue {
  currentPath: string
  navigate: (path: string) => void
  userId: string
  sponsorId: string | null
}

export const PortalNavContext = createContext<PortalNavContextValue>({
  currentPath: '/',
  navigate: () => {},
  userId: '',
  sponsorId: null,
})

export function usePortalNav() {
  return useContext(PortalNavContext)
}
