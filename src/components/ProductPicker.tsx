'use client'

import { useRef, useState } from 'react'
import { searchProductsAction } from '@/actions/groupActions'
import type { ProductSearchResult } from '@/lib/products'

export default function ProductPicker({
  initialProducts,
}: {
  initialProducts: ProductSearchResult[]
}) {
  const [selected, setSelected] = useState<ProductSearchResult[]>(initialProducts)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ProductSearchResult[]>([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleQueryChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (value.trim().length < 2) {
      setResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    debounceRef.current = setTimeout(async () => {
      const matches = await searchProductsAction(value)
      setResults(matches)
      setSearching(false)
      setOpen(true)
    }, 300)
  }

  function addProduct(product: ProductSearchResult) {
    setSelected((prev) => (prev.some((p) => p.id === product.id) ? prev : [...prev, product]))
    setQuery('')
    setResults([])
    setOpen(false)
  }

  function removeProduct(id: string) {
    setSelected((prev) => prev.filter((p) => p.id !== id))
  }

  const suggestions = results.filter((r) => !selected.some((p) => p.id === r.id))

  return (
    <div>
      <input type="hidden" name="productIds" value={selected.map((p) => p.id).join(',')} />

      {selected.length === 0 ? (
        <p className="text-sm text-muted mb-3">No products assigned yet.</p>
      ) : (
        <ul className="mb-3 divide-y divide-line border border-line rounded">
          {selected.map((product) => (
            <li key={product.id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="text-sm truncate">{product.title}</span>
              <button
                type="button"
                onClick={() => removeProduct(product.id)}
                aria-label={`Remove ${product.title}`}
                className="text-danger hover:text-danger-hover shrink-0 px-2 py-1 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <label htmlFor="product-search" className="sr-only">
          Search products to assign
        </label>
        <input
          id="product-search"
          type="text"
          placeholder="Search products to add…"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="w-full border border-line rounded px-3 py-2 text-sm transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
        />
        {searching && (
          <p className="text-xs text-muted mt-1">Searching…</p>
        )}
        {open && suggestions.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full bg-surface border border-line rounded shadow-lg text-sm overflow-hidden">
            {suggestions.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onMouseDown={() => addProduct(product)}
                  className="w-full text-left px-3 py-2 hover:bg-line transition-colors duration-200"
                >
                  {product.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
