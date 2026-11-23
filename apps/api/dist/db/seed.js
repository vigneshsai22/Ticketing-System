"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFullSeed = runFullSeed;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const client_js_1 = require("./client.js");
const shared_1 = require("@frontdesk/shared");
const sla_1 = require("@frontdesk/sla");
const audit_service_js_1 = require("../services/audit.service.js");
async function runFullSeed(dbClient) {
    const db = dbClient || (await (0, client_js_1.getDbClient)());
    console.log('--- Starting Arvo Systems Full Database Seed ---');
    // Ensure schema and triggers are applied
    const candidatePaths = [
        path.resolve(__dirname, 'schema.sql'),
        path.resolve(__dirname, '../../src/db/schema.sql'),
        path.resolve(__dirname, '../src/db/schema.sql'),
        path.resolve(process.cwd(), 'apps/api/src/db/schema.sql'),
        path.resolve(process.cwd(), 'src/db/schema.sql')
    ];
    const schemaPath = candidatePaths.find(p => fs.existsSync(p));
    if (schemaPath && fs.existsSync(schemaPath)) {
        const schemaSql = fs.readFileSync(schemaPath, 'utf-8');
        await db.exec(schemaSql);
    }
    // We anchor our seed simulation clock to Friday March 6, 2026, 18:00:00 IST
    const seedClock = new shared_1.ShiftableClock('2026-03-06T18:00:00.000+05:30', false);
    // 1. Seed Arvo Staff (1 Lead, 1 Admin, 9 Agents = 11 Users)
    const staff = [
        { email: 'aria.chen@arvo.internal', name: 'Aria Chen', role: 'lead' },
        { email: 'kiran.patel@arvo.internal', name: 'Kiran Patel', role: 'admin' },
        { email: 'dev.sharma@arvo.internal', name: 'Dev Sharma', role: 'agent' },
        { email: 'sara.lindqvist@arvo.internal', name: 'Sara Lindqvist', role: 'agent' },
        { email: 'marcus.brody@arvo.internal', name: 'Marcus Brody', role: 'agent' },
        { email: 'zoe.almansoor@arvo.internal', name: 'Zoe Al-Mansoor', role: 'agent' },
        { email: 'alex.rivera@arvo.internal', name: 'Alex Rivera', role: 'agent' },
        { email: 'priya.nair@arvo.internal', name: 'Priya Nair', role: 'agent' },
        { email: 'kenji.sato@arvo.internal', name: 'Kenji Sato', role: 'agent' },
        { email: 'fatima.alzahra@arvo.internal', name: 'Fatima Al-Zahra', role: 'agent' },
        { email: 'lucas.meyer@arvo.internal', name: 'Lucas Meyer', role: 'agent' }
    ];
    const userMap = {};
    for (const u of staff) {
        const res = await db.query(`INSERT INTO users (email, name, role, active)
       VALUES ($1, $2, $3, TRUE)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, role = EXCLUDED.role, active = TRUE
       RETURNING id`, [u.email, u.name, u.role]);
        userMap[u.email] = res.rows[0].id;
    }
    console.log(`✓ Seeded ${staff.length} Arvo staff members (1 lead, 1 admin, 9 agents)`);
    // 2. SLA Policies
    const slaPolicies = [
        { priority: 'urgent', respond_minutes: 120, resolve_minutes: 540, resolve_mode: 'end_of_response_day' },
        { priority: 'medium', respond_minutes: 270, resolve_minutes: 1620, resolve_mode: 'fixed_minutes' },
        { priority: 'low', respond_minutes: 540, resolve_minutes: 2700, resolve_mode: 'fixed_minutes' }
    ];
    const policyMap = {};
    for (const policy of slaPolicies) {
        policyMap[policy.priority] = policy;
        await db.query(`INSERT INTO sla_policies (priority, respond_minutes, resolve_minutes, resolve_mode)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (priority) DO UPDATE
       SET respond_minutes = EXCLUDED.respond_minutes,
           resolve_minutes = EXCLUDED.resolve_minutes,
           resolve_mode = EXCLUDED.resolve_mode`, [policy.priority, policy.respond_minutes, policy.resolve_minutes, policy.resolve_mode]);
    }
    console.log('✓ Seeded SLA policies (urgent, medium, low)');
    // 3. Settings
    const settings = [
        { key: 'business_day_minutes', value: 540, description: 'Standard working day length in business minutes (9 hours = 540 min)' },
        { key: 'auto_close_minutes', value: 2700, description: 'Customer silence window before auto-close (2700 business minutes = 5 business days)' },
        { key: 'reopen_window_days', value: 5, description: 'Permitted window for customers to reopen resolved tickets (5 business days)' },
        {
            key: 'working_hours',
            value: {
                start: '09:30',
                end: '18:30',
                timezone: 'Asia/Kolkata',
                days: [1, 2, 3, 4, 5]
            },
            description: 'Operating working hours schedule for Arvo Systems'
        }
    ];
    for (const s of settings) {
        await db.query(`INSERT INTO settings (key, value, description)
       VALUES ($1, $2::jsonb, $3)
       ON CONFLICT (key) DO UPDATE
       SET value = EXCLUDED.value, description = EXCLUDED.description`, [s.key, JSON.stringify(s.value), s.description]);
    }
    console.log('✓ Seeded system configuration settings');
    // 4. Holidays
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
        await db.query(`INSERT INTO holidays (date, name)
       VALUES ($1, $2)
       ON CONFLICT (date) DO UPDATE
       SET name = EXCLUDED.name`, [h.date, h.name]);
    }
    console.log('✓ Seeded official holidays');
    // 5. Canned Replies
    const cannedReplies = [
        {
            title: 'Request Diagnostic Logs',
            content: 'Hello,\n\nCould you please provide the full diagnostic bundle or application logs from around the time this issue occurred? This will help us isolate the root cause quickly.\n\nThank you,\nArvo Systems Support',
            shortcut: '!logs',
            category: 'troubleshooting'
        },
        {
            title: 'SSO Configuration Guide',
            content: 'Hello,\n\nPlease verify that your Identity Provider entity ID and ACS URL match the values configured in your Arvo admin console. You can download our latest SAML metadata XML directly from your settings panel.\n\nBest regards,\nArvo Systems Support',
            shortcut: '!sso',
            category: 'auth'
        },
        {
            title: 'Resolution Notice',
            content: 'Hello,\n\nWe have verified that the fix has been deployed and the service is operating normally. We are marking this ticket resolved. Please reply within 5 business days if you experience any further issues.\n\nBest regards,\nArvo Systems Support',
            shortcut: '!resolved',
            category: 'lifecycle'
        }
    ];
    for (const cr of cannedReplies) {
        await db.query(`INSERT INTO canned_replies (title, content, shortcut, category)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING`, [cr.title, cr.content, cr.shortcut, cr.category]);
    }
    console.log('✓ Seeded standard canned replies');
    // 6. Customers
    const customerData = [
        { email: 'maya.lin@acme.com', name: 'Maya Lin', organization: 'Acme Corporation' },
        { email: 'thomas.sterling@wayne-enterprises.com', name: 'Thomas Sterling', organization: 'Wayne Enterprises' },
        { email: 'elena.rostova@globex.io', name: 'Elena Rostova', organization: 'Globex Corporation' },
        { email: 'marcus.vance@initech.com', name: 'Marcus Vance', organization: 'Initech' },
        { email: 'chloe.bennett@hooli.xyz', name: 'Chloe Bennett', organization: 'Hooli' },
        { email: 'liam.davies@stark-industries.com', name: 'Liam Davies', organization: 'Stark Industries' },
        { email: 'sophia.zhang@umbrella.corp', name: 'Sophia Zhang', organization: 'Umbrella Corp' },
        { email: 'arthur.p@cyberdyne.ai', name: 'Arthur Pendelton', organization: 'Cyberdyne Systems' }
    ];
    const customerMap = {};
    for (const c of customerData) {
        const res = await db.query(`INSERT INTO customers (email, name, organization)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, organization = EXCLUDED.organization
       RETURNING id`, [c.email, c.name, c.organization]);
        customerMap[c.email] = res.rows[0].id;
    }
    console.log(`✓ Seeded ${customerData.length} customer organizations`);
    // 7. Clean existing ticket tables to guarantee a deterministic, idempotent seed
    console.log('Resetting ticket, message, pause, and audit tables for clean seed...');
    await db.query(`
    TRUNCATE TABLE magic_links, outbox, sla_pauses, ticket_cycles, internal_notes, public_messages, audit_events, tickets RESTART IDENTITY CASCADE;
  `);
    await db.query(`ALTER SEQUENCE ticket_human_id_seq RESTART WITH 1;`);
    async function seedTicket(params) {
        const customerId = customerMap[params.customerEmail];
        const assigneeId = params.assigneeEmail ? userMap[params.assigneeEmail] : null;
        // 1. Insert ticket
        const ticketRes = await db.query(`INSERT INTO tickets (human_id, subject, priority, status, assignee_id, version, cycle_no, customer_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 1, $6, $7, $8, $8)
       RETURNING id, human_id`, [
            params.humanId,
            params.subject,
            params.priority,
            params.status,
            assigneeId,
            params.cycleNo || 1,
            customerId,
            params.createdAtIso
        ]);
        const ticketId = ticketRes.rows[0].id;
        // 2. Compute Deadlines using SLA engine
        const policy = policyMap[params.priority];
        const rawDeadlines = (0, sla_1.computeDeadlines)({
            clock_start: params.createdAtIso
        }, policy, [], sla_1.DEFAULT_WORKING_HOURS, holidays);
        // 3. Insert Cycle 1
        await db.query(`INSERT INTO ticket_cycles (
        ticket_id, cycle_no, clock_start, response_due, resolve_due,
        first_response_at, resolved_at, response_breached_at, response_breach_reason,
        resolve_breached_at, resolve_breach_reason, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)`, [
            ticketId,
            params.cycleNo || 1,
            rawDeadlines.clockStartNormalized.toISO(),
            rawDeadlines.responseDue.toISO(),
            rawDeadlines.resolveDue.toISO(),
            params.firstResponseAtIso || null,
            params.resolvedAtIso || null,
            params.responseBreachedAtIso || null,
            params.responseBreachReason || null,
            params.resolveBreachedAtIso || null,
            params.resolveBreachReason || null,
            params.createdAtIso
        ]);
        // Initial audit event: ticket created
        seedClock.set(params.createdAtIso, false);
        await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
            ticketId,
            actorType: 'customer',
            actorId: customerId,
            eventType: 'ticket_created',
            before: null,
            after: {
                human_id: params.humanId,
                subject: params.subject,
                priority: params.priority,
                status: 'open',
                cycle_no: params.cycleNo || 1
            }
        });
        // Customer initial message
        await db.query(`INSERT INTO public_messages (ticket_id, sender_type, sender_id, body, created_at)
       VALUES ($1, 'customer', $2, $3, $4)`, [ticketId, customerId, params.description, params.createdAtIso]);
        // Assignment audit event (if assigned)
        if (assigneeId && params.assigneeEmail) {
            seedClock.set(params.createdAtIso, false);
            await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
                ticketId,
                actorType: 'agent',
                actorId: assigneeId,
                eventType: 'ticket_claimed',
                before: { assignee_id: null },
                after: { assignee_id: assigneeId, assignee_name: params.assigneeEmail }
            });
        }
        // Active or ended pause
        if (params.pause) {
            await db.query(`INSERT INTO sla_pauses (ticket_id, cycle_no, started_at, ended_at, created_at)
         VALUES ($1, $2, $3, $4, $3)`, [ticketId, params.cycleNo || 1, params.pause.startedAtIso, params.pause.endedAtIso || null]);
        }
        // Public replies
        if (params.publicReplies) {
            for (const reply of params.publicReplies) {
                const senderId = reply.authorType === 'agent' ? userMap[reply.authorEmail] : customerMap[reply.authorEmail];
                await db.query(`INSERT INTO public_messages (ticket_id, sender_type, sender_id, body, created_at)
           VALUES ($1, $2, $3, $4, $5)`, [ticketId, reply.authorType, senderId, reply.body, reply.createdAtIso]);
                seedClock.set(reply.createdAtIso, false);
                await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
                    ticketId,
                    actorType: reply.authorType,
                    actorId: senderId,
                    eventType: 'public_message_added',
                    before: null,
                    after: { author_type: reply.authorType, author_email: reply.authorEmail }
                });
            }
        }
        // Internal notes (strictly isolated)
        if (params.internalNotes) {
            for (const note of params.internalNotes) {
                const authorId = userMap[note.authorEmail];
                await db.query(`INSERT INTO internal_notes (ticket_id, author_id, body, created_at)
           VALUES ($1, $2, $3, $4)`, [ticketId, authorId, note.body, note.createdAtIso]);
                seedClock.set(note.createdAtIso, false);
                await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
                    ticketId,
                    actorType: 'agent',
                    actorId: authorId,
                    eventType: 'internal_note_added',
                    before: null,
                    after: { note_author: note.authorEmail }
                });
            }
        }
        return ticketId;
    }
    // ============================================================================
    // 8. SEED THE 8 PRIMARY SPECIFIED TICKETS
    // ============================================================================
    console.log('Seeding 8 primary incident scenario tickets...');
    // 1. INC-0001: Friday 18:00 Urgent Ticket
    // Mon-Fri 09:30-18:30 IST. 120m response = 30m Fri + 90m Mon -> Mon 11:00. Resolve = Mon 18:30.
    await seedTicket({
        humanId: 'INC-0001',
        subject: 'Production API cluster throwing 504 Gateway Timeout errors',
        description: 'We are observing widespread 504 timeouts across our production ingress controllers affecting all EMEA tenants.',
        priority: 'urgent',
        status: 'open',
        customerEmail: 'maya.lin@acme.com',
        createdAtIso: '2026-03-06T18:00:00.000+05:30'
    });
    // 2. INC-0002: Already Late Ticket (Breached Response & Resolve)
    await seedTicket({
        humanId: 'INC-0002',
        subject: 'Critical data export failing with silent truncation',
        description: 'Monthly compliance archive exports terminate prematurely at exactly 2GB without any error banner in the admin portal.',
        priority: 'urgent',
        status: 'open',
        customerEmail: 'thomas.sterling@wayne-enterprises.com',
        assigneeEmail: 'dev.sharma@arvo.internal',
        createdAtIso: '2026-03-04T10:00:00.000+05:30',
        responseBreachedAtIso: '2026-03-04T12:00:00.000+05:30',
        responseBreachReason: 'slow_after_assignment',
        resolveBreachedAtIso: '2026-03-04T18:30:00.000+05:30',
        resolveBreachReason: 'slow_after_assignment',
        internalNotes: [
            {
                authorEmail: 'dev.sharma@arvo.internal',
                body: 'Investigating streaming pipe buffer overflow. We need to patch the stream chunk writer.',
                createdAtIso: '2026-03-04T14:00:00.000+05:30'
            }
        ]
    });
    // 3. INC-0003: At-Risk Ticket (<20% budget remaining)
    await seedTicket({
        humanId: 'INC-0003',
        subject: 'SSO SAML redirect loop on mobile client browsers',
        description: 'Users on iOS Chrome and Safari are stuck in an infinite redirect between our IDP and Arvo auth endpoint.',
        priority: 'urgent',
        status: 'in_progress',
        customerEmail: 'elena.rostova@globex.io',
        assigneeEmail: 'sara.lindqvist@arvo.internal',
        createdAtIso: '2026-03-06T14:00:00.000+05:30',
        firstResponseAtIso: '2026-03-06T14:45:00.000+05:30',
        publicReplies: [
            {
                authorType: 'agent',
                authorEmail: 'sara.lindqvist@arvo.internal',
                body: 'Hello Elena, our mobile identity team is reviewing the SameSite cookie attributes in iOS WebKit.',
                createdAtIso: '2026-03-06T14:45:00.000+05:30'
            }
        ],
        internalNotes: [
            {
                authorEmail: 'sara.lindqvist@arvo.internal',
                body: 'Only 30 minutes left before 18:30 EOD resolution deadline! Prepping emergency hotfix.',
                createdAtIso: '2026-03-06T17:45:00.000+05:30'
            }
        ]
    });
    // 4. INC-0004: Waiting on Customer Ticket (Active Pause)
    await seedTicket({
        humanId: 'INC-0004',
        subject: 'Webhook HMAC delivery signature mismatch after key rotation',
        description: 'After rotating the webhook secret in organization settings, inbound event signatures fail verification.',
        priority: 'medium',
        status: 'waiting_on_customer',
        customerEmail: 'marcus.vance@initech.com',
        assigneeEmail: 'marcus.brody@arvo.internal',
        createdAtIso: '2026-03-06T10:00:00.000+05:30',
        firstResponseAtIso: '2026-03-06T11:30:00.000+05:30',
        pause: {
            startedAtIso: '2026-03-06T11:30:00.000+05:30'
        },
        publicReplies: [
            {
                authorType: 'agent',
                authorEmail: 'marcus.brody@arvo.internal',
                body: 'Hello Marcus, could you share the X-Arvo-Signature header and the timestamp from a recent failed payload?',
                createdAtIso: '2026-03-06T11:30:00.000+05:30'
            }
        ]
    });
    // 5. INC-0005: Near Auto-Close Ticket (~2600 business minutes in silence)
    const t5Id = await seedTicket({
        humanId: 'INC-0005',
        subject: 'Billing currency conversion discrepancies in EU invoices',
        description: 'Q4 invoice exchange rates do not match the ECB reference rate published on the invoice date.',
        priority: 'low',
        status: 'waiting_on_customer',
        customerEmail: 'chloe.bennett@hooli.xyz',
        assigneeEmail: 'zoe.almansoor@arvo.internal',
        createdAtIso: '2026-02-27T10:00:00.000+05:30',
        firstResponseAtIso: '2026-02-27T11:00:00.000+05:30',
        pause: {
            startedAtIso: '2026-02-27T11:00:00.000+05:30'
        },
        publicReplies: [
            {
                authorType: 'agent',
                authorEmail: 'zoe.almansoor@arvo.internal',
                body: 'Hello Chloe, please provide the specific invoice serial numbers so finance can recalculate.',
                createdAtIso: '2026-02-27T11:00:00.000+05:30'
            }
        ]
    });
    // Record warning event and queue outbox email
    seedClock.set('2026-03-06T15:00:00.000+05:30', false);
    await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
        ticketId: t5Id,
        actorType: 'system',
        actorId: null,
        eventType: 'auto_close_warning_sent',
        before: null,
        after: { elapsed_business_minutes: 2520 }
    });
    await db.query(`INSERT INTO outbox (recipient_email, subject, body, template, status, created_at)
     VALUES ($1, $2, $3, 'auto_close_warning', 'sent', $4)`, [
        'chloe.bennett@hooli.xyz',
        '[INC-0005] Friendly reminder: Ticket awaiting your input',
        'This ticket will automatically close in 1 business day if no further response is received.',
        '2026-03-06T15:00:00.000+05:30'
    ]);
    // 6. INC-0006: Reopened Ticket with 2 Cycles
    const t6Id = await seedTicket({
        humanId: 'INC-0006',
        subject: 'Custom SSL certificate upload fails validation on SAN check',
        description: 'Uploading wildcard certificates for *.dev.stark.com returns invalid subject alternative name.',
        priority: 'medium',
        status: 'in_progress',
        customerEmail: 'liam.davies@stark-industries.com',
        assigneeEmail: 'alex.rivera@arvo.internal',
        createdAtIso: '2026-03-02T10:00:00.000+05:30',
        cycleNo: 2
    });
    // Cycle 1 history
    await db.query(`INSERT INTO ticket_cycles (
      ticket_id, cycle_no, clock_start, response_due, resolve_due,
      first_response_at, resolved_at, created_at, updated_at
    ) VALUES ($1, 1, '2026-03-02T10:00:00.000+05:30', '2026-03-02T14:30:00.000+05:30', '2026-03-05T13:00:00.000+05:30',
              '2026-03-02T11:15:00.000+05:30', '2026-03-03T16:00:00.000+05:30', '2026-03-02T10:00:00.000+05:30', '2026-03-03T16:00:00.000+05:30')`, [t6Id]);
    // Reopen audit event
    seedClock.set('2026-03-05T11:00:00.000+05:30', false);
    await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
        ticketId: t6Id,
        actorType: 'customer',
        actorId: customerMap['liam.davies@stark-industries.com'],
        eventType: 'ticket_reopened',
        before: { status: 'resolved', cycle_no: 1 },
        after: { status: 'open', cycle_no: 2 }
    });
    // 7. INC-0007: Mid-flight Priority Upgrade (Low -> Urgent, escalated_mid_flight)
    const t7Id = await seedTicket({
        humanId: 'INC-0007',
        subject: 'Slow dashboard query affecting enterprise analytics widgets',
        description: 'Dashboard query taking 28s to render aggregate metrics for executive reports.',
        priority: 'urgent',
        status: 'open',
        customerEmail: 'sophia.zhang@umbrella.corp',
        assigneeEmail: 'priya.nair@arvo.internal',
        createdAtIso: '2026-03-05T14:00:00.000+05:30',
        responseBreachedAtIso: '2026-03-06T15:00:00.000+05:30',
        responseBreachReason: 'escalated_mid_flight'
    });
    seedClock.set('2026-03-06T15:00:00.000+05:30', false);
    await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
        ticketId: t7Id,
        actorType: 'agent',
        actorId: userMap['aria.chen@arvo.internal'],
        eventType: 'ticket_priority_changed',
        before: { priority: 'low' },
        after: {
            priority: 'urgent',
            reason: 'Customer reported board presentation blocked by query performance',
            instant_breach: true
        }
    });
    // 8. INC-0008: Auto-Closed Ticket
    const t8Id = await seedTicket({
        humanId: 'INC-0008',
        subject: 'Feature request: Custom webhook retry backoff policy',
        description: 'We would like configurable exponential backoff parameters for failed destination endpoints.',
        priority: 'low',
        status: 'closed',
        customerEmail: 'arthur.p@cyberdyne.ai',
        assigneeEmail: 'kenji.sato@arvo.internal',
        createdAtIso: '2026-02-16T10:00:00.000+05:30',
        firstResponseAtIso: '2026-02-16T11:00:00.000+05:30',
        pause: {
            startedAtIso: '2026-02-16T11:00:00.000+05:30',
            endedAtIso: '2026-02-27T16:00:00.000+05:30'
        }
    });
    seedClock.set('2026-02-27T16:00:00.000+05:30', false);
    await (0, audit_service_js_1.recordAuditEvent)(db, seedClock, {
        ticketId: t8Id,
        actorType: 'system',
        actorId: null,
        eventType: 'ticket_auto_closed',
        before: { status: 'waiting_on_customer' },
        after: { status: 'closed', reason: 'customer_silence_2700m' }
    });
    // ============================================================================
    // 9. SEED REMAINING 32 TICKETS (INC-0009 to INC-0040)
    // ============================================================================
    console.log('Seeding 32 additional realistic tickets across agents and customers...');
    const additionalTicketsData = [
        {
            subject: 'Kafka consumer lag alert on telemetry ingress partition 4',
            desc: 'Consumer group telemetry-workers is lagging by 1.2M messages. Ingestion pipeline is throttled.',
            priority: 'urgent',
            status: 'in_progress',
            customer: 'maya.lin@acme.com',
            assignee: 'fatima.alzahra@arvo.internal'
        },
        {
            subject: 'SCIM directory synchronization failing on user deactivations',
            desc: 'Users deactivated in Okta remain active in the Arvo workspace with full workspace read permissions.',
            priority: 'urgent',
            status: 'open',
            customer: 'thomas.sterling@wayne-enterprises.com',
            assignee: 'lucas.meyer@arvo.internal'
        },
        {
            subject: 'Elasticsearch cluster yellow status during index rollover',
            desc: 'Unassigned replica shards on logstash-2026.03.05 index. Disk watermark warning on data node 2.',
            priority: 'medium',
            status: 'in_progress',
            customer: 'elena.rostova@globex.io',
            assignee: 'dev.sharma@arvo.internal'
        },
        {
            subject: 'OAuth2 refresh token rotation returning intermittent 401 Unauthorized',
            desc: 'Token refresh requests from our microservice backend fail with 401 every ~30 requests.',
            priority: 'medium',
            status: 'waiting_on_customer',
            customer: 'marcus.vance@initech.com',
            assignee: 'sara.lindqvist@arvo.internal'
        },
        {
            subject: 'CORS preflight request failure on /v2/analytics endpoints',
            desc: 'Browser preflight OPTIONS requests fail with 403 when origin header has trailing slash.',
            priority: 'medium',
            status: 'open',
            customer: 'chloe.bennett@hooli.xyz',
            assignee: 'marcus.brody@arvo.internal'
        },
        {
            subject: 'PDF invoice receipt missing organization tax identifier (VAT ID)',
            desc: 'Invoices downloaded from billing tab do not include the registered VAT number in the footer.',
            priority: 'low',
            status: 'resolved',
            customer: 'liam.davies@stark-industries.com',
            assignee: 'zoe.almansoor@arvo.internal'
        },
        {
            subject: 'Dead Letter Queue processing stalled after minor version upgrade',
            desc: 'DLQ messages are accumulating in AWS SQS without being routed to replay handler.',
            priority: 'urgent',
            status: 'in_progress',
            customer: 'sophia.zhang@umbrella.corp',
            assignee: 'alex.rivera@arvo.internal'
        },
        {
            subject: 'Rate limit bucket reset not adhering to Retry-After HTTP response header',
            desc: 'When receiving 429 Too Many Requests, client waits the specified 60s but subsequent call is still rejected.',
            priority: 'medium',
            status: 'open',
            customer: 'arthur.p@cyberdyne.ai',
            assignee: 'priya.nair@arvo.internal'
        },
        {
            subject: 'Custom domain DNS validation timeout for enterprise tenant',
            desc: 'TXT verification record was added 48 hours ago but portal domain status still displays Pending DNS.',
            priority: 'low',
            status: 'waiting_on_customer',
            customer: 'maya.lin@acme.com',
            assignee: 'kenji.sato@arvo.internal'
        },
        {
            subject: 'Audit log CSV export truncated at exactly 10,000 entries',
            desc: 'Requesting a 30-day security event export caps results at 10,000 rows without pagination controls.',
            priority: 'medium',
            status: 'resolved',
            customer: 'thomas.sterling@wayne-enterprises.com',
            assignee: 'fatima.alzahra@arvo.internal'
        },
        {
            subject: 'GraphQL query depth limit triggered on nested user roles query',
            desc: 'Query complexity validator rejects queries fetching team members and nested organization permissions.',
            priority: 'low',
            status: 'open',
            customer: 'elena.rostova@globex.io',
            assignee: 'lucas.meyer@arvo.internal'
        },
        {
            subject: 'IP allowlist blocking Cloudflare health check probe IP ranges',
            desc: 'Adding CIDR block blocks legitimate health monitoring requests from Cloudflare edge locations.',
            priority: 'urgent',
            status: 'in_progress',
            customer: 'marcus.vance@initech.com',
            assignee: 'dev.sharma@arvo.internal'
        },
        {
            subject: 'Session timeout ignoring configured idle duration in workspace policy',
            desc: 'Engineers are being logged out after 15 minutes of inactivity despite policy being configured for 4 hours.',
            priority: 'medium',
            status: 'open',
            customer: 'chloe.bennett@hooli.xyz',
            assignee: 'sara.lindqvist@arvo.internal'
        },
        {
            subject: 'Database connection pool starvation during scheduled midnight reporting batch',
            desc: 'All 50 pooled connections are held by long-running reporting queries, blocking interactive UI traffic.',
            priority: 'urgent',
            status: 'in_progress',
            customer: 'liam.davies@stark-industries.com',
            assignee: 'marcus.brody@arvo.internal'
        },
        {
            subject: 'CSV file import character encoding corruption on UTF-8 accented letters',
            desc: 'Importing contacts with names like Müller or François results in Mojibake replacement glyphs.',
            priority: 'low',
            status: 'resolved',
            customer: 'sophia.zhang@umbrella.corp',
            assignee: 'zoe.almansoor@arvo.internal'
        },
        {
            subject: 'Stripe payment webhook duplicate processing causing double credit issuance',
            desc: 'When Stripe sends duplicate charge.succeeded events, customer wallet receives double balance credit.',
            priority: 'urgent',
            status: 'resolved',
            customer: 'arthur.p@cyberdyne.ai',
            assignee: 'alex.rivera@arvo.internal'
        },
        {
            subject: 'WebSocket disconnected after 60s inactivity behind AWS ALB',
            desc: 'Real-time collaborative whiteboard drops socket connection every minute when no mouse events occur.',
            priority: 'medium',
            status: 'open',
            customer: 'maya.lin@acme.com',
            assignee: 'priya.nair@arvo.internal'
        },
        {
            subject: 'GDPR Right to Be Forgotten request for user UUID 9c4b-3211',
            desc: 'Customer requested complete purging of telemetry and personal data pursuant to GDPR Article 17.',
            priority: 'low',
            status: 'in_progress',
            customer: 'thomas.sterling@wayne-enterprises.com',
            assignee: 'kenji.sato@arvo.internal'
        },
        {
            subject: 'Permission check bypass: Read-only users able to download draft report exports',
            desc: 'Direct URL to /api/exports/:id allows users with Viewer role to retrieve unpublished draft reports.',
            priority: 'urgent',
            status: 'in_progress',
            customer: 'elena.rostova@globex.io',
            assignee: 'fatima.alzahra@arvo.internal'
        },
        {
            subject: 'Webhooks failing with TLS handshake error after server certificate renewal',
            desc: 'Inbound deliveries to webhook.initech.internal reject SSL handshake with error UNABLE_TO_VERIFY_LEAF_SIGNATURE.',
            priority: 'medium',
            status: 'waiting_on_customer',
            customer: 'marcus.vance@initech.com',
            assignee: 'lucas.meyer@arvo.internal'
        },
        {
            subject: 'Scheduled weekly digest email failing to deliver to Google Workspace group',
            desc: 'Weekly summary email sent to team-leads@hooli.xyz bounces with relay access denied.',
            priority: 'low',
            status: 'closed',
            customer: 'chloe.bennett@hooli.xyz',
            assignee: 'dev.sharma@arvo.internal'
        },
        {
            subject: 'S3 bucket lifecycle rule prematurely archiving active customer assets',
            desc: 'Images uploaded 14 days ago were transitioned to Glacier Deep Archive, causing 404 in web app.',
            priority: 'medium',
            status: 'open',
            customer: 'liam.davies@stark-industries.com',
            assignee: 'sara.lindqvist@arvo.internal'
        },
        {
            subject: 'Password reset link token expiration error when clicked from mobile email client',
            desc: 'Users tapping password reset on Outlook Mobile get immediate Token Expired error due to link pre-fetching.',
            priority: 'medium',
            status: 'in_progress',
            customer: 'sophia.zhang@umbrella.corp',
            assignee: 'marcus.brody@arvo.internal'
        },
        {
            subject: 'Custom dashboard widget displaying NaN for average resolution time calculation',
            desc: 'When a team has 0 tickets in the selected interval, division by zero results in NaN in the UI chart.',
            priority: 'low',
            status: 'resolved',
            customer: 'arthur.p@cyberdyne.ai',
            assignee: 'zoe.almansoor@arvo.internal'
        },
        {
            subject: 'Single Sign-On metadata XML parser denial of service vulnerability patch',
            desc: 'Applying security patch for XML external entity (XXE) expansion in customer identity provider metadata.',
            priority: 'urgent',
            status: 'open',
            customer: 'maya.lin@acme.com',
            assignee: 'alex.rivera@arvo.internal'
        },
        {
            subject: 'Kubernetes worker pod OOMKilled during peak hourly batch ingest',
            desc: 'Worker pods on node pool batch-large exceed 8Gi memory limit during hourly delta sync.',
            priority: 'urgent',
            status: 'in_progress',
            customer: 'thomas.sterling@wayne-enterprises.com',
            assignee: 'priya.nair@arvo.internal'
        },
        {
            subject: 'Mobile push notification badge count out of sync on Android 14',
            desc: 'App icon unread badge shows 5 unread tickets even after clearing all inbox notifications.',
            priority: 'low',
            status: 'open',
            customer: 'elena.rostova@globex.io',
            assignee: 'kenji.sato@arvo.internal'
        },
        {
            subject: 'API key regeneration leaves previous key active for 10 minutes',
            desc: 'Revoked API keys continue to authenticate successfully against edge caches until TTL expires.',
            priority: 'medium',
            status: 'in_progress',
            customer: 'marcus.vance@initech.com',
            assignee: 'fatima.alzahra@arvo.internal'
        },
        {
            subject: 'Dark mode theme color contrast ratio accessibility compliance failure',
            desc: 'Secondary navigation text contrast ratio is 3.1:1, failing WCAG AA 4.5:1 requirement.',
            priority: 'low',
            status: 'open',
            customer: 'chloe.bennett@hooli.xyz',
            assignee: 'lucas.meyer@arvo.internal'
        },
        {
            subject: 'Audit trail hash verification failed alert triggered on tenant database',
            desc: 'Automated integrity scanner flagged a hash verification failure on ticket audit log sequence.',
            priority: 'urgent',
            status: 'in_progress',
            customer: 'liam.davies@stark-industries.com',
            assignee: 'dev.sharma@arvo.internal'
        },
        {
            subject: 'Two-factor authentication SMS OTP delivery delays on UK mobile carriers',
            desc: 'SMS codes delivered via Twilio are taking up to 8 minutes to arrive for users on Vodafone UK.',
            priority: 'medium',
            status: 'waiting_on_customer',
            customer: 'sophia.zhang@umbrella.corp',
            assignee: 'sara.lindqvist@arvo.internal'
        },
        {
            subject: 'Elasticsearch query parser syntax error on search queries with unescaped slashes',
            desc: 'Searching for URLs like https://example.com in global search raises 400 Bad Request.',
            priority: 'low',
            status: 'resolved',
            customer: 'arthur.p@cyberdyne.ai',
            assignee: 'marcus.brody@arvo.internal'
        }
    ];
    for (let i = 0; i < additionalTicketsData.length; i++) {
        const item = additionalTicketsData[i];
        const ticketNum = i + 9;
        const humanId = `INC-${ticketNum.toString().padStart(4, '0')}`;
        // Vary creation times through the week
        const dayOffset = (i % 5);
        const hour = 10 + (i % 7);
        const dateStr = `2026-03-0${2 + dayOffset}T${hour.toString().padStart(2, '0')}:15:00.000+05:30`;
        await seedTicket({
            humanId,
            subject: item.subject,
            description: item.desc,
            priority: item.priority,
            status: item.status,
            customerEmail: item.customer,
            assigneeEmail: item.assignee,
            createdAtIso: dateStr,
            firstResponseAtIso: item.status !== 'open' ? dateStr : null,
            resolvedAtIso: item.status === 'resolved' || item.status === 'closed' ? dateStr : null,
            internalNotes: i % 3 === 0 ? [
                {
                    authorEmail: item.assignee,
                    body: `Internal review note: verified telemetry patterns and discussed remediation with lead.`,
                    createdAtIso: dateStr
                }
            ] : undefined
        });
    }
    console.log(`✓ Seeded ${8 + additionalTicketsData.length} total realistic tickets (INC-0001 to INC-0040)`);
    // Resync ticket_human_id_seq to the highest human ID (e.g. 40)
    await db.query(`SELECT setval('ticket_human_id_seq', (SELECT COALESCE(MAX(SUBSTRING(human_id FROM 5)::integer), 1) FROM tickets));`);
    console.log('--- Arvo Systems Full Seed Finished Successfully ---');
}
if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
    runFullSeed()
        .then(async () => {
        const db = await (0, client_js_1.getDbClient)();
        await db.close();
        process.exit(0);
    })
        .catch((err) => {
        console.error('Full seed failed:', err);
        process.exit(1);
    });
}
//# sourceMappingURL=seed.js.map