import React from 'react';
import { UserCheck } from 'lucide-react';

interface ClaimConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentOwnerName: string;
  onRefresh: () => void;
}

export const ClaimConflictModal: React.FC<ClaimConflictModalProps> = ({
  isOpen,
  onClose,
  currentOwnerName,
  onRefresh
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-100">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-5 text-xs text-zinc-200 text-center">
        <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center mb-3">
          <UserCheck className="w-6 h-6" />
        </div>

        <h3 className="text-sm font-bold text-white mb-1">Ticket Already Claimed</h3>
        <p className="text-zinc-400 leading-relaxed mb-4">
          <strong className="text-white font-semibold">{currentOwnerName || 'Another agent'}</strong> claimed this ticket moments ago. To avoid conflicting replies, ownership was awarded to them.
        </p>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium transition-colors"
          >
            Dismiss
          </button>
          <button
            onClick={() => {
              onRefresh();
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors"
          >
            View Updated Ticket
          </button>
        </div>
      </div>
    </div>
  );
};
