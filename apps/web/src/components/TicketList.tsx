import React, { useMemo } from 'react';
import { Ticket, TicketScope, TicketGroup, User } from '../types/index.js';
import { computeTicketSla } from '../utils/sla.js';
import { Inbox, AlertCircle, Clock, PauseCircle, CheckCircle2, UserX, Users } from 'lucide-react';

interface TicketListProps {
  tickets: Ticket[];
  selectedTicketId: string | null;
  onSelectTicket: (ticket: Ticket) => void;
  scope: TicketScope;
  onScopeChange: (scope: TicketScope) => void;
  currentUser: User | null;
  currentTimeIso?: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
}

export const TicketList: React.FC<TicketListProps> = ({
  tickets,
  selectedTicketId,
  onSelectTicket,
  scope,
  onScopeChange,
  currentUser,
  currentTimeIso,
  searchQuery,
  onSearchChange
}) => {
  // 1. Filter by Scope
  const scopedTickets = useMemo(() => {
    return tickets.filter((t) => {
      if (scope === 'my') {
        return t.assignee_id === currentUser?.id;
      }
      if (scope === 'unassigned') {
        return !t.assignee_id;
      }
      // 'all'
      return true;
    });
  }, [tickets, scope, currentUser]);

  // 2. Filter by Search Query
  const filteredTickets = useMemo(() => {
    if (!searchQuery.trim()) return scopedTickets;
    const q = searchQuery.toLowerCase();
    return scopedTickets.filter(
      (t) =>
        t.human_id.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        (t.customer_name && t.customer_name.toLowerCase().includes(q)) ||
        (t.customer_email && t.customer_email.toLowerCase().includes(q))
    );
  }, [scopedTickets, searchQuery]);

  // 3. Group tickets by SLA state: Late, At risk, Waiting on customer, On track
  const groupedTickets = useMemo(() => {
    const groups: Record<TicketGroup, Array<{ ticket: Ticket; sla: ReturnType<typeof computeTicketSla> }>> = {
      late: [],
      at_risk: [],
      waiting: [],
      on_track: []
    };

    for (const t of filteredTickets) {
      const sla = computeTicketSla(t, currentTimeIso);
      groups[sla.group].push({ ticket: t, sla });
    }

    return groups;
  }, [filteredTickets, currentTimeIso]);

  const priorityChip = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return 'bg-rose-950/70 text-rose-300 border-rose-800/60';
      case 'medium':
        return 'bg-amber-950/70 text-amber-300 border-amber-800/60';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700/60';
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'open':
        return 'bg-blue-950/60 text-blue-300 border-blue-800/50';
      case 'in_progress':
        return 'bg-indigo-950/60 text-indigo-300 border-indigo-800/50';
      case 'waiting_on_customer':
        return 'bg-amber-950/60 text-amber-300 border-amber-800/50';
      case 'resolved':
        return 'bg-emerald-950/60 text-emerald-300 border-emerald-800/50';
      case 'closed':
        return 'bg-zinc-900 text-zinc-400 border-zinc-800';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  const groupHeaders: Array<{ key: TicketGroup; title: string; icon: React.ReactNode; color: string }> = [
    { key: 'late', title: 'Late / Breached', icon: <AlertCircle className="w-3.5 h-3.5 text-rose-400" />, color: 'text-rose-400' },
    { key: 'at_risk', title: 'At Risk (<20% budget)', icon: <Clock className="w-3.5 h-3.5 text-amber-400" />, color: 'text-amber-400' },
    { key: 'waiting', title: 'Waiting on Customer', icon: <PauseCircle className="w-3.5 h-3.5 text-blue-400" />, color: 'text-blue-400' },
    { key: 'on_track', title: 'On Track', icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />, color: 'text-emerald-400' }
  ];

  return (
    <div className="w-full md:w-[420px] lg:w-[460px] h-full flex flex-col border-r border-zinc-800/80 bg-zinc-950 select-none">
      {/* Top Scope Tabs */}
      <div className="p-3 border-b border-zinc-800/80 space-y-2.5">
        <div className="flex rounded-lg bg-zinc-900 p-0.5 border border-zinc-800/80 text-xs">
          <button
            onClick={() => onScopeChange('my')}
            className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 ${
              scope === 'my'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" />
            <span>My tickets</span>
          </button>

          <button
            onClick={() => onScopeChange('unassigned')}
            className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 ${
              scope === 'unassigned'
                ? 'bg-zinc-800 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <UserX className="w-3.5 h-3.5" />
            <span>Unassigned</span>
          </button>

          {(currentUser?.role === 'lead' || currentUser?.role === 'admin') && (
            <button
              onClick={() => onScopeChange('all')}
              className={`flex-1 py-1.5 px-2 rounded-md font-medium transition-all flex items-center justify-center gap-1.5 ${
                scope === 'all'
                  ? 'bg-zinc-800 text-white shadow-sm'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>All queue</span>
            </button>
          )}
        </div>

        {/* Filter / Quick Search */}
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Filter by INC id, subject, customer..."
            className="w-full px-3 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
          />
        </div>
      </div>

      {/* Grouped Tickets List */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
        {filteredTickets.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs">
            <Inbox className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p className="font-medium text-zinc-400">No tickets found</p>
            <p className="text-[11px] mt-1">Try switching scopes or clearing your search filter.</p>
          </div>
        ) : (
          groupHeaders.map((gh) => {
            const items = groupedTickets[gh.key];
            if (items.length === 0) return null;

            return (
              <div key={gh.key} className="py-2">
                {/* Group Section Header */}
                <div className="px-3 py-1 flex items-center justify-between text-[11px] font-semibold tracking-wide uppercase text-zinc-400 sticky top-0 bg-zinc-950/95 backdrop-blur-sm z-10">
                  <div className="flex items-center gap-1.5">
                    {gh.icon}
                    <span className={gh.color}>{gh.title}</span>
                  </div>
                  <span className="text-[10px] bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-400">
                    {items.length}
                  </span>
                </div>

                {/* Items in this group */}
                <div className="mt-1 space-y-1 px-2">
                  {items.map(({ ticket, sla }) => {
                    const isSelected = selectedTicketId === ticket.id;

                    return (
                      <div
                        key={ticket.id}
                        onClick={() => onSelectTicket(ticket)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-zinc-800/90 border-blue-500/50 shadow-md shadow-blue-500/5 ring-1 ring-blue-500/30'
                            : sla.group === 'at_risk'
                            ? 'bg-amber-950/20 hover:bg-amber-950/30 border-amber-800/60 shadow-sm shadow-amber-500/5'
                            : sla.group === 'late'
                            ? 'bg-rose-950/20 hover:bg-rose-950/30 border-rose-900/60'
                            : 'bg-zinc-900/60 hover:bg-zinc-900 border-zinc-800/60 hover:border-zinc-700/80'
                        }`}
                      >
                        {/* Top: Human ID, Priority, SLA Countdown */}
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-xs font-bold text-zinc-200">
                              {ticket.human_id}
                            </span>
                            <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${priorityChip(ticket.priority)}`}>
                              {ticket.priority}
                            </span>
                          </div>

                          {/* SLA Countdown Chip */}
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${sla.badgeClass}`}>
                            {sla.label}
                          </span>
                        </div>

                        {/* Subject */}
                        <h4 className="text-xs font-semibold text-zinc-100 line-clamp-1 mb-1.5 leading-snug">
                          {ticket.subject}
                        </h4>

                        {/* Bottom: Customer & Status */}
                        <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1 border-t border-zinc-800/40">
                          <div className="truncate max-w-[200px]">
                            <span className="text-zinc-300 font-medium">{ticket.customer_name || 'Customer'}</span>
                          </div>

                          <span className={`text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${statusBadge(ticket.status)}`}>
                            {ticket.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
