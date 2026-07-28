import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn, signOut } from '../fixtures';

test.describe('KYC review queue', () => {
  test('filters the queue and opens a case workspace', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await page.getByRole('link', { name: 'KYC review queue' }).click();
    await expect(page.getByTestId('kyc-case-row').first()).toBeVisible();

    const allRows = await page.getByTestId('kyc-case-row').count();
    expect(allRows).toBeGreaterThan(0);

    await page.getByLabel('Risk').selectOption('CRITICAL');
    await expect(page.getByTestId('kyc-case-row').first()).toBeVisible();
    const criticalRows = await page.getByTestId('kyc-case-row').count();
    expect(criticalRows).toBeLessThanOrEqual(allRows);
    await expect(page.getByText('critical', { exact: false }).first()).toBeVisible();

    await page.getByTestId('kyc-case-row').first().getByRole('link', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: /^Case KYC-/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audit history' })).toBeVisible();
  });

  test('reviewer works a case and an approver decides it', async ({ page }) => {
    await signIn(page, ACCOUNTS.reviewer);
    await page.goto('/console/kyc?status=NEW&risk=LOW');
    await expect(page.getByTestId('kyc-case-row').first()).toBeVisible();
    await page.getByTestId('kyc-case-row').first().getByRole('link', { name: 'Open' }).click();
    await expect(page.getByRole('heading', { name: /^Case KYC-/ })).toBeVisible();
    const caseUrl = page.url();

    await page.getByLabel('Assignee').selectOption({ label: 'Riley Reviewer (REVIEWER)' });
    await page.getByRole('button', { name: 'Assign case' }).click();
    await expect(page.getByRole('button', { name: 'Start review' })).toBeVisible();

    await page.getByRole('button', { name: 'Start review' }).click();
    await expect(page.getByText('in review').first()).toBeVisible();

    await page.getByRole('button', { name: 'Accept' }).first().click();
    await page.getByLabel('Comment').fill('Checked the passport against the registry');
    await page.getByRole('button', { name: 'Add comment' }).click();
    await expect(page.getByText('Checked the passport against the registry')).toBeVisible();

    // Reviewers may not decide: the approve control is never rendered for them.
    await expect(page.getByRole('button', { name: 'Approve case' })).toHaveCount(0);
    await signOut(page);

    await signIn(page, ACCOUNTS.approver);
    await page.goto(caseUrl);
    await page.getByLabel('Reason / note').fill('Identity confirmed, approving onboarding');
    await page.getByRole('button', { name: 'Approve case' }).click();
    await expect(page.getByText('This case is closed. No further actions are available.')).toBeVisible();
    await expect(page.getByText('kyc.case.approved')).toBeVisible();
  });

  test('surfaces validation errors from the server', async ({ page }) => {
    await signIn(page, ACCOUNTS.approver);
    await page.goto('/console/kyc?status=IN_REVIEW');
    await expect(page.getByTestId('kyc-case-row').first()).toBeVisible();
    await page.getByTestId('kyc-case-row').first().getByRole('link', { name: 'Open' }).click();
    await page.getByLabel('Reason / note').fill('too short');
    await page.getByRole('button', { name: 'Approve case' }).click();
    await expect(page.getByTestId('form-error')).toContainText('VALIDATION_ERROR');
  });
});
