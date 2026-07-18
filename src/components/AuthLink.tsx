import Link from 'next/link'
import type { ComponentProps } from 'react'
import { appendToken } from '@/lib/auth-token'

type AuthLinkProps = ComponentProps<typeof Link> & { token: string }

export default function AuthLink({ href, token, ...rest }: AuthLinkProps) {
  // Fail loudly at dev-time rather than silently dropping the auth token:
  // a UrlObject href would otherwise pass through untouched, and the token
  // loss only surfaces later as an unexplained 403 for a real user.
  if (typeof href !== 'string') {
    throw new Error('AuthLink requires a string href so the auth token can be appended; got an object href instead.')
  }
  const finalHref = appendToken(href, token)
  return <Link href={finalHref} {...rest} />
}
