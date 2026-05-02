import { cache } from 'react'
import { getServerSession } from 'next-auth'
import { authOptions } from './auth'

/**
 * Cached getServerSession — deduplicated within a single React server render.
 * Multiple layouts/pages calling getSession() in one request only decode the JWT once.
 */
export const getSession = cache(() => getServerSession(authOptions))
