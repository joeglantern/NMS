import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  PlusCircle, ClipboardText, CheckCircle, Warning, Clock, Ambulance, XCircle,
} from '@phosphor-icons/react';
import EndCaseModal from '../../components/shared/EndCaseModal';
import { formatDistanceToNow } from 'date-fns';
import api from '../../api/client';
import { Incident, IncidentStatus } from '../../types/api';
import { useAuthStore } from '../../stores/authStore';
import { socket } from '../../lib/socket';

const STATUS_BADGE: Record<IncidentStatus, { label: string; cls: string }> = {
  DRAFT:             { label: 'Draft',     cls: 'bg-slate-100 text-slate-500' },
  SUBMITTED:         { label: 'Submitted', cls: 'bg-status-warning/10 text-status-warning' },
  DISPATCH_HANDLING: { label: 'Handling',  cls: 'bg-status-info/10 text-status-info' },
  DISPATCH_ON_HOLD:  { label: 'On Hold',   cls: 'bg-slate-100 text-slate-500' },
  DISPATCHED:        { label: 'Dispatched',cls: 'bg-brand-green/10 text-brand-green' },
  RESOLVED:          { label: 'Resolved',  cls: 'bg-brand-teal/10 text-brand-teal' },
};

export default function WatcherDashboardPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | 'ALL'>('ALL');
  const [endCaseTarget, setEndCaseTarget] = useState<Incident | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['watcher', 'incidents', user?.id],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (user?.id) params.set('watcherId', user.id);
      const res = await api.get(`/incidents?${params}`);
      return (res.data.data ?? []) as Incident[];
    },
    enabled: !!user?.id,
  });

  const incidents = data ?? [];

  useEffect(() => {
    function onIncidentUpdate(updated: Incident) {
      queryClient.setQueryData(
        ['watcher', 'incidents', user?.id],
        (old: Incident[] | undefined) =>
          old?.map(i => (i.id === updated.id ? { ...i, ...updated } : i)) ?? old
      );
    }
    function onIncidentNew(inc: Incident) {
      if ((inc as any).watcherId === user?.id) {
        queryClient.invalidateQueries({ queryKey: ['watcher', 'incidents', user?.id] });
      }
    }
    socket.on('incident:update', onIncidentUpdate);
    socket.on('incident:new', onIncidentNew);
    return () => {
      socket.off('incident:update', onIncidentUpdate);
      socket.off('incident:new', onIncidentNew);
    };
  }, [queryClient, user?.id]);

  const filtered = statusFilter === 'ALL'
    ? incidents
    : incidents.filter(i => i.status === statusFilter);

  const submittedCount  = incidents.filter(i => i.status === 'SUBMITTED').length;
  const dispatchedCount = incidents.filter(i => i.status === 'DISPATCHED' || i.status === 'DISPATCH_HANDLING').length;
  const resolvedCount   = incidents.filter(i => i.status === 'RESOLVED').length;

  return (
    <div className="col" style={{ gap: 20 }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-5 rounded-xl border border-surface-border shadow-sm">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Watcher Portal</p>
          <h1 className="text-2xl font-bold text-brand-teal">My Alerts</h1>
        </div>
        <button
          onClick={() => navigate('/watcher/new-incident')}
          className="flex items-center gap-2 bg-brand-teal text-white font-bold text-sm px-5 py-2.5 rounded-lg hover:opacity-90 transition-all shadow-md"
        >
          <PlusCircle size={18} weight="fill" />
          New Incident
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-text">Total Reported</p>
            <ClipboardText size={14} className="text-slate-300" />
          </div>
          <p className="text-3xl font-bold text-brand-teal">{incidents.length}</p>
        </div>
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-text">Awaiting Dispatch</p>
            <Clock size={14} className="text-status-warning" />
          </div>
          <p className="text-3xl font-bold text-status-warning">{submittedCount}</p>
          {submittedCount > 0 && (
            <p className="text-[10px] font-semibold text-status-warning mt-2 animate-pulse">Needs attention</p>
          )}
        </div>
        <div className="bg-white p-5 rounded-xl border border-surface-border shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-text">In Progress</p>
            <Ambulance size={14} className="text-brand-green" weight="fill" />
          </div>
          <p className="text-3xl font-bold text-brand-green">{dispatchedCount}</p>
        </div>
        <div className="bg-brand-sidebar p-5 rounded-xl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-slate-400">Resolved</p>
            <CheckCircle size={14} className="text-brand-green" weight="fill" />
          </div>
          <p className="text-3xl font-bold text-white">{resolvedCount}</p>
        </div>
      </div>

      {/* Incidents Table */}
      <div className="bg-white rounded-xl border border-surface-border shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row gap-3 justify-between sm:items-center">
          <div className="flex items-center gap-2">
            <Warning size={18} className="text-slate-text" weight="fill" />
            <h3 className="font-semibold text-brand-teal">Incident History</h3>
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="h-9 px-3 border border-surface-border rounded-lg text-xs font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-slate-50"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="DISPATCH_HANDLING">Handling</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-surface-border">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-text">Case ID</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-text">Complaint</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-text">Location</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-text">Reported</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-text">Status</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-text"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <div className="w-8 h-8 border-4 border-brand-teal/20 border-t-brand-teal rounded-full animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-16 text-center">
                    <ClipboardText size={40} weight="duotone" className="text-slate-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-slate-400">No incidents yet</p>
                    <p className="text-xs text-slate-300 mt-1">Submitted alerts will appear here</p>
                    <button
                      onClick={() => navigate('/watcher/new-incident')}
                      className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-brand-teal border border-brand-teal/30 px-4 py-2 rounded-lg hover:bg-brand-teal/5 transition-all"
                    >
                      <PlusCircle size={14} weight="fill" /> Submit your first alert
                    </button>
                  </td>
                </tr>
              ) : filtered.map(inc => {
                const badge = STATUS_BADGE[inc.status];
                return (
                  <tr key={inc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <span className="font-bold text-brand-teal text-sm font-mono tracking-tight">
                        {inc.caseNumber}
                      </span>
                    </td>
                    <td className="px-5 py-4 max-w-[260px]">
                      <p className="text-sm text-slate-700 truncate">{inc.chiefComplaint}</p>
                      {inc.massCasualty && (
                        <span className="text-[10px] font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                          MCI
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm text-slate-600">{inc.locationName}</p>
                      <p className="text-xs text-slate-400">{inc.subCounty}</p>
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      {inc.status !== 'RESOLVED' && (
                        <button
                          onClick={e => { e.stopPropagation(); setEndCaseTarget(inc); }}
                          className="flex items-center gap-1.5 text-xs font-bold text-status-danger border border-status-danger/30 px-3 py-1.5 rounded-lg hover:bg-status-danger hover:text-white transition-all"
                        >
                          <XCircle size={13} weight="fill" />
                          End Case
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {endCaseTarget && (
        <EndCaseModal
          incidentId={endCaseTarget.id}
          caseNumber={endCaseTarget.caseNumber}
          isOpen={!!endCaseTarget}
          onClose={() => setEndCaseTarget(null)}
          invalidateKeys={[['watcher', 'incidents', user?.id]]}
        />
      )}
    </div>
  );
}
