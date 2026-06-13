import { useState } from 'react';
import {
  UserPlus, MagnifyingGlass, DotsThreeVertical,
  Download, ClockCounterClockwise, MagicWand, CaretLeft,
  CaretRight, TrendUp, ShieldCheck, Check, X as XIcon,
  PencilSimple, Buildings,
} from '@phosphor-icons/react';
import { useNotificationStore } from '../../stores/notificationStore';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import { User, Agency, PaginatedResponse, Role } from '../../types/api';
import AddPersonnelModal from '../../components/shared/AddPersonnelModal';
import PartnerOnboardingModal from '../../components/shared/PartnerOnboardingModal';

export default function UserManagementPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isPartnerModalOpen, setIsPartnerModalOpen] = useState(false);
  const [editRoleTarget, setEditRoleTarget] = useState<{ id: string; name: string; role: Role; agencyId: string | null } | null>(null);
  const [editRoleValue, setEditRoleValue] = useState<Role>('WATCHER');
  const [editAgencyValue, setEditAgencyValue] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [roleFilter, setRoleFilter] = useState<Role | 'ALL'>('ALL');
  const [agencyFilter, setAgencyFilter] = useState('ALL');
  const [actionMenuUserId, setActionMenuUserId] = useState<string | null>(null);
  const [showAuditModal, setShowAuditModal] = useState(false);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      return api.patch(`/admin/users/${userId}`, { isActive });
    },
    onSuccess: (_, { isActive }) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setActionMenuUserId(null);
      addNotification({
        type: 'success',
        title: isActive ? 'User Activated' : 'User Deactivated',
        message: isActive ? 'Account has been reactivated.' : 'Account has been deactivated.',
      });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Action Failed', message: err?.response?.data?.message || 'Could not update user status.' });
    },
  });

  const editRoleMutation = useMutation({
    mutationFn: ({ userId, role, agencyId }: { userId: string; role: Role; agencyId?: string }) =>
      api.patch(`/admin/users/${userId}`, { role, ...(agencyId ? { agencyId } : {}) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      setEditRoleTarget(null);
      addNotification({ type: 'success', title: 'Role Updated', message: 'User role has been changed.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Update Failed', message: err?.response?.data?.message || 'Could not update role.' });
    },
  });

  const { data: usersResponse, isLoading } = useQuery({
    queryKey: ['admin', 'users', currentPage, roleFilter, agencyFilter],
    queryFn: async () => {
      const params: any = { page: currentPage, limit: 10 };
      if (roleFilter !== 'ALL') params.role = roleFilter;
      if (agencyFilter !== 'ALL') params.agencyId = agencyFilter;
      const res = await api.get<PaginatedResponse<User>>('/admin/users', { params });
      return res.data;
    },
  });

  const { data: agencies = [] } = useQuery({
    queryKey: ['admin', 'agencies'],
    queryFn: async () => {
      const res = await api.get('/admin/agencies');
      return res.data.data as Agency[];
    },
  });

  const { data: auditLogsResponse, isLoading: auditLoading } = useQuery({
    queryKey: ['admin', 'audit-logs'],
    queryFn: async () => {
      const res = await api.get('/admin/audit-logs?limit=50');
      return res.data.data as { id: string; createdAt: string; action: string; subjectId?: string; user?: { name: string; email: string } }[];
    },
    enabled: showAuditModal,
  });

  const auditLogs = auditLogsResponse ?? [];

  function downloadAuditCSV() {
    const headers = ['Time', 'User', 'Email', 'Action', 'Subject'];
    const rows = auditLogs.map(l => [
      new Date(l.createdAt).toISOString(),
      l.user?.name ?? '',
      l.user?.email ?? '',
      l.action,
      l.subjectId ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Audit_Log_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  const users = usersResponse?.data || [];
  const meta = usersResponse?.meta || { total: 0, page: 1, limit: 10, totalPages: 0 };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  function exportRosterCSV() {
    const headers = ['Name', 'Email', 'Role', 'Agency', 'Status', 'Phone'];
    const rows = users.map(u => [
      u.name,
      u.email,
      u.role,
      (u as any).agency?.name ?? '',
      u.isActive ? 'Active' : 'Inactive',
      u.phone ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Personnel_Roster_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    addNotification({ type: 'success', title: 'Exported', message: 'Personnel roster downloaded.' });
  }

  const getColor = (role: string) => {
    switch (role) {
      case 'SUPER_ADMIN': return 'bg-brand-teal text-white';
      case 'ADMIN': return 'bg-brand-green text-white';
      case 'DISPATCHER': return 'bg-[#006973] text-white';
      case 'WATCHER': return 'bg-status-info text-white';
      default: return 'bg-slate-300 text-slate-700';
    }
  };

  return (
    <div className="col" style={{ gap: 24 }}>

      {/* Header Section */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-4 sm:p-6 lg:p-8 rounded-xl border border-surface-border shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full"></div>
            <p className="font-sans text-[11px] font-black tracking-[0.2em] text-slate-text uppercase text-xs sm:text-[11px]">Personnel & Identity Bureau</p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black text-brand-teal tracking-tight uppercase">Personnel Roster</h2>
        </div>
        <div className="flex gap-3 w-full sm:w-auto">
          <button
            onClick={() => setIsPartnerModalOpen(true)}
            className="flex-1 sm:flex-none bg-brand-teal/10 hover:bg-brand-teal text-brand-teal hover:text-white font-black text-xs uppercase tracking-widest px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-all border border-brand-teal/30"
          >
            <MagicWand size={18} weight="bold" />
            Onboard Partner
          </button>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex-1 sm:flex-none bg-brand-green hover:bg-brand-sidebar hover:text-white text-brand-teal font-black text-xs uppercase tracking-widest px-6 py-3 sm:px-8 sm:py-4 rounded-xl flex items-center justify-center gap-3 transition-all shadow-md active:scale-95"
          >
            <UserPlus size={22} weight="bold" />
            Enlist Personnel
          </button>
        </div>
      </div>

      {/* Dashboard Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        <div className="bg-white border border-surface-border p-6 rounded-xl shadow-sm group hover:border-brand-green transition-all">
          <div className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-2">Total Personnel</div>
          <div className="font-sans text-4xl font-black text-brand-teal leading-none">{meta.total}</div>
          <div className="font-sans text-[10px] font-black text-brand-green mt-4 flex items-center gap-1 uppercase tracking-tighter">
            <TrendUp size={14} weight="bold" /> {meta.totalPages} page{meta.totalPages !== 1 ? 's' : ''} of records
          </div>
        </div>
        
        <div className="bg-white border border-surface-border p-6 rounded-xl shadow-sm group hover:border-status-info transition-all">
          <div className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-2">Active Accounts</div>
          <div className="font-sans text-4xl font-black text-brand-teal leading-none">
            {users.filter(u => u.isActive).length}
          </div>
          <div className="flex -space-x-2 mt-4">
            {users.filter(u => u.isActive).slice(0, 3).map(u => (
              <div key={u.id} className={`w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-[9px] text-white font-black shadow-sm ${getColor(u.role)}`}>
                {getInitials(u.name)}
              </div>
            ))}
            {users.filter(u => u.isActive).length > 3 && (
              <div className="w-8 h-8 rounded-full border-2 border-white bg-brand-sidebar flex items-center justify-center text-[9px] text-white font-black shadow-sm">
                +{users.filter(u => u.isActive).length - 3}
              </div>
            )}
          </div>
        </div>

        <div className="md:col-span-2 bg-brand-sidebar p-6 rounded-xl shadow-2xl flex items-center justify-between border border-brand-teal/30 relative overflow-hidden group">
          <div className="w-full max-w-md relative z-10">
            <div className="font-sans text-[10px] font-black tracking-[0.2em] text-brand-green uppercase mb-2">Account Distribution</div>
            <div className="font-sans text-4xl font-black text-white flex items-end gap-3 leading-none">
              {meta.total} <span className="text-[10px] text-brand-green font-black uppercase tracking-widest mb-1.5 bg-brand-green/10 px-3 py-1 rounded-full border border-brand-green/20">Total</span>
            </div>
            <div className="w-full bg-white/5 h-2.5 rounded-full mt-6 overflow-hidden border border-white/5">
              <div
                className="bg-brand-green h-full shadow-[0_0_12px_rgba(136,194,65,0.4)]"
                style={{ width: meta.total > 0 ? `${(users.filter(u => u.isActive).length / Math.max(users.length, 1)) * 100}%` : '0%' }}
              ></div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-widest">{users.filter(u => u.isActive).length} of {users.length} on this page active</p>
          </div>
          <div className="hidden md:block opacity-5 group-hover:opacity-10 transition-all scale-150 relative z-0">
            <TrendUp size={80} color="#88c241" weight="fill" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col lg:flex-row items-stretch lg:items-center gap-4 lg:gap-6 shadow-sm">
        <div className="relative flex-1 group">
          <MagnifyingGlass size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-brand-green transition-colors" weight="bold" />
          <input 
            className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-surface-border rounded-lg font-sans text-sm font-semibold text-brand-teal focus:bg-white focus:ring-2 focus:ring-brand-green outline-none transition-all" 
            placeholder="Search by name, email, or agency identifier..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3 flex-1">
            <span className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase">Role</span>
            <select 
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as any)}
              className="flex-1 bg-slate-50 border border-surface-border rounded-lg px-4 py-3 font-sans text-xs font-black uppercase tracking-widest text-brand-teal outline-none focus:ring-2 focus:ring-brand-green transition-all cursor-pointer"
            >
              <option value="ALL">All Roles</option>
              <option value="SUPER_ADMIN">Super Admin</option>
              <option value="ADMIN">Admin</option>
              <option value="DISPATCHER">Dispatcher</option>
              <option value="WATCHER">Watcher</option>
              <option value="PARTNER">Partner</option>
              <option value="DRIVER">Driver</option>
              <option value="EMT">EMT</option>
              <option value="NURSE">Nurse</option>
            </select>
          </div>
          <div className="flex items-center gap-3 flex-1">
            <span className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase">Agency</span>
            <select
              value={agencyFilter}
              onChange={e => { setAgencyFilter(e.target.value); setCurrentPage(1); }}
              className="flex-1 bg-slate-50 border border-surface-border rounded-lg px-4 py-3 font-sans text-xs font-black uppercase tracking-widest text-brand-teal outline-none focus:ring-2 focus:ring-brand-green transition-all cursor-pointer"
            >
              <option value="ALL">All Agencies</option>
              {agencies?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 lg:gap-8">
        {/* Table */}
        <div className="flex-[3] bg-white rounded-xl shadow-sm border border-surface-border overflow-hidden flex flex-col min-h-[500px]">
          <div className="overflow-x-auto flex-1 hide-scrollbar">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                <div className="w-12 h-12 border-4 border-brand-teal/20 border-t-brand-teal rounded-full animate-spin"></div>
                <p className="font-black text-xs text-brand-teal uppercase tracking-widest animate-pulse">Accessing Personnel Files...</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[800px]">
                <thead>
                  <tr className="bg-slate-50 border-b border-surface-border">
                    <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Personnel</th>
                    <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Operational Role</th>
                    <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Assigned Agency</th>
                    <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Status</th>
                    <th className="px-8 py-5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/50">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center">
                        <div className="flex flex-col items-center gap-4">
                           <ShieldCheck size={48} weight="duotone" className="text-slate-200" />
                           <p className="font-bold text-sm text-slate-400 uppercase tracking-widest">No personnel records found</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    users.filter(u => u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase())).map(u => (
                      <tr key={u.id} className="hover:bg-brand-green/5 transition-all group cursor-default">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black text-xs shadow-sm ${getColor(u.role)}`}>
                              {getInitials(u.name)}
                            </div>
                            <div>
                              <div className="font-black text-brand-teal text-sm uppercase tracking-tight">{u.name}</div>
                              <div className="font-bold text-[11px] text-slate-400">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="bg-brand-green/10 text-brand-green px-3 py-1.5 rounded-full font-black text-[10px] border border-brand-green/20 uppercase tracking-widest shadow-sm">
                            {u.role.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="font-bold text-sm text-brand-teal uppercase tracking-tight">{(u as any).agency?.name || 'Unknown'}</div>
                        </td>
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <span className={`w-2.5 h-2.5 rounded-full ${u.isActive ? 'bg-brand-green animate-pulse' : 'bg-status-danger'}`}></span>
                            <span className={`font-black text-[11px] uppercase tracking-widest ${u.isActive ? 'text-brand-teal' : 'text-status-danger'}`}>{u.isActive ? 'Active' : 'Deactivated'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right relative">
                          <button
                            onClick={() => setActionMenuUserId(actionMenuUserId === u.id ? null : u.id)}
                            className="p-3 rounded-xl hover:bg-white text-slate-400 hover:text-brand-teal transition-all shadow-sm border border-transparent hover:border-surface-border"
                          >
                            <DotsThreeVertical size={24} weight="bold" />
                          </button>
                          {actionMenuUserId === u.id && (
                            <div className="absolute right-8 top-14 z-20 bg-white border border-surface-border rounded-xl shadow-xl py-1 min-w-[190px] text-left">
                              <button
                                onClick={() => {
                                  setEditRoleTarget({ id: u.id, name: u.name, role: u.role, agencyId: u.agencyId });
                                  setEditRoleValue(u.role);
                                  setEditAgencyValue(u.agencyId ?? '');
                                  setActionMenuUserId(null);
                                }}
                                className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold hover:bg-slate-50 transition-all text-brand-teal"
                              >
                                <PencilSimple size={16} weight="bold" /> Edit Role
                              </button>
                              <div className="border-t border-slate-100 my-0.5" />
                              <button
                                onClick={() => toggleActiveMutation.mutate({ userId: u.id, isActive: !u.isActive })}
                                disabled={toggleActiveMutation.isPending}
                                className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold hover:bg-slate-50 transition-all disabled:opacity-50 ${u.isActive ? 'text-status-danger' : 'text-brand-green'}`}
                              >
                                {u.isActive
                                  ? <><XIcon size={16} weight="bold" /> Deactivate Account</>
                                  : <><Check size={16} weight="bold" /> Reactivate Account</>}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
          
          {/* Pagination */}
          <div className="bg-slate-50 px-4 sm:px-8 py-5 border-t border-surface-border flex flex-col sm:flex-row gap-4 justify-between items-center">
            <div className="font-bold text-[11px] text-slate-400 uppercase tracking-widest text-center sm:text-left">
              Showing {users.length} of {meta.total} personnel
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-surface-border hover:bg-white hover:text-brand-teal disabled:opacity-30 text-slate-400 transition-all shadow-sm"
              >
                <CaretLeft size={20} weight="bold" />
              </button>
              <div className="flex items-center gap-1">
                {Array.from({ length: meta.totalPages }, (_, i) => i + 1).map(p => (
                  <button 
                    key={p}
                    onClick={() => setCurrentPage(p)}
                    className={`w-9 h-9 rounded-lg font-black text-xs transition-all ${currentPage === p ? 'bg-brand-teal text-white shadow-md' : 'hover:bg-white border border-transparent hover:border-surface-border text-slate-500'}`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setCurrentPage(p => Math.min(meta.totalPages, p + 1))}
                disabled={currentPage === meta.totalPages}
                className="p-2 rounded-lg border border-surface-border hover:bg-white hover:text-brand-teal disabled:opacity-30 text-slate-400 transition-all shadow-sm"
              >
                <CaretRight size={20} weight="bold" />
              </button>
            </div>
          </div>
        </div>

        {/* Side Panel Widgets */}
        <div className="flex-1 flex flex-col gap-8">
          <div className="bg-slate-50 rounded-xl p-8 border border-surface-border shadow-sm">
            <div className="flex items-center gap-3 mb-8">
               <div className="bg-brand-teal/10 p-2 rounded-lg">
                  <MagicWand size={22} weight="bold" className="text-brand-teal" />
                </div>
               <h4 className="font-sans text-xl font-black text-brand-teal uppercase tracking-tight">Directives</h4>
            </div>
            <div className="flex flex-col gap-4">
              <button
                onClick={exportRosterCSV}
                className="flex items-center justify-between p-5 bg-white rounded-xl hover:shadow-lg transition-all text-brand-teal border border-surface-border group"
              >
                <span className="font-black text-[11px] uppercase tracking-widest group-hover:text-brand-green transition-colors">Export Tactical Roster</span>
                <Download size={22} weight="bold" className="text-slate-300 group-hover:text-brand-green transition-colors" />
              </button>
              <button
                onClick={() => setShowAuditModal(true)}
                className="flex items-center justify-between p-5 bg-white rounded-xl hover:shadow-lg transition-all text-brand-teal border border-surface-border group"
              >
                <span className="font-black text-[11px] uppercase tracking-widest group-hover:text-brand-green transition-colors">Audit Integrity Log</span>
                <ClockCounterClockwise size={22} weight="bold" className="text-slate-300 group-hover:text-brand-green transition-colors" />
              </button>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-xl border border-brand-teal/30 bg-brand-sidebar shadow-2xl flex-1 min-h-[250px] group p-8 flex flex-col justify-between">
            <div>
              <div className="font-sans text-[10px] font-black tracking-[0.2em] text-brand-green uppercase mb-2">System Info</div>
              <div className="font-sans text-2xl font-black text-white uppercase tracking-tight">EOC Operations</div>
              <p className="font-sans text-xs font-bold text-slate-400 mt-4 leading-relaxed uppercase tracking-wide">
                {meta.total} registered personnel across {agencies?.length ?? 1} {agencies?.length === 1 ? 'agency' : 'agencies'}.
              </p>
            </div>
            <div className="mt-6 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Active</p>
                <p className="text-2xl font-black text-brand-green">{users.filter(u => u.isActive).length}</p>
              </div>
              <div>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Inactive</p>
                <p className="text-2xl font-black text-status-danger">{users.filter(u => !u.isActive).length}</p>
              </div>
            </div>
            <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-all scale-150">
              <ShieldCheck size={120} weight="fill" className="text-white" />
            </div>
          </div>
        </div>
      </div>
      
      {/* Edit Role Modal */}
      {editRoleTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditRoleTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PencilSimple size={18} weight="fill" className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Edit Role</p>
                  <p className="text-sm font-bold text-white">{editRoleTarget.name}</p>
                </div>
              </div>
              <button onClick={() => setEditRoleTarget(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={16} weight="bold" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">New Role</label>
                <select
                  className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                  value={editRoleValue}
                  onChange={e => setEditRoleValue(e.target.value as Role)}
                >
                  {(['SUPER_ADMIN', 'ADMIN', 'DISPATCHER', 'WATCHER', 'PARTNER', 'DRIVER', 'EMT', 'NURSE'] as Role[]).map(r => (
                    <option key={r} value={r}>{r.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>

              {editRoleValue === 'PARTNER' && (
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    <Buildings size={10} className="inline mr-1" />Assign to Partner Agency
                  </label>
                  <select
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                    value={editAgencyValue}
                    onChange={e => setEditAgencyValue(e.target.value)}
                  >
                    <option value={editRoleTarget.agencyId ?? ''}>Keep current agency</option>
                    {agencies.filter(a => a.type === 'PARTNER').map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </select>
                  {agencies.filter(a => a.type === 'PARTNER').length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">No partner agencies yet — use "Onboard Partner" to create one first.</p>
                  )}
                </div>
              )}

              {editRoleValue !== editRoleTarget.role && (
                <div className="bg-status-warning/5 border border-status-warning/20 rounded-xl px-4 py-2.5 text-xs text-status-warning font-medium">
                  Role will change from <span className="font-bold">{editRoleTarget.role.replace('_', ' ')}</span> → <span className="font-bold">{editRoleValue.replace('_', ' ')}</span>. User gets new permissions on next login.
                </div>
              )}
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setEditRoleTarget(null)}
                className="px-4 py-2 border border-slate-200 text-slate-500 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => editRoleMutation.mutate({
                  userId: editRoleTarget.id,
                  role: editRoleValue,
                  agencyId: editRoleValue === 'PARTNER' && editAgencyValue && editAgencyValue !== (editRoleTarget.agencyId ?? '') ? editAgencyValue : undefined,
                })}
                disabled={editRoleMutation.isPending || editRoleValue === editRoleTarget.role}
                className="flex items-center gap-2 px-5 py-2 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Check size={14} weight="bold" />
                {editRoleMutation.isPending ? 'Saving…' : 'Save Role'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Integrity Log Modal */}
      {showAuditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAuditModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <ClockCounterClockwise size={18} weight="fill" className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">System Records</p>
                  <p className="text-sm font-bold text-white">Audit Integrity Log</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={downloadAuditCSV}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-green/20 hover:bg-brand-green text-brand-green hover:text-white text-xs font-bold rounded-lg transition-all"
                >
                  <Download size={13} weight="bold" /> Export CSV
                </button>
                <button onClick={() => setShowAuditModal(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                  <XIcon size={16} weight="bold" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {auditLoading ? (
                <div className="flex items-center justify-center py-16 gap-3">
                  <div className="w-8 h-8 border-4 border-brand-teal/20 border-t-brand-teal rounded-full animate-spin" />
                  <p className="text-xs font-black text-brand-teal uppercase tracking-widest">Loading audit records…</p>
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-center text-sm text-slate-400 py-16">No audit records found.</p>
              ) : (
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-surface-border sticky top-0">
                      <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Time</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">User</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Action</th>
                      <th className="px-5 py-3 text-xs font-black text-slate-400 uppercase tracking-widest">Subject</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border/50">
                    {auditLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(log.createdAt).toLocaleString()}</td>
                        <td className="px-5 py-3">
                          <div className="text-xs font-bold text-brand-teal">{log.user?.name ?? '—'}</div>
                          <div className="text-[11px] text-slate-400">{log.user?.email ?? ''}</div>
                        </td>
                        <td className="px-5 py-3 text-xs font-semibold text-brand-teal">{log.action}</td>
                        <td className="px-5 py-3 text-xs text-slate-400 font-mono">{log.subjectId ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <AddPersonnelModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      <PartnerOnboardingModal
        isOpen={isPartnerModalOpen}
        onClose={() => setIsPartnerModalOpen(false)}
      />
    </div>
  );
}
