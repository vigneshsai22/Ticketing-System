import { z } from 'zod';
export declare const DemoLoginSchema: z.ZodObject<{
    email: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["agent", "lead", "admin"]>>;
}, "strip", z.ZodTypeAny, {
    email?: string | undefined;
    role?: "agent" | "lead" | "admin" | undefined;
}, {
    email?: string | undefined;
    role?: "agent" | "lead" | "admin" | undefined;
}>;
export declare const CreateTicketSchema: z.ZodObject<{
    subject: z.ZodString;
    priority: z.ZodEnum<["urgent", "medium", "low"]>;
    customerId: z.ZodOptional<z.ZodString>;
    initialMessage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    subject: string;
    priority: "urgent" | "medium" | "low";
    customerId?: string | undefined;
    initialMessage?: string | undefined;
}, {
    subject: string;
    priority: "urgent" | "medium" | "low";
    customerId?: string | undefined;
    initialMessage?: string | undefined;
}>;
export declare const UpdateStatusSchema: z.ZodObject<{
    status: z.ZodEnum<["new", "open", "in_progress", "waiting_on_customer", "resolved", "closed"]>;
    reason: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    status: "new" | "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
    version?: number | undefined;
    reason?: string | undefined;
}, {
    status: "new" | "open" | "in_progress" | "waiting_on_customer" | "resolved" | "closed";
    version?: number | undefined;
    reason?: string | undefined;
}>;
export declare const ReleaseTicketSchema: z.ZodDefault<z.ZodOptional<z.ZodObject<{
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version?: number | undefined;
}, {
    version?: number | undefined;
}>>>;
export declare const ReassignTicketSchema: z.ZodEffects<z.ZodObject<{
    assigneeId: z.ZodOptional<z.ZodString>;
    agentId: z.ZodOptional<z.ZodString>;
    reason: z.ZodOptional<z.ZodString>;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    version?: number | undefined;
    reason?: string | undefined;
    assigneeId?: string | undefined;
    agentId?: string | undefined;
}, {
    version?: number | undefined;
    reason?: string | undefined;
    assigneeId?: string | undefined;
    agentId?: string | undefined;
}>, {
    version?: number | undefined;
    reason?: string | undefined;
    assigneeId?: string | undefined;
    agentId?: string | undefined;
}, {
    version?: number | undefined;
    reason?: string | undefined;
    assigneeId?: string | undefined;
    agentId?: string | undefined;
}>;
export declare const PriorityChangeSchema: z.ZodObject<{
    priority: z.ZodEnum<["urgent", "medium", "low"]>;
    reason: z.ZodString;
    version: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    priority: "urgent" | "medium" | "low";
    reason: string;
    version?: number | undefined;
}, {
    priority: "urgent" | "medium" | "low";
    reason: string;
    version?: number | undefined;
}>;
export declare const AgentReplySchema: z.ZodObject<{
    body: z.ZodString;
    wait_on_customer: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    body: string;
    wait_on_customer?: boolean | undefined;
}, {
    body: string;
    wait_on_customer?: boolean | undefined;
}>;
export declare const InternalNoteSchema: z.ZodObject<{
    body: z.ZodString;
}, "strip", z.ZodTypeAny, {
    body: string;
}, {
    body: string;
}>;
export declare const CustomerCreateTicketSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    subject: z.ZodString;
    priority: z.ZodEnum<["urgent", "medium", "low"]>;
    message: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    message: string;
    subject: string;
    priority: "urgent" | "medium" | "low";
    name: string;
}, {
    email: string;
    message: string;
    subject: string;
    priority: "urgent" | "medium" | "low";
    name: string;
}>;
export declare const CustomerReplySchema: z.ZodObject<{
    body: z.ZodString;
}, "strip", z.ZodTypeAny, {
    body: string;
}, {
    body: string;
}>;
export declare const CustomerReopenSchema: z.ZodDefault<z.ZodOptional<z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    reason?: string | undefined;
}, {
    reason?: string | undefined;
}>>>;
export declare const IntakeTicketSchema: z.ZodObject<{
    channel: z.ZodDefault<z.ZodOptional<z.ZodEnum<["phone", "email", "in_person"]>>>;
    customer: z.ZodObject<{
        email: z.ZodString;
        name: z.ZodString;
        organization: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        email: string;
        name: string;
        organization?: string | undefined;
    }, {
        email: string;
        name: string;
        organization?: string | undefined;
    }>;
    subject: z.ZodString;
    priority: z.ZodEnum<["urgent", "medium", "low"]>;
    initialMessage: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    customer: {
        email: string;
        name: string;
        organization?: string | undefined;
    };
    subject: string;
    priority: "urgent" | "medium" | "low";
    channel: "email" | "phone" | "in_person";
    initialMessage?: string | undefined;
}, {
    customer: {
        email: string;
        name: string;
        organization?: string | undefined;
    };
    subject: string;
    priority: "urgent" | "medium" | "low";
    initialMessage?: string | undefined;
    channel?: "email" | "phone" | "in_person" | undefined;
}>;
export declare const CreateUserSchema: z.ZodObject<{
    email: z.ZodString;
    name: z.ZodString;
    role: z.ZodEnum<["agent", "lead", "admin"]>;
}, "strip", z.ZodTypeAny, {
    email: string;
    role: "agent" | "lead" | "admin";
    name: string;
}, {
    email: string;
    role: "agent" | "lead" | "admin";
    name: string;
}>;
export declare const UpdateUserSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    role: z.ZodOptional<z.ZodEnum<["agent", "lead", "admin"]>>;
    active: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    role?: "agent" | "lead" | "admin" | undefined;
    name?: string | undefined;
    active?: boolean | undefined;
}, {
    role?: "agent" | "lead" | "admin" | undefined;
    name?: string | undefined;
    active?: boolean | undefined;
}>;
export declare const CreateHolidaySchema: z.ZodObject<{
    date: z.ZodString;
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    date: string;
    name: string;
}, {
    date: string;
    name: string;
}>;
export declare const UpdateSlaPolicySchema: z.ZodObject<{
    respond_minutes: z.ZodOptional<z.ZodNumber>;
    resolve_minutes: z.ZodOptional<z.ZodNumber>;
    resolve_mode: z.ZodOptional<z.ZodEnum<["fixed_minutes", "end_of_response_day"]>>;
}, "strip", z.ZodTypeAny, {
    respond_minutes?: number | undefined;
    resolve_minutes?: number | undefined;
    resolve_mode?: "fixed_minutes" | "end_of_response_day" | undefined;
}, {
    respond_minutes?: number | undefined;
    resolve_minutes?: number | undefined;
    resolve_mode?: "fixed_minutes" | "end_of_response_day" | undefined;
}>;
export declare const UpdateSettingSchema: z.ZodObject<{
    value: z.ZodUnknown;
}, "strip", z.ZodTypeAny, {
    value?: unknown;
}, {
    value?: unknown;
}>;
export declare const CreateCannedReplySchema: z.ZodObject<{
    title: z.ZodString;
    content: z.ZodString;
    shortcut: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    content: string;
    title: string;
    shortcut?: string | undefined;
    category?: string | undefined;
}, {
    content: string;
    title: string;
    shortcut?: string | undefined;
    category?: string | undefined;
}>;
export declare const UpdateCannedReplySchema: z.ZodObject<{
    title: z.ZodOptional<z.ZodString>;
    content: z.ZodOptional<z.ZodString>;
    shortcut: z.ZodOptional<z.ZodString>;
    category: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    content?: string | undefined;
    title?: string | undefined;
    shortcut?: string | undefined;
    category?: string | undefined;
}, {
    content?: string | undefined;
    title?: string | undefined;
    shortcut?: string | undefined;
    category?: string | undefined;
}>;
export declare const TimeJumpSchema: z.ZodObject<{
    target: z.ZodString;
}, "strip", z.ZodTypeAny, {
    target: string;
}, {
    target: string;
}>;
export declare const TimeShiftSchema: z.ZodObject<{
    minutes: z.ZodOptional<z.ZodNumber>;
    hours: z.ZodOptional<z.ZodNumber>;
    days: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    minutes?: number | undefined;
    hours?: number | undefined;
    days?: number | undefined;
}, {
    minutes?: number | undefined;
    hours?: number | undefined;
    days?: number | undefined;
}>;
export declare const TimeSetSchema: z.ZodObject<{
    time: z.ZodString;
}, "strip", z.ZodTypeAny, {
    time: string;
}, {
    time: string;
}>;
export declare const PresenceSchema: z.ZodObject<{
    ticket_id: z.ZodString;
    action: z.ZodOptional<z.ZodEnum<["viewing", "left"]>>;
}, "strip", z.ZodTypeAny, {
    ticket_id: string;
    action?: "viewing" | "left" | undefined;
}, {
    ticket_id: string;
    action?: "viewing" | "left" | undefined;
}>;
export declare const SearchQuerySchema: z.ZodObject<{
    q: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    q?: string | undefined;
    limit?: number | undefined;
}, {
    q?: string | undefined;
    limit?: number | undefined;
}>;
export declare function validateWithZod<T>(schema: z.ZodType<T>, data: unknown): {
    success: true;
    data: T;
} | {
    success: false;
    error: string;
    issues: z.ZodIssue[];
};
