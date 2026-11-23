"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sseBroadcaster = void 0;
const node_events_1 = require("node:events");
class SseBroadcaster extends node_events_1.EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(100);
    }
    broadcast(eventName, data) {
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
    broadcastPresence(userId, userName, ticketId, action = 'viewing') {
        this.broadcast('presence', {
            user_id: userId,
            user_name: userName,
            ticket_id: ticketId,
            action
        });
    }
}
exports.sseBroadcaster = new SseBroadcaster();
//# sourceMappingURL=sse.service.js.map