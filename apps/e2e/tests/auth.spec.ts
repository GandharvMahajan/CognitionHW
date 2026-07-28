import { expect, test } from '@playwright/test';
import { ACCOUNTS, PASSWORD, signIn, signOut } from '../fixtures';

test.describe('authentication and navigation', () => {
  test('redirects anonymous visitors to the login page', async ({ page }) => {
    await page.goto('/console/kyc');
    await expect(page).toHaveURL(/\/login/);
  });

  test('rejects bad credentials with an inline error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.reviewer);
    await page.getByLabel('Password').fill('Wrong-Password-9');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByTestId('form-error')).toContainText('Invalid email or password');
  });

  test('signs a reviewer in and out', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await expect(page.getByRole('link', { name: 'KYC review queue' })).toBeVisible();
    await signOut(page);
  });

  test('hides the audit log from reviewers but shows it to auditors', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await expect(page.getByRole('link', { name: 'Audit log' })).toHaveCount(0);
    await signOut(page);

    await page.goto('/login');
    await page.getByLabel('Email').fill(ACCOUNTS.auditor);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.getByRole('link', { name: 'Audit log' }).click();
    await expect(page.getByRole('heading', { name: 'Audit log' })).toBeVisible();
    await expect(page.getByTestId('audit-row').first()).toBeVisible();
  });
});
