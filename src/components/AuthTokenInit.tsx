'use client'

import { useEffect } from 'react'
import { setAuthToken, getAuthToken, appendToken } from '@/lib/auth-token'

type WindowWithPatchFlag = { __authFetchPatched?: boolean }

export default function AuthTokenInit({ initialToken }: { initialToken: string }) {
  useEffect(() => {
    setAuthToken(initialToken)

    const w = window as unknown as WindowWithPatchFlag
    if (w.__authFetchPatched) return
    w.__authFetchPatched = true

    const originalFetch = window.fetch.bind(window)
    const origin = window.location.origin

    window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : null

      if (url === null) {
        return originalFetch(input, init)
      }

      // Resolve against `origin` rather than a startsWith() check — a plain
      // string-prefix test treats protocol-relative URLs like
      // "//evil.example.com/x" as same-origin (they also start with "/"),
      // which would attach the live auth token to a third-party request.
      const isSameOrigin = new URL(url, origin).origin === origin
      if (!isSameOrigin) {
        return originalFetch(input, init)
      }

      const urlWithToken = appendToken(url, getAuthToken())
      const response = await originalFetch(urlWithToken, init)
      const freshToken = response.headers.get('x-auth-token')
      if (freshToken) setAuthToken(freshToken)
      return response
    }
  }, [initialToken])

  return null
}
