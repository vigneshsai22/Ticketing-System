import React, { useState, useEffect } from 'react';
import { api } from '../services/api.js';
import { User, Holiday, SlaPolicy, SystemSetting, CannedReply, UserRole } from '../types/index.js';
import {
  Calendar,
  Sliders,
  Users,
  MessageSquare,
  Plus,
  Trash2,
  Edit2,
  Check,
  AlertCircle,
  Info,
  ArrowUpRight,
  RefreshCw,
  Search
} from 'lucide-react';

interface AdminSettingsProps {
  currentUser: User | null;
  onBackToConsole: () => void;
  onStaffUpdated?: () => void;
}

type AdminTab = 'holidays' | 'policies' | 'users' | 'canned';

export const AdminSettings: React.FC<AdminSettingsProps> = ({
  onBackToConsole,
  onStaffUpdated
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('holidays');
  const [loading, setLoading] = useState(false);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // 1. Holiday State
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');
  const [addingHoliday, setAddingHoliday] = useState(false);

  // 2. SLA Policies & Settings State
  const [policies, setPolicies] = useState<SlaPolicy[]>([]);
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [editingPolicy, setEditingPolicy] = useState<SlaPolicy | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // 3. User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>('agent');
  const [addingUser, setAddingUser] = useState(false);

  // 4. Canned Replies State
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [cannedSearch, setCannedSearch] = useState('');
  const [newCannedTitle, setNewCannedTitle] = useState('');
  const [newCannedContent, setNewCannedContent] = useState('');
  const [newCannedShortcut, setNewCannedShortcut] = useState('');
  const [newCannedCategory, setNewCannedCategory] = useState('general');
  const [addingCanned, setAddingCanned] = useState(false);

  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  const showError = (msg: string) => {
    setErrorNotice(msg);
    setTimeout(() => setErrorNotice(null), 6000);
  };

  // Load active tab data
  useEffect(() => {
    const loadTabData = async () => {
      setLoading(true);
      setErrorNotice(null);
      try {
        if (activeTab === 'holidays') {
          const res = await api.getHolidays();
          setHolidays(res.holidays || []);
        } else if (activeTab === 'policies') {
          const [pRes, sRes] = await Promise.all([
            api.getSlaPolicies(),
            api.getSettings()
          ]);
          setPolicies(pRes.policies || []);
          setSettings(sRes.settings || []);
        } else if (activeTab === 'users') {
          const res = await api.getAdminUsers();
          setUsers(res.users || []);
        } else if (activeTab === 'canned') {
          const res = await api.getCannedReplies();
          setCannedReplies(res.replies || []);
        }
      } catch (err: unknown) {
        showError(err instanceof Error ? err.message : 'Failed to load configuration data');
      } finally {
        setLoading(false);
      }
    };
    loadTabData();
  }, [activeTab]);

  // --- 1. Holiday Handlers ---
  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayDate || !newHolidayName) return;
    try {
      const res = await api.createHoliday(newHolidayDate, newHolidayName);
      setHolidays((prev) => [...prev, res.holiday].sort((a, b) => a.date.localeCompare(b.date)));
      setNewHolidayDate('');
      setNewHolidayName('');
      setAddingHoliday(false);
      showSuccess(`Holiday "${res.holiday.name}" added and audited.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to add holiday');
    }
  };

  const handleDeleteHoliday = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete holiday "${name}"?`)) return;
    try {
      await api.deleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      showSuccess(`Holiday "${name}" deleted and audited.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete holiday');
    }
  };

  // --- 2. SLA Policies Handlers ---
  const handleSavePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPolicy) return;
    setSavingPolicy(true);
    try {
      const res = await api.updateSlaPolicy(editingPolicy.priority, {
        respond_minutes: Number(editingPolicy.respond_minutes),
        resolve_minutes: Number(editingPolicy.resolve_minutes),
        resolve_mode: editingPolicy.resolve_mode
      });
      setPolicies((prev) => prev.map((p) => (p.priority === editingPolicy.priority ? res.policy : p)));
      setEditingPolicy(null);
      showSuccess(res.notice);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update SLA policy');
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleUpdateSetting = async (key: string, value: unknown) => {
    try {
      const res = await api.updateSetting(key, value);
      setSettings((prev) => prev.map((s) => (s.key === key ? res.setting : s)));
      showSuccess(res.notice);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update setting');
    }
  };

  // --- 3. User Management Handlers ---
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName || !newUserEmail) return;
    try {
      const res = await api.createUser({
        name: newUserName,
        email: newUserEmail,
        role: newUserRole
      });
      setUsers((prev) => [...prev, res.user]);
      setNewUserName('');
      setNewUserEmail('');
      setAddingUser(false);
      onStaffUpdated?.();
      showSuccess(`Agent "${res.user.name}" created and audited.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleToggleUserActive = async (user: User) => {
    try {
      const res = await api.updateUser(user.id, { active: !user.active });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      onStaffUpdated?.();
      showSuccess(`User ${user.name} is now ${res.user.active ? 'Active' : 'Deactivated'}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update user status');
    }
  };

  const handleChangeUserRole = async (user: User, newRole: UserRole) => {
    try {
      const res = await api.updateUser(user.id, { role: newRole });
      setUsers((prev) => prev.map((u) => (u.id === user.id ? res.user : u)));
      onStaffUpdated?.();
      showSuccess(`User ${user.name} role changed to ${newRole}.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to update user role');
    }
  };

  // --- 4. Canned Replies Handlers ---
  const handleAddCannedReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCannedTitle || !newCannedContent) return;
    try {
      const res = await api.createCannedReply({
        title: newCannedTitle,
        content: newCannedContent,
        shortcut: newCannedShortcut || undefined,
        category: newCannedCategory || undefined
      });
      setCannedReplies((prev) => [...prev, res.canned_reply]);
      setNewCannedTitle('');
      setNewCannedContent('');
      setNewCannedShortcut('');
      setAddingCanned(false);
      showSuccess(`Canned reply "${res.canned_reply.title}" created.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to create canned reply');
    }
  };

  const handleDeleteCannedReply = async (id: string, title: string) => {
    if (!window.confirm(`Delete canned reply "${title}"?`)) return;
    try {
      await api.deleteCannedReply(id);
      setCannedReplies((prev) => prev.filter((c) => c.id !== id));
      showSuccess(`Canned reply "${title}" deleted.`);
    } catch (err: unknown) {
      showError(err instanceof Error ? err.message : 'Failed to delete canned reply');
    }
  };

  const filteredCannedReplies = cannedReplies.filter((c) => {
    if (!cannedSearch.trim()) return true;
    const q = cannedSearch.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      c.content.toLowerCase().includes(q) ||
      (c.shortcut && c.shortcut.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex-1 flex flex-col bg-zinc-950 text-zinc-100 overflow-y-auto">
      {/* 1. Header */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/60 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-800/50">
              Admin & Governance
            </span>
            <h1 className="text-xl font-bold tracking-tight text-zinc-100">
              System Configuration & Master Controls
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Audited management of operational holidays, SLA policies, staff access, and macro replies.
          </p>
        </div>

        <button
          onClick={onBackToConsole}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors shadow-sm"
        >
          <span>Agent Console</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 2. Feedback Alerts */}
      {successNotice && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {errorNotice && (
        <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorNotice}</span>
        </div>
      )}

      {/* 3. Navigation Tabs */}
      <div className="border-b border-zinc-800/80 bg-zinc-900/30 px-6 pt-3 flex gap-2 overflow-x-auto text-xs">
        <button
          onClick={() => setActiveTab('holidays')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg font-medium border-b-2 transition-all ${
            activeTab === 'holidays'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/80 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Holiday Calendar</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
            {holidays.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('policies')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg font-medium border-b-2 transition-all ${
            activeTab === 'policies'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/80 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>SLA Policies & Engine</span>
        </button>

        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg font-medium border-b-2 transition-all ${
            activeTab === 'users'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/80 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>User & Agent Management</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
            {users.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('canned')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-t-lg font-medium border-b-2 transition-all ${
            activeTab === 'canned'
              ? 'border-blue-500 text-blue-400 bg-zinc-900/80 font-semibold'
              : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span>Canned Replies</span>
          <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-800 text-zinc-400">
            {cannedReplies.length}
          </span>
        </button>
      </div>

      {/* 4. Tab Content */}
      <div className="p-6 max-w-6xl w-full mx-auto space-y-6">
        {loading && (
          <div className="flex items-center justify-center py-16 text-xs text-zinc-500">
            <RefreshCw className="w-4 h-4 animate-spin mr-2 text-blue-400" />
            Loading configuration data...
          </div>
        )}

        {/* ---------------- TAB 1: HOLIDAY CALENDAR ---------------- */}
        {!loading && activeTab === 'holidays' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Official Operating Holidays</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Business time calculations strictly pause and skip these calendar dates in Asia/Kolkata timezone.
                </p>
              </div>

              <button
                onClick={() => setAddingHoliday(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Holiday</span>
              </button>
            </div>

            {/* Add Holiday Form */}
            {addingHoliday && (
              <form
                onSubmit={handleAddHoliday}
                className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3 animate-in fade-in duration-150"
              >
                <h3 className="text-xs font-semibold text-zinc-200">Add New Official Holiday</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Date (YYYY-MM-DD)</label>
                    <input
                      type="date"
                      value={newHolidayDate}
                      onChange={(e) => setNewHolidayDate(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Holiday Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Republic Day"
                      value={newHolidayName}
                      onChange={(e) => setNewHolidayName(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddingHoliday(false)}
                    className="px-3 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 font-medium"
                  >
                    Save Holiday
                  </button>
                </div>
              </form>
            )}

            {/* Holidays Table */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 text-[11px]">
                    <th className="py-2.5 px-4 font-medium">Date</th>
                    <th className="py-2.5 px-4 font-medium">Holiday Name</th>
                    <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {holidays.map((h) => (
                    <tr key={h.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-2.5 px-4 font-mono text-zinc-300">
                        {typeof h.date === 'string' ? h.date.slice(0, 10) : new Date(h.date).toISOString().slice(0, 10)}
                      </td>
                      <td className="py-2.5 px-4 text-zinc-200 font-medium">{h.name}</td>
                      <td className="py-2.5 px-4 text-right">
                        <button
                          onClick={() => handleDeleteHoliday(h.id, h.name)}
                          className="p-1 rounded hover:bg-rose-950/50 text-zinc-500 hover:text-rose-400 transition-colors"
                          title="Delete holiday"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- TAB 2: SLA POLICIES & ENGINE ---------------- */}
        {!loading && activeTab === 'policies' && (
          <div className="space-y-6">
            {/* Audited Policy Notice Banner */}
            <div className="p-4 rounded-xl bg-blue-950/40 border border-blue-800/60 text-blue-300 text-xs flex items-start gap-3">
              <Info className="w-4 h-4 shrink-0 text-blue-400 mt-0.5" />
              <div>
                <strong className="font-semibold text-blue-200">SLA Governance & Immutability Rule:</strong>
                <p className="mt-0.5 text-blue-300/90 leading-relaxed">
                  All policy and setting adjustments are cryptographically recorded in the append-only audit trail. In accordance with operational business rules (documented in <code className="bg-blue-900/40 px-1 py-0.5 rounded font-mono">ASSUMPTIONS.md</code>), policy modifications apply <strong>exclusively to future ticket cycles</strong>. Existing active and historical ticket deadlines remain immutable.
                </p>
              </div>
            </div>

            {/* SLA Policies Table */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/90 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-100">SLA Priority Policies</h3>
                  <p className="text-[11px] text-zinc-400">Response and resolution target allocations by priority tier</p>
                </div>
              </div>

              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 text-[11px]">
                    <th className="py-2.5 px-4 font-medium">Priority</th>
                    <th className="py-2.5 px-4 font-medium">Response Target</th>
                    <th className="py-2.5 px-4 font-medium">Resolution Target</th>
                    <th className="py-2.5 px-4 font-medium">Resolution Rule</th>
                    <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {policies.map((p) => (
                    <tr key={p.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4 font-bold uppercase tracking-wider">
                        <span
                          className={`px-2 py-0.5 rounded border text-[10px] ${
                            p.priority === 'urgent'
                              ? 'bg-rose-950/80 text-rose-300 border-rose-800/60'
                              : p.priority === 'medium'
                              ? 'bg-amber-950/80 text-amber-300 border-amber-800/60'
                              : 'bg-blue-950/80 text-blue-300 border-blue-800/60'
                          }`}
                        >
                          {p.priority}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-200">
                        {p.respond_minutes} mins ({Math.round((p.respond_minutes / 60) * 10) / 10}h)
                      </td>
                      <td className="py-3 px-4 font-mono text-zinc-200">
                        {p.resolve_mode === 'end_of_response_day' ? (
                          <span className="text-amber-400">End of response day (18:30)</span>
                        ) : (
                          `${p.resolve_minutes} mins (${Math.round((p.resolve_minutes / 540) * 10) / 10} business days)`
                        )}
                      </td>
                      <td className="py-3 px-4 text-zinc-400">
                        {p.resolve_mode === 'end_of_response_day'
                          ? 'Resolve due at 18:30 IST on day of response deadline'
                          : 'Standard business time accumulation'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setEditingPolicy({ ...p })}
                          className="flex items-center gap-1 px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors ml-auto text-[11px]"
                        >
                          <Edit2 className="w-3 h-3 text-blue-400" />
                          <span>Configure</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Policy Edit Modal */}
            {editingPolicy && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-100">
                <form
                  onSubmit={handleSavePolicy}
                  className="bg-zinc-900 border border-zinc-800 rounded-xl max-w-md w-full p-5 space-y-4 shadow-2xl"
                >
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
                    <h3 className="font-semibold text-sm text-zinc-100 flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-blue-400" />
                      <span>Configure {editingPolicy.priority.toUpperCase()} SLA Policy</span>
                    </h3>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-zinc-400 mb-1">Response Target (Minutes)</label>
                      <input
                        type="number"
                        min="1"
                        value={editingPolicy.respond_minutes}
                        onChange={(e) =>
                          setEditingPolicy({ ...editingPolicy, respond_minutes: Number(e.target.value) })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-zinc-400 mb-1">Resolution Mode</label>
                      <select
                        value={editingPolicy.resolve_mode}
                        onChange={(e) =>
                          setEditingPolicy({
                            ...editingPolicy,
                            resolve_mode: e.target.value as 'fixed_minutes' | 'end_of_response_day'
                          })
                        }
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="fixed_minutes">Fixed Business Minutes</option>
                        <option value="end_of_response_day">
                          End of Working Day Containing Response Deadline (18:30 IST)
                        </option>
                      </select>
                    </div>

                    {editingPolicy.resolve_mode === 'fixed_minutes' && (
                      <div>
                        <label className="block text-zinc-400 mb-1">Resolution Target (Minutes)</label>
                        <input
                          type="number"
                          min="1"
                          value={editingPolicy.resolve_minutes}
                          onChange={(e) =>
                            setEditingPolicy({ ...editingPolicy, resolve_minutes: Number(e.target.value) })
                          }
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-zinc-200 font-mono focus:outline-none focus:border-blue-500"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-2 flex items-center justify-end gap-2 border-t border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setEditingPolicy(null)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingPolicy}
                      className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white shadow-sm flex items-center gap-1.5"
                    >
                      {savingPolicy && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                      <span>Save & Audit Policy</span>
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* System Engine Settings */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
              <div className="p-4 border-b border-zinc-800 bg-zinc-900/90">
                <h3 className="text-sm font-semibold text-zinc-100">Engine Operational Settings</h3>
                <p className="text-[11px] text-zinc-400">Core parameters governing working hours, auto-close, and reopen windows</p>
              </div>

              <div className="p-4 space-y-4 text-xs">
                {settings.map((s) => (
                  <div
                    key={s.key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg bg-zinc-950/60 border border-zinc-800/60"
                  >
                    <div>
                      <span className="font-mono font-semibold text-zinc-200">{s.key}</span>
                      <p className="text-zinc-500 text-[11px] mt-0.5">{s.description || 'System engine parameter'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-zinc-300 bg-zinc-900 px-2.5 py-1 rounded border border-zinc-800">
                        {typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value)}
                      </span>
                      <button
                        onClick={() => {
                          const currentValStr = typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value);
                          const input = window.prompt(`Update setting "${s.key}":`, currentValStr);
                          if (input !== null && input.trim() !== '') {
                            try {
                              const parsed = JSON.parse(input);
                              handleUpdateSetting(s.key, parsed);
                            } catch {
                              const num = Number(input);
                              handleUpdateSetting(s.key, isNaN(num) ? input : num);
                            }
                          }
                        }}
                        className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] transition-colors"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ---------------- TAB 3: USER & AGENT MANAGEMENT ---------------- */}
        {!loading && activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Team Roster & Role Permissions</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Manage agent accounts, managerial roles (lead/admin), and active availability status.
                </p>
              </div>

              <button
                onClick={() => setAddingUser(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Staff Member</span>
              </button>
            </div>

            {/* Add User Form */}
            {addingUser && (
              <form
                onSubmit={handleAddUser}
                className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3 animate-in fade-in duration-150"
              >
                <h3 className="text-xs font-semibold text-zinc-200">Provision New Support Staff</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Maya Patel"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="e.g. maya.patel@arvo.internal"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Initial Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="agent">Support Agent</option>
                      <option value="lead">Team Lead</option>
                      <option value="admin">Administrator</option>
                    </select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddingUser(false)}
                    className="px-3 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 font-medium"
                  >
                    Provision Staff
                  </button>
                </div>
              </form>
            )}

            {/* Users Table */}
            <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-xl overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-950/60 text-zinc-400 text-[11px]">
                    <th className="py-2.5 px-4 font-medium">Name & Email</th>
                    <th className="py-2.5 px-4 font-medium">Role</th>
                    <th className="py-2.5 px-4 font-medium">Status</th>
                    <th className="py-2.5 px-4 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-800/40 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-zinc-200">{u.name}</div>
                        <div className="text-[11px] text-zinc-500">{u.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={u.role}
                          onChange={(e) => handleChangeUserRole(u, e.target.value as UserRole)}
                          className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                        >
                          <option value="agent">Agent</option>
                          <option value="lead">Lead</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            u.active
                              ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                              : 'bg-zinc-800 text-zinc-500 border border-zinc-700/60'
                          }`}
                        >
                          {u.active ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleToggleUserActive(u)}
                          className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
                            u.active
                              ? 'bg-rose-950/50 hover:bg-rose-900/60 text-rose-300 border border-rose-800/50'
                              : 'bg-emerald-950/50 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/50'
                          }`}
                        >
                          {u.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ---------------- TAB 4: CANNED REPLIES ---------------- */}
        {!loading && activeTab === 'canned' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">Standardized Canned Replies</h2>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Team-wide response macros available to all support agents in the response composer.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    placeholder="Search replies..."
                    value={cannedSearch}
                    onChange={(e) => setCannedSearch(e.target.value)}
                    className="bg-zinc-900 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <button
                  onClick={() => setAddingCanned(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Canned Reply</span>
                </button>
              </div>
            </div>

            {/* Add Canned Reply Form */}
            {addingCanned && (
              <form
                onSubmit={handleAddCannedReply}
                className="p-4 rounded-xl bg-zinc-900 border border-zinc-800 space-y-3 animate-in fade-in duration-150"
              >
                <h3 className="text-xs font-semibold text-zinc-200">Create New Canned Reply</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Request Logs"
                      value={newCannedTitle}
                      onChange={(e) => setNewCannedTitle(e.target.value)}
                      required
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Shortcut (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. /logs"
                      value={newCannedShortcut}
                      onChange={(e) => setNewCannedShortcut(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Category</label>
                    <select
                      value={newCannedCategory}
                      onChange={(e) => setNewCannedCategory(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                    >
                      <option value="general">General</option>
                      <option value="troubleshooting">Troubleshooting</option>
                      <option value="closing">Closing / Resolved</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-zinc-400 mb-1">Response Content</label>
                  <textarea
                    rows={4}
                    placeholder="Enter template message text..."
                    value={newCannedContent}
                    onChange={(e) => setNewCannedContent(e.target.value)}
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-200 focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setAddingCanned(false)}
                    className="px-3 py-1 rounded-lg bg-zinc-800 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 rounded-lg bg-blue-600 text-xs text-white hover:bg-blue-500 font-medium"
                  >
                    Save Canned Reply
                  </button>
                </div>
              </form>
            )}

            {/* Canned Replies Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCannedReplies.map((c) => (
                <div
                  key={c.id}
                  className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 flex flex-col justify-between shadow-sm"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-zinc-200">{c.title}</span>
                        {c.shortcut && (
                          <span className="text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-blue-400 border border-zinc-700/60">
                            {c.shortcut}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => handleDeleteCannedReply(c.id, c.title)}
                        className="p-1 rounded hover:bg-rose-950/50 text-zinc-500 hover:text-rose-400 transition-colors"
                        title="Delete reply"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-zinc-400 line-clamp-3 leading-relaxed bg-zinc-950/60 p-2.5 rounded-lg border border-zinc-850 font-sans">
                      {c.content}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-800/60 pt-2">
                    <span className="uppercase tracking-wider text-[10px]">{c.category || 'general'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
