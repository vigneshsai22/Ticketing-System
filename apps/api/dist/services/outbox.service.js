"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueOutboxEmail = enqueueOutboxEmail;
const customer_serializer_js_1 = require("./customer-serializer.js");
/**
 * Enqueues a simulated email in the outbox table.
 * All email bodies are constructed strictly via the customer serializer to prevent note leakage.
 */
async function enqueueOutboxEmail(db, clock, params) {
    const { subject, body } = (0, customer_serializer_js_1.renderCustomerEmail)(params);
    const nowIso = clock.now().toISOString();
    const res = await db.query(`INSERT INTO outbox (
       recipient_email, subject, body, template, status, created_at
     ) VALUES ($1, $2, $3, $4, 'pending', $5)
     RETURNING id`, [params.recipientEmail, subject, body, params.template, nowIso]);
    return res.rows[0].id;
}
//# sourceMappingURL=outbox.service.js.map