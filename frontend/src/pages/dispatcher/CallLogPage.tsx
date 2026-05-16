import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneDisconnect,
  MagnifyingGlass,
  Funnel,
  LinkSimple,
  ArrowClockwise,
} from '@phosphor-icons/react';
import { formatDistanceToNow, format } from 'date-fns';
import api from '../../api/client';
import { CallLog, CallDirection, CallStatus, ActiveCall } from '../../types/api';
import { useActiveCalls } from '../../hooks/useActiveCalls';
import { useNotificationStore } from '../../stores/notificationStore';
import { socket } from '../../lib/socket';

const DIRECTION_ICONS: Record<CallDirection, JSX.Element> = {
  INBOUND:  <PhoneIncoming  size={16} weight="bold" className="text-brand-green" />,
  OUTBOUND: <PhoneOutgoing  size={16} weight="bold" className="text-brand-teal" />,
  INTERNAL: <Phone          size={16} weight="bold" className="text-slate-400" />,
};

const STATUS_STYLES: Record<CallStatus | 'RINGING', string> = {
  ANSWERED:  'bg-brand-green/10 text-brand-green',
  NO_ANSWER: 'bg-slate-100 text-slate-500',
  BUSY:      'bg-amber-50 text-amber-600',
  FAILED:    'bg-status-danger/10 text-status-danger',
  RINGING:   'bg-blue-50 text-blue-600',
};

