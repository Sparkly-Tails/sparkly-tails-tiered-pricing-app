import { headers } from 'next/headers'
import AuthLink from '@/components/AuthLink'

export default async function NotFound() {
  const token = (await headers()).get('x-auth-token') ?? ''

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-semibold mb-2">Group not found</h1>
      <p className="text-sm text-muted mb-6">
        It may have been deleted, or the link is out of date.
      </p>
      <AuthLink
        href="/"
        token={token}
        className="inline-block bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Back to groups
      </AuthLink>
    </main>
  )
}
