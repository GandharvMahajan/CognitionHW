'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ErrorMessage, Field, Input } from '@fintech/ui';
import { submitCommand } from '@/lib/command';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('reviewer@fintech.test');
  const [password, setPassword] = useState('Password123!');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const result = await submitCommand('/api/auth/login', { email, password });
    setPending(false);
    if (!result.ok) {
      setError(result.errorMessage ?? 'Sign in failed');
      return;
    }
    router.push('/console');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </Field>
      <ErrorMessage>{error}</ErrorMessage>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in...' : 'Sign in'}
      </Button>
    </form>
  );
}
