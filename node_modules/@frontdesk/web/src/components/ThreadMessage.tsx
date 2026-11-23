import React from 'react';
import { PublicMessage, InternalNote, AuditEvent } from '../types/index.js';
import { Lock, User, ShieldCheck, Clock, AlertTriangle } from 'lucide-react';

export type UnifiedThreadItem =
  | { type: 'public_message'; data: PublicMessage; createdAt: string }
  | { type: 'internal_note'; data: InternalNote; createdAt: string }
  | { type: 'audit_event'; data: AuditEvent; createdAt: string };

interface ThreadMessageProps {
  item: UnifiedThreadItem;
}

export const ThreadMessage: React.FC<ThreadMessageProps> = ({ item }) => {
  const formatDate = (iso: string) => {
    try {
      const dt = new Date(iso);
      return dt.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return iso;
    }
  };

  // 1. Internal Note (Warm yellow/amber styling with lock icon)
  if (item.type === 'internal_note') {
    const note = item.data;
    return (
      <div className="my-3 rounded-xl border border-amber-800/60 bg-amber-950/30 p-4 text-xs shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-amber-900/40">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-md bg-amber-500/20 text-amber-400">
              <Lock className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-amber-200">
                {note.author_name || 'Agent'}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-600/30">
                Internal Note • Team Only
              </span>
            </div>
          </div>
          <span className="font-mono text-[11px] text-amber-400/70">
            {formatDate(note.created_at)}
          </span>
        </div>
        <div className="text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
          {note.body}
        </div>
      </div>
    );
  }

  // 2. Public Message (Blue styling for agents, Neutral for customer)
  if (item.type === 'public_message') {
    const msg = item.data;
    const isAgent = msg.sender_type === 'agent';

    if (isAgent) {
      // Agent Public Reply (Calm Blue theme)
      return (
        <div className="my-3 rounded-xl border border-blue-800/60 bg-blue-950/30 p-4 text-xs shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-blue-900/40">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300 font-bold text-[10px]">
                {msg.sender_name?.charAt(0) || 'A'}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-blue-200">
                  {msg.sender_name || 'Support Agent'}
                </span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-600/30">
                  Public Reply
                </span>
              </div>
            </div>
            <span className="font-mono text-[11px] text-blue-300/70">
              {formatDate(msg.created_at)}
            </span>
          </div>
          <div className="text-zinc-100 leading-relaxed whitespace-pre-wrap font-sans">
            {msg.body}
          </div>
        </div>
      );
    }

    // Customer message
    return (
      <div className="my-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-4 text-xs shadow-sm">
        <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-zinc-300 font-bold text-[10px]">
              {msg.sender_name?.charAt(0) || 'C'}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-zinc-200">
                {msg.sender_name || 'Customer'}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                {msg.sender_email}
              </span>
            </div>
          </div>
          <span className="font-mono text-[11px] text-zinc-400">
            {formatDate(msg.created_at)}
          </span>
        </div>
        <div className="text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
          {msg.body}
        </div>
      </div>
    );
  }

  // 3. Audit Lifecycle Event (Claimed, Priority changed, Status changed, Breached)
  if (item.type === 'audit_event') {
    const event = item.data;

    let icon = <Clock className="w-3.5 h-3.5 text-zinc-400" />;
    let text = event.event_type.replace(/_/g, ' ');

    if (event.event_type === 'ticket_claimed') {
      icon = <User className="w-3.5 h-3.5 text-blue-400" />;
      text = `Claimed by ${event.actor_name || 'Agent'}`;
    } else if (event.event_type === 'ticket_priority_changed') {
      icon = <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />;
      const newPri = event.after?.priority as string;
      const reason = event.after?.reason as string;
      text = `Priority changed to ${newPri.toUpperCase()}${reason ? `: "${reason}"` : ''}`;
    } else if (event.event_type === 'sla_response_breached') {
      icon = <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      const reason = (event.after?.reason as string) || '';
      text = `SLA response breached (${reason.replace(/_/g, ' ')})`;
    } else if (event.event_type === 'sla_resolve_breached') {
      icon = <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />;
      const reason = (event.after?.reason as string) || '';
      text = `SLA resolve breached (${reason.replace(/_/g, ' ')})`;
    } else if (event.event_type === 'ticket_auto_closed') {
      icon = <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />;
      text = `Ticket automatically closed due to customer silence (2700 business minutes)`;
    } else if (event.event_type === 'status_changed') {
      const newStatus = (event.after?.status as string) || '';
      text = `Status changed to ${newStatus.replace(/_/g, ' ')}`;
    }

    return (
      <div className="my-2 flex items-center justify-center">
        <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-800 text-[11px] text-zinc-400">
          {icon}
          <span>{text}</span>
          <span className="text-[10px] font-mono text-zinc-500">• {formatDate(event.created_at)}</span>
        </div>
      </div>
    );
  }

  return null;
};
