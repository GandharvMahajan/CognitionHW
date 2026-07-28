import { expect, test } from '@playwright/test';
import { ACCOUNTS, selectRefundableTransaction, signIn, signOut } from '../fixtures';

test.describe('refunds dashboard', () => {
  test('auto-approves a small refund below the approval threshold', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await page.getByRole('link', { name: 'Refunds', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Request a refund' })).toBeVisible();

    await selectRefundableTransaction(page, 2500);
    await page.getByLabel('Refund kind').selectOption('PARTIAL');
    await page.getByLabel('Refund amount').fill('2500');
    await page.getByLabel('Refund reason').fill('Goodwill credit for a delayed transfer');
    await page.getByRole('button', { name: 'Submit refund request' }).click();

    await expect(page.getByText(/created with status APPROVED/)).toBeVisible();
  });

  test('rejects a refund larger than the refundable remainder', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await page.goto('/console/refunds');
    await page.getByLabel('Refund amount').fill('99999999');
    await page.getByLabel('Refund reason').fill('Deliberately over-refunding the transaction');
    await page.getByRole('button', { name: 'Submit refund request' }).click();
    await expect(page.getByTestId('form-error')).toContainText('refundable remainder');
  });

  test('requires a second approver above the threshold and blocks self-approval', async ({ page }) => {
    await signIn(page, ACCOUNTS.approver);
    await page.goto('/console/refunds');
    await selectRefundableTransaction(page, 20000);
    await page.getByLabel('Refund amount').fill('20000');
    await page.getByLabel('Refund reason').fill('Duplicate settlement reported by the customer');
    await page.getByRole('button', { name: 'Submit refund request' }).click();
    await expect(page.getByText(/created with status PENDING_APPROVAL/)).toBeVisible();

    await page.goto('/console/refunds?status=PENDING_APPROVAL');
    await expect(page.getByTestId('refund-row').first()).toBeVisible();
    await page.getByTestId('refund-row').first().getByRole('link', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: /^Refund RFD-/ })).toBeVisible();
    const refundUrl = page.url();

    await expect(page.getByText('Maker-checker: you requested this refund, so someone else must approve it.')).toBeVisible();
    await page.getByLabel('Decision reason').fill('Trying to approve my own refund request');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByTestId('form-error')).toContainText('MAKER_CHECKER_VIOLATION');
    await signOut(page);

    await signIn(page, ACCOUNTS.approver2);
    await page.goto(refundUrl);
    await page.getByLabel('Decision reason').fill('Verified the duplicate settlement in the ledger');
    await page.getByRole('button', { name: 'Approve', exact: true }).click();
    await expect(page.getByText('refund.approved')).toBeVisible();
  });

  test('auditors can read refunds but cannot request them', async ({ page }) => {
    await signIn(page, ACCOUNTS.auditor);
    await page.goto('/console/refunds');
    await expect(page.getByTestId('refund-row').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit refund request' })).toHaveCount(0);
  });
});
