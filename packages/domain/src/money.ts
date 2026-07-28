/** All monetary amounts are integer minor units (e.g. cents) to avoid float drift. */
export type MinorUnits = number;

export function formatMinor(amount: MinorUnits, currency = 'USD', locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount / 100);
}

export function assertPositiveMinor(amount: number): asserts amount is MinorUnits {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer in minor units');
  }
}

export function sumMinor(values: MinorUnits[]): MinorUnits {
  return values.reduce((a, b) => a + b, 0);
}
