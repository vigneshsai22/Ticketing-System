import React, { useState } from 'react';
import {
  Compass,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  ArrowRight,
  Lock,
  Eye,
  PauseCircle,
  Clock
} from 'lucide-react';

interface GuidedTourProps {
  onOpenCustomerPreview?: () => void;
  onJumpTime?: (target: string) => Promise<void>;
  onClaimFirstUnassigned?: () => void;
  onFocusComposer?: (mode: 'reply' | 'note') => void;
}

export const GuidedTour: React.FC<GuidedTourProps> = ({
  onOpenCustomerPreview,
  onJumpTime,
  onFocusComposer
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [minimized, setMinimized] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const steps = [
    {
      title: 'Step 1: Take a Ticket (Atomic Claim)',
      desc: 'Claim an unassigned ticket like INC-0001 from the queue. Notice the atomic update prevents collision race conditions with 409 conflict handling.',
      icon: <Sparkles className="w-4 h-4 text-blue-400" />,
      actionLabel: 'Focus Ticket',
      action: () => {}
    },
    {
      title: 'Step 2: Add an Internal Note (Zero-Leakage)',
      desc: 'Switch the composer toggle to "Internal note" (amber). Write confidential notes that are strictly isolated in a separate database table.',
      icon: <Lock className="w-4 h-4 text-amber-400" />,
      actionLabel: 'Switch to Note',
      action: () => onFocusComposer?.('note')
    },
    {
      title: 'Step 3: Preview as Customer (Canary Safe)',
      desc: 'Click "Preview as customer" to view the ticket exactly as rendered through customer_visible_events. Notice confidential notes are completely absent.',
      icon: <Eye className="w-4 h-4 text-cyan-400" />,
      actionLabel: 'Open Preview',
      action: () => onOpenCustomerPreview?.()
    },
    {
      title: 'Step 4: Send & Wait on Customer (Pause Clocks)',
      desc: 'Compose a public reply with "Send and wait on customer" checked. Watch both SLA clocks pause and record a pause segment in the SLA ribbon.',
      icon: <PauseCircle className="w-4 h-4 text-cyan-400" />,
      actionLabel: 'Switch to Reply',
      action: () => onFocusComposer?.('reply')
    },
    {
      title: 'Step 5: Jump the Time Machine (SLA Engine)',
      desc: 'Use the Time Machine banner above to jump to "Monday 11:01" or "+1 working day". The automated scheduler will evaluate breach deadlines and auto-close windows.',
      icon: <Clock className="w-4 h-4 text-purple-400" />,
      actionLabel: 'Jump to Monday',
      action: () => onJumpTime?.('Monday 11:01')
    }
  ];

  if (dismissed) return null;

  if (minimized) {
    return (
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-40 bg-zinc-900 border border-zinc-700/80 rounded-full px-3 py-1.5 shadow-xl flex items-center gap-2 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-all hover:scale-105"
      >
        <Compass className="w-3.5 h-3.5 text-blue-400 animate-spin" style={{ animationDuration: '8s' }} />
        <span>Resume Guided Tour ({currentStep + 1}/5)</span>
      </button>
    );
  }

  const step = steps[currentStep];

  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-lg w-full bg-zinc-900/95 border border-zinc-700/80 rounded-2xl shadow-2xl p-4 backdrop-blur-md animate-in slide-in-from-bottom-5 duration-200">
      <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5 mb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
            <Compass className="w-3.5 h-3.5" />
          </div>
          <span className="text-xs font-bold text-zinc-100">Guided Evaluator Tour</span>
          <span className="text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700">
            {currentStep + 1} of {steps.length}
          </span>
        </div>

        <div className="flex items-center gap-1 text-zinc-400">
          <button
            onClick={() => setMinimized(true)}
            className="p-1 hover:text-zinc-200 text-xs"
            title="Minimize tour"
          >
            Minimize
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1 hover:text-zinc-200"
            title="Close tour"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-zinc-950 border border-zinc-800 shrink-0 mt-0.5">
          {step.icon}
        </div>
        <div className="flex-1 text-xs">
          <h4 className="font-semibold text-zinc-100">{step.title}</h4>
          <p className="text-zinc-400 mt-1 leading-relaxed text-[11px]">{step.desc}</p>
        </div>
      </div>

      <div className="flex items-center justify-between pt-3 mt-3 border-t border-zinc-800/80">
        <div className="flex items-center gap-1">
          {steps.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentStep(i)}
              className={`w-2 h-2 rounded-full transition-all ${
                i === currentStep ? 'bg-blue-500 w-4' : 'bg-zinc-700 hover:bg-zinc-500'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center gap-2">
          {step.actionLabel && (
            <button
              onClick={step.action}
              className="px-2.5 py-1 rounded-md bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 border border-blue-500/40 text-[11px] font-medium flex items-center gap-1 transition-colors"
            >
              <span>{step.actionLabel}</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={() => setCurrentStep((prev) => Math.max(0, prev - 1))}
            disabled={currentStep === 0}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setCurrentStep((prev) => Math.min(steps.length - 1, prev + 1))}
            disabled={currentStep === steps.length - 1}
            className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 text-zinc-300"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};
