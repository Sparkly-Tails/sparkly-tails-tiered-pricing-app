import { describe, it, expect } from 'vitest'
import {
  percentOffFromTargetPrice,
  resultingPrice,
  percentageToShopifyFraction,
} from '@/lib/tier-math'

describe('percentOffFromTargetPrice', () => {
  it('computes the percent off needed to go from £1.70 to £1.45', () => {
    // (1.70 - 1.45) / 1.70 * 100 = 14.705882... → rounds to 14.7
    expect(percentOffFromTargetPrice(1.70, 1.45)).toBe(14.7)
  })

  it('computes 0% when target equals base price', () => {
    expect(percentOffFromTargetPrice(1.70, 1.70)).toBe(0)
  })
})

describe('resultingPrice', () => {
  it('applies 14.7% off £1.70 and rounds to 2 decimal places', () => {
    // 1.70 * (1 - 0.147) = 1.4501 → rounds to 1.45
    expect(resultingPrice(1.70, 14.7)).toBe(1.45)
  })

  it('returns the base price unchanged at 0% off', () => {
    expect(resultingPrice(1.70, 0)).toBe(1.70)
  })

  it('rounds up when the third decimal is 5 or more', () => {
    // 1.70 * (1 - 0.176) = 1.4008 → rounds to 1.40
    expect(resultingPrice(1.70, 17.6)).toBe(1.40)
  })
})

describe('percentageToShopifyFraction', () => {
  it('converts a stored percentage (14.7) to the fraction Shopify expects (0.147)', () => {
    expect(percentageToShopifyFraction(14.7)).toBeCloseTo(0.147, 10)
  })

  it('converts 100% to 1.0', () => {
    expect(percentageToShopifyFraction(100)).toBe(1)
  })

  it('converts 0% to 0', () => {
    expect(percentageToShopifyFraction(0)).toBe(0)
  })
})
