import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlass, SortAscending, SortDescending, WarningCircle } from '@phosphor-icons/react';
import api from '../../api/client';
import { Incident } from '../../types/api';
import { socket } from '../../lib/socket';
import { formatDistanceToNow } from 'date-fns';

const statusPill: Record<string, string> = {
  SUBMITTED: 'pill-red',
  DISPATCH_HANDLING: 'pill-amber',
  DISPATCHED: 'pill-blue',
  RESOLVED: 'pill-green',
};

export default function QueuePage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: incidents, isLoading } = useQuery({
    queryKey: ['incidents'],
    queryFn: async () => {
      const res = await api.get('/incidents');
      return res.data.data as Incident[];
    },
  });

  useEffect(() => {
    socket.connect();
    socket.on('incident:new', (incident: Incident) => {
      queryClient.setQueryData(['incidents'], (old: Incident[] | undefined) =>
        old ? [incident, ...old] : [incident]
      );
    });
    socket.on('incident:update', (updated: Incident) => {
      queryClient.setQueryData(['incidents'], (old: Incident[] | undefined) =>
        old ? old.map((inc) => (inc.id === updated.id ? updated : inc)) : [updated]
      );
    });
    return () => {
      socket.off('incident:new');
      socket.off('incident:update');
    };
  }, [queryClient]);

  const filteredIncidents = (
    incidents?.filter((inc) => {
      const matchesSearch =
        inc.caseNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        inc.chiefComplaint.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || inc.status === statusFilter;
      return matchesSearch && matchesStatus;
    }) ?? []
  ).sort((a, b) => {
    const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    return sortOrder === 'desc' ? diff : -diff;
  });

  return (
    <>
      {/* Page header */}
      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <div className="section-title" style={{ fontSize: 20 }}>Incident Feed</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Live incident management and dispatch tracking</div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
          <div className="searchbox" style={{ minWidth: 220, flex: 1, maxWidth: 400 }}>
            <MagnifyingGlass size={16} />
            <input
              type="text"
              placeholder="Search case number or complaint…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="seg">
            {['ALL', 'SUBMITTED', 'DISPATCH_HANDLING', 'DISPATCHED', 'RESOLVED'].map((s) => (
              <button
                key={s}
                className={statusFilter === s ? 'on' : ''}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'ALL' ? 'All' : s === 'DISPATCH_HANDLING' ? 'Handling' : s.charAt(0) + s.slice(1).toLowerCase().replace('_', ' ')}
              </button>
            ))}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setSortOrder((o) => (o === 'desc' ? 'asc' : 'desc'))}
            title={sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          >
            {sortOrder === 'desc' ? <SortDescending size={16} /> : <SortAscending size={16} />}
            {sortOrder === 'desc' ? 'Newest first' : 'Oldest first'}
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Status</th>
                <th>Complaint</th>
                <th>Location</th>
                <th>Wait</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    Synchronising feed…
                  </td>
                </tr>
              ) : filteredIncidents.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
                    No incidents match the current filter
                  </td>
                </tr>
              ) : (
                filteredIncidents.map((inc) => {
                  const late = Date.now() - new Date(inc.createdAt).getTime() > 600_000;
                  return (
                    <tr key={inc.id} onClick={() => navigate(`/incidents/${inc.id}`)}>
                      <td>
                        <span className="mono strong" style={{ fontSize: 13 }}>{inc.caseNumber}</span>
                        {inc.massCasualty && (
                          <span className="pill pill-red" style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px' }}>
                            <WarningCircle size={9} weight="fill" /> MCI
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`pill ${statusPill[inc.status] ?? 'pill-gray'}`}>
                          {inc.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: 13.5, fontWeight: 500 }}>{inc.chiefComplaint}</div>
                        {(inc.watcherComments || inc.preHospitalManagement) && (
                          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Notes available</div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontSize: 13.5 }}>{inc.locationName}</div>
                        {inc.subCounty && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{inc.subCounty}</div>}
                      </td>
                      <td>
                        <span className={`mono ${late ? 'live-badge' : 'muted'}`} style={{ fontSize: 12.5, fontWeight: 600 }}>
                          {late && <span className="dot" style={{ width: 6, height: 6, background: 'var(--red)', borderRadius: 99, display: 'inline-block', marginRight: 5 }} />}
                          {formatDistanceToNow(new Date(inc.createdAt), { addSuffix: true })}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {!isLoading && filteredIncidents.length > 0 && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--muted)' }}>
            Showing {filteredIncidents.length} incident{filteredIncidents.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </>
  );
}
