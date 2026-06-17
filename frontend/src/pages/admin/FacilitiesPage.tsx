import { useState } from 'react';
import {
  Plus, MagnifyingGlass, DotsThreeVertical, Hospital,
  PencilSimple, Check, X as XIcon, MapPin,
} from '@phosphor-icons/react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNotificationStore } from '../../stores/notificationStore';
import api from '../../api/client';
import { Facility } from '../../types/api';

const FACILITY_TYPES = ['Hospital', 'Health Centre', 'Clinic', 'Dispensary', 'Nursing Home', 'Maternity'];
const KEPH_LEVELS = [1, 2, 3, 4, 5, 6];
const NAIROBI_SUB_COUNTIES = [
  'Westlands', 'Dagoretti North', 'Dagoretti South', 'Langata', 'Kibra',
  'Roysambu', 'Kasarani', 'Ruaraka', 'Embakasi South', 'Embakasi North',
  'Embakasi Central', 'Embakasi East', 'Embakasi West', 'Makadara',
  'Kamukunji', 'Starehe', 'Mathare',
];

const kephColor: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600',
  2: 'bg-blue-50 text-blue-700',
  3: 'bg-amber-50 text-amber-700',
  4: 'bg-orange-50 text-orange-700',
  5: 'bg-red-50 text-red-700',
  6: 'bg-purple-50 text-purple-700',
};

const emptyForm = {
  name: '', type: 'Hospital', kephLevel: 3,
  subCounty: '', lat: '', lng: '',
};

