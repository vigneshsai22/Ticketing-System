import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { Ticket } from '../types/index.js';
import { ShieldCheck, X, Eye } from 'lucide-react';

interface CustomerPreviewModalProps {
  ticket: Ticket;
  isOpen: boolean;
  onClose: () => void;
}

export const CustomerPreviewModal: React.FC<CustomerPreviewModalProps> = ({
  ticket,
  isOpen,
  onClose
}) => {
  const [events, setEvents] = useState<Array<{
    id: string;
    event_type: string;
    content: string;
    sender_type: string;
    created_at: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.getCustomerPreview(ticket.id)
      .then((res) => {
        setEvents(res.events || []);
      })
      .catch((err) => {
        console.error('Failed to load customer preview:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, ticket.id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="w-full max-w-2xl max-h-[85vh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col text-xs text-zinc-200 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-950">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400">
              <Eye className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">Customer Portal Preview</h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
                  {ticket.human_id}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Exact thread visible to <span className="text-zinc-200 font-medium">{ticket.customer_email}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Security badge banner */}
        <div className="bg-emerald-950/40 border-b border-emerald-800/40 px-4 py-2 flex items-center gap-2 text-emerald-300 text-[11px]">
          <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>
            <strong>INC-0304 Guarantee:</strong> All internal notes, agent private discussions, and internal audit reasons are structurally excluded.
          </span>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="p-8 text-center text-zinc-500">Loading customer view...</div>
          ) : events.length === 0 ? (
            <div className="p-8 text-center text-zinc-500">No public messages yet.</div>
          ) : (
            events.map((e) => {
              const isAgent = e.sender_type === 'agent';
              return (
                <div
                  key={e.id}
                  className={`p-3.5 rounded-xl border ${
                    isAgent
                      ? 'bg-blue-950/20 border-blue-900/40 text-blue-100'
                      : 'bg-zinc-950 border-zinc-800 text-zinc-200'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] mb-1.5 pb-1.5 border-b border-white/5">
                    <span className="font-semibold capitalize">
                      {isAgent ? 'Arvo Systems Support' : ticket.customer_name || 'Customer'}
                    </span>
                    <span className="font-mono text-zinc-400">
                      {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap leading-relaxed">{e.content}</div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs"
          >
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
};
