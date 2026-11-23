import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import {
  ShieldCheck,
  Clock,
  Lock,
  ArrowRight,
  Sparkles,
  Server,
  Users,
  Compass,
  AlertTriangle,
  Mail,
  ChevronRight
} from 'lucide-react';

interface LandingPageProps {
  onLoginSuccess: (email: string) => Promise<void>;
  onOpenCustomerPortal: () => void;
  onOpenOutbox: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onLoginSuccess,
  onOpenCustomerPortal,
  onOpenOutbox
}) => {
  const [wakingUp, setWakingUp] = useState(false);
  const [serverReady, setServerReady] = useState(true);
  const [loggingIn, setLoggingIn] = useState<string | null>(null);

  // Probe server health on load (detect sleeping free tier instance)
  useEffect(() => {
    let attempts = 0;
    const probe = async () => {
      try {
        await api.checkHealth();
        setServerReady(true);
        setWakingUp(false);
      } catch {
        attempts++;
        setWakingUp(true);
        if (attempts < 10) {
          setTimeout(probe, 2500);
        }
      }
    };
    probe();
  }, []);

  const handleDemoLogin = async (email: string) => {
    setLoggingIn(email);
    try {
      await onLoginSuccess(email);
    } finally {
      setLoggingIn(null);
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-zinc-100 flex flex-col font-sans overflow-y-auto selection:bg-blue-600 selection:text-white">
      {/* Cold-start notification banner (if sleeping free tier is spinning up) */}
      {wakingUp && !serverReady && (
        <div className="bg-gradient-to-r from-amber-900/90 to-blue-900/90 border-b border-amber-700/60 p-3 text-xs text-amber-100 text-center flex items-center justify-center gap-2 animate-pulse">
          <Server className="w-4 h-4 animate-spin text-amber-300" />
          <span>
            <strong>Waking up backend service...</strong> Free-tier container is spinning up PostgreSQL and initializing memory. Automatic reconnection in progress.
          </span>
        </div>
      )}

      {/* Top Navbar */}
      <header className="h-16 border-b border-zinc-800/80 px-6 flex items-center justify-between max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/20">
            F
          </div>
          <div>
            <span className="font-bold tracking-tight text-white text-base">Frontdesk</span>
            <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 ml-2">
              Arvo Systems
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={onOpenCustomerPortal}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5"
          >
            <span>Customer Portal</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={onOpenOutbox}
            className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all flex items-center gap-1.5"
          >
            <Mail className="w-3.5 h-3.5 text-amber-400" />
            <span>Simulated Emails</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-12 flex flex-col justify-center">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Mission-Critical Customer Support</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-4">
            Production-Grade Ticketing with Exact Business-Hour SLAs
          </h1>
          <p className="text-sm sm:text-base text-zinc-400 leading-relaxed max-w-2xl mx-auto">
            Built for <strong>Arvo Systems</strong> (9 agents, ~40 tickets/day). Featuring atomic ownership, zero internal note leakage (INC-0304), cryptographic append-only audit chains (INC-0318), and interactive Time Machine fast-forward controls.
          </p>
        </div>

        {/* 1. One-Click Demo Personas */}
        <div className="mb-14">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 text-center mb-4 flex items-center justify-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span>Select Demo Persona (One-Click Instant Access)</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {/* Agent */}
            <div
              onClick={() => handleDemoLogin('dev.sharma@arvo.internal')}
              className="p-5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-blue-500/50 cursor-pointer transition-all group relative overflow-hidden shadow-xl hover:shadow-blue-500/5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-950/80 text-blue-300 border border-blue-800/60">
                  Support Agent
                </span>
                <span className="text-xs font-mono text-zinc-500">Tier 2</span>
              </div>
              <h3 className="font-bold text-base text-white group-hover:text-blue-400 transition-colors">
                Dev Sharma
              </h3>
              <p className="text-xs text-zinc-400 mt-1 mb-4 leading-relaxed">
                Handle day-to-day tickets, claim unassigned issues, draft public responses with canned replies, and write private internal notes.
              </p>
              <div className="flex items-center text-xs font-semibold text-blue-400 group-hover:translate-x-1 transition-transform gap-1">
                <span>{loggingIn === 'dev.sharma@arvo.internal' ? 'Authenticating...' : 'Enter as Dev Sharma'}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Lead */}
            <div
              onClick={() => handleDemoLogin('aria.chen@arvo.internal')}
              className="p-5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-purple-500/50 cursor-pointer transition-all group relative overflow-hidden shadow-xl hover:shadow-purple-500/5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-950/80 text-purple-300 border border-purple-800/60">
                  Team Lead
                </span>
                <span className="text-xs font-mono text-zinc-500">Supervisor</span>
              </div>
              <h3 className="font-bold text-base text-white group-hover:text-purple-400 transition-colors">
                Aria Chen
              </h3>
              <p className="text-xs text-zinc-400 mt-1 mb-4 leading-relaxed">
                Inspect the entire queue across all agents, reassign tickets, perform mid-flight priority upgrades, and download internal export transcripts.
              </p>
              <div className="flex items-center text-xs font-semibold text-purple-400 group-hover:translate-x-1 transition-transform gap-1">
                <span>{loggingIn === 'aria.chen@arvo.internal' ? 'Authenticating...' : 'Enter as Aria Chen'}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>

            {/* Admin */}
            <div
              onClick={() => handleDemoLogin('kiran.patel@arvo.internal')}
              className="p-5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-900 border border-zinc-800/80 hover:border-rose-500/50 cursor-pointer transition-all group relative overflow-hidden shadow-xl hover:shadow-rose-500/5"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-950/80 text-rose-300 border border-rose-800/60">
                  Administrator
                </span>
                <span className="text-xs font-mono text-zinc-500">Ops Lead</span>
              </div>
              <h3 className="font-bold text-base text-white group-hover:text-rose-400 transition-colors">
                Kiran Patel
              </h3>
              <p className="text-xs text-zinc-400 mt-1 mb-4 leading-relaxed">
                Inspect simulated transactional emails in the Outbox, manage canned reply templates, audit log chains, and oversee agent rosters.
              </p>
              <div className="flex items-center text-xs font-semibold text-rose-400 group-hover:translate-x-1 transition-transform gap-1">
                <span>{loggingIn === 'kiran.patel@arvo.internal' ? 'Authenticating...' : 'Enter as Kiran Patel'}</span>
                <ChevronRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </div>

        {/* 2. "Try This" Scenario Tour */}
        <div className="max-w-4xl mx-auto w-full pt-6 border-t border-zinc-800/80">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-4 flex items-center gap-2">
            <Compass className="w-4 h-4 text-amber-400" />
            <span>Interactive Guided Scenario Tour ("Try This")</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs">
            {/* Scenario 1 */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-amber-300 font-semibold mb-1">
                  <Clock className="w-3.5 h-3.5" />
                  <span>1. Friday 18:00 Urgent Ticket (INC-0001)</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Ticket arrived Friday at 18:00 (30m before close). The 120m SLA clock pauses over the weekend and calculates response due <strong>Monday 11:00 IST</strong>. Use the Time Machine banner to jump to Sunday (not late) then Monday 11:01 to witness the breach!
                </p>
              </div>
            </div>

            {/* Scenario 2 */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-blue-300 font-semibold mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>2. Atomic Claim Race (INC-0291)</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Click on an unassigned ticket in the left queue. The system executes atomic conditional assignment. If another agent claimed it in the same millisecond, you receive a friendly modal with the winner's name.
                </p>
              </div>
            </div>

            {/* Scenario 3 */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-emerald-300 font-semibold mb-1">
                  <Lock className="w-3.5 h-3.5" />
                  <span>3. Zero Note Leakage (INC-0304)</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Write a private yellow internal note in the agent composer. Then click <strong>"Preview as customer"</strong> or open the Customer Portal: internal notes are structurally segregated in a separate table and guaranteed never visible.
                </p>
              </div>
            </div>

            {/* Scenario 4 */}
            <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/60 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-purple-300 font-semibold mb-1">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>4. Mid-Flight Escalation & Breach</span>
                </div>
                <p className="text-zinc-400 leading-relaxed">
                  Select a Low priority ticket and click the priority badge to change to Urgent with a mandatory reason. Deadlines are retroactively recomputed, flagging <code>escalated_mid_flight</code> if overdue.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
