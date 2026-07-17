import Link from 'next/link'
import type { ComponentProps } from 'react'
import { appendToken } from '@/lib/auth-token'

type AuthLinkProps = ComponentProps<typeof Link> & { token: string }

export default function AuthLink({ href, token, ...rest }: AuthLinkProps) {
  const finalHref = typeof href === 'string' ? appendToken(href, token) : href
  return <Link href={finalHref} {...rest} />
}
