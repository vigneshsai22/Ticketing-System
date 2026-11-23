import { EventEmitter } from 'node:events';
export interface SseEvent {
    event: 'ticket_updated' | 'ticket_claimed' | 'new_message' | 'presence';
    data: Record<string, unknown>;
}
declare class SseBroadcaster extends EventEmitter {
    constructor();
    broadcast(eventName: SseEvent['event'], data: Record<string, unknown>): void;
    broadcastPresence(userId: string, userName: string, ticketId: string, action?: 'viewing' | 'left'): void;
}
export declare const sseBroadcaster: SseBroadcaster;
export {};
