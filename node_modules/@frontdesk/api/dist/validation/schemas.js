"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SearchQuerySchema = exports.PresenceSchema = exports.TimeSetSchema = exports.TimeShiftSchema = exports.TimeJumpSchema = exports.UpdateCannedReplySchema = exports.CreateCannedReplySchema = exports.UpdateSettingSchema = exports.UpdateSlaPolicySchema = exports.CreateHolidaySchema = exports.UpdateUserSchema = exports.CreateUserSchema = exports.IntakeTicketSchema = exports.CustomerReopenSchema = exports.CustomerReplySchema = exports.CustomerCreateTicketSchema = exports.InternalNoteSchema = exports.AgentReplySchema = exports.PriorityChangeSchema = exports.ReassignTicketSchema = exports.ReleaseTicketSchema = exports.UpdateStatusSchema = exports.CreateTicketSchema = exports.DemoLoginSchema = void 0;
exports.validateWithZod = validateWithZod;
const zod_1 = require("zod");
// ============================================================================
// 1. AUTH SCHEMAS
// ============================================================================
exports.DemoLoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Valid email is required').optional(),
    role: zod_1.z.enum(['agent', 'lead', 'admin']).optional()
});
// ============================================================================
// 2. TICKET SCHEMAS
// ============================================================================
exports.CreateTicketSchema = zod_1.z.object({
    subject: zod_1.z.string().min(1, 'Subject is required').max(255),
    priority: zod_1.z.enum(['urgent', 'medium', 'low']),
    customerId: zod_1.z.string().min(1).optional(),
    initialMessage: zod_1.z.string().optional()
});
exports.UpdateStatusSchema = zod_1.z.object({
    status: zod_1.z.enum(['new', 'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed']),
    reason: zod_1.z.string().optional(),
    version: zod_1.z.number().int().optional()
});
exports.ReleaseTicketSchema = zod_1.z.object({
    version: zod_1.z.number().int().optional()
}).optional().default({});
exports.ReassignTicketSchema = zod_1.z.object({
    assigneeId: zod_1.z.string().min(1).optional(),
    agentId: zod_1.z.string().min(1).optional(),
    reason: zod_1.z.string().optional(),
    version: zod_1.z.number().int().optional()
}).refine(data => Boolean(data.assigneeId || data.agentId), {
    message: 'assigneeId or agentId is required'
});
exports.PriorityChangeSchema = zod_1.z.object({
    priority: zod_1.z.enum(['urgent', 'medium', 'low']),
    reason: zod_1.z.string({ required_error: 'Priority change reason is strictly required' }).min(1, 'Priority change reason is strictly required'),
    version: zod_1.z.number().int().optional()
});
// ============================================================================
// 3. REPLIES & NOTES SCHEMAS
// ============================================================================
exports.AgentReplySchema = zod_1.z.object({
    body: zod_1.z.string().min(1, 'Message body cannot be empty'),
    wait_on_customer: zod_1.z.boolean().optional()
});
exports.InternalNoteSchema = zod_1.z.object({
    body: zod_1.z.string().min(1, 'Note body cannot be empty')
});
// ============================================================================
// 4. CUSTOMER PORTAL SCHEMAS
// ============================================================================
exports.CustomerCreateTicketSchema = zod_1.z.object({
    email: zod_1.z.string().email('Valid email is required'),
    name: zod_1.z.string().min(1, 'Name is required'),
    subject: zod_1.z.string().min(1, 'Subject is required'),
    priority: zod_1.z.enum(['urgent', 'medium', 'low']),
    message: zod_1.z.string().min(1, 'Message is required')
});
exports.CustomerReplySchema = zod_1.z.object({
    body: zod_1.z.string().min(1, 'Reply body cannot be empty')
});
exports.CustomerReopenSchema = zod_1.z.object({
    reason: zod_1.z.string().optional()
}).optional().default({});
// ============================================================================
// 5. INTAKE SCHEMAS
// ============================================================================
exports.IntakeTicketSchema = zod_1.z.object({
    channel: zod_1.z.enum(['phone', 'email', 'in_person']).optional().default('email'),
    customer: zod_1.z.object({
        email: zod_1.z.string().email('Valid customer email is required'),
        name: zod_1.z.string().min(1, 'Customer name is required'),
        organization: zod_1.z.string().optional()
    }),
    subject: zod_1.z.string().min(1, 'Subject is required'),
    priority: zod_1.z.enum(['urgent', 'medium', 'low']),
    initialMessage: zod_1.z.string().optional()
});
// ============================================================================
// 6. ADMIN & USER GOVERNANCE SCHEMAS
// ============================================================================
exports.CreateUserSchema = zod_1.z.object({
    email: zod_1.z.string().email('Valid email is required'),
    name: zod_1.z.string().min(1, 'Name is required'),
    role: zod_1.z.enum(['agent', 'lead', 'admin'])
});
exports.UpdateUserSchema = zod_1.z.object({
    name: zod_1.z.string().min(1).optional(),
    role: zod_1.z.enum(['agent', 'lead', 'admin']).optional(),
    active: zod_1.z.boolean().optional()
});
exports.CreateHolidaySchema = zod_1.z.object({
    date: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
    name: zod_1.z.string().min(1, 'Holiday name is required')
});
exports.UpdateSlaPolicySchema = zod_1.z.object({
    respond_minutes: zod_1.z.number().int().nonnegative().optional(),
    resolve_minutes: zod_1.z.number().int().nonnegative().optional(),
    resolve_mode: zod_1.z.enum(['fixed_minutes', 'end_of_response_day']).optional()
});
exports.UpdateSettingSchema = zod_1.z.object({
    value: zod_1.z.unknown()
});
exports.CreateCannedReplySchema = zod_1.z.object({
    title: zod_1.z.string().min(1, 'Title is required'),
    content: zod_1.z.string().min(1, 'Content is required'),
    shortcut: zod_1.z.string().optional(),
    category: zod_1.z.string().optional()
});
exports.UpdateCannedReplySchema = zod_1.z.object({
    title: zod_1.z.string().min(1).optional(),
    content: zod_1.z.string().min(1).optional(),
    shortcut: zod_1.z.string().optional(),
    category: zod_1.z.string().optional()
});
// ============================================================================
// 7. TIME MACHINE & DEMO SCHEMAS
// ============================================================================
exports.TimeJumpSchema = zod_1.z.object({
    target: zod_1.z.string().min(1, 'Target moment is required')
});
exports.TimeShiftSchema = zod_1.z.object({
    minutes: zod_1.z.number().optional(),
    hours: zod_1.z.number().optional(),
    days: zod_1.z.number().optional()
});
exports.TimeSetSchema = zod_1.z.object({
    time: zod_1.z.string().min(1, 'ISO timestamp string is required')
});
// ============================================================================
// 8. EVENTS & SEARCH SCHEMAS
// ============================================================================
exports.PresenceSchema = zod_1.z.object({
    ticket_id: zod_1.z.string().min(1, 'ticket_id is required'),
    action: zod_1.z.enum(['viewing', 'left']).optional()
});
exports.SearchQuerySchema = zod_1.z.object({
    q: zod_1.z.string().optional(),
    limit: zod_1.z.coerce.number().int().positive().max(100).optional()
});
// ============================================================================
// VALIDATION HELPER
// ============================================================================
function validateWithZod(schema, data) {
    const result = schema.safeParse(data);
    if (!result.success) {
        const errorMsg = result.error.errors
            .map(e => e.message || `${e.path.join('.')}: ${e.code}`)
            .join(', ');
        return {
            success: false,
            error: errorMsg,
            issues: result.error.issues
        };
    }
    return { success: true, data: result.data };
}
//# sourceMappingURL=schemas.js.map