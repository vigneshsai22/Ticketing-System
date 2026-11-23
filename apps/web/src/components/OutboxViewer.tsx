import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { OutboxEmail } from '../types/index.js';
import {
  Mail,
  Search,
  ArrowLeft,
  ExternalLink,
  Sparkles,
  Link as LinkIcon
} from 'lucide-react';

interface OutboxViewerProps {
  onBackToAgentConsole: () => void;
  onOpenCustomerPortalWithToken: (ticketId: string, token: string) => void;
}

export const OutboxViewer: React.FC<OutboxViewerProps> = ({
  onBackToAgentConsole,
  onOpenCustomerPortalWithToken
}) => {
  const [emails, setEmails] = useState<OutboxEmail[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<OutboxEmail | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const loadOutbox = async () => {
    setLoading(true);
    try {
      const res = await api.getOutbox();
      setEmails(res.outbox || []);
      if (res.outbox && res.outbox.length > 0) {
        setSelectedEmail(res.outbox[0]);
      }
    } catch (err) {
      console.error('Failed to load outbox:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOutbox();
  }, []);

  const filteredEmails = emails.filter((em) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      em.recipient_email.toLowerCase().includes(q) ||
      em.subject.toLowerCase().includes(q) ||
      (em.template && em.template.toLowerCase().includes(q))
    );
  });

  // Extract magic link from email body
  const extractMagicLinkInfo = (body: string): { ticketId: string; token: string } | null => {
    // Looks for /portal/tickets/:id?token=:token or ?token=:token
    const tokenMatch = body.match(/token=([a-f0-9]{32,64}|[a-zA-Z0-9_-]+)/);
    const ticketMatch = body.match(/tickets\/([a-f0-9-]{36})/i) || body.match(/\[(INC-\d{4})\]/i);

    if (tokenMatch) {
      const token = tokenMatch[1];
      const ticketId = ticketMatch ? ticketMatch[1] : '';
      return { ticketId, token };
    }
    return null;
  };

  const templateBadge = (template?: string | null) => {
    switch (template) {
      case 'ticket_created':
        return 'bg-blue-950/80 text-blue-300 border-blue-800/60';
      case 'agent_reply':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-800/60';
      case 'status_change':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800/60';
      case 'auto_close_warning':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/60';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-hidden selection:bg-blue-600 selection:text-white">
      {/* Header */}
      <header className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between bg-zinc-950 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToAgentConsole}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white transition-colors text-xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Agent Console</span>
          </button>
          <div className="h-4 w-px bg-zinc-800" />
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <span className="font-bold text-white text-sm">Simulated Emails Outbox</span>
              <span className="text-[10px] text-zinc-400 ml-2">Transactional Queue</span>
            </div>
          </div>
        </div>

        <button
          onClick={loadOutbox}
          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white text-xs transition-colors"
        >
          Refresh Queue
        </button>
      </header>

      {/* Main Split Body */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Email List */}
        <div className="w-full md:w-96 border-r border-zinc-800 flex flex-col bg-zinc-950 shrink-0">
          <div className="p-3 border-b border-zinc-800">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by recipient or subject..."
                className="w-full pl-8 pr-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-zinc-900">
            {loading ? (
              <div className="p-8 text-center text-zinc-500 text-xs">Loading outbox queue...</div>
            ) : filteredEmails.length === 0 ? (
              <div className="p-8 text-center text-zinc-500 text-xs">No simulated emails found.</div>
            ) : (
              filteredEmails.map((em) => {
                const isSelected = selectedEmail?.id === em.id;
                const magic = extractMagicLinkInfo(em.body);

                return (
                  <div
                    key={em.id}
                    onClick={() => setSelectedEmail(em)}
                    className={`p-3.5 cursor-pointer text-xs transition-colors ${
                      isSelected
                        ? 'bg-zinc-800/90 border-l-2 border-l-blue-500'
                        : 'hover:bg-zinc-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-white truncate max-w-[200px]">
                        {em.recipient_email}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono">
                        {new Date(em.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h4 className="text-zinc-300 font-medium line-clamp-1 mb-1.5">
                      {em.subject}
                    </h4>

                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded border ${templateBadge(em.template)}`}>
                        {em.template || 'email'}
                      </span>
                      {magic && (
                        <span className="text-[10px] text-amber-400 font-medium flex items-center gap-0.5 bg-amber-950/40 border border-amber-800/40 px-1.5 py-0.5 rounded">
                          <LinkIcon className="w-2.5 h-2.5" />
                          <span>Magic Link</span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected Email View */}
        <div className="flex-1 bg-zinc-900/30 overflow-y-auto p-6">
          {selectedEmail ? (
            <div className="max-w-2xl mx-auto bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden text-xs">
              {/* Email Envelope Header */}
              <div className="p-5 border-b border-zinc-800 bg-zinc-950/80 space-y-2">
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${templateBadge(selectedEmail.template)}`}>
                    {selectedEmail.template || 'email'}
                  </span>
                  <span className="font-mono text-zinc-400 text-[11px]">
                    {new Date(selectedEmail.created_at).toLocaleString()}
                  </span>
                </div>

                <h2 className="text-base font-bold text-white">{selectedEmail.subject}</h2>

                <div className="text-zinc-400 space-y-0.5 pt-1 border-t border-zinc-800/60">
                  <div>To: <strong className="text-zinc-200">{selectedEmail.recipient_email}</strong></div>
                  <div>From: <strong className="text-zinc-200">Arvo Systems Support &lt;support@arvo.internal&gt;</strong></div>
                </div>

                {/* Clickable Magic Link Banner */}
                {(() => {
                  const magic = extractMagicLinkInfo(selectedEmail.body);
                  if (!magic) return null;

                  return (
                    <div className="mt-3 p-3 rounded-xl bg-gradient-to-r from-blue-950/80 to-indigo-950/80 border border-blue-700/60 flex items-center justify-between gap-3 text-blue-200">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                        <div>
                          <div className="font-bold text-white text-[11px]">Clickable Magic Link Detected</div>
                          <div className="text-[10px] text-blue-300/80 font-mono">
                            Token: {magic.token.substring(0, 16)}...
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => onOpenCustomerPortalWithToken(magic.ticketId, magic.token)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md transition-all shrink-0"
                      >
                        <span>Open Customer Portal</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })()}
              </div>

              {/* Email Body Content */}
              <div className="p-6 whitespace-pre-wrap font-sans text-zinc-200 leading-relaxed bg-zinc-900">
                {selectedEmail.body}
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
              Select an email from the left queue to view delivery headers and message content.
            </div>
          )}
        </div>
      </main>
    </div>
  );
};
