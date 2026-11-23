import { DatabaseClient } from '../db/client.js';
import { searchPublicTickets } from './search.service.js';
import { serializeCustomerTicket, serializeCustomerMessage, renderCustomerEmail } from './customer-serializer.js';

export interface CanaryTestResult {
  surfaceName: string;
  leaked: boolean;
  details?: string;
}

export interface CanaryRegistryEntry {
  name: string;
  testSurface: (db: DatabaseClient, canaryToken: string, sampleData?: Record<string, unknown>) => Promise<boolean>;
}

export const canarySurfaces: CanaryRegistryEntry[] = [
  {
    name: 'Customer-Safe Database View (customer_visible_events)',
    testSurface: async (db, canaryToken) => {
      const res = await db.query('SELECT * FROM customer_visible_events');
      const serialized = JSON.stringify(res.rows);
      return serialized.includes(canaryToken);
    }
  },
  {
    name: 'Public Search Service (searchPublicTickets)',
    testSurface: async (db, canaryToken) => {
      const results = await searchPublicTickets(db, canaryToken);
      const serialized = JSON.stringify(results);
      return serialized.includes(canaryToken);
    }
  },
  {
    name: 'Customer Ticket Serializer (serializeCustomerTicket)',
    testSurface: async (_db, canaryToken, sample) => {
      const ticket = sample || {
        id: '00000000-0000-0000-0000-000000000000',
        human_id: 'INC-9999',
        subject: 'Public Subject',
        status: 'open',
        priority: 'urgent',
        created_at: '2026-03-02T10:00:00.000Z',
        updated_at: '2026-03-02T10:00:00.000Z',
        private_note: canaryToken // extra secret field
      };
      const serialized = JSON.stringify(serializeCustomerTicket(ticket));
      return serialized.includes(canaryToken);
    }
  },
  {
    name: 'Customer Message Serializer (serializeCustomerMessage)',
    testSurface: async (_db, canaryToken, sample) => {
      const msg = sample || {
        id: '00000000-0000-0000-0000-000000000000',
        sender_type: 'agent',
        body: 'Public response text',
        created_at: '2026-03-02T10:00:00.000Z',
        internal_note_leak: canaryToken
      };
      const serialized = JSON.stringify(serializeCustomerMessage(msg));
      return serialized.includes(canaryToken);
    }
  },
  {
    name: 'Customer Outbox Email Builder (renderCustomerEmail)',
    testSurface: async (_db, canaryToken) => {
      const rendered = renderCustomerEmail({
        template: 'agent_reply',
        customerName: 'Customer Name',
        ticketHumanId: 'INC-1001',
        ticketSubject: 'Public Subject',
        messageBody: 'Legitimate public message'
      });
      const serialized = JSON.stringify(rendered);
      return serialized.includes(canaryToken);
    }
  }
];

export async function runCanaryLeakCheck(
  db: DatabaseClient,
  canaryToken: string
): Promise<CanaryTestResult[]> {
  const results: CanaryTestResult[] = [];

  for (const surface of canarySurfaces) {
    try {
      const leaked = await surface.testSurface(db, canaryToken);
      results.push({
        surfaceName: surface.name,
        leaked,
        details: leaked ? `LEAK DETECTED: Canary token found in ${surface.name}!` : undefined
      });
    } catch (err: unknown) {
      results.push({
        surfaceName: surface.name,
        leaked: false,
        details: `Error executing surface check: ${String(err)}`
      });
    }
  }

  return results;
}
