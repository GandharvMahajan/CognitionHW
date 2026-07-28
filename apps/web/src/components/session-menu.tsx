'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@fintech/ui';
import { submitCommand } from '@/lib/command';

export function SessionMenu({ email }: { email: string }) {
  const router = useRouter();

  async function signOut() {
    await submitCommand('/api/auth/logout');
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-slate-500 sm:inline">{email}</span>
      <Button variant="secondary" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
