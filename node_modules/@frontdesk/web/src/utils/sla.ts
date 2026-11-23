import { Ticket, TicketGroup } from '../types/index.js';

export interface SlaBadgeInfo {
  group: TicketGroup;
  label: string;
  badgeClass: string;
  chipClass: string;
  isOverdue: boolean;
  targetType: 'response' | 'resolve' | 'none';
}

export function formatTimeDiff(ms: number): string {
  const absMs = Math.abs(ms);
  const minutes = Math.floor(absMs / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    const remHours = hours % 24;
    return remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  }
  if (hours > 0) {
    const remMins = minutes % 60;
    return remMins > 0 ? `${hours}h ${remMins}m` : `${hours}h`;
  }
  return `${Math.max(1, minutes)}m`;
}

export function computeTicketSla(ticket: Ticket, currentTimeIso?: string): SlaBadgeInfo {
  if (ticket.status === 'resolved' || ticket.status === 'closed') {
    return {
      group: 'on_track',
      label: 'Completed',
      badgeClass: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/50',
      chipClass: 'text-emerald-400',
      isOverdue: false,
      targetType: 'none'
    };
  }

  if (ticket.status === 'waiting_on_customer') {
    return {
      group: 'waiting',
      label: 'Clock Paused',
      badgeClass: 'bg-blue-950/60 text-blue-400 border-blue-800/50',
      chipClass: 'text-blue-400',
      isOverdue: false,
      targetType: 'none'
    };
  }

  const now = currentTimeIso ? new Date(currentTimeIso).getTime() : 0;

  // If first response hasn't happened, evaluate response deadline
  const isAwaitingResponse = !ticket.first_response_at && ticket.response_due;
  const targetIso = isAwaitingResponse ? ticket.response_due : ticket.resolve_due;
  const targetType = isAwaitingResponse ? 'response' : 'resolve';

  if (!targetIso) {
    return {
      group: 'on_track',
      label: 'On Track',
      badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      chipClass: 'text-zinc-300',
      isOverdue: false,
      targetType: 'none'
    };
  }

  const dueTime = new Date(targetIso).getTime();
  const diffMs = dueTime - now;

  if (diffMs < 0) {
    // Breached / Late
    const overdueStr = formatTimeDiff(diffMs);
    return {
      group: 'late',
      label: `${overdueStr} overdue (${targetType})`,
      badgeClass: 'bg-rose-950/70 text-rose-300 border-rose-800/60 font-semibold',
      chipClass: 'text-rose-400',
      isOverdue: true,
      targetType
    };
  }

  const remainingMins = Math.floor(diffMs / (60 * 1000));

  // At risk if <= 60 mins remaining or urgent with < 45m
  const isAtRisk = remainingMins <= 60 || (ticket.priority === 'urgent' && remainingMins <= 45);

  if (isAtRisk) {
    const leftStr = formatTimeDiff(diffMs);
    return {
      group: 'at_risk',
      label: `${leftStr} left (${targetType})`,
      badgeClass: 'bg-amber-950/70 text-amber-300 border-amber-800/60 font-semibold animate-pulse',
      chipClass: 'text-amber-400',
      isOverdue: false,
      targetType
    };
  }

  // Healthy / On track
  const leftStr = formatTimeDiff(diffMs);
  return {
    group: 'on_track',
    label: `${leftStr} left`,
    badgeClass: 'bg-zinc-800/80 text-zinc-300 border-zinc-700',
    chipClass: 'text-zinc-300',
    isOverdue: false,
    targetType
  };
}
