import { type Page, expect } from '@playwright/test';

export const PASSWORD = 'Password123!';

export const ACCOUNTS = {
  admin: 'admin@fintech.test',
  approver: 'approver@fintech.test',
  approver2: 'approver2@fintech.test',
  reviewer: 'reviewer@fintech.test',
  reviewer2: 'reviewer2@fintech.test',
  auditor: 'auditor@fintech.test',
} as const;

export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Welcome/ })).toBeVisible();
}

/** Picks a seeded transaction with at least `minorAmount` still refundable. */
export async function selectRefundableTransaction(page: Page, minorAmount: number): Promise<void> {
  const select = page.getByLabel('Transaction');
  const value = await select.evaluate((element, min) => {
    const options = Array.from((element as HTMLSelectElement).options);
    const match = options.find((option) => {
      const found = option.text.match(/\$([\d,]+\.\d{2}) left/);
      return found ? Math.round(Number(found[1].replace(/,/g, '')) * 100) >= min : false;
    });
    return match?.value ?? '';
  }, minorAmount);
  expect(value, `expected a transaction with at least ${minorAmount} minor units refundable`).not.toBe('');
  await select.selectOption(value);
}

export async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
}
