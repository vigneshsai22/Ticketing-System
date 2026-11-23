import { EventEmitter } from 'node:events';

export interface SseEvent {
  event: 'ticket_updated' | 'ticket_claimed' | 'new_message' | 'presence';
  data: Record<string, unknown>;
}

class SseBroadcaster extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(100);
  }

  broadcast(eventName: SseEvent['event'], data: Record<string, unknown>) {
    // SECURITY GUARD: Ensure no internal note bodies are ever broadcast
    const sanitizedData = { ...data };
    delete sanitizedData.body;
    delete sanitizedData.internal_note;
    delete sanitizedData.note_content;

    this.emit('broadcast', {
      event: eventName,
      data: sanitizedData
    });
  }

  broadcastPresence(userId: string, userName: string, ticketId: string, action: 'viewing' | 'left' = 'viewing') {
    this.broadcast('presence', {
      user_id: userId,
      user_name: userName,
      ticket_id: ticketId,
      action
    });
  }
}

export const sseBroadcaster = new SseBroadcaster();
