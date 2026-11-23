import React, { useState } from 'react';
import { Ticket, TicketPriority } from '../types/index.js';
import { AlertTriangle, X } from 'lucide-react';

interface PriorityModalProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
  onUpdatePriority: (priority: TicketPriority, reason: string) => Promise<void>;
}

export const PriorityModal: React.FC<PriorityModalProps> = ({
  ticket,
  isOpen,
  onClose,
  onUpdatePriority
}) => {
  const [priority, setPriority] = useState<TicketPriority>(ticket.priority);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('A mandatory business justification reason is required to change priority.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onUpdatePriority(priority, reason.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change priority');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 text-xs text-zinc-200">
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-white">Change Priority</h3>
              <p className="text-[11px] text-zinc-400 font-mono">{ticket.human_id} • {ticket.subject}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Target Priority
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(['urgent', 'medium', 'low'] as TicketPriority[]).map((p) => {
                const isSelected = priority === p;
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 px-3 rounded-lg border font-semibold uppercase text-[11px] transition-all ${
                      isSelected
                        ? p === 'urgent'
                          ? 'bg-rose-950/80 border-rose-600 text-rose-200 shadow-sm'
                          : p === 'medium'
                          ? 'bg-amber-950/80 border-amber-600 text-amber-200 shadow-sm'
                          : 'bg-zinc-800 border-zinc-500 text-zinc-100 shadow-sm'
                        : 'bg-zinc-950/50 border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
              Justification Reason <span className="text-rose-400">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Customer escalated: entire APAC leadership team unable to log in..."
              rows={3}
              required
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 resize-none font-sans"
            />
            <p className="text-[10px] text-zinc-500 mt-1">
              Note: Priority upgrades recompute SLA deadlines from original arrival. If the ticket retroactively exceeds the new threshold, an immediate <code>escalated_mid_flight</code> breach will be recorded.
            </p>
          </div>

          {error && (
            <div className="p-2.5 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !reason.trim()}
              className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition-all disabled:opacity-40"
            >
              {submitting ? 'Applying...' : 'Apply Change'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
