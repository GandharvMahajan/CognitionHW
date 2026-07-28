import { loadConfig } from '../config.js';

export interface GatewayRefundCommand {
  idempotencyKey: string;
  transactionReference: string;
  amountMinor: number;
  currency: string;
}

export interface GatewayRefundResult {
  ok: boolean;
  providerReference?: string;
  error?: string;
  replayed: boolean;
}

/**
 * Mocked payment provider. Refund execution is idempotent: replaying the same
 * idempotency key returns the original result instead of moving money twice.
 */
export class MockPaymentGateway {
  private readonly ledger = new Map<string, GatewayRefundResult>();
  private forcedFailures = new Map<string, number>();

  async refund(command: GatewayRefundCommand): Promise<GatewayRefundResult> {
    const existing = this.ledger.get(command.idempotencyKey);
    if (existing) return { ...existing, replayed: true };

    const forced = this.forcedFailures.get(command.idempotencyKey) ?? 0;
    if (forced > 0) {
      this.forcedFailures.set(command.idempotencyKey, forced - 1);
      // Failures are not stored in the ledger so a retry can still succeed.
      return { ok: false, error: 'PROVIDER_DECLINED: temporary gateway failure', replayed: false };
    }

    if (Math.random() < loadConfig().PROVIDER_FAILURE_RATE) {
      return { ok: false, error: 'PROVIDER_TIMEOUT: gateway did not respond', replayed: false };
    }

    const result: GatewayRefundResult = {
      ok: true,
      providerReference: `prov_${command.idempotencyKey.slice(-12)}_${Date.now()}`,
      replayed: false,
    };
    this.ledger.set(command.idempotencyKey, result);
    return result;
  }

  /** Test/demo hook: make the next N calls for a key fail. */
  failNext(idempotencyKey: string, times = 1): void {
    this.forcedFailures.set(idempotencyKey, times);
  }

  reset(): void {
    this.ledger.clear();
    this.forcedFailures.clear();
  }
}

export const paymentGateway = new MockPaymentGateway();
