import { getDbClient } from './client.js';

export async function runStubSeed() {
  const db = await getDbClient();

  console.log('Seeding baseline reference data (Stub: Users, SLA Policies, Settings, Holidays, Customers)...');

  // 1. Seed Arvo Systems 9 Agents
  const users = [
    { email: 'aria.chen@arvo.internal', name: 'Aria Chen', role: 'lead' },
    { email: 'kiran.patel@arvo.internal', name: 'Kiran Patel', role: 'admin' },
    { email: 'dev.sharma@arvo.internal', name: 'Dev Sharma', role: 'agent' },
    { email: 'sara.lindqvist@arvo.internal', name: 'Sara Lindqvist', role: 'agent' },
    { email: 'marcus.brody@arvo.internal', name: 'Marcus Brody', role: 'agent' },
    { email: 'zoe.almansoor@arvo.internal', name: 'Zoe Al-Mansoor', role: 'agent' },
    { email: 'alex.rivera@arvo.internal', name: 'Alex Rivera', role: 'agent' },
    { email: 'priya.nair@arvo.internal', name: 'Priya Nair', role: 'agent' },
    { email: 'kenji.sato@arvo.internal', name: 'Kenji Sato', role: 'agent' }
  ];

  for (const user of users) {
    await db.query(
      `INSERT INTO users (email, name, role, active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (email) DO UPDATE 
       SET name = EXCLUDED.name, role = EXCLUDED.role`,
      [user.email, user.name, user.role]
    );
  }
  console.log(`✓ Seeded ${users.length} Arvo Systems users`);

  // 2. Seed SLA Policies
  const slaPolicies = [
    { priority: 'urgent', respond_minutes: 120, resolve_minutes: 540, resolve_mode: 'end_of_response_day' },
    { priority: 'medium', respond_minutes: 270, resolve_minutes: 1620, resolve_mode: 'fixed_minutes' },
    { priority: 'low', respond_minutes: 540, resolve_minutes: 2700, resolve_mode: 'fixed_minutes' }
  ];

  for (const policy of slaPolicies) {
    await db.query(
      `INSERT INTO sla_policies (priority, respond_minutes, resolve_minutes, resolve_mode)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (priority) DO UPDATE
       SET respond_minutes = EXCLUDED.respond_minutes,
           resolve_minutes = EXCLUDED.resolve_minutes,
           resolve_mode = EXCLUDED.resolve_mode`,
      [policy.priority, policy.respond_minutes, policy.resolve_minutes, policy.resolve_mode]
    );
  }
  console.log(`✓ Seeded ${slaPolicies.length} SLA policies`);

  // 3. Seed System Settings
  const settings = [
    {
      key: 'business_day_minutes',
      value: JSON.stringify(540),
      description: 'Standard working day length in business minutes (9 hours = 540 min)'
    },
    {
      key: 'auto_close_minutes',
      value: JSON.stringify(2700),
      description: 'Customer silence window before auto-close (2700 business minutes = 5 business days)'
    },
    {
      key: 'reopen_window_days',
      value: JSON.stringify(5),
      description: 'Permitted window for customers to reopen resolved tickets (5 business days)'
    },
    {
      key: 'working_hours',
      value: JSON.stringify({
        start: '09:30',
        end: '18:30',
        timezone: 'Asia/Kolkata',
        days: [1, 2, 3, 4, 5] // Monday through Friday
      }),
      description: 'Operating working hours schedule for Arvo Systems SLA calculation'
    }
  ];

  for (const s of settings) {
    await db.query(
      `INSERT INTO settings (key, value, description)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, description = EXCLUDED.description`,
      [s.key, s.value, s.description]
    );
  }
  console.log(`✓ Seeded ${settings.length} system configuration settings`);

  // 4. Seed Official Holidays
  const holidays = [
    { date: '2026-01-26', name: 'Republic Day' },
    { date: '2026-03-03', name: 'Holi' },
    { date: '2026-04-03', name: 'Good Friday' },
    { date: '2026-05-01', name: 'May Day' },
    { date: '2026-08-15', name: 'Independence Day' },
    { date: '2026-10-02', name: 'Mahatma Gandhi Jayanti' },
    { date: '2026-10-20', name: 'Dussehra' },
    { date: '2026-11-08', name: 'Diwali' },
    { date: '2026-12-25', name: 'Christmas Day' }
  ];

  for (const h of holidays) {
    await db.query(
      `INSERT INTO holidays (date, name)
       VALUES ($1, $2)
       ON CONFLICT (date) DO UPDATE
       SET name = EXCLUDED.name`,
      [h.date, h.name]
    );
  }
  console.log(`✓ Seeded ${holidays.length} admin-managed holidays`);

  // 5. Seed Baseline Customers
  const customers = [
    { email: 'maya.lin@acme.com', name: 'Maya Lin', organization: 'Acme Corporation' },
    { email: 'thomas.sterling@wayne-enterprises.com', name: 'Thomas Sterling', organization: 'Wayne Enterprises' },
    { email: 'elena.rostova@globex.io', name: 'Elena Rostova', organization: 'Globex Corporation' }
  ];

  for (const c of customers) {
    await db.query(
      `INSERT INTO customers (email, name, organization)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, organization = EXCLUDED.organization`,
      [c.email, c.name, c.organization]
    );
  }
  console.log(`✓ Seeded ${customers.length} customer accounts`);

  console.log('Baseline stub seed completed successfully.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-stub.ts')) {
  runStubSeed()
    .then(async () => {
      const db = await getDbClient();
      await db.close();
      process.exit(0);
    })
    .catch((err) => {
      console.error('Stub seed failed:', err);
      process.exit(1);
    });
}
