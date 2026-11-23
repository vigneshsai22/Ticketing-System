import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { CustomerTicket, CustomerVisibleEvent, TicketPriority } from '../types/index.js';
import {
  Send,
  Clock,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ShieldCheck,
  ArrowLeft
} from 'lucide-react';

interface CustomerPortalProps {
  onBackToAgentConsole: () => void;
  initialTicketId?: string | null;
  initialToken?: string | null;
}

export const CustomerPortal: React.FC<CustomerPortalProps> = ({
  onBackToAgentConsole,
  initialTicketId,
  initialToken
}) => {
  const [ticketId, setTicketId] = useState<string | null>(initialTicketId || null);
  const [token, setToken] = useState<string | null>(initialToken || null);
  const [ticket, setTicket] = useState<CustomerTicket | null>(null);
  const [events, setEvents] = useState<CustomerVisibleEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Raise a Problem" form state
  const [formMode, setFormMode] = useState<boolean>(!initialTicketId || !initialToken);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TicketPriority>('medium');
  const [submittingProblem, setSubmittingProblem] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Reply / Reopen state
  const [replyBody, setReplyBody] = useState('');
  const [submittingReply, setSubmittingReply] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenModalOpen, setReopenModalOpen] = useState(false);

  // Load ticket and thread when ticketId and token are provided
  const loadTicketData = async (tId: string, tok: string) => {
    setLoading(true);
    setError(null);
    try {
      const [tRes, threadRes] = await Promise.all([
        api.getCustomerTicket(tId, tok),
        api.getCustomerThreadByToken(tId, tok)
      ]);
      setTicket(tRes.ticket);
      setEvents(threadRes.events || []);
      setFormMode(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid or expired magic-link token');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ticketId && token) {
      loadTicketData(ticketId, token);
    }
  }, [ticketId, token]);

  // Submit "Raise a Problem" form
  const handleRaiseProblem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || !subject.trim() || !description.trim()) {
      setError('Please fill in all required fields.');
      return;
    }

    setSubmittingProblem(true);
    setError(null);
    try {
      const res = await api.createCustomerTicket({
        name: name.trim(),
        email: email.trim(),
        subject: subject.trim(),
        priority,
        message: description.trim()
      });

      setTicketId(res.ticket.id);
      setToken(res.token);
      setSuccessNotice(`Ticket created! Human ID: ${res.ticket.human_id}. Magic link generated.`);
      await loadTicketData(res.ticket.id, res.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit problem');
    } finally {
      setSubmittingProblem(false);
    }
  };

  // Submit reply
  const handleSendReply = async () => {
    if (!ticketId || !token || !replyBody.trim() || submittingReply) return;
    setSubmittingReply(true);
    try {
      await api.postCustomerReply(ticketId, token, replyBody.trim());
      setReplyBody('');
      await loadTicketData(ticketId, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  // Submit reopen
  const handleReopen = async () => {
    if (!ticketId || !token || !reopenReason.trim()) return;
    try {
      await api.reopenCustomerTicket(ticketId, token, reopenReason.trim());
      setReopenModalOpen(false);
      setReopenReason('');
      await loadTicketData(ticketId, token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen ticket');
    }
  };

  const formatIST = (iso?: string | null) => {
    if (!iso) return 'N/A';
    try {
      const dt = new Date(iso);
      return dt.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
      }) + ' IST';
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">
      {/* Top Header */}
      <header className="h-16 border-b border-zinc-800 px-6 flex items-center justify-between max-w-5xl mx-auto w-full">
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
            <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-xs">
              A
            </div>
            <div>
              <span className="font-bold text-white text-sm">Arvo Support</span>
              <span className="text-[10px] text-zinc-400 ml-2">Customer Portal</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          {!formMode && (
            <button
              onClick={() => {
                setFormMode(true);
                setTicket(null);
                setTicketId(null);
                setToken(null);
              }}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all"
            >
              Raise Another Problem
            </button>
          )}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/60 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Public View</span>
          </div>
        </div>
      </header>

      {/* Main Body */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-8">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successNotice && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-950/70 border border-emerald-800 text-emerald-200 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{successNotice}</span>
            </div>
            {token && ticketId && (
              <span className="font-mono text-[11px] bg-black/40 px-2 py-0.5 rounded border border-white/10">
                Token: {token.substring(0, 10)}...
              </span>
            )}
          </div>
        )}

        {/* VIEW 1: Raise a Problem Form */}
        {formMode ? (
          <div className="max-w-2xl mx-auto bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl p-6 sm:p-8">
            <div className="mb-6 pb-4 border-b border-zinc-800">
              <h2 className="text-xl font-bold text-white mb-1">Raise a Problem with Arvo Systems</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Describe the issue you are experiencing. You will instantly receive a passwordless magic-link URL to track updates, review responses, and converse directly with our support team.
              </p>
            </div>

            <form onSubmit={handleRaiseProblem} className="space-y-5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Your Full Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Maya Lin"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                    Work Email <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. maya.lin@acme.com"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Subject / Summary <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Production API cluster throwing 504 Gateway Timeouts"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Severity Selection: Plain language choices */}
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Severity Impact <span className="text-rose-400">*</span>
                </label>
                <div className="space-y-2">
                  {/* Urgent */}
                  <label
                    onClick={() => setPriority('urgent')}
                    className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                      priority === 'urgent'
                        ? 'bg-rose-950/40 border-rose-600 ring-1 ring-rose-500/30'
                        : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="severity"
                        checked={priority === 'urgent'}
                        onChange={() => setPriority('urgent')}
                        className="mt-0.5 text-rose-600 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-2">
                          <span>I cannot work at all</span>
                          <span className="text-[10px] uppercase font-bold text-rose-400 px-1.5 py-0.2 rounded bg-rose-950 border border-rose-800/80">
                            Urgent SLA
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                          Critical business outage. Core services or production infrastructure is completely down or severely degraded.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Medium */}
                  <label
                    onClick={() => setPriority('medium')}
                    className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                      priority === 'medium'
                        ? 'bg-amber-950/40 border-amber-600 ring-1 ring-amber-500/30'
                        : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="severity"
                        checked={priority === 'medium'}
                        onChange={() => setPriority('medium')}
                        className="mt-0.5 text-amber-600 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-2">
                          <span>Something is broken but I can work around it</span>
                          <span className="text-[10px] uppercase font-bold text-amber-400 px-1.5 py-0.2 rounded bg-amber-950 border border-amber-800/80">
                            Medium SLA
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                          Impaired functionality or workflow disruption, but key business operations can proceed with alternative steps.
                        </p>
                      </div>
                    </div>
                  </label>

                  {/* Low */}
                  <label
                    onClick={() => setPriority('low')}
                    className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                      priority === 'low'
                        ? 'bg-zinc-800/90 border-zinc-500 ring-1 ring-zinc-400/30'
                        : 'bg-zinc-950/60 border-zinc-800 hover:border-zinc-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="radio"
                        name="severity"
                        checked={priority === 'low'}
                        onChange={() => setPriority('low')}
                        className="mt-0.5 text-zinc-400 focus:ring-0"
                      />
                      <div>
                        <div className="font-bold text-white text-xs flex items-center gap-2">
                          <span>A question or small request</span>
                          <span className="text-[10px] uppercase font-bold text-zinc-300 px-1.5 py-0.2 rounded bg-zinc-800 border border-zinc-700">
                            Low SLA
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                          General product questions, documentation guidance, non-urgent feature inquiries, or minor UI quirks.
                        </p>
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-1.5">
                  Detailed Description <span className="text-rose-400">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Include reproduction steps, timestamps, error banners, or API payload headers..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-sans resize-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={submittingProblem}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-500/20 transition-all disabled:opacity-40"
                >
                  {submittingProblem ? 'Registering Problem...' : 'Submit Support Request'}
                </button>
              </div>
            </form>
          </div>
        ) : (
          /* VIEW 2: Customer Ticket Thread & Reply */
          <div className="space-y-6">
            {/* Ticket Header & Status Banner */}
            {ticket && (
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-zinc-800">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-blue-400 bg-blue-950/60 border border-blue-800/60 px-2.5 py-0.5 rounded-md">
                      {ticket.human_id}
                    </span>
                    <span className="text-xs uppercase font-semibold text-zinc-400">
                      • {ticket.priority} priority
                    </span>
                  </div>

                  <span className="font-mono text-[11px] text-zinc-400">
                    Created {formatIST(ticket.created_at)}
                  </span>
                </div>

                <h1 className="text-lg font-bold text-white mb-4">{ticket.subject}</h1>

                {/* Status Banners (Explicit requirement) */}
                {ticket.status === 'waiting_on_customer' && (
                  <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-700/60 text-amber-200 text-xs flex items-center gap-3">
                    <Clock className="w-5 h-5 text-amber-400 shrink-0 animate-pulse" />
                    <div>
                      <div className="font-bold text-white">We're waiting for your reply, the clock is paused</div>
                      <p className="text-[11px] text-amber-300/80 mt-0.5">
                        Our engineering team has requested information. The SLA timer will resume as soon as you reply below.
                      </p>
                    </div>
                  </div>
                )}

                {(ticket.status === 'open' || ticket.status === 'in_progress' || ticket.status === 'new') && (
                  <div className="p-3.5 rounded-xl bg-blue-950/60 border border-blue-700/60 text-blue-200 text-xs flex items-center gap-3">
                    <Clock className="w-5 h-5 text-blue-400 shrink-0" />
                    <div>
                      <div className="font-bold text-white">
                        We're working on it, expected reply by {formatIST(ticket.response_due)}
                      </div>
                      <p className="text-[11px] text-blue-300/80 mt-0.5">
                        Your ticket is actively assigned to Arvo Support engineering.
                      </p>
                    </div>
                  </div>
                )}

                {ticket.status === 'resolved' && (
                  <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <div className="font-bold text-white">This ticket is marked resolved</div>
                        <p className="text-[11px] text-emerald-300/80 mt-0.5">
                          You may reopen this ticket within 5 working days if the issue recurs.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setReopenModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-500/20 transition-all shrink-0 flex items-center gap-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reopen Ticket</span>
                    </button>
                  </div>
                )}

                {ticket.status === 'closed' && (
                  <div className="p-3.5 rounded-xl bg-zinc-950 border border-zinc-800 text-zinc-300 text-xs flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="w-5 h-5 text-zinc-500 shrink-0" />
                      <div>
                        <div className="font-bold text-zinc-200">Ticket closed</div>
                        <p className="text-[11px] text-zinc-400 mt-0.5">
                          This ticket is closed. Reply below to automatically start a new linked ticket.
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setReopenModalOpen(true)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-xs border border-zinc-700 shrink-0"
                    >
                      Start Linked Ticket
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Public Discussion Thread */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400 px-1">
                Conversation Thread
              </h3>

              {loading ? (
                <div className="p-8 text-center text-zinc-500 text-xs">Loading thread...</div>
              ) : events.length === 0 ? (
                <div className="p-8 text-center text-zinc-500 text-xs">No messages recorded yet.</div>
              ) : (
                events.map((e) => {
                  const isAgent = e.sender_type === 'agent';
                  return (
                    <div
                      key={e.id}
                      className={`p-4 rounded-xl border text-xs shadow-sm ${
                        isAgent
                          ? 'bg-blue-950/20 border-blue-800/40 text-blue-100 ml-4'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-200 mr-4'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] mb-2 pb-2 border-b border-white/5">
                        <span className="font-semibold text-white">
                          {isAgent ? 'Arvo Systems Support' : 'You (Customer)'}
                        </span>
                        <span className="font-mono text-zinc-400">{formatIST(e.created_at)}</span>
                      </div>
                      <div className="whitespace-pre-wrap leading-relaxed">{e.content}</div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Customer Reply Box */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4 shadow-xl">
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                Send a Reply to Support
              </label>
              <textarea
                rows={3}
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Provide additional details, diagnostic logs, or follow-up questions..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 font-sans resize-none"
              />
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">
                  Replying resumes any paused SLA timers immediately.
                </span>
                <button
                  onClick={handleSendReply}
                  disabled={!replyBody.trim() || submittingReply}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-md shadow-blue-500/20 transition-all disabled:opacity-40"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submittingReply ? 'Sending...' : 'Send Reply'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reopen Ticket Modal */}
        {reopenModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-100">
            <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 text-xs text-zinc-200">
              <div className="flex items-center gap-2 mb-3 pb-2 border-b border-zinc-800">
                <RotateCcw className="w-4 h-4 text-emerald-400" />
                <h3 className="font-bold text-white text-sm">Reopen Ticket</h3>
              </div>
              <p className="text-zinc-400 mb-3 leading-relaxed">
                Please describe why this issue is recurring or what remains unresolved:
              </p>
              <textarea
                rows={3}
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                placeholder="e.g. Gateway timeouts resumed after European business hours..."
                className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-zinc-700 resize-none font-sans"
              />
              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setReopenModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleReopen}
                  disabled={!reopenReason.trim()}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all disabled:opacity-40"
                >
                  Confirm Reopen
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};
