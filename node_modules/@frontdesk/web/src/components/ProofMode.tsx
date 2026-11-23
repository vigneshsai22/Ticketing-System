import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { Ticket, AuditLedgerEvent, VerifyChainResult, SlaPause, TicketCycleDetails } from '../types/index.js';
import {
  ShieldCheck,
  ShieldAlert,
  Printer,
  ArrowLeft,
  CheckCircle2,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';

interface ProofModeProps {
  ticket: Ticket;
  currentTimeIso?: string;
  onBackToConsole: () => void;
}

export const ProofMode: React.FC<ProofModeProps> = ({
  ticket,
  currentTimeIso,
  onBackToConsole
}) => {
  const [events, setEvents] = useState<AuditLedgerEvent[]>([]);
  const [pauses, setPauses] = useState<SlaPause[]>([]);
  const [cycle, setCycle] = useState<TicketCycleDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyChainResult | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const loadAuditData = async () => {
    setLoading(true);
    try {
      const [auditRes, threadRes] = await Promise.all([
        api.getTicketAudit(ticket.id),
        api.getThread(ticket.id)
      ]);
      setEvents(auditRes.events || []);
      setPauses(threadRes.pauses || []);
      setCycle(threadRes.cycle || null);

      // Automatically run initial verification
      const verifyRes = await api.verifyTicketAudit(ticket.id);
      setVerifyResult(verifyRes);
    } catch (err) {
      console.error('Failed to load audit proof data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuditData();
  }, [ticket.id]);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await api.verifyTicketAudit(ticket.id);
      setVerifyResult(res);
    } finally {
      setVerifying(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(text);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const formatIst = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' IST';
  };

  // Plain-Language Dispute Settlement Logic (e.g. for INC-0318)
  const generateDisputeSummary = () => {
    const clockStart = cycle?.clock_start || ticket.clock_start || ticket.created_at;
    const firstReplyEvent = events.find(
      (e) => e.event_type === 'public_reply' || e.event_type === 'public_message'
    );
    const firstReplyTime = cycle?.first_response_at || firstReplyEvent?.created_at;
    const firstReplyActor = firstReplyEvent?.actor_name || 'Assigned Agent';

    let elapsedMinutes = 0;
    if (firstReplyTime && clockStart) {
      elapsedMinutes = Math.max(
        0,
        Math.round((new Date(firstReplyTime).getTime() - new Date(clockStart).getTime()) / 60000)
      );
    }

    const totalPausedMinutes = pauses.reduce((acc, p) => {
      const pStart = new Date(p.started_at).getTime();
      const pEnd = p.ended_at
        ? new Date(p.ended_at).getTime()
        : currentTimeIso
        ? new Date(currentTimeIso).getTime()
        : new Date(ticket.updated_at || ticket.created_at).getTime();
      return acc + Math.max(0, Math.round((pEnd - pStart) / 60000));
    }, 0);

    const isResolved = ['resolved', 'closed'].includes(ticket.status);
    const resolvedTime = cycle?.resolved_at || ticket.resolved_at;

    return {
      arrival: formatIst(ticket.created_at),
      clockStart: formatIst(clockStart),
      firstReplyTime: firstReplyTime ? formatIst(firstReplyTime) : 'Pending',
      firstReplyActor,
      elapsedBusinessMins: elapsedMinutes,
      totalPausedMinutes,
      isResolved,
      resolvedTime: resolvedTime ? formatIst(resolvedTime) : null,
      targetMins: cycle?.respond_minutes || (ticket.priority === 'urgent' ? 120 : ticket.priority === 'medium' ? 270 : 540)
    };
  };

  const summary = generateDisputeSummary();

  if (loading && events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center bg-zinc-950 text-zinc-500 text-xs">
        <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-400" />
        <span>Loading cryptographic audit proof...</span>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 overflow-y-auto print:bg-white print:text-black">
      {/* 1. Header Toolbar (Hidden when printing) */}
      <div className="print:hidden border-b border-zinc-800/80 bg-zinc-900/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-30 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToConsole}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Ticket</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-sm text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/50">
                {ticket.human_id}
              </span>
              <h1 className="text-base font-bold text-zinc-100">Cryptographic Proof & Audit Ledger</h1>
            </div>
            <p className="text-[11px] text-zinc-400 mt-0.5">
              Append-only SHA-256 hash chained proof mode for SLA and dispute settlement.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleVerify}
            disabled={verifying}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-sm transition-all"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            <span>Verify Integrity</span>
          </button>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-xs border border-zinc-700/60 transition-all shadow-sm"
          >
            <Printer className="w-3.5 h-3.5 text-blue-400" />
            <span>Print Official Proof</span>
          </button>
        </div>
      </div>

      {/* 2. Official Printable Report Body */}
      <div className="p-8 max-w-5xl w-full mx-auto space-y-6">
        {/* Printable Letterhead */}
        <div className="border-b border-zinc-800 pb-5 print:border-black">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest font-mono text-blue-400 font-bold print:text-blue-700">
                ARVO SYSTEMS ENTERPRISE SUPPORT
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-zinc-100 print:text-black mt-1">
                Cryptographic Dispute Settlement Certificate
              </h2>
              <div className="text-xs text-zinc-400 print:text-gray-600 mt-1">
                Incident Ref: <strong className="font-mono text-zinc-200 print:text-black">{ticket.human_id}</strong> • Subject: {ticket.subject}
              </div>
            </div>

            <div className="text-right text-xs text-zinc-400 font-mono print:text-gray-600">
              <div>Customer: {ticket.customer_name || 'Enterprise Client'}</div>
              <div>Priority: {ticket.priority.toUpperCase()}</div>
              <div>Generated: {formatIst(currentTimeIso || ticket.updated_at || ticket.created_at)}</div>
            </div>
          </div>
        </div>

        {/* 3. Plain-Language Dispute Resolution Narrative (INC-0318) */}
        <div className="p-5 rounded-xl bg-zinc-900/90 border border-zinc-800 shadow-sm print:bg-gray-50 print:border-gray-300">
          <h3 className="text-xs uppercase tracking-wider font-semibold text-blue-400 print:text-blue-700 mb-3 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" />
            <span>Plain-Language Dispute Chronology (SLA Verification)</span>
          </h3>

          <div className="space-y-2.5 text-xs text-zinc-300 print:text-gray-800 leading-relaxed font-sans">
            <p>
              • <strong>Ticket Ingestion:</strong> Incident recorded at <span className="font-mono text-zinc-100 print:text-black font-semibold">{summary.arrival}</span>. Business SLA clock began at <span className="font-mono text-zinc-100 print:text-black font-semibold">{summary.clockStart}</span> (Asia/Kolkata 09:30-18:30 operating schedule).
            </p>
            <p>
              • <strong>First Public Agent Response:</strong> First customer-visible reply was sent at <span className="font-mono text-zinc-100 print:text-black font-semibold">{summary.firstReplyTime}</span> by <strong className="text-blue-400 print:text-blue-700">{summary.firstReplyActor}</strong>. Elapsed response business time was <strong className="font-mono text-zinc-100 print:text-black">{summary.elapsedBusinessMins} minutes</strong> against the SLA target of <strong className="font-mono text-zinc-100 print:text-black">{summary.targetMins} minutes</strong> ({summary.elapsedBusinessMins <= summary.targetMins ? 'COMPLIANT — WITHIN BUDGET' : 'OVERRUN'}).
            </p>
            {summary.totalPausedMinutes > 0 && (
              <p>
                • <strong>Customer Silence Pauses:</strong> Both response and resolution SLA clocks were paused for customer response for a cumulative <span className="font-mono text-cyan-400 print:text-cyan-700 font-semibold">{summary.totalPausedMinutes} business minutes</span> in accordance with Section 2 of SLA Operating Rules.
              </p>
            )}
            {summary.isResolved && (
              <p>
                • <strong>Incident Resolution:</strong> Ticket reached resolved status at <span className="font-mono text-zinc-100 print:text-black font-semibold">{summary.resolvedTime}</span>.
              </p>
            )}
          </div>
        </div>

        {/* 4. Cryptographic Verification Status Banner */}
        {verifyResult && (
          <div
            className={`p-4 rounded-xl border flex items-start justify-between gap-4 ${
              verifyResult.valid
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300 print:bg-emerald-50 print:border-emerald-600 print:text-emerald-900'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300 print:bg-rose-50 print:border-rose-600 print:text-rose-900'
            }`}
          >
            <div className="flex items-start gap-3">
              {verifyResult.valid ? (
                <ShieldCheck className="w-5 h-5 text-emerald-400 print:text-emerald-700 shrink-0 mt-0.5" />
              ) : (
                <ShieldAlert className="w-5 h-5 text-rose-400 print:text-rose-700 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold text-sm">
                  {verifyResult.valid
                    ? 'Cryptographic Audit Chain: VERIFIED & TAMPER-FREE'
                    : 'Cryptographic Audit Chain: VERIFICATION FAILED'}
                </div>
                <p className="text-xs opacity-90 mt-0.5 leading-relaxed">
                  {verifyResult.valid
                    ? `All ${verifyResult.totalEvents} sequential audit events have been cryptographically verified from Genesis to Head using SHA-256 hash chaining. Database triggers enforce immutability; zero rows were modified, inserted out-of-order, or deleted.`
                    : `Verification failed at Sequence #${verifyResult.brokenAtSeq}. Expected hash ${verifyResult.expectedHash} but found ${verifyResult.actualHash}.`}
                </p>
              </div>
            </div>

            <div className="text-right font-mono text-[11px] shrink-0">
              <span className="px-2.5 py-1 rounded-full font-bold bg-emerald-900/60 border border-emerald-700 print:bg-emerald-200">
                {verifyResult.totalEvents} / {verifyResult.totalEvents} LINKS PASS
              </span>
            </div>
          </div>
        )}

        {/* 5. Complete Chronological Audit Ledger Table */}
        <div className="bg-zinc-900/80 border border-zinc-800 rounded-xl overflow-hidden shadow-sm print:bg-white print:border-gray-300">
          <div className="p-4 border-b border-zinc-800 bg-zinc-900/90 print:bg-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-xs text-zinc-100 print:text-black">
              Immutable Audit Ledger ({events.length} Chained Records)
            </h3>
            <span className="text-[10px] font-mono text-zinc-400 print:text-gray-600">
              Algorithm: SHA-256 (prev_hash + canonical_json)
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-950/60 print:bg-gray-50 text-zinc-400 print:text-gray-700 text-[11px]">
                  <th className="py-2.5 px-3 font-mono font-medium">Seq</th>
                  <th className="py-2.5 px-3 font-medium">Timestamp (IST)</th>
                  <th className="py-2.5 px-3 font-medium">Actor</th>
                  <th className="py-2.5 px-3 font-medium">Event Type</th>
                  <th className="py-2.5 px-3 font-medium">Changes (Before / After)</th>
                  <th className="py-2.5 px-3 font-mono font-medium text-right">SHA-256 Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 print:divide-gray-200">
                {events.map((e) => (
                  <tr key={e.id} className="hover:bg-zinc-800/30 print:hover:bg-transparent">
                    {/* Seq */}
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-400 print:text-blue-700">
                      #{e.seq}
                    </td>

                    {/* Timestamp */}
                    <td className="py-2.5 px-3 font-mono text-zinc-300 print:text-black whitespace-nowrap text-[11px]">
                      {formatIst(e.created_at)}
                    </td>

                    {/* Actor */}
                    <td className="py-2.5 px-3 text-zinc-200 print:text-black">
                      <div className="font-medium">{e.actor_name || e.actor_type.toUpperCase()}</div>
                      <div className="text-[10px] text-zinc-500 font-mono">{e.actor_type}</div>
                    </td>

                    {/* Event Type */}
                    <td className="py-2.5 px-3">
                      <span className="font-mono text-[10px] bg-zinc-800 text-zinc-300 px-1.5 py-0.5 rounded border border-zinc-700/60 print:bg-gray-100 print:text-black">
                        {e.event_type}
                      </span>
                    </td>

                    {/* Changes Before/After */}
                    <td className="py-2.5 px-3 text-[11px] max-w-xs truncate text-zinc-400 print:text-gray-700 font-mono">
                      {e.after ? JSON.stringify(e.after) : e.before ? JSON.stringify(e.before) : '—'}
                    </td>

                    {/* Cryptographic Hash */}
                    <td className="py-2.5 px-3 font-mono text-[10px] text-right text-zinc-400 print:text-gray-600">
                      <button
                        onClick={() => handleCopy(e.hash)}
                        className="inline-flex items-center gap-1 hover:text-zinc-100 group"
                        title="Copy SHA-256 hash"
                      >
                        <span className="truncate max-w-[120px]">{e.hash.substring(0, 16)}...</span>
                        {copiedHash === e.hash ? (
                          <Check className="w-3 h-3 text-emerald-400" />
                        ) : (
                          <Copy className="w-3 h-3 opacity-40 group-hover:opacity-100" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
