"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_js_1 = require("../db/client.js");
const sla_1 = require("@frontdesk/sla");
const analyticsRoutes = async (fastify) => {
    // 1. Lead Dashboard Data Endpoint (Lead or Admin only)
    fastify.get('/analytics/lead-dashboard', {
        preHandler: [fastify.requireRole('lead', 'admin')]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { agent_id, priority, date_range } = request.query;
        const now = fastify.clock.now();
        const nowIso = now.toISOString();
        // 1. Fetch holidays and settings for accurate SLA business calculations
        const [holidaysRes, settingsRes] = await Promise.all([
            db.query('SELECT date, name FROM holidays'),
            db.query('SELECT key, value FROM settings')
        ]);
        const holidays = holidaysRes.rows.map(h => ({
            date: typeof h.date === 'string' ? h.date : new Date(h.date).toISOString().slice(0, 10),
            name: h.name
        }));
        let workingHoursConfig = sla_1.DEFAULT_WORKING_HOURS;
        const whSetting = settingsRes.rows.find(s => s.key === 'working_hours');
        if (whSetting && whSetting.value) {
            const val = whSetting.value;
            workingHoursConfig = {
                start: val.start || sla_1.DEFAULT_WORKING_HOURS.start,
                end: val.end || sla_1.DEFAULT_WORKING_HOURS.end,
                timezone: val.timezone || sla_1.DEFAULT_WORKING_HOURS.timezone,
                days: val.days || sla_1.DEFAULT_WORKING_HOURS.days
            };
        }
        // 2. Build filtered SQL for tickets
        let filterSql = 'WHERE 1=1';
        const filterParams = [];
        if (agent_id) {
            filterParams.push(agent_id);
            filterSql += ` AND t.assignee_id = $${filterParams.length}`;
        }
        if (priority) {
            filterParams.push(priority);
            filterSql += ` AND t.priority = $${filterParams.length}`;
        }
        if (date_range === '7d') {
            filterSql += ` AND t.created_at >= (NOW() - INTERVAL '7 days')`;
        }
        else if (date_range === '30d') {
            filterSql += ` AND t.created_at >= (NOW() - INTERVAL '30 days')`;
        }
        // Query all relevant tickets with their latest cycle, assignee, customer
        const ticketsQuery = `
      SELECT 
        t.id,
        t.human_id,
        t.subject,
        t.priority,
        t.status,
        t.assignee_id,
        t.version,
        t.cycle_no,
        t.customer_id,
        t.created_at,
        u.name AS assignee_name,
        c.name AS customer_name,
        c.organization AS customer_org,
        tc.clock_start,
        tc.response_due,
        tc.resolve_due,
        tc.first_response_at,
        tc.resolved_at,
        tc.response_breached_at,
        tc.resolve_breached_at,
        tc.response_breach_reason,
        tc.resolve_breach_reason
      FROM tickets t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN ticket_cycles tc ON t.id = tc.ticket_id AND t.cycle_no = tc.cycle_no
      ${filterSql}
      ORDER BY t.created_at DESC
    `;
        const ticketsRes = await db.query(ticketsQuery, filterParams);
        const tickets = ticketsRes.rows;
        // Fetch all pauses for these tickets
        const pausesRes = await db.query(`
      SELECT ticket_id, cycle_no, started_at, ended_at, reason
      FROM sla_pauses
      ORDER BY started_at ASC
    `);
        const allPauses = pausesRes.rows;
        // Fetch audit events for breach analysis
        const auditRes = await db.query(`
      SELECT ticket_id, event_type, before, after, created_at
      FROM audit_events
      WHERE ticket_id IS NOT NULL
      ORDER BY seq ASC
    `);
        const allAuditEvents = auditRes.rows;
        // 3. Compute KPI metrics
        const totalTickets = tickets.length;
        let responseBreaches = 0;
        let resolveBreaches = 0;
        let currentlyLateCount = 0;
        let atRiskCount = 0;
        let waitingOnCustomerCount = 0;
        let unassignedCount = 0;
        const lateTicketsList = [];
        const breachReasonCounts = {
            unassigned_too_long: 0,
            slow_after_assignment: 0,
            escalated_mid_flight: 0,
            multiple_reassignments: 0,
            other: 0
        };
        const lateByDateMap = {};
        for (const t of tickets) {
            const isResolvedOrClosed = ['resolved', 'closed'].includes(t.status);
            const isWaiting = t.status === 'waiting_on_customer';
            const isUnassigned = !t.assignee_id && !isResolvedOrClosed;
            if (isWaiting)
                waitingOnCustomerCount++;
            if (isUnassigned)
                unassignedCount++;
            // Response breach condition:
            const hasResponseBreach = Boolean(t.response_breached_at ||
                (!t.first_response_at && t.response_due && new Date(nowIso) > new Date(t.response_due)));
            if (hasResponseBreach)
                responseBreaches++;
            // Resolution breach condition:
            const hasResolveBreach = Boolean(t.resolve_breached_at ||
                (!t.resolved_at && t.resolve_due && new Date(nowIso) > new Date(t.resolve_due)));
            if (hasResolveBreach)
                resolveBreaches++;
            const isLate = (hasResponseBreach && !t.first_response_at) || (hasResolveBreach && !isResolvedOrClosed);
            if (isLate)
                currentlyLateCount++;
            // At risk condition: active ticket with <20% time budget remaining
            if (!isResolvedOrClosed && !isLate && t.resolve_due) {
                const dueTime = new Date(t.resolve_due).getTime();
                const startTime = new Date(t.clock_start || t.created_at).getTime();
                const totalDuration = dueTime - startTime;
                const timeLeft = dueTime - now.getTime();
                if (totalDuration > 0 && timeLeft > 0 && timeLeft / totalDuration <= 0.2) {
                    atRiskCount++;
                }
            }
            // Pauses for this ticket and cycle
            const ticketPauses = allPauses.filter(p => p.ticket_id === t.id && p.cycle_no === t.cycle_no);
            // Customer wait minutes excluded
            let customerWaitMinutes = 0;
            for (const p of ticketPauses) {
                const pStart = new Date(p.started_at).getTime();
                const pEnd = p.ended_at ? new Date(p.ended_at).getTime() : now.getTime();
                const diffMinutes = Math.max(0, Math.round((pEnd - pStart) / 60000));
                customerWaitMinutes += diffMinutes;
            }
            // If either breached or currently late, categorize breach reason and add to late table
            if (hasResponseBreach || hasResolveBreach || isLate) {
                // Track trend by date
                const dateKey = new Date(t.created_at).toISOString().slice(0, 10);
                lateByDateMap[dateKey] = (lateByDateMap[dateKey] || 0) + 1;
                // Auto-derive breach reason using computeBreachReason
                let derivedReason = t.response_breach_reason || t.resolve_breach_reason;
                if (!derivedReason) {
                    const ticketAudits = allAuditEvents
                        .filter(a => a.ticket_id === t.id)
                        .map(a => ({
                        type: (a.event_type === 'claimed' ? 'assigned' : a.event_type),
                        timestamp: a.created_at,
                        data: a.after
                    }));
                    const diagnosis = (0, sla_1.computeBreachReason)(ticketAudits, {
                        clock_start: t.clock_start || t.created_at,
                        response_due: t.response_due,
                        resolve_due: t.resolve_due,
                        first_response_at: t.first_response_at,
                        resolved_at: t.resolved_at,
                        response_breached_at: t.response_breached_at,
                        resolve_breached_at: t.resolve_breached_at
                    }, ticketPauses.map(p => ({
                        startedAt: p.started_at,
                        endedAt: p.ended_at
                    })), workingHoursConfig, holidays);
                    derivedReason = diagnosis.reason;
                }
                if (!derivedReason || !breachReasonCounts[derivedReason]) {
                    derivedReason = 'other';
                }
                breachReasonCounts[derivedReason]++;
                const reasonLabels = {
                    unassigned_too_long: 'Unassigned too long (>50% budget waiting)',
                    slow_after_assignment: 'Slow after assignment',
                    escalated_mid_flight: 'Escalated mid-flight (retroactive breach)',
                    multiple_reassignments: 'Multiple reassignments (>= 2 times)',
                    other: 'General SLA overrun'
                };
                lateTicketsList.push({
                    id: t.id,
                    human_id: t.human_id,
                    subject: t.subject,
                    priority: t.priority,
                    status: t.status,
                    assignee_id: t.assignee_id,
                    assignee_name: t.assignee_name || 'Unassigned',
                    customer_name: t.customer_name || 'Customer',
                    customer_org: t.customer_org || 'Direct Account',
                    created_at: t.created_at,
                    response_due: t.response_due,
                    resolve_due: t.resolve_due,
                    first_response_at: t.first_response_at,
                    resolved_at: t.resolved_at,
                    response_breached: hasResponseBreach,
                    resolve_breached: hasResolveBreach,
                    why_late: derivedReason,
                    why_late_label: reasonLabels[derivedReason] || derivedReason,
                    customer_wait_minutes_excluded: customerWaitMinutes,
                    cycle_no: t.cycle_no
                });
            }
        }
        const responseCompliancePct = totalTickets > 0
            ? Math.max(0, Math.round(((totalTickets - responseBreaches) / totalTickets) * 1000) / 10)
            : 100;
        const resolutionCompliancePct = totalTickets > 0
            ? Math.max(0, Math.round(((totalTickets - resolveBreaches) / totalTickets) * 1000) / 10)
            : 100;
        // 4. Compute Agent Workloads
        const staffRes = await db.query(`
      SELECT id, name, email, role
      FROM users
      WHERE role IN ('agent', 'lead') AND active = TRUE
      ORDER BY name ASC
    `);
        const agentWorkloads = staffRes.rows.map(agent => {
            const agentTickets = tickets.filter(t => t.assignee_id === agent.id);
            const openCount = agentTickets.filter(t => !['resolved', 'closed'].includes(t.status)).length;
            const resolvedCount = agentTickets.filter(t => ['resolved', 'closed'].includes(t.status)).length;
            const lateCount = agentTickets.filter(t => {
                const isLate = (t.response_breached_at && !t.first_response_at) ||
                    (t.resolve_breached_at && !['resolved', 'closed'].includes(t.status));
                return isLate;
            }).length;
            return {
                agent_id: agent.id,
                agent_name: agent.name,
                role: agent.role,
                open_tickets: openCount,
                resolved_tickets: resolvedCount,
                late_tickets: lateCount
            };
        });
        // 5. Structure trend and breakdown charts
        const lateOverTime = Object.keys(lateByDateMap)
            .sort()
            .map(date => ({
            date,
            count: lateByDateMap[date]
        }));
        const totalBreachesWithReason = Object.values(breachReasonCounts).reduce((a, b) => a + b, 0);
        const breachReasonsBreakdown = [
            {
                reason: 'unassigned_too_long',
                label: 'Unassigned Too Long',
                count: breachReasonCounts.unassigned_too_long,
                percentage: totalBreachesWithReason > 0 ? Math.round((breachReasonCounts.unassigned_too_long / totalBreachesWithReason) * 100) : 0
            },
            {
                reason: 'slow_after_assignment',
                label: 'Slow After Assignment',
                count: breachReasonCounts.slow_after_assignment,
                percentage: totalBreachesWithReason > 0 ? Math.round((breachReasonCounts.slow_after_assignment / totalBreachesWithReason) * 100) : 0
            },
            {
                reason: 'escalated_mid_flight',
                label: 'Escalated Mid-Flight',
                count: breachReasonCounts.escalated_mid_flight,
                percentage: totalBreachesWithReason > 0 ? Math.round((breachReasonCounts.escalated_mid_flight / totalBreachesWithReason) * 100) : 0
            },
            {
                reason: 'multiple_reassignments',
                label: 'Multiple Reassignments',
                count: breachReasonCounts.multiple_reassignments,
                percentage: totalBreachesWithReason > 0 ? Math.round((breachReasonCounts.multiple_reassignments / totalBreachesWithReason) * 100) : 0
            },
            {
                reason: 'other',
                label: 'Other / Overrun',
                count: breachReasonCounts.other,
                percentage: totalBreachesWithReason > 0 ? Math.round((breachReasonCounts.other / totalBreachesWithReason) * 100) : 0
            }
        ];
        return reply.send({
            kpis: {
                total_tickets: totalTickets,
                response_compliance_pct: responseCompliancePct,
                resolution_compliance_pct: resolutionCompliancePct,
                currently_late: currentlyLateCount,
                at_risk: atRiskCount,
                waiting_on_customer: waitingOnCustomerCount,
                unassigned: unassignedCount
            },
            late_tickets: lateTicketsList,
            charts: {
                late_over_time: lateOverTime,
                breach_reasons: breachReasonsBreakdown,
                workload_per_agent: agentWorkloads
            }
        });
    });
    // 2. Internal CSV Export (Lead or Admin only; clearly labeled as containing internal data)
    fastify.get('/analytics/export-csv', {
        preHandler: [fastify.requireRole('lead', 'admin')]
    }, async (request, reply) => {
        const db = await (0, client_js_1.getDbClient)();
        const { agent_id, priority, date_range } = request.query;
        let filterSql = 'WHERE 1=1';
        const filterParams = [];
        if (agent_id) {
            filterParams.push(agent_id);
            filterSql += ` AND t.assignee_id = $${filterParams.length}`;
        }
        if (priority) {
            filterParams.push(priority);
            filterSql += ` AND t.priority = $${filterParams.length}`;
        }
        if (date_range === '7d') {
            filterSql += ` AND t.created_at >= (NOW() - INTERVAL '7 days')`;
        }
        else if (date_range === '30d') {
            filterSql += ` AND t.created_at >= (NOW() - INTERVAL '30 days')`;
        }
        const query = `
      SELECT 
        t.human_id,
        t.subject,
        c.name AS customer_name,
        c.organization AS customer_org,
        t.priority,
        t.status,
        COALESCE(u.name, 'Unassigned') AS assignee,
        t.created_at,
        tc.response_due,
        tc.resolve_due,
        tc.first_response_at,
        tc.resolved_at,
        tc.response_breached_at,
        tc.resolve_breached_at,
        COALESCE(tc.response_breach_reason, tc.resolve_breach_reason, 'on_track') AS why_late,
        tc.cycle_no
      FROM tickets t
      LEFT JOIN users u ON t.assignee_id = u.id
      LEFT JOIN customers c ON t.customer_id = c.id
      LEFT JOIN ticket_cycles tc ON t.id = tc.ticket_id AND t.cycle_no = tc.cycle_no
      ${filterSql}
      ORDER BY t.created_at DESC
    `;
        const res = await db.query(query, filterParams);
        const nowIso = fastify.clock.now().toISOString();
        const escapeCsv = (str) => {
            if (str === null || str === undefined)
                return '""';
            const s = String(str).replace(/"/g, '""');
            return `"${s}"`;
        };
        const lines = [
            `# ==============================================================================`,
            `# ARVO SYSTEMS - LEAD AUDIT & SLA REPORT (CONFIDENTIAL)`,
            `# WARNING: CONTAINS INTERNAL DATA (STAFF ASSIGNMENTS, AUDIT HISTORIES, ROOT CAUSES)`,
            `# Exported By: ${request.user.name} (${request.user.email})`,
            `# Exported At: ${nowIso}`,
            `# Filter Agent: ${agent_id || 'All'} | Filter Priority: ${priority || 'All'} | Filter Date Range: ${date_range || 'All'}`,
            `# ==============================================================================`,
            [
                'Ticket ID',
                'Subject',
                'Customer Name',
                'Customer Org',
                'Priority',
                'Status',
                'Assignee',
                'Created At',
                'Response Due',
                'Resolve Due',
                'First Response At',
                'Resolved At',
                'Response Breached At',
                'Resolve Breached At',
                'Why Late',
                'Cycle No'
            ].map(escapeCsv).join(',')
        ];
        for (const r of res.rows) {
            lines.push([
                r.human_id,
                r.subject,
                r.customer_name,
                r.customer_org,
                r.priority,
                r.status,
                r.assignee,
                r.created_at,
                r.response_due,
                r.resolve_due,
                r.first_response_at,
                r.resolved_at,
                r.response_breached_at,
                r.resolve_breached_at,
                r.why_late,
                r.cycle_no
            ].map(escapeCsv).join(','));
        }
        const csvContent = lines.join('\n');
        reply.header('Content-Type', 'text/csv; charset=utf-8');
        reply.header('Content-Disposition', 'attachment; filename="arvo_lead_sla_audit_report.csv"');
        return reply.send(csvContent);
    });
};
exports.default = analyticsRoutes;
//# sourceMappingURL=analytics.routes.js.map