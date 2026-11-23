import React from 'react';
import { Ticket, SlaPause, TicketCycleDetails, AuditEvent } from '../types/index.js';
import { Clock } from 'lucide-react';

interface SlaRibbonProps {
  ticket: Ticket;
  cycle: TicketCycleDetails | null;
  pauses: SlaPause[];
  auditEvents: AuditEvent[];
  currentTimeIso?: string;
}

export const SlaRibbon: React.FC<SlaRibbonProps> = ({
  ticket,
  cycle,
  pauses,
  auditEvents,
  currentTimeIso
}) => {
  // Use cycle clock_start, or fallback to ticket created_at
  const clockStartStr = cycle?.clock_start || ticket.clock_start || ticket.created_at;
  const clockStart = new Date(clockStartStr).getTime();

  // Target deadline: response due or resolve due
  const deadlineStr = cycle?.response_due || ticket.response_due || cycle?.resolve_due || ticket.resolve_due;
  if (!deadlineStr) return null;

  const deadline = new Date(deadlineStr).getTime();
  const now = currentTimeIso
    ? new Date(currentTimeIso).getTime()
    : new Date(ticket.updated_at || ticket.created_at).getTime();

  // Total span for timeline visualization (at least from clockStart to max(deadline, now))
  const endPoint = Math.max(deadline, now, clockStart + 1000);
  const totalDuration = Math.max(endPoint - clockStart, 60000);

  const getPercent = (t: number) => {
    const p = ((t - clockStart) / totalDuration) * 100;
    return Math.max(0, Math.min(100, p));
  };

  const formatIst = (dateStrOrMs: string | number) => {
    const d = new Date(dateStrOrMs);
    return d.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }) + ' IST';
  };

  // 1. Paused segments
  const pauseSegments = pauses.map((p) => {
    const pStart = new Date(p.started_at).getTime();
    const pEnd = p.ended_at ? new Date(p.ended_at).getTime() : now;
    const left = getPercent(pStart);
    const width = Math.max(1, getPercent(pEnd) - left);
    return {
      id: p.id,
      left,
      width,
      startedAt: p.started_at,
      endedAt: p.ended_at,
      durationMins: Math.round((pEnd - pStart) / 60000)
    };
  });

  // 2. Markers
  // First response marker
  const firstResponseAt = cycle?.first_response_at || ticket.first_response_at;
  const firstResponsePercent = firstResponseAt ? getPercent(new Date(firstResponseAt).getTime()) : null;

  // Priority change markers from audit events
  const priorityChanges = auditEvents
    .filter((a) => a.event_type === 'ticket_priority_changed' || a.event_type === 'priority_changed')
    .map((a) => ({
      id: a.id,
      percent: getPercent(new Date(a.created_at).getTime()),
      timestamp: a.created_at,
      afterPriority:
        typeof a.after === 'object' && a.after && 'priority' in a.after
          ? String((a.after as Record<string, unknown>).priority)
          : 'unknown',
      reason:
        typeof a.after === 'object' && a.after && 'reason' in a.after
          ? String((a.after as Record<string, unknown>).reason)
          : ''
    }));

  const deadlinePercent = getPercent(deadline);
  const nowPercent = getPercent(now);

  const isBreached = Boolean(
    ticket.response_breached_at ||
    ticket.resolve_breached_at ||
    (!firstResponseAt && now > deadline)
  );

  return (
    <div className="w-full bg-zinc-900/90 border border-zinc-800 rounded-xl p-3.5 space-y-2.5 text-xs shadow-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between text-[11px]">
        <div className="flex items-center gap-2">
          <Clock className="w-3.5 h-3.5 text-blue-400" />
          <span className="font-semibold text-zinc-200">SLA Business Timeline Ribbon</span>
          <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800">
            Asia/Kolkata (IST)
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] text-zinc-400">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-600/60 border border-blue-500" />
            <span>Working Time</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-cyan-900/60 border border-cyan-500/80" />
            <span>Paused (Waiting)</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-600" />
            <span>Deadline</span>
          </div>
        </div>
      </div>

      {/* Main Track Ribbon */}
      <div className="relative w-full h-6 bg-zinc-950 rounded-lg border border-zinc-800 overflow-visible my-3 select-none">
        {/* Base Working Time Background */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-950/60 via-indigo-950/40 to-blue-950/60 rounded-lg" />

        {/* Paused Segments */}
        {pauseSegments.map((seg) => (
          <div
            key={seg.id}
            className="absolute top-0 bottom-0 bg-cyan-900/70 border-x border-cyan-500/80 group cursor-pointer"
            style={{ left: `${seg.left}%`, width: `${seg.width}%` }}
          >
            {/* Tooltip on hover */}
            <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-zinc-100 border border-zinc-700 px-2 py-1 rounded shadow-xl text-[10px] whitespace-nowrap z-30 font-mono">
              <span className="text-cyan-400 font-bold">⏸ Paused:</span> +{seg.durationMins}m customer wait
              <div className="text-[9px] text-zinc-400">
                {formatIst(seg.startedAt)} - {seg.endedAt ? formatIst(seg.endedAt) : 'Active'}
              </div>
            </div>
          </div>
        ))}

        {/* Priority Change Markers */}
        {priorityChanges.map((pc) => (
          <div
            key={pc.id}
            className="absolute top-0 bottom-0 w-1 bg-purple-500 group cursor-pointer z-10"
            style={{ left: `${pc.percent}%` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-purple-500 -ml-[3px] -mt-1 shadow-sm" />
            <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-zinc-100 border border-zinc-700 px-2 py-1 rounded shadow-xl text-[10px] whitespace-nowrap z-30 font-mono">
              <span className="text-purple-400 font-bold">▲ Priority Upgrade:</span> {pc.afterPriority.toUpperCase()}
              <div className="text-[9px] text-zinc-400">{formatIst(pc.timestamp)}</div>
              {pc.reason && <div className="text-[9px] text-zinc-500 italic font-sans">{pc.reason}</div>}
            </div>
          </div>
        ))}

        {/* First Response Marker */}
        {firstResponsePercent !== null && firstResponseAt && (
          <div
            className="absolute top-0 bottom-0 w-1 bg-emerald-500 group cursor-pointer z-10"
            style={{ left: `${firstResponsePercent}%` }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400 -ml-[3px] -mt-1 shadow-md shadow-emerald-500/50" />
            <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-zinc-100 border border-zinc-700 px-2 py-1 rounded shadow-xl text-[10px] whitespace-nowrap z-30 font-mono">
              <span className="text-emerald-400 font-bold">✓ First Public Response</span>
              <div className="text-[9px] text-zinc-400">{formatIst(firstResponseAt)}</div>
            </div>
          </div>
        )}

        {/* Deadline Marker */}
        <div
          className={`absolute top-0 bottom-0 w-1 ${isBreached ? 'bg-rose-500 animate-pulse' : 'bg-rose-600'} group cursor-pointer z-20`}
          style={{ left: `${deadlinePercent}%` }}
        >
          <div className="w-3 h-3 rounded-full bg-rose-600 -ml-[4px] -mt-1 shadow-md shadow-rose-600/50" />
          <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-zinc-100 border border-zinc-700 px-2 py-1 rounded shadow-xl text-[10px] whitespace-nowrap z-30 font-mono">
            <span className="text-rose-400 font-bold">⚡ SLA Target Deadline</span>
            <div className="text-[9px] text-zinc-400">{formatIst(deadlineStr)}</div>
            <div className="text-[9px] text-rose-300 font-sans">
              {isBreached ? 'Deadline Breached' : 'Active Target'}
            </div>
          </div>
        </div>

        {/* Current Time Indicator */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-zinc-200 group cursor-pointer z-20"
          style={{ left: `${nowPercent}%` }}
        >
          <div className="w-2 h-2 rounded-full bg-zinc-100 -ml-[3px] -mt-0.5 shadow-md" />
          <div className="hidden group-hover:block absolute bottom-8 left-1/2 -translate-x-1/2 bg-zinc-900 text-zinc-100 border border-zinc-700 px-2 py-1 rounded shadow-xl text-[10px] whitespace-nowrap z-30 font-mono">
            <span className="text-zinc-200 font-bold">Now: {formatIst(now)}</span>
          </div>
        </div>
      </div>

      {/* Timestamp labels below ribbon */}
      <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-0.5">
        <div>
          <span className="text-zinc-500">Clock Start:</span> {formatIst(clockStartStr)}
        </div>
        <div>
          <span className="text-zinc-500">Deadline:</span> {formatIst(deadlineStr)}
        </div>
      </div>
    </div>
  );
};
