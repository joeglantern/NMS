import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Handshake, Buildings, UserPlus, EnvelopeSimple,
  Lock, Phone, Globe, ArrowRight, CheckCircle, UserGear,
} from '@phosphor-icons/react';
import api from '../../api/client';
import { useNotificationStore } from '../../stores/notificationStore';
import { Agency, User } from '../../types/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'create' | 'assign';

const inputCls = 'w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all placeholder:text-slate-300';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';

export default function PartnerOnboardingModal({ isOpen, onClose }: Props) {
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const [tab, setTab] = useState<Tab>('create');

  // ── Create tab state ──────────────────────────────────────────────────────
  const [step, setStep] = useState<1 | 2>(1);
  const [createdAgencyId, setCreatedAgencyId] = useState('');
  const [agencyForm, setAgencyForm] = useState({ name: '', location: '', contactEmail: '', contactPhone: '' });
  const [userForm, setUserForm] = useState({ name: '', email: '', passwordRaw: '', phone: '' });

  // ── Assign tab state ──────────────────────────────────────────────────────
  const [assignUserId, setAssignUserId]     = useState('');
  const [assignAgencyId, setAssignAgencyId] = useState('');
  const [userSearch, setUserSearch]         = useState('');

  // ── Data ──────────────────────────────────────────────────────────────────
  const { data: partnerAgencies = [] } = useQuery({
    queryKey: ['admin', 'agencies', 'PARTNER'],
    queryFn: async () => {
      const res = await api.get('/admin/agencies');
      return (res.data.data as Agency[]).filter(a => a.type === 'PARTNER');
    },
    enabled: isOpen,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['admin', 'users', 'all-for-assign'],
    queryFn: async () => {
      const res = await api.get('/admin/users?limit=200');
      return res.data.data as User[];
    },
    enabled: isOpen && tab === 'assign',
  });

  const filteredUsers = allUsers.filter(u =>
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createAgencyMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/agencies', {
        name: agencyForm.name,
        type: 'PARTNER',
        location: agencyForm.location || undefined,
        contactInfo: { email: agencyForm.contactEmail, phone: agencyForm.contactPhone },
      }),
    onSuccess: (res) => {
      const agency = res.data.data as Agency;
      setCreatedAgencyId(agency.id);
      queryClient.invalidateQueries({ queryKey: ['admin', 'agencies'] });
      setStep(2);
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Agency Creation Failed', message: err?.response?.data?.message || 'Could not create partner agency.' });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/users', {
        name: userForm.name,
        email: userForm.email,
        passwordRaw: userForm.passwordRaw,
        phone: userForm.phone || undefined,
        role: 'PARTNER',
        agencyId: createdAgencyId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      addNotification({ type: 'success', title: 'Partner Onboarded', message: `${userForm.name} has been set up as a partner user.` });
      handleClose();
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'User Creation Failed', message: err?.response?.data?.message || 'Could not create partner user.' });
    },
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.patch(`/admin/users/${assignUserId}`, {
        role: 'PARTNER',
        agencyId: assignAgencyId || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      addNotification({ type: 'success', title: 'Partner Assigned', message: 'User has been reassigned as a partner.' });
      handleClose();
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Assignment Failed', message: err?.response?.data?.message || 'Could not assign partner role.' });
    },
  });

  function handleClose() {
    setTab('create');
    setStep(1);
    setCreatedAgencyId('');
    setAgencyForm({ name: '', location: '', contactEmail: '', contactPhone: '' });
    setUserForm({ name: '', email: '', passwordRaw: '', phone: '' });
    setAssignUserId('');
    setAssignAgencyId('');
    setUserSearch('');
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="relative bg-white w-full max-w-xl rounded-2xl shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="bg-brand-sidebar px-6 py-5 flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="bg-brand-green/20 p-2 rounded-xl">
              <Handshake size={20} weight="fill" className="text-brand-green" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base">Partner Onboarding</h2>
              <p className="text-slate-400 text-xs">Set up a partner agency and user access</p>
            </div>
          </div>
          <button onClick={handleClose} className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-100">
          {([['create', 'Create New Partner', UserPlus], ['assign', 'Assign Existing User', UserGear]] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold transition-all border-b-2 ${
                tab === id
                  ? 'border-brand-teal text-brand-teal bg-brand-teal/5'
                  : 'border-transparent text-slate-400 hover:text-slate-600'
              }`}
            >
              <Icon size={14} />
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: Create New ─────────────────────────────────────────────── */}
        {tab === 'create' && (
          <div className="p-6">

            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-6">
              {[['1', 'Partner Agency', Buildings], ['2', 'User Account', UserPlus]].map(([num, label, _Icon], i) => {
                const done = step > i + 1;
                const active = step === i + 1;
                return (
                  <div key={num as string} className="flex items-center gap-2 flex-1">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      done ? 'bg-brand-green text-white' : active ? 'bg-brand-teal text-white' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {done ? <CheckCircle size={14} weight="fill" /> : num as string}
                    </div>
                    <span className={`text-xs font-bold ${active ? 'text-brand-teal' : done ? 'text-brand-green' : 'text-slate-400'}`}>
                      {label as string}
                    </span>
                    {i === 0 && <div className={`flex-1 h-0.5 rounded-full ml-2 ${done ? 'bg-brand-green' : 'bg-slate-200'}`} />}
                  </div>
                );
              })}
            </div>

            {/* Step 1: Agency */}
            {step === 1 && (
              <form onSubmit={e => { e.preventDefault(); createAgencyMutation.mutate(); }} className="space-y-4">
                <div>
                  <label className={labelCls}><Buildings size={12} className="inline mr-1" />Agency Name *</label>
                  <input required className={inputCls} placeholder="e.g. St. John Ambulance Kenya" value={agencyForm.name} onChange={e => setAgencyForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}><Globe size={12} className="inline mr-1" />Location / Address</label>
                  <input className={inputCls} placeholder="e.g. Upper Hill, Nairobi" value={agencyForm.location} onChange={e => setAgencyForm(f => ({ ...f, location: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}><EnvelopeSimple size={12} className="inline mr-1" />Contact Email *</label>
                    <input required type="email" className={inputCls} placeholder="e.g. ops@partneragency.org" value={agencyForm.contactEmail} onChange={e => setAgencyForm(f => ({ ...f, contactEmail: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}><Phone size={12} className="inline mr-1" />Contact Phone *</label>
                    <input required type="tel" className={inputCls} placeholder="e.g. +254712345678" value={agencyForm.contactPhone} onChange={e => setAgencyForm(f => ({ ...f, contactPhone: e.target.value }))} />
                  </div>
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={!agencyForm.name.trim() || !agencyForm.contactEmail.trim() || !agencyForm.contactPhone.trim() || createAgencyMutation.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40"
                  >
                    {createAgencyMutation.isPending ? 'Creating…' : 'Next — Create User'}
                    <ArrowRight size={16} weight="bold" />
                  </button>
                </div>
              </form>
            )}

            {/* Step 2: User */}
            {step === 2 && (
              <form onSubmit={e => { e.preventDefault(); createUserMutation.mutate(); }} className="space-y-4">
                <div className="bg-brand-green/5 border border-brand-green/20 rounded-xl px-4 py-2.5 text-xs font-bold text-brand-teal flex items-center gap-2">
                  <CheckCircle size={14} weight="fill" className="text-brand-green" />
                  Agency created — now add the partner user account
                </div>
                <div>
                  <label className={labelCls}>Full Name *</label>
                  <input required className={inputCls} placeholder="e.g. Jane Mwangi" value={userForm.name} onChange={e => setUserForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <label className={labelCls}><EnvelopeSimple size={12} className="inline mr-1" />Email *</label>
                  <input required type="email" className={inputCls} placeholder="e.g. jane@partneragency.org" value={userForm.email} onChange={e => setUserForm(f => ({ ...f, email: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}><Lock size={12} className="inline mr-1" />Password *</label>
                    <input required type="password" className={inputCls} placeholder="Min 8 chars" value={userForm.passwordRaw} onChange={e => setUserForm(f => ({ ...f, passwordRaw: e.target.value }))} />
                  </div>
                  <div>
                    <label className={labelCls}><Phone size={12} className="inline mr-1" />Phone</label>
                    <input type="tel" className={inputCls} placeholder="+254…" value={userForm.phone} onChange={e => setUserForm(f => ({ ...f, phone: e.target.value }))} />
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-500 font-medium">
                  Role will be set to <span className="font-bold text-brand-teal">PARTNER</span> automatically.
                </div>
                <div className="pt-2 flex items-center justify-between">
                  <button type="button" onClick={() => setStep(1)} className="text-xs font-bold text-slate-400 hover:text-slate-600 transition-all">← Back</button>
                  <button
                    type="submit"
                    disabled={!userForm.name || !userForm.email || !userForm.passwordRaw || !createdAgencyId || createUserMutation.isPending}
                    className="flex items-center gap-2 px-6 py-2.5 bg-brand-green text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40"
                  >
                    <Handshake size={16} weight="fill" />
                    {createUserMutation.isPending ? 'Onboarding…' : 'Complete Onboarding'}
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* ── TAB: Assign Existing ─────────────────────────────────────────── */}
        {tab === 'assign' && (
          <div className="p-6 space-y-5">
            <p className="text-sm text-slate-500">
              Choose an existing user and reassign them as a partner, optionally moving them to a partner agency.
            </p>

            {/* User search */}
            <div>
              <label className={labelCls}>Search User *</label>
              <input
                className={inputCls}
                placeholder="Name or email…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
              />
              {userSearch.length > 0 && filteredUsers.length > 0 && (
                <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-lg max-h-48 overflow-y-auto">
                  {filteredUsers.slice(0, 8).map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setAssignUserId(u.id); setUserSearch(`${u.name} (${u.email})`); }}
                      className={`w-full text-left px-4 py-3 text-sm flex items-center justify-between hover:bg-slate-50 border-b border-slate-100 last:border-0 transition-colors ${assignUserId === u.id ? 'bg-brand-teal/5' : ''}`}
                    >
                      <div>
                        <p className="font-bold text-slate-700">{u.name}</p>
                        <p className="text-xs text-slate-400">{u.email}</p>
                      </div>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{u.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Partner agency */}
            <div>
              <label className={labelCls}><Buildings size={12} className="inline mr-1" />Assign to Partner Agency (optional)</label>
              <select
                className={inputCls}
                value={assignAgencyId}
                onChange={e => setAssignAgencyId(e.target.value)}
              >
                <option value="">Keep current agency</option>
                {partnerAgencies.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              {partnerAgencies.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No partner agencies yet — create one first using the "Create New Partner" tab.</p>
              )}
            </div>

            <div className="bg-status-warning/5 border border-status-warning/20 rounded-xl px-4 py-3 text-xs text-status-warning font-medium">
              This will change the user's role to <span className="font-bold">PARTNER</span>. They will see only the partner dashboard on their next login.
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => assignMutation.mutate()}
                disabled={!assignUserId || assignMutation.isPending}
                className="flex items-center gap-2 px-6 py-2.5 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40"
              >
                <UserGear size={16} weight="fill" />
                {assignMutation.isPending ? 'Assigning…' : 'Assign as Partner'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
