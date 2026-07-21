'use client'

import { useState } from 'react'

type TierRow = { key: string; minQty: string; percentOff: string }

function makeRow(): TierRow {
  return { key: crypto.randomUUID(), minQty: '', percentOff: '' }
}

export default function TierFields() {
  const [rows, setRows] = useState<TierRow[]>(() => [makeRow(), makeRow()])

  function addRow() {
    setRows((prev) => [...prev, makeRow()])
  }

  function removeRow(key: string) {
    setRows((prev) => (prev.length <= 1 ? prev : prev.filter((r) => r.key !== key)))
  }

  function updateRow(key: string, field: 'minQty' | 'percentOff', value: string) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, [field]: value } : r)))
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.key} className="flex flex-wrap gap-2 items-center">
          <label htmlFor={`tier-${i}-minQty`} className="sr-only">
            Tier {i + 1} minimum quantity
          </label>
          <input
            id={`tier-${i}-minQty`}
            name={`tier-${i}-minQty`}
            type="number"
            min="1"
            placeholder="Min qty (e.g. 5)"
            value={row.minQty}
            onChange={(e) => updateRow(row.key, 'minQty', e.target.value)}
            className="border border-line rounded px-3 py-2 w-40 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <span className="text-sm text-muted">+ units →</span>
          <label htmlFor={`tier-${i}-percentOff`} className="sr-only">
            Tier {i + 1} percent off
          </label>
          <input
            id={`tier-${i}-percentOff`}
            name={`tier-${i}-percentOff`}
            type="number"
            min="0"
            max="100"
            step="0.1"
            placeholder="% off (e.g. 14.7)"
            value={row.percentOff}
            onChange={(e) => updateRow(row.key, 'percentOff', e.target.value)}
            className="border border-line rounded px-3 py-2 w-40 transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-accent"
          />
          <button
            type="button"
            onClick={() => removeRow(row.key)}
            disabled={rows.length <= 1}
            aria-label={`Remove tier ${i + 1}`}
            className="text-danger hover:text-danger-hover disabled:opacity-30 disabled:cursor-not-allowed px-2 py-2 rounded transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger"
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addRow}
        className="text-sm text-accent hover:underline transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded px-1"
      >
        + Add tier
      </button>
    </div>
  )
}
