/**
 * Given a base price and the price you want customers to actually pay,
 * returns the percentage off (e.g. 14.7 for 14.7%) needed to get there,
 * rounded to 1 decimal place. This is a PERCENTAGE, not a fraction — see
 * percentageToShopifyFraction for the conversion Shopify's API needs.
 */
export function percentOffFromTargetPrice(
  basePrice: number,
  targetPrice: number,
): number {
  const rawPercent = ((basePrice - targetPrice) / basePrice) * 100
  return Math.round(rawPercent * 10) / 10
}

/**
 * Given a base price and a percentage off (e.g. 14.7 for 14.7%), returns
 * the actual price a customer pays, rounded to 2 decimal places using
 * standard rounding — the same rounding Shopify applies at checkout.
 */
export function resultingPrice(basePrice: number, percentOff: number): number {
  const fraction = percentageToShopifyFraction(percentOff)
  const raw = basePrice * (1 - fraction)
  return Math.round(raw * 100) / 100
}

/**
 * Converts a stored percentage (14.7, meaning 14.7%) into the fraction
 * Shopify's discountAutomaticBasicCreate customerGets.value.percentage
 * field expects (0.147). THIS IS THE ONLY PLACE THIS CONVERSION HAPPENS.
 * Config metafields always store percentages; Shopify's API always wants
 * fractions. Mixing them up is a 10x pricing error in a live discount.
 */
export function percentageToShopifyFraction(percentOff: number): number {
  return percentOff / 100
}
