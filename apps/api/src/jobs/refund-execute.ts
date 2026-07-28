import { executeRefund } from '../modules/refunds/service.js';

export async function handleRefundExecuteJob(payload: Record<string, unknown>): Promise<void> {
  const refundId = payload.refundId;
  if (typeof refundId !== 'string') throw new Error('refundId missing from job payload');
  await executeRefund(refundId, null);
}