export default function FacilitiesPage() {
  const [search, setSearch] = useState('');
  const [subCountyFilter, setSubCountyFilter] = useState('ALL');
  const [kephFilter, setKephFilter] = useState('ALL');
  const [showModal, setShowModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Facility | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [actionId, setActionId] = useState<string | null>(null);
  const { addNotification } = useNotificationStore();
  const queryClient = useQueryClient();

  const { data: facilities = [], isLoading } = useQuery({
    queryKey: ['admin', 'facilities', subCountyFilter, kephFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (subCountyFilter !== 'ALL') params.subCounty = subCountyFilter;
      if (kephFilter !== 'ALL') params.kephLevel = kephFilter;
      const res = await api.get('/admin/facilities', { params });
      return res.data.data as Facility[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof emptyForm) =>
      api.post('/admin/facilities', {
        ...data,
        kephLevel: Number(data.kephLevel),
        lat: Number(data.lat),
        lng: Number(data.lng),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'facilities'] });
      setShowModal(false);
      setForm(emptyForm);
      addNotification({ type: 'success', title: 'Facility Added', message: 'New facility registered successfully.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not add facility.' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Facility> }) =>
      api.patch(`/admin/facilities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'facilities'] });
      setEditTarget(null);
      setActionId(null);
      addNotification({ type: 'success', title: 'Updated', message: 'Facility updated.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not update facility.' });
    },
  });

  const filtered = facilities.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.subCounty.toLowerCase().includes(search.toLowerCase())
  );

  function openAdd() {
    setForm(emptyForm);
    setShowModal(true);
  }

  function openEdit(f: Facility) {
    setEditTarget(f);
    setActionId(null);
  }

  const formValid =
    form.name.trim().length >= 2 &&
    form.subCounty.trim().length >= 2 &&
    form.lat !== '' && form.lng !== '' &&
    !isNaN(Number(form.lat)) && !isNaN(Number(form.lng));

  return (
    <div className="col" style={{ gap: 24 }}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-4 sm:p-6 lg:p-8 rounded-xl border border-surface-border shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full" />
            <p className="font-sans text-[11px] font-black tracking-[0.2em] text-slate-text uppercase">Medical Facilities Registry</p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black text-brand-teal tracking-tight uppercase">Facilities</h2>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-3 bg-brand-green hover:bg-brand-sidebar hover:text-white text-brand-teal font-black text-xs uppercase tracking-widest px-6 py-3 sm:px-8 sm:py-4 rounded-xl transition-all shadow-md active:scale-95"
        >
          <Plus size={20} weight="bold" />
          Add Facility
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white border border-surface-border p-6 rounded-xl shadow-sm">
          <div className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-2">Total</div>
          <div className="font-sans text-4xl font-black text-brand-teal leading-none">{facilities.length}</div>
        </div>
        <div className="bg-white border border-surface-border p-6 rounded-xl shadow-sm">
          <div className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-2">Active</div>
          <div className="font-sans text-4xl font-black text-brand-teal leading-none">{facilities.filter(f => f.isActive).length}</div>
        </div>
        <div className="bg-white border border-surface-border p-6 rounded-xl shadow-sm">
          <div className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-2">Hospitals</div>
          <div className="font-sans text-4xl font-black text-brand-teal leading-none">{facilities.filter(f => f.type === 'Hospital').length}</div>
        </div>
        <div className="bg-white border border-surface-border p-6 rounded-xl shadow-sm">
          <div className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-400 uppercase mb-2">Sub-Counties</div>
          <div className="font-sans text-4xl font-black text-brand-teal leading-none">{new Set(facilities.map(f => f.subCounty)).size}</div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-surface-border rounded-xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-4 shadow-sm">
        <div className="relative flex-1 group">
          <MagnifyingGlass size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" weight="bold" />
          <input
            className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-surface-border rounded-lg text-sm font-semibold text-brand-teal focus:bg-white focus:ring-2 focus:ring-brand-green outline-none transition-all"
            placeholder="Search by name or sub-county…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          value={subCountyFilter}
          onChange={e => setSubCountyFilter(e.target.value)}
          className="bg-slate-50 border border-surface-border rounded-lg px-4 py-3 text-xs font-black uppercase tracking-widest text-brand-teal outline-none focus:ring-2 focus:ring-brand-green transition-all cursor-pointer"
        >
          <option value="ALL">All Sub-Counties</option>
          {NAIROBI_SUB_COUNTIES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={kephFilter}
          onChange={e => setKephFilter(e.target.value)}
          className="bg-slate-50 border border-surface-border rounded-lg px-4 py-3 text-xs font-black uppercase tracking-widest text-brand-teal outline-none focus:ring-2 focus:ring-brand-green transition-all cursor-pointer"
        >
          <option value="ALL">All KEPH Levels</option>
          {KEPH_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-border overflow-hidden">
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-10 h-10 border-4 border-brand-teal/20 border-t-brand-teal rounded-full animate-spin" />
              <p className="font-black text-xs text-brand-teal uppercase tracking-widest animate-pulse">Loading facilities…</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-50 border-b border-surface-border">
                  <th className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Facility</th>
                  <th className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Type</th>
                  <th className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">KEPH Level</th>
                  <th className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Sub-County</th>
                  <th className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Coordinates</th>
                  <th className="px-6 py-4 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Status</th>
                  <th className="px-6 py-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-20 text-center">
                      <div className="flex flex-col items-center gap-4">
                        <Hospital size={48} weight="duotone" className="text-slate-200" />
                        <p className="font-bold text-sm text-slate-400 uppercase tracking-widest">No facilities found</p>
                      </div>
                    </td>
                  </tr>
                ) : filtered.map(f => (
                  <tr key={f.id} className="hover:bg-brand-green/5 transition-all group cursor-default">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                          <Hospital size={18} weight="duotone" className="text-brand-teal" />
                        </div>
                        <span className="font-black text-sm text-brand-teal uppercase tracking-tight">{f.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="font-bold text-sm text-brand-teal">{f.type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${kephColor[f.kephLevel] ?? 'bg-slate-100 text-slate-600'}`}>
                        Level {f.kephLevel}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-brand-teal">
                        <MapPin size={13} className="text-slate-400" />
                        {f.subCounty}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      {f.lat.toFixed(4)}, {f.lng.toFixed(4)}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${f.isActive ? 'bg-brand-green animate-pulse' : 'bg-status-danger'}`} />
                        <span className={`font-black text-[11px] uppercase tracking-widest ${f.isActive ? 'text-brand-teal' : 'text-status-danger'}`}>
                          {f.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right relative">
                      <button
                        onClick={() => setActionId(actionId === f.id ? null : f.id)}
                        className="p-2.5 rounded-xl hover:bg-white text-slate-400 hover:text-brand-teal transition-all shadow-sm border border-transparent hover:border-surface-border"
                      >
                        <DotsThreeVertical size={22} weight="bold" />
                      </button>
                      {actionId === f.id && (
                        <div className="absolute right-6 top-12 z-20 bg-white border border-surface-border rounded-xl shadow-xl py-1 min-w-[170px] text-left">
                          <button
                            onClick={() => openEdit(f)}
                            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold hover:bg-slate-50 transition-all text-brand-teal"
                          >
                            <PencilSimple size={15} weight="bold" /> Edit
                          </button>
                          <div className="border-t border-slate-100 my-0.5" />
                          <button
                            onClick={() => updateMutation.mutate({ id: f.id, data: { isActive: !f.isActive } })}
                            disabled={updateMutation.isPending}
                            className={`w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold hover:bg-slate-50 transition-all disabled:opacity-50 ${f.isActive ? 'text-status-danger' : 'text-brand-green'}`}
                          >
                            {f.isActive
                              ? <><XIcon size={15} weight="bold" /> Deactivate</>
                              : <><Check size={15} weight="bold" /> Activate</>}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Facility Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Hospital size={18} weight="fill" className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Registry</p>
                  <p className="text-sm font-bold text-white">Add New Facility</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={16} weight="bold" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Facility Name *</label>
                  <input
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                    placeholder="e.g. Kenyatta National Hospital"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Type *</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                    value={form.type}
                    onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  >
                    {FACILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">KEPH Level *</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                    value={form.kephLevel}
                    onChange={e => setForm(f => ({ ...f, kephLevel: Number(e.target.value) }))}
                  >
                    {KEPH_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Sub-County *</label>
                  <select
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                    value={form.subCounty}
                    onChange={e => setForm(f => ({ ...f, subCounty: e.target.value }))}
                  >
                    <option value="">Select sub-county…</option>
                    {NAIROBI_SUB_COUNTIES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Latitude *</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                    placeholder="-1.2921"
                    value={form.lat}
                    onKeyDown={e => ['e', 'E', '+'].includes(e.key) && e.preventDefault()}
                    onChange={e => setForm(f => ({ ...f, lat: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Longitude *</label>
                  <input
                    type="number"
                    step="any"
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
                    placeholder="36.8219"
                    value={form.lng}
                    onKeyDown={e => ['e', 'E', '+'].includes(e.key) && e.preventDefault()}
                    onChange={e => setForm(f => ({ ...f, lng: e.target.value }))}
                  />
                </div>
              </div>
            </div>
            <div className="px-5 pb-5 flex gap-3 justify-end">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 border border-slate-200 text-slate-500 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => createMutation.mutate(form)}
                disabled={createMutation.isPending || !formValid}
                className="flex items-center gap-2 px-5 py-2 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={14} weight="bold" />
                {createMutation.isPending ? 'Adding…' : 'Add Facility'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Facility Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setEditTarget(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="bg-brand-sidebar px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PencilSimple size={18} weight="fill" className="text-brand-green" />
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest font-bold">Edit Facility</p>
                  <p className="text-sm font-bold text-white truncate max-w-[220px]">{editTarget.name}</p>
                </div>
              </div>
              <button onClick={() => setEditTarget(null)} className="p-1.5 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-all">
                <XIcon size={16} weight="bold" />
              </button>
            </div>
            <EditFacilityForm
              facility={editTarget}
              onSave={data => updateMutation.mutate({ id: editTarget.id, data })}
              onCancel={() => setEditTarget(null)}
              isPending={updateMutation.isPending}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function EditFacilityForm({
  facility, onSave, onCancel, isPending,
}: {
  facility: Facility;
  onSave: (data: Partial<Facility>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(facility.name);
  const [type, setType] = useState(facility.type);
  const [kephLevel, setKephLevel] = useState(facility.kephLevel);

  return (
    <>
      <div className="p-5 space-y-4">
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Name</label>
          <input
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Type</label>
          <select
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
            value={type}
            onChange={e => setType(e.target.value)}
          >
            {FACILITY_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">KEPH Level</label>
          <select
            className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-semibold text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-white"
            value={kephLevel}
            onChange={e => setKephLevel(Number(e.target.value))}
          >
            {KEPH_LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
          </select>
        </div>
      </div>
      <div className="px-5 pb-5 flex gap-3 justify-end">
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-slate-200 text-slate-500 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ name, type, kephLevel })}
          disabled={isPending || name.trim().length < 2}
          className="flex items-center gap-2 px-5 py-2 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Check size={14} weight="bold" />
          {isPending ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}