function formatDuration(seconds: number): string {
  if (!seconds) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export default function CallLogPage() {
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();
  const activeCalls = useActiveCalls();

  const [search, setSearch]           = useState('');
  const [direction, setDirection]     = useState('');
  const [status, setStatus]           = useState('');
  const [daysBack, setDaysBack]       = useState('7');
  const [linkModal, setLinkModal]     = useState<{ callId: string; logId: string } | null>(null);
  const [caseNumber, setCaseNumber]   = useState('');

  const from = new Date(Date.now() - parseInt(daysBack) * 86_400_000).toISOString();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['pbx', 'cdr', direction, status, daysBack, search],
    queryFn: async () => {
      const params = new URLSearchParams({ from, limit: '100' });
      if (direction) params.set('direction', direction);
      if (status)    params.set('status', status);
      if (search)    params.set('search', search);
      const res = await api.get(`/pbx/cdr?${params}`);
      return res.data.data as CallLog[];
    },
  });

  // Real-time: refresh CDR list when a call ends
  useEffect(() => {
    socket.connect();
    const handler = () => queryClient.invalidateQueries({ queryKey: ['pbx', 'cdr'] });
    socket.on('pbx:call:ended', handler);
    return () => { socket.off('pbx:call:ended', handler); };
  }, [queryClient]);

  const linkMutation = useMutation({
    mutationFn: async ({ logId, incidentId }: { logId: string; incidentId: string }) =>
      api.patch(`/pbx/cdr/${logId}/link`, { incidentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pbx', 'cdr'] });
      setLinkModal(null);
      setCaseNumber('');
      addNotification({ type: 'success', title: 'Call Linked', message: 'Call log linked to incident.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Link Failed', message: err?.response?.data?.message || 'Could not link call.' });
    },
  });

  async function handleLinkSubmit() {
    if (!linkModal || !caseNumber.trim()) return;
    // Resolve case number → incident id
    try {
      const res = await api.get(`/incidents?search=${encodeURIComponent(caseNumber.trim())}&limit=1`);
      const incidents = res.data.data as Array<{ id: string; caseNumber: string }>;
      const match = incidents.find(i => i.caseNumber.toLowerCase() === caseNumber.trim().toLowerCase());
      if (!match) {
        addNotification({ type: 'error', title: 'Not Found', message: `Case "${caseNumber}" not found.` });
        return;
      }
      linkMutation.mutate({ logId: linkModal.logId, incidentId: match.id });
    } catch {
      addNotification({ type: 'error', title: 'Error', message: 'Could not search incidents.' });
    }
  }

  const logs = data ?? [];

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-6 max-w-[1600px] mx-auto w-full">
      {/* Header */}
      <div className="bg-white p-5 rounded-xl border border-surface-border flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-brand-teal">Call Logs</h1>
          <p className="text-xs text-slate-text mt-0.5">Yeastar PBX — all inbound, outbound, and internal calls</p>
        </div>
        <button
          onClick={() => refetch()}
          className="p-2.5 border border-surface-border rounded-lg text-slate-500 hover:bg-slate-50 transition-all"
          title="Refresh"
        >
          <ArrowClockwise size={18} weight="bold" />
        </button>
      </div>

      {/* Active calls banner */}
      {activeCalls.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex flex-col gap-2">
          <p className="text-xs font-black uppercase tracking-widest text-blue-700">
            {activeCalls.length} Active Call{activeCalls.length > 1 ? 's' : ''}
          </p>
          <div className="flex flex-col gap-1.5">
            {activeCalls.map((c: ActiveCall) => (
              <div key={c.callId} className="flex items-center gap-3 text-sm text-blue-800">
                <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                <span className="font-semibold">{c.callFrom}</span>
                <span className="text-blue-400">→</span>
                <span className="font-semibold">{c.callTo}</span>
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${STATUS_STYLES.RINGING}`}>
                  {c.status === 'ANSWERED' ? 'Answered' : 'Ringing'}
                </span>
                <span className="text-xs text-blue-400 ml-auto">
                  {formatDistanceToNow(new Date(c.startedAt), { addSuffix: true })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48 group">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-green" size={16} weight="bold" />
          <input
            type="text"
            placeholder="Search number..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 border border-surface-border rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-brand-green outline-none text-sm font-semibold text-brand-teal transition-all"
          />
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <Funnel size={16} weight="bold" />
        </div>

        <select
          value={direction}
          onChange={e => setDirection(e.target.value)}
          className="border border-surface-border rounded-lg px-3 py-2.5 text-xs font-black uppercase tracking-widest text-brand-teal bg-slate-50 outline-none focus:ring-2 focus:ring-brand-green cursor-pointer"
        >
          <option value="">All Directions</option>
          <option value="INBOUND">Inbound</option>
          <option value="OUTBOUND">Outbound</option>
          <option value="INTERNAL">Internal</option>
        </select>

        <select
          value={status}
          onChange={e => setStatus(e.target.value)}
          className="border border-surface-border rounded-lg px-3 py-2.5 text-xs font-black uppercase tracking-widest text-brand-teal bg-slate-50 outline-none focus:ring-2 focus:ring-brand-green cursor-pointer"
        >
          <option value="">All Statuses</option>
          <option value="ANSWERED">Answered</option>
          <option value="NO_ANSWER">No Answer</option>
          <option value="BUSY">Busy</option>
          <option value="FAILED">Failed</option>
        </select>

        <select
          value={daysBack}
          onChange={e => setDaysBack(e.target.value)}
          className="border border-surface-border rounded-lg px-3 py-2.5 text-xs font-black uppercase tracking-widest text-brand-teal bg-slate-50 outline-none focus:ring-2 focus:ring-brand-green cursor-pointer"
        >
          <option value="1">Today</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-surface-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-slate-text font-semibold">Loading call logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-10 text-center text-slate-text font-semibold">No call records found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-slate-50 text-xs font-black uppercase tracking-widest text-slate-400">
                  <th className="px-4 py-3 text-left">Direction</th>
                  <th className="px-4 py-3 text-left">From</th>
                  <th className="px-4 py-3 text-left">To</th>
                  <th className="px-4 py-3 text-left">Date / Time</th>
                  <th className="px-4 py-3 text-left">Duration</th>
                  <th className="px-4 py-3 text-left">Talk</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Incident</th>
                  <th className="px-4 py-3 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} className="border-b border-surface-border/50 hover:bg-slate-50/50 transition-all">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {DIRECTION_ICONS[log.direction]}
                        <span className="text-xs font-bold text-slate-500 capitalize">{log.direction.toLowerCase()}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-brand-teal">{log.callFrom}</td>
                    <td className="px-4 py-3 font-semibold text-brand-teal">{log.callTo}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                      <span className="font-semibold text-slate-700">{format(new Date(log.startedAt), 'dd MMM yyyy')}</span>
                      <br />
                      <span className="text-xs">{format(new Date(log.startedAt), 'HH:mm:ss')}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDuration(log.duration)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDuration(log.talkDuration)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-bold ${STATUS_STYLES[log.status]}`}>
                        {log.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {log.incident ? (
                        <a
                          href={`/incidents/${log.incident.id}`}
                          className="text-xs font-bold text-brand-teal hover:underline"
                        >
                          {log.incident.caseNumber}
                        </a>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {log.recording && (
                          <a
                            href={log.recording}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs font-bold text-brand-teal hover:underline flex items-center gap-1"
                          >
                            <PhoneDisconnect size={14} weight="bold" />
                            Play
                          </a>
                        )}
                        {!log.incident && (
                          <button
                            onClick={() => setLinkModal({ callId: log.callId, logId: log.id })}
                            className="flex items-center gap-1 text-xs font-bold text-slate-400 hover:text-brand-teal transition-colors"
                            title="Link to incident"
                          >
                            <LinkSimple size={14} weight="bold" />
                            Link
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Link to incident modal */}
      {linkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-surface-border">
            <h3 className="text-base font-bold text-brand-teal mb-4">Link Call to Incident</h3>
            <p className="text-xs text-slate-text mb-3">Enter the case number to link this call record to an incident.</p>
            <input
              type="text"
              placeholder="e.g. NMS-2026-001"
              autoFocus
              value={caseNumber}
              onChange={e => setCaseNumber(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLinkSubmit()}
              className="w-full border border-surface-border rounded-lg px-4 py-3 text-sm font-semibold text-brand-teal focus:ring-2 focus:ring-brand-green outline-none mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setLinkModal(null); setCaseNumber(''); }}
                className="flex-1 px-4 py-2.5 border border-surface-border rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleLinkSubmit}
                disabled={!caseNumber.trim() || linkMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-brand-teal text-white rounded-lg text-sm font-semibold hover:bg-brand-teal/90 transition-all disabled:opacity-50"
              >
                {linkMutation.isPending ? 'Linking...' : 'Link'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
