import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { User, LeadDashboardData } from '../types/index.js';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  Download,
  Filter,
  Users,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ShieldAlert,
  PauseCircle,
  FileSpreadsheet
} from 'lucide-react';

interface LeadDashboardProps {
  currentUser: User | null;
  allStaff: User[];
  onSelectTicket?: (ticketId: string) => void;
  onBackToConsole: () => void;
}

export const LeadDashboard: React.FC<LeadDashboardProps> = ({
  allStaff,
  onSelectTicket,
  onBackToConsole
}) => {
  const [data, setData] = useState<LeadDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [agentFilter, setAgentFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [dateRangeFilter, setDateRangeFilter] = useState<string>('all');

  const loadDashboard = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getLeadDashboard({
        agent_id: agentFilter || undefined,
        priority: priorityFilter || undefined,
        date_range: dateRangeFilter !== 'all' ? dateRangeFilter : undefined
      });
      setData(res);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load lead dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [agentFilter, priorityFilter, dateRangeFilter]);

  const handleExportCsv = () => {
    const url = api.getLeadExportCsvUrl({
      agent_id: agentFilter || undefined,
      priority: priorityFilter || undefined,
      date_range: dateRangeFilter !== 'all' ? dateRangeFilter : undefined
    });
    window.open(url, '_blank');
  };

  const getReasonBadge = (reason: string) => {
    switch (reason) {
      case 'unassigned_too_long':
        return {
          bg: 'bg-rose-950/80 text-rose-300 border-rose-800/80',
          label: 'Unassigned Too Long',
          desc: 'Waited >50% of SLA budget before agent claimed'
        };
      case 'slow_after_assignment':
        return {
          bg: 'bg-amber-950/80 text-amber-300 border-amber-800/80',
          label: 'Slow After Assignment',
          desc: 'Spent majority of budget actively assigned to agent'
        };
      case 'escalated_mid_flight':
        return {
          bg: 'bg-purple-950/80 text-purple-300 border-purple-800/80',
          label: 'Escalated Mid-Flight',
          desc: 'Priority upgrade retroactively exceeded SLA threshold'
        };
      case 'multiple_reassignments':
        return {
          bg: 'bg-orange-950/80 text-orange-300 border-orange-800/80',
          label: 'Multiple Reassignments',
          desc: 'Ticket was passed between agents 2+ times'
        };
      default:
        return {
          bg: 'bg-zinc-800 text-zinc-300 border-zinc-700',
          label: 'SLA Overrun',
          desc: 'Total elapsed business time exceeded allocation'
        };
    }
  };

  const priorityBadge = (p: string) => {
    switch (p) {
      case 'urgent':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/60';
      case 'medium':
        return 'bg-amber-950/80 text-amber-300 border-amber-800/60';
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-800/60';
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* 1. Header & Controls */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-blue-400 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-800/50">
              Lead Operations
            </span>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              SLA Compliance & Root Cause Analysis
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time attribution answering which tickets were late and why, with customer wait exclusion.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleExportCsv}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 border border-zinc-700/60 transition-colors shadow-sm"
            title="Download CSV containing internal assignments & audit attribution"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export Internal CSV</span>
          </button>

          <button
            onClick={onBackToConsole}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors shadow-sm"
          >
            <span>Agent Console</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* 2. Filter Bar */}
      <div className="bg-zinc-900/40 border-b border-zinc-800/60 px-6 py-3 flex flex-wrap items-center gap-4 text-xs">
        <div className="flex items-center gap-2 text-zinc-400">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <span className="font-medium">Filter by:</span>
        </div>

        {/* Agent Filter */}
        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Agents</option>
          {allStaff.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.role})
            </option>
          ))}
        </select>

        {/* Priority Filter */}
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1 text-zinc-200 focus:outline-none focus:border-blue-500"
        >
          <option value="">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        {/* Date Range */}
        <div className="flex items-center bg-zinc-900 rounded-lg border border-zinc-800 p-0.5">
          <button
            onClick={() => setDateRangeFilter('all')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              dateRangeFilter === 'all' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            All Time
          </button>
          <button
            onClick={() => setDateRangeFilter('30d')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              dateRangeFilter === '30d' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Last 30 Days
          </button>
          <button
            onClick={() => setDateRangeFilter('7d')}
            className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
              dateRangeFilter === '7d' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Last 7 Days
          </button>
        </div>

        {(agentFilter || priorityFilter || dateRangeFilter !== 'all') && (
          <button
            onClick={() => {
              setAgentFilter('');
              setPriorityFilter('');
              setDateRangeFilter('all');
            }}
            className="text-[11px] text-zinc-500 hover:text-zinc-300 underline ml-auto"
          >
            Reset Filters
          </button>
        )}
      </div>

      <div className="p-6 space-y-6 max-w-7xl w-full mx-auto">
        {loading && !data && (
          <div className="flex items-center justify-center py-20 text-zinc-500 text-xs">
            <RefreshCw className="w-5 h-5 animate-spin mr-2 text-blue-500" />
            Computing SLA compliance and root cause attributions...
          </div>
        )}

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {data && (
          <>
            {/* 3. KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              {/* Response Compliance */}
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div className="text-[11px] font-medium text-zinc-400 flex items-center justify-between">
                  <span>Response SLA</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-zinc-100">
                    {data.kpis.response_compliance_pct}%
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">First public reply</div>
              </div>

              {/* Resolution Compliance */}
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div className="text-[11px] font-medium text-zinc-400 flex items-center justify-between">
                  <span>Resolution SLA</span>
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-zinc-100">
                    {data.kpis.resolution_compliance_pct}%
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">Ticket resolution</div>
              </div>

              {/* Currently Late */}
              <div className="bg-zinc-900/80 border border-rose-900/40 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div className="text-[11px] font-medium text-rose-400 flex items-center justify-between">
                  <span>Currently Late</span>
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-rose-300">
                    {data.kpis.currently_late}
                  </span>
                  <span className="text-[10px] text-zinc-500">tickets</span>
                </div>
                <div className="mt-1 text-[10px] text-rose-500/80">Active deadline breach</div>
              </div>

              {/* At Risk */}
              <div className="bg-zinc-900/80 border border-amber-900/40 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div className="text-[11px] font-medium text-amber-400 flex items-center justify-between">
                  <span>At Risk (&lt;20%)</span>
                  <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-amber-300">
                    {data.kpis.at_risk}
                  </span>
                  <span className="text-[10px] text-zinc-500">tickets</span>
                </div>
                <div className="mt-1 text-[10px] text-amber-500/80">&lt;20% budget remaining</div>
              </div>

              {/* Waiting on Customer */}
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div className="text-[11px] font-medium text-cyan-400 flex items-center justify-between">
                  <span>Waiting Customer</span>
                  <PauseCircle className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-cyan-300">
                    {data.kpis.waiting_on_customer}
                  </span>
                  <span className="text-[10px] text-zinc-500">tickets</span>
                </div>
                <div className="mt-1 text-[10px] text-cyan-500/80">SLA Clocks paused</div>
              </div>

              {/* Unassigned */}
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                <div className="text-[11px] font-medium text-zinc-400 flex items-center justify-between">
                  <span>Unassigned</span>
                  <Users className="w-3.5 h-3.5 text-zinc-400" />
                </div>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-2xl font-bold font-mono text-zinc-200">
                    {data.kpis.unassigned}
                  </span>
                  <span className="text-[10px] text-zinc-500">in queue</span>
                </div>
                <div className="mt-1 text-[10px] text-zinc-500">Needs owner</div>
              </div>
            </div>

            {/* 4. Charts: Breach Breakdown & Agent Workload */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Breach Reasons Breakdown */}
              <div className="lg:col-span-1 bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-400" />
                      <span>Root Cause Breakdown</span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Auto-derived via computeBreachReason
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {data.charts.breach_reasons.map((b) => (
                    <div key={b.reason} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-zinc-300 font-medium">{b.label}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-zinc-400">{b.count}</span>
                          <span className="font-mono text-[11px] text-zinc-500 w-8 text-right">
                            {b.percentage}%
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(b.percentage, b.count > 0 ? 5 : 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Workload Per Agent */}
              <div className="lg:col-span-2 bg-zinc-900/80 border border-zinc-800/80 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-blue-400" />
                      <span>Workload & Late Tickets by Agent</span>
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Active tickets, resolution counts, and breach rate across the team
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {data.charts.workload_per_agent.map((agent) => (
                    <div
                      key={agent.agent_id}
                      className="p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/80 flex flex-col justify-between"
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-xs text-zinc-200">{agent.agent_name}</div>
                        <span className="text-[9px] uppercase px-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                          {agent.role}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center justify-between text-[11px] border-t border-zinc-800/60 pt-2 font-mono">
                        <div>
                          <span className="text-zinc-500">Active:</span>{' '}
                          <span className="text-zinc-200 font-semibold">{agent.open_tickets}</span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Late:</span>{' '}
                          <span
                            className={
                              agent.late_tickets > 0 ? 'text-rose-400 font-bold' : 'text-zinc-400'
                            }
                          >
                            {agent.late_tickets}
                          </span>
                        </div>
                        <div>
                          <span className="text-zinc-500">Done:</span>{' '}
                          <span className="text-emerald-400">{agent.resolved_tickets}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 5. Late Tickets Table & Attribution */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/90">
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    <span>Late Tickets & Diagnostic Attribution</span>
                  </h2>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    Tickets exceeding response or resolution SLA thresholds with excluded customer wait time
                  </p>
                </div>
                <span className="text-xs font-mono bg-zinc-800 px-2 py-0.5 rounded text-zinc-300 border border-zinc-700/60">
                  {data.late_tickets.length} breached
                </span>
              </div>

              {data.late_tickets.length === 0 ? (
                <div className="p-12 text-center text-zinc-500 text-xs">
                  <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                  <p className="font-medium text-zinc-300">Zero Late Tickets</p>
                  <p className="mt-1">All tickets are currently within SLA budget for the selected filters.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 text-[11px]">
                        <th className="py-2.5 px-4 font-medium">Ticket ID</th>
                        <th className="py-2.5 px-4 font-medium">Subject & Customer</th>
                        <th className="py-2.5 px-4 font-medium">Priority</th>
                        <th className="py-2.5 px-4 font-medium">Assignee</th>
                        <th className="py-2.5 px-4 font-medium">Why Late (Root Cause)</th>
                        <th className="py-2.5 px-4 font-medium text-right">Customer Wait Excluded</th>
                        <th className="py-2.5 px-4 font-medium text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {data.late_tickets.map((t) => {
                        const reasonInfo = getReasonBadge(t.why_late);
                        return (
                          <tr
                            key={t.id}
                            onClick={() => onSelectTicket?.(t.id)}
                            className="hover:bg-zinc-800/40 transition-colors cursor-pointer group"
                          >
                            {/* Human ID */}
                            <td className="py-3 px-4 font-mono font-medium text-blue-400 group-hover:underline">
                              {t.human_id}
                            </td>

                            {/* Subject & Customer */}
                            <td className="py-3 px-4">
                              <div className="font-medium text-zinc-200 line-clamp-1">
                                {t.subject}
                              </div>
                              <div className="text-[11px] text-zinc-500">
                                {t.customer_name} • {t.customer_org}
                              </div>
                            </td>

                            {/* Priority */}
                            <td className="py-3 px-4">
                              <span
                                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded border ${priorityBadge(
                                  t.priority
                                )}`}
                              >
                                {t.priority}
                              </span>
                            </td>

                            {/* Assignee */}
                            <td className="py-3 px-4 text-zinc-300">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px] text-zinc-300">
                                  {t.assignee_name.charAt(0)}
                                </div>
                                <span>{t.assignee_name}</span>
                              </div>
                            </td>

                            {/* Why Late Badge */}
                            <td className="py-3 px-4">
                              <div className="flex flex-col gap-0.5">
                                <span
                                  className={`text-[10px] font-medium px-2 py-0.5 rounded-md border inline-block w-fit ${reasonInfo.bg}`}
                                >
                                  {reasonInfo.label}
                                </span>
                                <span className="text-[10px] text-zinc-500">
                                  {reasonInfo.desc}
                                </span>
                              </div>
                            </td>

                            {/* Customer Wait Excluded */}
                            <td className="py-3 px-4 text-right font-mono">
                              {t.customer_wait_minutes_excluded > 0 ? (
                                <span className="text-cyan-400 font-medium">
                                  +{t.customer_wait_minutes_excluded}m paused
                                </span>
                              ) : (
                                <span className="text-zinc-600">0m</span>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-3 px-4 text-right">
                              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                                {t.status}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Confidentiality Notice */}
            <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/80 text-zinc-400 text-[11px] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-blue-400 shrink-0" />
                <span>
                  <strong>Internal Lead & Admin Audit Data:</strong> All root-cause attributions are derived from internal timestamps, staff claim histories, and pause intervals. Strictly excluded from customer transcripts.
                </span>
              </div>
              <button
                onClick={handleExportCsv}
                className="text-blue-400 hover:text-blue-300 underline font-medium shrink-0 ml-4"
              >
                Download CSV
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
