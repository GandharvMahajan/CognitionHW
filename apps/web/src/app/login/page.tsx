import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import { LoginForm } from './login-form';

const DEMO_ACCOUNTS = [
  { role: 'Admin', email: 'admin@fintech.test' },
  { role: 'Approver', email: 'approver@fintech.test' },
  { role: 'Reviewer', email: 'reviewer@fintech.test' },
  { role: 'Auditor', email: 'auditor@fintech.test' },
];

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect('/console');

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-slate-900">Fintech Operations Console</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to review KYC cases, refunds and feature flags</p>
        </div>
        <LoginForm />
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <p className="font-medium text-slate-700">Demo accounts (password: Password123!)</p>
          <ul className="mt-2 space-y-1 text-slate-600">
            {DEMO_ACCOUNTS.map((account) => (
              <li key={account.email} className="flex justify-between gap-4">
                <span>{account.role}</span>
                <code className="text-xs text-slate-500">{account.email}</code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
