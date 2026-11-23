import React, { useEffect, useState, useRef } from 'react';
import { Ticket, User, CannedReply, TicketPriority, SlaPause, TicketCycleDetails, AuditEvent } from '../types/index.js';
import { api } from '../services/api.js';
import { computeTicketSla } from '../utils/sla.js';
import { ThreadMessage, UnifiedThreadItem } from './ThreadMessage.js';
import { Composer } from './Composer.js';
import { PriorityModal } from './PriorityModal.js';
import { CustomerPreviewModal } from './CustomerPreviewModal.js';
import { ClaimConflictModal } from './ClaimConflictModal.js';
import { SlaRibbon } from './SlaRibbon.js';
import {
  UserPlus,
  MessageSquare,
  ShieldCheck,
  History,
  AlertTriangle
} from 'lucide-react';

interface TicketDetailProps {
  ticket: Ticket | null;
  currentUser: User | null;
  cannedReplies: CannedReply[];
  currentTimeIso?: string;
  activeViewer: string | null;
  onTicketUpdated: (updatedTicket: Ticket) => void;
  onOpenProofMode?: (ticket: Ticket) => void;
}

export const TicketDetail: React.FC<TicketDetailProps> = ({
  ticket,
  currentUser,
  cannedReplies,
  currentTimeIso,
  activeViewer,
  onTicketUpdated,
  onOpenProofMode
}) => {
  const [threadItems, setThreadItems] = useState<UnifiedThreadItem[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [pauses, setPauses] = useState<SlaPause[]>([]);
  const [cycle, setCycle] = useState<TicketCycleDetails | null>(null);
  const [activeTab, setActiveTab] = useState<'thread' | 'timeline'>('thread');
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [conflictOwner, setConflictOwner] = useState('');
  const [priorityModalOpen, setPriorityModalOpen] = useState(false);
  const [customerPreviewOpen, setCustomerPreviewOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Load ticket thread whenever selected ticket changes
  const loadThread = async (ticketId: string) => {
    setLoading(true);
    try {
      const data = await api.getThread(ticketId);
      setAuditEvents(data.audit_events || []);
      setPauses(data.pauses || []);
      setCycle(data.cycle || null);

      const combined: UnifiedThreadItem[] = [
        ...data.public_messages.map((pm) => ({
          type: 'public_message' as const,
          data: pm,
          createdAt: pm.created_at
        })),
        ...data.internal_notes.map((inNote) => ({
          type: 'internal_note' as const,
          data: inNote,
          createdAt: inNote.created_at
        })),
        ...data.audit_events
          .filter((ae) =>
            ['ticket_created', 'ticket_claimed', 'ticket_released', 'ticket_reassigned',
             'ticket_priority_changed', 'sla_response_breached', 'sla_resolve_breached',
             'ticket_auto_closed', 'status_changed'].includes(ae.event_type)
          )
          .map((ae) => ({
            type: 'audit_event' as const,
            data: ae,
            createdAt: ae.created_at
          }))
      ];

      // Sort chronologically
      combined.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setThreadItems(combined);
    } catch (err) {
      console.error('Failed to load thread:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticket) {
      loadThread(ticket.id);
      // Send viewer presence
      api.sendPresence(ticket.id);
    } else {
      setThreadItems([]);
    }
  }, [ticket?.id]);

  // Scroll to bottom on thread update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadItems]);

  if (!ticket) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center text-zinc-500 bg-zinc-950">
        <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
        <h3 className="text-sm font-semibold text-zinc-300">No ticket selected</h3>
        <p className="text-xs text-zinc-500 max-w-sm mt-1">
          Select a ticket from the left queue to view the thread, reply to customer, add internal notes, or inspect SLA deadlines.
        </p>
      </div>
    );
  }

  const sla = computeTicketSla(ticket, currentTimeIso);
  const isAssignedToMe = ticket.assignee_id === currentUser?.id;
  const isUnassigned = !ticket.assignee_id;

  // Handle Optimistic Claim (INC-0291)
  const handleClaim = async () => {
    if (claiming || !currentUser) return;
    setClaiming(true);

    // Optimistic UI update
    const previousAssigneeId = ticket.assignee_id;
    const previousAssigneeName = ticket.assignee_name;
    const updatedOptimistic: Ticket = {
      ...ticket,
      assignee_id: currentUser.id,
      assignee_name: currentUser.name
    };
    onTicketUpdated(updatedOptimistic);

    try {
      const res = await api.claimTicket(ticket.id, ticket.version);
      onTicketUpdated(res.ticket);
      loadThread(ticket.id);
    } catch (err: unknown) {
      // Revert optimistic update
      onTicketUpdated({
        ...ticket,
        assignee_id: previousAssigneeId,
        assignee_name: previousAssigneeName
      });

      // Check 409 Conflict
      const anyErr = err as { status?: number; data?: { current_assignee?: string } };
      if (anyErr?.status === 409) {
        setConflictOwner(anyErr.data?.current_assignee || 'Another agent');
        setConflictModalOpen(true);
      } else {
        alert(err instanceof Error ? err.message : 'Claim failed');
      }
    } finally {
      setClaiming(false);
    }
  };

  // Handle Release
  const handleRelease = async () => {
    try {
      const res = await api.releaseTicket(ticket.id, ticket.version);
      onTicketUpdated(res.ticket);
      loadThread(ticket.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Release failed');
    }
  };

  // Handle Priority Update
  const handleUpdatePriority = async (newPriority: TicketPriority, reason: string) => {
    const res = await api.changePriority(ticket.id, newPriority, reason, ticket.version);
    onTicketUpdated(res.ticket);
    loadThread(ticket.id);
  };

  // Handle Public Reply
  const handleSendPublicReply = async (body: string, waitOnCustomer: boolean) => {
    const idempotencyKey = `web-${ticket.id}-${Math.random().toString(36).substring(2, 12)}`;
    await api.postPublicReply(ticket.id, body, waitOnCustomer, idempotencyKey);
    // Refresh ticket & thread
    const updated = await api.getTicket(ticket.id);
    onTicketUpdated(updated.ticket);
    loadThread(ticket.id);
  };

  // Handle Internal Note
  const handleSendInternalNote = async (body: string) => {
    await api.postInternalNote(ticket.id, body);
    loadThread(ticket.id);
  };

  const priorityColor = (p: string) => {
    switch (p) {
      case 'urgent':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/80';
      case 'medium':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/80';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="flex-1 h-full flex flex-col bg-zinc-950 overflow-hidden">
      {/* 1. Ticket Header Bar */}
      <div className="p-4 border-b border-zinc-800/80 bg-zinc-900/40 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: INC ID + Priority chip + Subject */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="font-mono text-base font-bold text-white tracking-wide px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800">
              {ticket.human_id}
            </span>

            <button
              onClick={() => setPriorityModalOpen(true)}
              className={`text-xs uppercase font-bold px-2 py-1 rounded-md border flex items-center gap-1.5 transition-all hover:brightness-110 ${priorityColor(ticket.priority)}`}
              title="Click to change priority (reason required)"
            >
              <span>{ticket.priority}</span>
              <span className="text-[10px] opacity-70">▾</span>
            </button>

            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${sla.badgeClass}`}>
              {sla.label}
            </span>

            {/* Active Presence Indicator ("Anita is viewing") */}
            {activeViewer && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-indigo-950/70 border border-indigo-700/60 text-indigo-300 text-[11px] animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                <span>{activeViewer} is viewing</span>
              </div>
            )}
          </div>

          {/* Right: Claim / Release & Proof Mode Buttons */}
          <div className="flex items-center gap-2">
            {onOpenProofMode && (
              <button
                onClick={() => onOpenProofMode(ticket)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 hover:text-white text-xs font-medium border border-zinc-700/60 transition-colors shadow-sm"
                title="Open Cryptographic Proof Mode for this ticket"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Proof Mode</span>
              </button>
            )}

            {isUnassigned ? (
              <button
                onClick={handleClaim}
                disabled={claiming}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Claim Ticket</span>
              </button>
            ) : isAssignedToMe ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-zinc-400">
                  Assigned to <strong className="text-blue-400">You</strong>
                </span>
                <button
                  onClick={handleRelease}
                  className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium border border-zinc-700/60"
                  title="Release ticket to unassigned queue"
                >
                  Release
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-zinc-400">
                  Assigned to <strong className="text-zinc-200">{ticket.assignee_name || 'Agent'}</strong>
                </span>
                {(currentUser?.role === 'lead' || currentUser?.role === 'admin') && (
                  <button
                    onClick={handleClaim}
                    className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium border border-zinc-700/60"
                  >
                    Reassign to Me
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Subject & Customer Information */}
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">{ticket.subject}</h2>
          <div className="flex items-center gap-2 text-xs text-zinc-400 mt-1">
            <span>Customer: <strong className="text-zinc-200">{ticket.customer_name || 'N/A'}</strong> ({ticket.customer_email})</span>
            <span>•</span>
            <span className="font-mono text-[11px]">Created {new Date(ticket.created_at).toLocaleString()}</span>
          </div>
        </div>

        {/* 2. SLA Ribbon Visual Timeline */}
        <SlaRibbon
          ticket={ticket}
          cycle={cycle}
          pauses={pauses}
          auditEvents={auditEvents}
          currentTimeIso={currentTimeIso}
        />

        {/* 3. "Why Was It Late?" Diagnostic Card (shown on breached / late tickets) */}
        {(ticket.response_breached_at || ticket.resolve_breached_at || sla.group === 'late') && (() => {
          const reason = ticket.response_breach_reason || ticket.resolve_breach_reason || 'slow_after_assignment';
          const totalPaused = pauses.reduce((acc, p) => {
            const pStart = new Date(p.started_at).getTime();
            const pEnd = p.ended_at
              ? new Date(p.ended_at).getTime()
              : (currentTimeIso ? new Date(currentTimeIso).getTime() : new Date(ticket.updated_at || ticket.created_at).getTime());
            return acc + Math.max(0, Math.round((pEnd - pStart) / 60000));
          }, 0);
          const targetBudget = cycle?.respond_minutes || (ticket.priority === 'urgent' ? 120 : ticket.priority === 'medium' ? 270 : 540);
          const reassignments = auditEvents.filter((a) => a.event_type === 'ticket_reassigned').length;

          const reasonDescriptions: Record<string, { title: string; desc: string }> = {
            unassigned_too_long: {
              title: 'Unassigned Too Long',
              desc: 'Waited >50% of the SLA budget in the queue before an agent took ownership.'
            },
            slow_after_assignment: {
              title: 'Slow After Assignment',
              desc: 'Spent the majority of available business time assigned to an agent without timely public response.'
            },
            escalated_mid_flight: {
              title: 'Escalated Mid-Flight',
              desc: 'Priority upgrade tightened SLA deadlines retroactively, resulting in an immediate deadline breach.'
            },
            multiple_reassignments: {
              title: 'Multiple Reassignments',
              desc: 'Ticket bounced between agents multiple times, creating delay handoffs that consumed the budget.'
            },
            other: {
              title: 'SLA Business Overrun',
              desc: 'Total elapsed working minutes exceeded the configured policy threshold.'
            }
          };

          const info = reasonDescriptions[reason] || reasonDescriptions.other;

          return (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/80 text-xs shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span className="font-bold text-rose-200">Why was this ticket late?</span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase bg-rose-900/60 border border-rose-700 text-rose-200 font-mono">
                    {info.title}
                  </span>
                </div>
                {totalPaused > 0 && (
                  <span className="text-[11px] text-cyan-400 font-mono">
                    +{totalPaused}m customer wait excluded
                  </span>
                )}
              </div>

              <p className="text-[11px] text-rose-300/90 leading-relaxed font-sans">
                {info.desc}
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[10px] border-t border-rose-900/60 text-zinc-300">
                <div>
                  <span className="text-zinc-500">SLA Budget:</span> <strong>{targetBudget}m</strong>
                </div>
                <div>
                  <span className="text-zinc-500">Handoffs:</span> <strong>{reassignments} reassignments</strong>
                </div>
                <div>
                  <span className="text-zinc-500">Paused:</span> <strong>{totalPaused}m</strong>
                </div>
                <div>
                  <span className="text-zinc-500">Status:</span> <strong className="text-rose-400">BREACHED</strong>
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 4. Tab Bar Switcher (Discussion Thread vs Full Audit History) */}
      <div className="border-b border-zinc-800 bg-zinc-900/60 px-4 pt-2 flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('thread')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'thread'
                ? 'border-blue-500 text-blue-400 bg-zinc-900 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Discussion Thread</span>
            <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
              {threadItems.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`px-3 py-1.5 rounded-t-lg text-xs font-medium border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'timeline'
                ? 'border-blue-500 text-blue-400 bg-zinc-900 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Audit History</span>
            <span className="text-[10px] font-mono px-1 rounded bg-zinc-800 text-zinc-400">
              {auditEvents.length}
            </span>
          </button>
        </div>

        {onOpenProofMode && (
          <button
            onClick={() => onOpenProofMode(ticket)}
            className="text-[11px] text-zinc-400 hover:text-zinc-200 flex items-center gap-1 hover:underline pb-1"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>Proof Mode</span>
          </button>
        )}
      </div>

      {/* 5. Main Tab Content Area */}
      {activeTab === 'thread' ? (
        <>
          {/* Scrollable Discussion Thread */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
            {loading ? (
              <div className="p-8 text-center text-zinc-500 text-xs">Loading ticket discussion...</div>
            ) : threadItems.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">No messages recorded in thread.</div>
            ) : (
              threadItems.map((item, index) => <ThreadMessage key={index} item={item} />)
            )}
          </div>

          {/* Composer */}
          <Composer
            ticket={ticket}
            cannedReplies={cannedReplies}
            onSendPublicReply={handleSendPublicReply}
            onSendInternalNote={handleSendInternalNote}
            onOpenCustomerPreview={() => setCustomerPreviewOpen(true)}
          />
        </>
      ) : (
        /* Full Audit History Tab for Agents */
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          <div className="text-[11px] text-zinc-400 mb-2 flex items-center justify-between">
            <span>Complete append-only audit trail for {ticket.human_id}:</span>
            <span className="font-mono text-[10px] text-zinc-500">Immutable SHA-256 Chained</span>
          </div>

          {auditEvents.map((ae) => (
            <div
              key={ae.id}
              className="p-3 rounded-lg bg-zinc-900/70 border border-zinc-800 flex items-start justify-between gap-3 text-xs"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-blue-400 text-[11px] font-bold">
                    #{ae.global_seq || ae.seq}
                  </span>
                  <span className="font-semibold text-zinc-200 font-mono text-[11px] bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
                    {ae.event_type}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    by <strong>{ae.actor_name || ae.actor_type}</strong>
                  </span>
                </div>
                {(ae.after || ae.before) && (
                  <div className="font-mono text-[10px] text-zinc-400 bg-zinc-950 p-2 rounded border border-zinc-850 truncate max-w-xl">
                    {ae.after ? JSON.stringify(ae.after) : JSON.stringify(ae.before)}
                  </div>
                )}
              </div>

              <div className="text-right text-[10px] text-zinc-500 font-mono shrink-0">
                <div>{new Date(ae.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modals */}
      <PriorityModal
        ticket={ticket}
        isOpen={priorityModalOpen}
        onClose={() => setPriorityModalOpen(false)}
        onUpdatePriority={handleUpdatePriority}
      />

      <CustomerPreviewModal
        ticket={ticket}
        isOpen={customerPreviewOpen}
        onClose={() => setCustomerPreviewOpen(false)}
      />

      <ClaimConflictModal
        isOpen={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        currentOwnerName={conflictOwner}
        onRefresh={() => {
          api.getTicket(ticket.id).then((res) => onTicketUpdated(res.ticket));
          loadThread(ticket.id);
        }}
      />
    </div>
  );
};
