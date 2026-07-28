import { registerJobHandler } from '../services/jobs.js';
import { applyScheduledFlagChange } from '../modules/flags/service.js';
import { handleRefundExecuteJob } from './refund-execute.js';
import { sweepSlaBreaches } from './sla-sweep.js';

let registered = false;

export function registerJobHandlers(): void {
  if (registered) return;
  registered = true;
  registerJobHandler('flag.apply_scheduled_change', async (payload) => {
    const changeId = payload.changeId;
    if (typeof changeId !== 'string') throw new Error('changeId missing from job payload');
    await applyScheduledFlagChange(changeId);
  });
  registerJobHandler('kyc.sla_breach_sweep', async () => {
    await sweepSlaBreaches();
  });
  registerJobHandler('refund.execute', handleRefundExecuteJob);
}
