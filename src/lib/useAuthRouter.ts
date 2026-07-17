'use client'

import { useRouter } from 'next/navigation'
import { getAuthToken, appendToken } from '@/lib/auth-token'

export function useAuthRouter() {
  const router = useRouter()
  return {
    push: (href: string) => router.push(appendToken(href, getAuthToken())),
    replace: (href: string) => router.replace(appendToken(href, getAuthToken())),
  }
}
