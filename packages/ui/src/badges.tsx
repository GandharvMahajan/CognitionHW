import type { ReactNode } from 'react';
import { cn } from './cn.js';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  info: 'bg-blue-50 text-blue-700 ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-red-200',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  );
}

const STATUS_TONES: Record<string, Tone> = {
  NEW: 'neutral',
  ASSIGNED: 'info',
  IN_REVIEW: 'info',
  PENDING_INFO: 'warning',
  PENDING_APPROVAL: 'warning',
  ESCALATED: 'danger',
  APPROVED: 'success',
  REJECTED: 'danger',
  REQUESTED: 'neutral',
  PROCESSING: 'info',
  SUCCEEDED: 'success',
  FAILED: 'danger',
  RECONCILED: 'success',
  CANCELLED: 'neutral',
  APPLIED: 'success',
  SCHEDULED: 'info',
  DRAFT: 'neutral',
  LOW: 'success',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
  ON_TRACK: 'success',
  AT_RISK: 'warning',
  BREACHED: 'danger',
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  return (
    <Badge tone={STATUS_TONES[value] ?? 'neutral'}>{(label ?? value).replace(/_/g, ' ').toLowerCase()}</Badge>
  );
}
