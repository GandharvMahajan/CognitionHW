'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Permission } from '@fintech/domain';

const LINKS: Array<{ href: string; label: string; permission: Permission }> = [
  { href: '/console', label: 'Overview', permission: 'kyc.case.read' },
  { href: '/console/kyc', label: 'KYC review queue', permission: 'kyc.case.read' },
  { href: '/console/refunds', label: 'Refunds', permission: 'refund.read' },
  { href: '/console/flags', label: 'Feature flags', permission: 'flag.read' },
  { href: '/console/audit', label: 'Audit log', permission: 'audit.read' },
];

export function ConsoleNav({ permissions }: { permissions: Permission[] }) {
  const pathname = usePathname();
  const visible = LINKS.filter((link) => permissions.includes(link.permission));

  return (
    <nav aria-label="Primary" className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:overflow-visible">
      {visible.map((link) => {
        const active = link.href === '/console' ? pathname === link.href : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm ${
              active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
