import React, { useState } from 'react';
import { Ticket, CannedReply } from '../types/index.js';
import { Lock, MessageSquare, Send, Clock, Eye, Sparkles } from 'lucide-react';

interface ComposerProps {
  ticket: Ticket;
  cannedReplies: CannedReply[];
  onSendPublicReply: (body: string, waitOnCustomer: boolean) => Promise<void>;
  onSendInternalNote: (body: string) => Promise<void>;
  onOpenCustomerPreview: () => void;
  disabled?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  ticket,
  cannedReplies,
  onSendPublicReply,
  onSendInternalNote,
  onOpenCustomerPreview,
  disabled
}) => {
  const [mode, setMode] = useState<'reply' | 'note'>('reply');
  const [body, setBody] = useState('');
  const [waitOnCustomer, setWaitOnCustomer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cannedMenuOpen, setCannedMenuOpen] = useState(false);

  const isReply = mode === 'reply';

  const handleSend = async (customWait?: boolean) => {
    if (!body.trim() || submitting || disabled) return;
    setSubmitting(true);
    try {
      if (isReply) {
        await onSendPublicReply(body.trim(), customWait ?? waitOnCustomer);
      } else {
        await onSendInternalNote(body.trim());
      }
      setBody('');
      setWaitOnCustomer(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  };

  const insertCannedReply = (content: string) => {
    setBody((prev) => (prev ? `${prev}\n\n${content}` : content));
    setCannedMenuOpen(false);
  };

  return (
    <div className={`border-t transition-colors ${
      isReply ? 'border-blue-900/60 bg-blue-950/10' : 'border-amber-900/60 bg-amber-950/10'
    } p-4`}>
      {/* Top Composer Bar: Mode Toggle + Target Visibility Notice + Canned Replies */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        {/* Mode Selector Tabs */}
        <div className="flex items-center gap-1 rounded-lg bg-zinc-900 p-0.5 border border-zinc-800 text-xs">
          <button
            type="button"
            onClick={() => setMode('reply')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              isReply
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Reply to customer</span>
          </button>

          <button
            type="button"
            onClick={() => setMode('note')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-semibold transition-all ${
              !isReply
                ? 'bg-amber-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Internal note</span>
          </button>
        </div>

        {/* Visibility Info & Action Triggers */}
        <div className="flex items-center gap-2 text-xs">
          {/* Target Visibility notice */}
          <div className={`px-2 py-1 rounded text-[11px] font-medium border ${
            isReply
              ? 'bg-blue-950/80 text-blue-300 border-blue-800/60'
              : 'bg-amber-950/80 text-amber-300 border-amber-800/60'
          }`}>
            {isReply ? (
              <span>Visible to: <strong className="font-semibold text-white">{ticket.customer_email || 'Customer'}</strong></span>
            ) : (
              <span>Team only • Never visible to customer</span>
            )}
          </div>

          {/* Canned Replies insertion menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setCannedMenuOpen(!cannedMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-xs"
              title="Insert canned reply"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Canned</span>
            </button>

            {cannedMenuOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setCannedMenuOpen(false)} />
                <div className="absolute right-0 bottom-full mb-2 w-72 bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl z-30 py-1.5 animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-zinc-400 border-b border-zinc-800">
                    Insert Canned Reply
                  </div>
                  <div className="max-h-56 overflow-y-auto divide-y divide-zinc-800/50">
                    {cannedReplies.map((cr) => (
                      <button
                        key={cr.id}
                        onClick={() => insertCannedReply(cr.content)}
                        className="w-full text-left px-3 py-2 hover:bg-zinc-800 text-xs text-zinc-200 transition-colors"
                      >
                        <div className="font-medium text-white flex items-center justify-between">
                          <span>{cr.title}</span>
                          {cr.shortcut && (
                            <span className="font-mono text-[10px] text-zinc-500 bg-zinc-800 px-1 rounded">
                              {cr.shortcut}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 line-clamp-1 mt-0.5">{cr.content}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Preview as customer button */}
          <button
            type="button"
            onClick={onOpenCustomerPreview}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all text-xs"
            title="Inspect thread as seen by customer"
          >
            <Eye className="w-3.5 h-3.5 text-zinc-400" />
            <span>Preview as customer</span>
          </button>
        </div>
      </div>

      {/* Composer Textarea */}
      <div className="relative rounded-xl border border-zinc-800 bg-zinc-900 focus-within:border-zinc-700 transition-colors">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isReply
              ? 'Draft a public response to the customer (supports Markdown)...'
              : 'Add a private internal note for the team (never visible to customer)...'
          }
          rows={4}
          disabled={disabled || submitting}
          className="w-full bg-transparent px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none font-sans"
        />

        {/* Bottom Actions Row inside textarea */}
        <div className="flex items-center justify-between px-3 py-2 border-t border-zinc-800/80 bg-zinc-950/40 rounded-b-xl text-xs">
          {/* Left: Optional Wait on Customer toggle (Reply mode only) */}
          <div>
            {isReply && (
              <label className="flex items-center gap-2 cursor-pointer text-zinc-300 hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={waitOnCustomer}
                  onChange={(e) => setWaitOnCustomer(e.target.checked)}
                  className="rounded border-zinc-700 bg-zinc-800 text-blue-600 focus:ring-0 focus:ring-offset-0"
                />
                <span className="text-[11px] flex items-center gap-1">
                  <Clock className="w-3 h-3 text-blue-400" />
                  <span>Send and wait on customer (pauses SLA clocks)</span>
                </span>
              </label>
            )}
          </div>

          {/* Right: Send Button with explicit mode reflection */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 hidden sm:inline font-mono">
              Cmd+Enter
            </span>

            {isReply && (
              <button
                type="button"
                onClick={() => handleSend(true)}
                disabled={!body.trim() || submitting || disabled}
                className="px-3 py-1.5 rounded-lg bg-blue-900/60 hover:bg-blue-800/70 border border-blue-700/60 text-blue-200 font-semibold text-xs transition-all disabled:opacity-40"
              >
                Send & Wait
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSend()}
              disabled={!body.trim() || submitting || disabled}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg font-semibold text-xs text-white shadow-sm transition-all disabled:opacity-40 ${
                isReply
                  ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-500/20'
                  : 'bg-amber-600 hover:bg-amber-500 shadow-amber-500/20'
              }`}
            >
              <Send className="w-3.5 h-3.5" />
              <span>
                {isReply ? 'Send Public Reply' : 'Save Internal Note'}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
