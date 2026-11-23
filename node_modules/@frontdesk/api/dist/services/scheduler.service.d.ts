import { DatabaseClient } from '../db/client.js';
import { Clock } from '@frontdesk/shared';
export interface SchedulerPassSummary {
    responseBreaches: number;
    resolveBreaches: number;
    warningsSent: number;
    autoClosed: number;
    reopenClosed: number;
}
/**
 * Idempotent Scheduler Pass:
 * 1. Detects and records SLA response & resolution breaches exactly once.
 * 2. Sends auto-close warning after customer silence.
 * 3. Auto-closes tickets after configured customer silence (2700 business minutes).
 * 4. Marks tickets closed when customer reopen window expires.
 *
 * Uses PostgreSQL advisory locking to ensure multiple instances or rapid triggers never overlap.
 */
export declare function runSchedulerPass(db: DatabaseClient, clock: Clock): Promise<SchedulerPassSummary>;
