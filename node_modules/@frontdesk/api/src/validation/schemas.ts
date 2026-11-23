import { z } from 'zod';

// ============================================================================
// 1. AUTH SCHEMAS
// ============================================================================
export const DemoLoginSchema = z.object({
  email: z.string().email('Valid email is required').optional(),
  role: z.enum(['agent', 'lead', 'admin']).optional()
});

// ============================================================================
// 2. TICKET SCHEMAS
// ============================================================================
export const CreateTicketSchema = z.object({
  subject: z.string().min(1, 'Subject is required').max(255),
  priority: z.enum(['urgent', 'medium', 'low']),
  customerId: z.string().min(1).optional(),
  initialMessage: z.string().optional()
});

export const UpdateStatusSchema = z.object({
  status: z.enum(['new', 'open', 'in_progress', 'waiting_on_customer', 'resolved', 'closed']),
  reason: z.string().optional(),
  version: z.number().int().optional()
});

export const ReleaseTicketSchema = z.object({
  version: z.number().int().optional()
}).optional().default({});

export const ReassignTicketSchema = z.object({
  assigneeId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  reason: z.string().optional(),
  version: z.number().int().optional()
}).refine(data => Boolean(data.assigneeId || data.agentId), {
  message: 'assigneeId or agentId is required'
});

export const PriorityChangeSchema = z.object({
  priority: z.enum(['urgent', 'medium', 'low']),
  reason: z.string({ required_error: 'Priority change reason is strictly required' }).min(1, 'Priority change reason is strictly required'),
  version: z.number().int().optional()
});

// ============================================================================
// 3. REPLIES & NOTES SCHEMAS
// ============================================================================
export const AgentReplySchema = z.object({
  body: z.string().min(1, 'Message body cannot be empty'),
  wait_on_customer: z.boolean().optional()
});

export const InternalNoteSchema = z.object({
  body: z.string().min(1, 'Note body cannot be empty')
});

// ============================================================================
// 4. CUSTOMER PORTAL SCHEMAS
// ============================================================================
export const CustomerCreateTicketSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Name is required'),
  subject: z.string().min(1, 'Subject is required'),
  priority: z.enum(['urgent', 'medium', 'low']),
  message: z.string().min(1, 'Message is required')
});

export const CustomerReplySchema = z.object({
  body: z.string().min(1, 'Reply body cannot be empty')
});

export const CustomerReopenSchema = z.object({
  reason: z.string().optional()
}).optional().default({});

// ============================================================================
// 5. INTAKE SCHEMAS
// ============================================================================
export const IntakeTicketSchema = z.object({
  channel: z.enum(['phone', 'email', 'in_person']).optional().default('email'),
  customer: z.object({
    email: z.string().email('Valid customer email is required'),
    name: z.string().min(1, 'Customer name is required'),
    organization: z.string().optional()
  }),
  subject: z.string().min(1, 'Subject is required'),
  priority: z.enum(['urgent', 'medium', 'low']),
  initialMessage: z.string().optional()
});

// ============================================================================
// 6. ADMIN & USER GOVERNANCE SCHEMAS
// ============================================================================
export const CreateUserSchema = z.object({
  email: z.string().email('Valid email is required'),
  name: z.string().min(1, 'Name is required'),
  role: z.enum(['agent', 'lead', 'admin'])
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(['agent', 'lead', 'admin']).optional(),
  active: z.boolean().optional()
});

export const CreateHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  name: z.string().min(1, 'Holiday name is required')
});

export const UpdateSlaPolicySchema = z.object({
  respond_minutes: z.number().int().nonnegative().optional(),
  resolve_minutes: z.number().int().nonnegative().optional(),
  resolve_mode: z.enum(['fixed_minutes', 'end_of_response_day']).optional()
});

export const UpdateSettingSchema = z.object({
  value: z.unknown()
});

export const CreateCannedReplySchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
  shortcut: z.string().optional(),
  category: z.string().optional()
});

export const UpdateCannedReplySchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  shortcut: z.string().optional(),
  category: z.string().optional()
});

// ============================================================================
// 7. TIME MACHINE & DEMO SCHEMAS
// ============================================================================
export const TimeJumpSchema = z.object({
  target: z.string().min(1, 'Target moment is required')
});

export const TimeShiftSchema = z.object({
  minutes: z.number().optional(),
  hours: z.number().optional(),
  days: z.number().optional()
});

export const TimeSetSchema = z.object({
  time: z.string().min(1, 'ISO timestamp string is required')
});

// ============================================================================
// 8. EVENTS & SEARCH SCHEMAS
// ============================================================================
export const PresenceSchema = z.object({
  ticket_id: z.string().min(1, 'ticket_id is required'),
  action: z.enum(['viewing', 'left']).optional()
});

export const SearchQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

// ============================================================================
// VALIDATION HELPER
// ============================================================================
export function validateWithZod<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: string; issues: z.ZodIssue[] } {
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
