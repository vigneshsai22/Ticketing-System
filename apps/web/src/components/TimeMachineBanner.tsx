import React, { useState } from 'react';
import { TimeMachineState } from '../types/index.js';
import { Clock, RotateCcw, FastForward, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';

interface TimeMachineBannerProps {
  timeState: TimeMachineState | null;
  onJump: (target: string) => Promise<void>;
  onShift: (params: { minutes?: number; hours?: number; days?: number }) => Promise<void>;
  onReset: () => Promise<void>;
  onRunScheduler: () => Promise<void>;
}

export const TimeMachineBanner: React.FC<TimeMachineBannerProps> = ({
  timeState,
  onJump,
  onShift,
  onReset,
  onRunScheduler
}) => {
  const [expanded, setExpanded] = useState(false);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  if (!timeState) return null;

  const handleAction = async (name: string, fn: () => Promise<void>) => {
    try {
      setLoadingAction(name);
      await fn();
    } finally {
      setLoadingAction(null);
    }
  };

  const isShifted = timeState.is_shifted;

  return (
    <div className={`w-full border-b transition-colors z-40 ${
      isShifted
        ? 'bg-amber-950/80 border-amber-800/80 text-amber-200'
        : 'bg-zinc-900/90 border-zinc-800 text-zinc-300'
    } backdrop-blur-md px-4 py-2`}>
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Left: Time & Status */}
        <div className="flex items-center gap-2.5">
          <div className={`p-1.5 rounded-md ${isShifted ? 'bg-amber-500/20 text-amber-300' : 'bg-zinc-800 text-zinc-400'}`}>
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-semibold tracking-wide uppercase text-[10px] px-1.5 py-0.5 rounded bg-black/40 border border-white/10">
                {timeState.banner.label}
              </span>
              <span className="font-mono text-zinc-100 font-medium">
                {timeState.banner.formatted_time || new Date(timeState.current_time).toLocaleString()}
              </span>
            </div>
            {isShifted && (
              <p className="text-[11px] text-amber-300/90 font-medium mt-0.5">
                {timeState.banner.message}
              </p>
            )}
          </div>
        </div>

        {/* Right: Quick Jump Presets */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-zinc-400 mr-1 hidden sm:inline">Jumps:</span>
          
          <button
            onClick={() => handleAction('fri', () => onJump('Friday 18:00'))}
            disabled={loadingAction !== null}
            className="px-2.5 py-1 rounded bg-black/30 hover:bg-black/50 border border-white/10 hover:border-white/20 transition-all text-zinc-200 disabled:opacity-50"
            title="Jump to Friday 18:00 IST (INC-0001 urgent arrival)"
          >
            Fri 18:00
          </button>

          <button
            onClick={() => handleAction('sat', () => onJump('Saturday'))}
            disabled={loadingAction !== null}
            className="px-2.5 py-1 rounded bg-black/30 hover:bg-black/50 border border-white/10 hover:border-white/20 transition-all text-zinc-200 disabled:opacity-50"
            title="Jump to Saturday noon (off-hours pause check)"
          >
            Saturday
          </button>

          <button
            onClick={() => handleAction('mon', () => onJump('Monday 11:01'))}
            disabled={loadingAction !== null}
            className="px-2.5 py-1 rounded bg-black/30 hover:bg-black/50 border border-white/10 hover:border-white/20 transition-all text-zinc-200 disabled:opacity-50"
            title="Jump to Monday 11:01 IST (1m past urgent response SLA)"
          >
            Mon 11:01
          </button>

          <button
            onClick={() => handleAction('+1d', () => onJump('+1 working day'))}
            disabled={loadingAction !== null}
            className="px-2.5 py-1 rounded bg-black/30 hover:bg-black/50 border border-white/10 hover:border-white/20 transition-all text-zinc-200 disabled:opacity-50 flex items-center gap-1"
            title="Advance +540 business minutes forward"
          >
            <FastForward className="w-3 h-3" />
            +1 Day
          </button>

          <button
            onClick={() => handleAction('sched', onRunScheduler)}
            disabled={loadingAction !== null}
            className="px-2.5 py-1 rounded bg-blue-950/60 hover:bg-blue-900/60 border border-blue-700/60 transition-all text-blue-200 disabled:opacity-50 flex items-center gap-1"
            title="Trigger an on-demand scheduler pass"
          >
            <RefreshCw className={`w-3 h-3 ${loadingAction === 'sched' ? 'animate-spin' : ''}`} />
            Run SLA
          </button>

          {isShifted && (
            <button
              onClick={() => handleAction('reset', onReset)}
              disabled={loadingAction !== null}
              className="px-2.5 py-1 rounded bg-rose-950/60 hover:bg-rose-900/60 border border-rose-700/60 transition-all text-rose-200 disabled:opacity-50 flex items-center gap-1"
              title="Revert offset to real wall clock"
            >
              <RotateCcw className="w-3 h-3" />
              Reset Time
            </button>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 rounded bg-black/20 hover:bg-black/40 border border-white/10 text-zinc-400 hover:text-zinc-200 transition-all"
            title="Toggle more simulation controls"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Expanded Custom Shift Drawer */}
      {expanded && (
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-white/10 flex flex-wrap items-center gap-2">
          <span className="text-zinc-400">Custom Shift:</span>
          <button
            onClick={() => handleAction('+15m', () => onShift({ minutes: 15 }))}
            className="px-2 py-0.5 rounded bg-black/40 hover:bg-black/60 border border-white/10 text-zinc-300"
          >
            +15 mins
          </button>
          <button
            onClick={() => handleAction('+1h', () => onShift({ hours: 1 }))}
            className="px-2 py-0.5 rounded bg-black/40 hover:bg-black/60 border border-white/10 text-zinc-300"
          >
            +1 hour
          </button>
          <button
            onClick={() => handleAction('+4h', () => onShift({ hours: 4 }))}
            className="px-2 py-0.5 rounded bg-black/40 hover:bg-black/60 border border-white/10 text-zinc-300"
          >
            +4 hours
          </button>
          <button
            onClick={() => handleAction('+1day', () => onShift({ days: 1 }))}
            className="px-2 py-0.5 rounded bg-black/40 hover:bg-black/60 border border-white/10 text-zinc-300"
          >
            +24 hours
          </button>
        </div>
      )}
    </div>
  );
};
