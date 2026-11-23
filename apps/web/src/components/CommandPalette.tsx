import React, { useState, useEffect } from 'react';
import { Ticket, TicketScope } from '../types/index.js';
import { Search, ArrowRight, Clock, Inbox, UserX, Users } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  tickets: Ticket[];
  onSelectTicket: (ticket: Ticket) => void;
  onScopeChange: (scope: TicketScope) => void;
  onJumpTime: (target: string) => Promise<void>;
  onResetTime: () => Promise<void>;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  tickets,
  onSelectTicket,
  onScopeChange,
  onJumpTime,
  onResetTime
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Trigger open is managed by parent, but toggle works
        }
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredTickets = query.trim()
    ? tickets.filter(
        (t) =>
          t.human_id.toLowerCase().includes(query.toLowerCase()) ||
          t.subject.toLowerCase().includes(query.toLowerCase()) ||
          (t.customer_name && t.customer_name.toLowerCase().includes(query.toLowerCase()))
      ).slice(0, 8)
    : tickets.slice(0, 6);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-xs text-zinc-200">
        {/* Search input bar */}
        <div className="p-3 border-b border-zinc-800 flex items-center gap-2.5 bg-zinc-950">
          <Search className="w-4 h-4 text-zinc-400" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command, jump to ticket, or search..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none"
          />
          <div className="flex items-center gap-1 font-mono text-[10px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 border border-zinc-700">
            <span>ESC</span>
          </div>
        </div>

        {/* Action groups */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-3">
          {/* Tickets matches */}
          <div>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Matching Tickets
            </div>
            <div className="space-y-0.5 mt-1">
              {filteredTickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => {
                    onSelectTicket(t);
                    onClose();
                  }}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-zinc-800 text-left transition-colors group"
                >
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-mono font-bold text-blue-400">{t.human_id}</span>
                    <span className="text-zinc-200 truncate">{t.subject}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] uppercase font-semibold text-zinc-400 group-hover:text-zinc-200">
                      {t.priority}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300" />
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Quick Scope Switches */}
          <div>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Switch Scope
            </div>
            <div className="grid grid-cols-3 gap-1.5 mt-1">
              <button
                onClick={() => {
                  onScopeChange('my');
                  onClose();
                }}
                className="flex items-center gap-2 p-2 rounded-lg bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <Inbox className="w-3.5 h-3.5 text-blue-400" />
                <span>My Tickets</span>
              </button>
              <button
                onClick={() => {
                  onScopeChange('unassigned');
                  onClose();
                }}
                className="flex items-center gap-2 p-2 rounded-lg bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <UserX className="w-3.5 h-3.5 text-amber-400" />
                <span>Unassigned</span>
              </button>
              <button
                onClick={() => {
                  onScopeChange('all');
                  onClose();
                }}
                className="flex items-center gap-2 p-2 rounded-lg bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors"
              >
                <Users className="w-3.5 h-3.5 text-purple-400" />
                <span>All Queue</span>
              </button>
            </div>
          </div>

          {/* Time Machine Presets */}
          <div>
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              Time Machine Presets
            </div>
            <div className="grid grid-cols-2 gap-1.5 mt-1">
              <button
                onClick={async () => {
                  await onJumpTime('Friday 18:00');
                  onClose();
                }}
                className="p-2 rounded-lg bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Jump to Fri 18:00</span>
                </div>
                <span className="text-[10px] text-zinc-400">INC-0001</span>
              </button>

              <button
                onClick={async () => {
                  await onJumpTime('Monday 11:01');
                  onClose();
                }}
                className="p-2 rounded-lg bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors flex items-center justify-between"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                  <span>Jump to Mon 11:01</span>
                </div>
                <span className="text-[10px] text-zinc-400">Breach SLA</span>
              </button>

              <button
                onClick={async () => {
                  await onResetTime();
                  onClose();
                }}
                className="p-2 rounded-lg bg-zinc-950/60 hover:bg-zinc-800 border border-zinc-800 text-left transition-colors flex items-center justify-between col-span-2"
              >
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>Reset to Real Wall Clock</span>
                </div>
                <span className="text-[10px] text-zinc-400">Offset = 0</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer with keyboard shortcuts hints */}
        <div className="p-2.5 border-t border-zinc-800 bg-zinc-950 flex items-center justify-between text-[11px] text-zinc-500">
          <div className="flex items-center gap-3">
            <span><strong className="text-zinc-300 font-mono">c</strong> Claim</span>
            <span><strong className="text-zinc-300 font-mono">r</strong> Reply</span>
            <span><strong className="text-zinc-300 font-mono">n</strong> Note</span>
            <span><strong className="text-zinc-300 font-mono">j/k</strong> Next/Prev</span>
          </div>
          <span>Frontdesk OS</span>
        </div>
      </div>
    </div>
  );
};
