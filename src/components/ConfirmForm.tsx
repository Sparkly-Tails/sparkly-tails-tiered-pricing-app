'use client'

import type { ReactNode } from 'react'

/**
 * Wraps a Server Action form with a native confirm() before submit —
 * for actions with real, immediate consequences (creating/removing live
 * Shopify discounts) that shouldn't fire on a single accidental click.
 */
export default function ConfirmForm({
  action,
  confirmMessage,
  children,
}: {
  action: () => Promise<void>
  confirmMessage: string
  children: ReactNode
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(confirmMessage)) {
          e.preventDefault()
        }
      }}
    >
      {children}
    </form>
  )
}
