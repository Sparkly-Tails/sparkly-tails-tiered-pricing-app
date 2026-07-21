import { createGroup } from '@/actions/groupActions'
import TierFields from '@/components/TierFields'

export default function NewGroupPage() {
  return (
    <main className="p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">New tier group</h1>

      <form action={createGroup} className="space-y-6">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-1">
            Group name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder="Standard voucher"
            className="w-full border border-line rounded px-3 py-2 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
        </div>

        <div>
          <p className="block text-sm font-medium mb-2">Tiers</p>
          <TierFields />
          <p className="text-xs text-muted mt-2">
            Enter percent-off directly. The next screen shows the actual
            resulting price for each assigned product before you save.
          </p>
        </div>

        <button type="submit" className="bg-accent hover:bg-accent-hover text-white px-4 py-3 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
          Create draft group
        </button>
      </form>
    </main>
  )
}
