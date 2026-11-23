import React, { useState } from 'react';
import { User } from '../types/index.js';
import { Search, ChevronDown, Check, Command, Sparkles } from 'lucide-react';

interface HeaderProps {
  currentUser: User | null;
  allStaff: User[];
  onSwitchUser: (email: string) => Promise<void>;
  onOpenCommandPalette: () => void;
  currentView?: 'agent' | 'landing' | 'customer' | 'outbox' | 'lead-dashboard' | 'admin' | 'proof';
  onViewChange?: (view: 'agent' | 'landing' | 'customer' | 'outbox' | 'lead-dashboard' | 'admin' | 'proof') => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  allStaff,
  onSwitchUser,
  onOpenCommandPalette,
  currentView = 'agent',
  onViewChange
}) => {
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const roleBadge = (role: string) => {
    switch (role) {
      case 'lead':
        return 'bg-purple-950/80 text-purple-300 border-purple-800/60';
      case 'admin':
        return 'bg-rose-950/80 text-rose-300 border-rose-800/60';
      default:
        return 'bg-blue-950/80 text-blue-300 border-blue-800/60';
    }
  };

  return (
    <header className="h-14 border-b border-zinc-800/80 bg-zinc-950/90 backdrop-blur-md px-4 flex items-center justify-between z-30 select-none">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-blue-500/20">
            F
          </div>
          <div>
            <div className="flex items-center gap-1.5 leading-none">
              <span className="font-bold tracking-tight text-zinc-100 text-sm">Frontdesk</span>
              <span className="text-[10px] uppercase font-mono px-1 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                Arvo
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-0.5">Support Operations</p>
          </div>
        </div>
      </div>

      {/* View Switcher Pills */}
      {onViewChange && (
        <div className="hidden lg:flex items-center gap-1 bg-zinc-900/90 p-1 rounded-lg border border-zinc-800 text-xs font-medium">
          <button
            onClick={() => onViewChange('agent')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              currentView === 'agent'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Console
          </button>
          <button
            onClick={() => onViewChange('lead-dashboard')}
            className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
              currentView === 'lead-dashboard'
                ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60 shadow-sm'
                : 'text-zinc-400 hover:text-purple-300'
            }`}
          >
            <span>Lead SLA</span>
          </button>
          <button
            onClick={() => onViewChange('admin')}
            className={`px-2.5 py-1 rounded-md transition-colors flex items-center gap-1 ${
              currentView === 'admin'
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60 shadow-sm'
                : 'text-zinc-400 hover:text-rose-300'
            }`}
          >
            <span>Admin</span>
          </button>
          <button
            onClick={() => onViewChange('customer')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              currentView === 'customer'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Customer
          </button>
          <button
            onClick={() => onViewChange('outbox')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              currentView === 'outbox'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Outbox
          </button>
          <button
            onClick={() => onViewChange('landing')}
            className={`px-2.5 py-1 rounded-md transition-colors ${
              currentView === 'landing'
                ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Tour
          </button>
        </div>
      )}

      {/* Middle: Command Palette Search Bar */}
      <div className="flex-1 max-w-md mx-4">
        <button
          onClick={onOpenCommandPalette}
          className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-900/90 hover:bg-zinc-800/80 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all text-xs group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300 transition-colors" />
            <span>Search tickets, commands, shortcuts...</span>
          </div>
          <div className="flex items-center gap-1 text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-400 border border-zinc-700/60">
            <Command className="w-2.5 h-2.5" />
            <span>K</span>
          </div>
        </button>
      </div>

      {/* Right: Demo User Switcher & Info */}
      <div className="flex items-center gap-3 relative">
        <div className="relative">
          <button
            onClick={() => setUserDropdownOpen(!userDropdownOpen)}
            className="flex items-center gap-2.5 py-1 px-2.5 rounded-lg bg-zinc-900 hover:bg-zinc-800/80 border border-zinc-800 text-left transition-all"
          >
            <div className="w-6 h-6 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[11px] font-semibold text-zinc-200">
              {currentUser?.name.charAt(0) || 'A'}
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-zinc-200">{currentUser?.name || 'Aria Chen'}</span>
                <span className={`text-[9px] uppercase font-bold px-1 rounded border ${roleBadge(currentUser?.role || 'lead')}`}>
                  {currentUser?.role || 'lead'}
                </span>
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
          </button>

          {/* User switcher dropdown */}
          {userDropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-1.5 w-64 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-50 py-1.5 divide-y divide-zinc-800/60 animate-in fade-in zoom-in-95 duration-100">
                <div className="px-3 py-2 text-[11px] text-zinc-400 flex items-center justify-between">
                  <span>Switch Demo Persona</span>
                  <Sparkles className="w-3 h-3 text-amber-400" />
                </div>
                <div className="max-h-64 overflow-y-auto py-1">
                  {allStaff.map((staff) => {
                    const isSelected = currentUser?.email === staff.email;
                    return (
                      <button
                        key={staff.id}
                        onClick={async () => {
                          setUserDropdownOpen(false);
                          await onSwitchUser(staff.email);
                        }}
                        className={`w-full px-3 py-2 text-left flex items-center justify-between text-xs hover:bg-zinc-800/60 transition-colors ${
                          isSelected ? 'bg-zinc-800/40 text-blue-400 font-medium' : 'text-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[10px]">
                            {staff.name.charAt(0)}
                          </div>
                          <div>
                            <div>{staff.name}</div>
                            <div className="text-[10px] text-zinc-500">{staff.email}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className={`text-[9px] uppercase px-1 rounded border ${roleBadge(staff.role)}`}>
                            {staff.role}
                          </span>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-400" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
