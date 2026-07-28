import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn, signOut } from '../fixtures';

test.describe('feature flag admin', () => {
  test('applies a staging change immediately', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await page.goto('/console/flags?environment=staging');
    await expect(page.getByTestId('flag-row').first()).toBeVisible();
    await page.getByTestId('flag-row').first().getByRole('link', { name: 'Manage' }).click();

    await page.getByLabel('Change reason').fill('Ramping the staging cohort for load testing');
    await page.getByLabel('Rollout percentage').fill('35');
    await page.getByRole('button', { name: 'Request rollout change' }).click();

    await expect(page.getByText('Change recorded with status APPLIED')).toBeVisible();
    await expect(page.getByTestId('flag-rollout')).toHaveText('35% rollout');
  });

  test('rejects an out-of-range rollout percentage', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await page.goto('/console/flags?environment=staging');
    await expect(page.getByTestId('flag-row').first()).toBeVisible();
    await page.getByTestId('flag-row').first().getByRole('link', { name: 'Manage' }).click();
    await page.getByLabel('Change reason').fill('Trying an impossible rollout percentage');
    await page.getByLabel('Rollout percentage').fill('150');
    await page.getByRole('button', { name: 'Request rollout change' }).click();
    await expect(page.getByTestId('form-error')).toContainText('VALIDATION_ERROR');
  });

  test('queues production changes for a second approver', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await page.goto('/console/flags?environment=production');
    await expect(page.getByTestId('flag-row').first()).toBeVisible();
    await page.getByTestId('flag-row').first().getByRole('link', { name: 'Manage' }).click();
    await expect(page.getByRole('heading', { name: 'Change controls' })).toBeVisible();
    const flagUrl = page.url();

    const reason = 'Enable the new payout engine for production';
    await page.getByLabel('Change reason').fill(reason);
    await page.getByRole('button', { name: /Request (enable|disable)/ }).click();
    await expect(page.getByText('Change recorded with status PENDING_APPROVAL')).toBeVisible();
    await signOut(page);

    await signIn(page, ACCOUNTS.approver);
    await page.goto('/console/flags');
    const pendingCard = page.getByTestId('pending-change').filter({ hasText: reason });
    await expect(pendingCard).toBeVisible();
    await pendingCard.getByPlaceholder('Decision reason (min 10 characters)').fill('Reviewed the rollout plan and metrics');
    await pendingCard.getByRole('button', { name: 'Approve change' }).click();
    await expect(pendingCard).toHaveCount(0);

    await page.goto(flagUrl);
    await expect(page.getByText('flag.change_applied')).toBeVisible();
  });

  test('admin engages the kill switch with a mandatory reason', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    await page.goto('/console/flags?environment=production');
    await expect(page.getByTestId('flag-row').first()).toBeVisible();
    await page.getByTestId('flag-row').first().getByRole('link', { name: 'Manage' }).click();

    await page.getByRole('button', { name: 'Engage emergency kill switch' }).click();
    await expect(page.getByTestId('form-error')).toContainText('VALIDATION_ERROR');

    await page.getByLabel('Change reason').fill('Incident 5150: disabling the flag immediately');
    await page.getByRole('button', { name: 'Engage emergency kill switch' }).click();
    await expect(page.getByText('The kill switch is engaged. Release it before making any other change.')).toBeVisible();
    await expect(page.getByText('flag.kill_switch_engaged')).toBeVisible();

    await page.getByLabel('Change reason').fill('Incident 5150 resolved after the hotfix');
    await page.getByRole('button', { name: 'Release kill switch' }).click();
    await expect(page.getByRole('button', { name: 'Engage emergency kill switch' })).toBeVisible();
  });

  test('non-admins cannot see the kill switch', async ({ page }) => {
    await signIn(page, ACCOUNTS.approver);
    await page.goto('/console/flags?environment=production');
    await expect(page.getByTestId('flag-row').first()).toBeVisible();
    await page.getByTestId('flag-row').first().getByRole('link', { name: 'Manage' }).click();
    await expect(page.getByRole('button', { name: 'Engage emergency kill switch' })).toHaveCount(0);
  });
});
