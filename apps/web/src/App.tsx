import React, { useEffect, useState, useCallback } from 'react';
import { User, Ticket, TicketScope, CannedReply, TimeMachineState } from './types/index.js';
import { api } from './services/api.js';
import { Header } from './components/Header.js';
import { TimeMachineBanner } from './components/TimeMachineBanner.js';
import { TicketList } from './components/TicketList.js';
import { TicketDetail } from './components/TicketDetail.js';
import { CommandPalette } from './components/CommandPalette.js';
import { LandingPage } from './components/LandingPage.js';
import { CustomerPortal } from './components/CustomerPortal.js';
import { OutboxViewer } from './components/OutboxViewer.js';
import { LeadDashboard } from './components/LeadDashboard.js';
import { AdminSettings } from './components/AdminSettings.js';
import { ProofMode } from './components/ProofMode.js';
import { GuidedTour } from './components/GuidedTour.js';

export const App: React.FC = () => {
  // Navigation / View State
  const [view, setView] = useState<'agent' | 'landing' | 'customer' | 'outbox' | 'lead-dashboard' | 'admin' | 'proof'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const urlView = params.get('view');
      if (urlView === 'customer' || params.has('token')) return 'customer';
      if (urlView === 'outbox') return 'outbox';
      if (urlView === 'landing') return 'landing';
      if (urlView === 'lead-dashboard') return 'lead-dashboard';
      if (urlView === 'admin') return 'admin';
      if (urlView === 'proof') return 'proof';
    }
    return 'agent';
  });
  const [proofTicket, setProofTicket] = useState<Ticket | null>(null);
  const [customerTicketId, setCustomerTicketId] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('ticket') || null;
    }
    return null;
  });
  const [customerToken, setCustomerToken] = useState<string | null>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('token') || null;
    }
    return null;
  });

  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [allStaff, setAllStaff] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [scope, setScope] = useState<TicketScope>('my');
  const [searchQuery, setSearchQuery] = useState('');
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [timeState, setTimeState] = useState<TimeMachineState | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [activeViewer, setActiveViewer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 1. Initial Load: Auto-login as Lead (Aria Chen) if not logged in, fetch reference data
  const initialize = async () => {
    try {
      // 1. Try to get current user or demo-login as default Lead
      let user: User;
      try {
        const meRes = await api.getMe();
        user = meRes.user;
      } catch {
        const loginRes = await api.demoLogin('aria.chen@arvo.internal');
        user = loginRes.user;
      }
      setCurrentUser(user);

      // 2. Fetch staff & canned replies & time machine state
      const [staffRes, cannedRes, timeRes] = await Promise.all([
        api.getStaff().catch(() => ({ users: [] })),
        api.getCannedReplies().catch(() => ({ replies: [] })),
        api.getTime().catch(() => null)
      ]);

      setAllStaff(staffRes.users || []);
      setCannedReplies(cannedRes.replies || []);
      if (timeRes) setTimeState(timeRes);

      // 3. Fetch tickets
      const ticketsRes = await api.getTickets();
      const loadedTickets = ticketsRes.tickets || [];
      setTickets(loadedTickets);

      if (loadedTickets.length > 0 && !selectedTicketId) {
        setSelectedTicketId(loadedTickets[0].id);
      }
    } catch (err) {
      console.error('Initialization error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    initialize();
  }, []);

  // 2. Refresh tickets
  const refreshTickets = useCallback(async () => {
    try {
      const res = await api.getTickets();
      setTickets(res.tickets || []);
    } catch (err) {
      console.error('Failed to refresh tickets:', err);
    }
  }, []);

  // 3. Setup SSE Live Updates
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/events');

      es.addEventListener('presence', (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.ticket_id === selectedTicketId && data.viewer_name && data.viewer_name !== currentUser?.name) {
            setActiveViewer(data.viewer_name);
            // Clear presence after 10s
            setTimeout(() => setActiveViewer(null), 10000);
          }
        } catch {
          // ignore parse errors
        }
      });

      es.addEventListener('ticket_updated', () => {
        refreshTickets();
      });

      es.addEventListener('ticket_claimed', () => {
        refreshTickets();
      });

      es.addEventListener('new_message', () => {
        refreshTickets();
      });
    } catch (err) {
      console.warn('SSE subscription failed:', err);
    }

    return () => {
      if (es) es.close();
    };
  }, [selectedTicketId, currentUser?.name, refreshTickets]);

  // 4. Keyboard Shortcuts: Cmd+K, 'c' to claim, 'j'/'k' next/prev ticket
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if typing inside input or textarea
      const target = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(target.tagName) || target.isContentEditable) {
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
        return;
      }

      if (e.key === 'c' && selectedTicket) {
        // Claim shortcut
        if (!selectedTicket.assignee_id) {
          e.preventDefault();
          api.claimTicket(selectedTicket.id, selectedTicket.version).then((res) => {
            handleTicketUpdated(res.ticket);
          });
        }
      }

      if (e.key === 'j' || e.key === 'ArrowDown') {
        // Next ticket
        e.preventDefault();
        const currentIndex = tickets.findIndex((t) => t.id === selectedTicketId);
        if (currentIndex >= 0 && currentIndex < tickets.length - 1) {
          setSelectedTicketId(tickets[currentIndex + 1].id);
        }
      }

      if (e.key === 'k' || e.key === 'ArrowUp') {
        // Previous ticket
        e.preventDefault();
        const currentIndex = tickets.findIndex((t) => t.id === selectedTicketId);
        if (currentIndex > 0) {
          setSelectedTicketId(tickets[currentIndex - 1].id);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  // User switcher
  const handleSwitchUser = async (email: string) => {
    const res = await api.demoLogin(email);
    setCurrentUser(res.user);
    refreshTickets();
  };

  // Time Machine actions
  const handleJumpTime = async (target: string) => {
    const newState = await api.jumpTime(target);
    setTimeState(newState);
    refreshTickets();
  };

  const handleShiftTime = async (params: { minutes?: number; hours?: number; days?: number }) => {
    const newState = await api.shiftTime(params);
    setTimeState(newState);
    refreshTickets();
  };

  const handleResetTime = async () => {
    const newState = await api.resetTime();
    setTimeState(newState);
    refreshTickets();
  };

  const handleRunScheduler = async () => {
    await api.runScheduler();
    const time = await api.getTime();
    setTimeState(time);
    refreshTickets();
  };

  const handleTicketUpdated = (updated: Ticket) => {
    setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
  };

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;

  if (loading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="w-10 h-10 rounded-xl bg-blue-600 animate-pulse mb-3" />
        <p className="text-xs font-medium text-zinc-300">Loading Frontdesk Support Console...</p>
      </div>
    );
  }

  // 1. Landing / Demo Tour View
  if (view === 'landing') {
    return (
      <LandingPage
        onLoginSuccess={async (email) => {
          await handleSwitchUser(email);
          setView('agent');
        }}
        onOpenCustomerPortal={() => setView('customer')}
        onOpenOutbox={() => setView('outbox')}
      />
    );
  }

  // 2. Customer Portal View (Public magic-link only)
  if (view === 'customer') {
    return (
      <CustomerPortal
        initialTicketId={customerTicketId}
        initialToken={customerToken}
        onBackToAgentConsole={() => setView('agent')}
      />
    );
  }

  // 3. Simulated Outbox Viewer (Admin/Lead/Demo)
  if (view === 'outbox') {
    return (
      <OutboxViewer
        onBackToAgentConsole={() => setView('agent')}
        onOpenCustomerPortalWithToken={(tId, tok) => {
          setCustomerTicketId(tId);
          setCustomerToken(tok);
          setView('customer');
        }}
      />
    );
  }

  // 4. Lead SLA Compliance & Root Cause Dashboard
  if (view === 'lead-dashboard') {
    return (
      <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
        <TimeMachineBanner
          timeState={timeState}
          onJump={handleJumpTime}
          onShift={handleShiftTime}
          onReset={handleResetTime}
          onRunScheduler={handleRunScheduler}
        />
        <Header
          currentUser={currentUser}
          allStaff={allStaff}
          onSwitchUser={handleSwitchUser}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          currentView={view}
          onViewChange={setView}
        />
        <LeadDashboard
          currentUser={currentUser}
          allStaff={allStaff}
          onBackToConsole={() => setView('agent')}
          onSelectTicket={(tId) => {
            setSelectedTicketId(tId);
            setView('agent');
          }}
        />
      </div>
    );
  }

  // 5. Admin Settings & Master Controls
  if (view === 'admin') {
    return (
      <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
        <TimeMachineBanner
          timeState={timeState}
          onJump={handleJumpTime}
          onShift={handleShiftTime}
          onReset={handleResetTime}
          onRunScheduler={handleRunScheduler}
        />
        <Header
          currentUser={currentUser}
          allStaff={allStaff}
          onSwitchUser={handleSwitchUser}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          currentView={view}
          onViewChange={setView}
        />
        <AdminSettings
          currentUser={currentUser}
          onBackToConsole={() => setView('agent')}
          onStaffUpdated={async () => {
            const res = await api.getStaff();
            setAllStaff(res.users || []);
          }}
        />
      </div>
    );
  }

  // 6. Proof Mode Certificate View
  if (view === 'proof' && (proofTicket || selectedTicket)) {
    return (
      <ProofMode
        ticket={proofTicket || selectedTicket!}
        currentTimeIso={timeState?.current_time}
        onBackToConsole={() => setView('agent')}
      />
    );
  }

  // 7. Default Agent Console Workspace
  return (
    <div className="h-screen w-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* 1. Time Machine Alert Banner */}
      <TimeMachineBanner
        timeState={timeState}
        onJump={handleJumpTime}
        onShift={handleShiftTime}
        onReset={handleResetTime}
        onRunScheduler={handleRunScheduler}
      />

      {/* 2. Top Application Header */}
      <Header
        currentUser={currentUser}
        allStaff={allStaff}
        onSwitchUser={handleSwitchUser}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        currentView={view}
        onViewChange={setView}
      />

      {/* 3. Main Workspace (Split View) */}
      <main className="flex-1 flex overflow-hidden">
        {/* Left: Filterable Ticket Queue */}
        <TicketList
          tickets={tickets}
          selectedTicketId={selectedTicketId}
          onSelectTicket={(t) => setSelectedTicketId(t.id)}
          scope={scope}
          onScopeChange={setScope}
          currentUser={currentUser}
          currentTimeIso={timeState?.current_time}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        {/* Right: Ticket Detail & Thread */}
        <TicketDetail
          ticket={selectedTicket}
          currentUser={currentUser}
          cannedReplies={cannedReplies}
          currentTimeIso={timeState?.current_time}
          activeViewer={activeViewer}
          onTicketUpdated={handleTicketUpdated}
          onOpenProofMode={(t) => {
            setProofTicket(t);
            setView('proof');
          }}
        />
      </main>

      {/* 4. Guided Evaluator Tour */}
      <GuidedTour
        onJumpTime={handleJumpTime}
      />

      {/* 5. Global Command Palette (Cmd+K) */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        tickets={tickets}
        onSelectTicket={(t) => setSelectedTicketId(t.id)}
        onScopeChange={setScope}
        onJumpTime={handleJumpTime}
        onResetTime={handleResetTime}
      />
    </div>
  );
};
