import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PlusCircle, MagnifyingGlass, Download, ArrowUpRight,
  MapTrifold, Crosshair, X, Gauge, Hash, NavigationArrow,
} from '@phosphor-icons/react';
import { formatDistanceToNow } from 'date-fns';
import api from '../../api/client';
import { Vehicle } from '../../types/api';
import Map from '../../components/shared/Map';
import AddVehicleModal from '../../components/shared/AddVehicleModal';
import { useVehicleTracking, getVehicleTrackingStatus, LiveVehicle } from '../../hooks/useVehicleTracking';
import { useNotificationStore } from '../../stores/notificationStore';

type StatusFilter = 'ALL' | 'moving' | 'stopped' | 'busy' | 'maintenance' | 'offline';

const STATUS_CFG = {
  moving:      { label: 'Moving',      row: 'bg-brand-green/10 text-brand-green',    dot: 'bg-brand-green' },
  stopped:     { label: 'Standby',     row: 'bg-blue-50 text-blue-600',              dot: 'bg-blue-400' },
  busy:        { label: 'Dispatched',  row: 'bg-amber-50 text-amber-700',            dot: 'bg-amber-500' },
  maintenance: { label: 'Maintenance', row: 'bg-slate-100 text-slate-500',           dot: 'bg-slate-300' },
  offline:     { label: 'Offline',     row: 'bg-status-danger/10 text-status-danger', dot: 'bg-status-danger' },
} as const;

export default function FleetPage() {
  const [search, setSearch]               = useState('');
  const [statusFilter, setStatusFilter]   = useState<StatusFilter>('ALL');
  const [isModalOpen, setIsModalOpen]     = useState(false);
  const [focusPos, setFocusPos]           = useState<[number, number] | undefined>();
  const [selected, setSelected]           = useState<Vehicle | null>(null);
  const [isFullscreen, setIsFullscreen]   = useState(false);

  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const { vehicles: liveVehicles, lastUpdatedAt } = useVehicleTracking();

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['admin', 'vehicles'],
    queryFn: async () => {
      const res = await api.get('/dispatch/vehicles');
      return res.data.data as Vehicle[];
    },
  });

  // ── Derived counts ────────────────────────────────────────────────────────
  const total        = vehicles.length;
  const movingCount  = liveVehicles.filter(v => getVehicleTrackingStatus(v) === 'moving').length;
  const busyCount    = liveVehicles.filter(v => getVehicleTrackingStatus(v) === 'busy').length
                       || vehicles.filter(v => v.status === 'BUSY').length;
  const standbyCount = liveVehicles.filter(v => getVehicleTrackingStatus(v) === 'stopped').length;
  const offlineCount = vehicles.filter(v => !v.isActive || getVehicleTrackingStatus(
    liveVehicles.find(lv => lv.registration === v.registrationNumber) ?? { dbStatus: 'READY', ignition: false, speed: 0, isActive: v.isActive } as any
  ) === 'offline').length;

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = vehicles.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q || v.registrationNumber.toLowerCase().includes(q) || v.imei.toLowerCase().includes(q);
    if (!matchSearch) return false;
    if (statusFilter === 'ALL') return true;
    const live = liveVehicles.find(lv => lv.registration === v.registrationNumber);
    const s = live
      ? getVehicleTrackingStatus(live)
      : v.status === 'MAINTENANCE' ? 'maintenance' : v.isActive ? 'stopped' : 'offline';
    return s === statusFilter;
  });

  // ── CSV export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const headers = ['Registration', 'IMEI', 'Status', 'Speed (km/h)', 'Last Seen', 'Lat', 'Lng'];
    const rows = filtered.map(v => {
      const live = liveVehicles.find(lv => lv.registration === v.registrationNumber);
      const s    = live ? getVehicleTrackingStatus(live) : 'offline';
      return [
        v.registrationNumber, v.imei, STATUS_CFG[s]?.label ?? s,
        live?.speed ?? '—',
        live?.timestamp ? new Date(live.timestamp).toLocaleString() : v.lastLocationAt ? new Date(v.lastLocationAt).toLocaleString() : 'N/A',
        live?.lat ?? v.lastLat ?? '', live?.lng ?? v.lastLng ?? '',
      ];
    });
    const csv  = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a    = document.createElement('a');
    a.href     = URL.createObjectURL(blob);
    a.download = `Fleet_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    addNotification({ type: 'success', title: 'Exported', message: 'Fleet roster downloaded.' });
  }

  // ── Selected vehicle live data ────────────────────────────────────────────
  const selectedLive = selected
    ? liveVehicles.find(lv => lv.registration === selected.registrationNumber)
    : null;

  return (
    <div className="flex h-full">
      {/* ── Main Panel ── */}
      <div className={`flex-1 overflow-y-auto transition-all duration-200 ${selected ? 'mr-[360px]' : ''}`}>
        <div className="p-6 lg:p-8 flex flex-col gap-6 max-w-[1600px] mx-auto">

          {/* Page Header */}
          <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-1">Fleet Management</p>
              <h2 className="text-2xl font-bold text-brand-teal">Ambulance Fleet Status</h2>
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="sm:self-end bg-brand-teal text-white text-sm font-semibold px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-brand-teal/90 transition-all shadow-sm"
            >
              <PlusCircle size={18} weight="bold" />
              Add Vehicle
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'Total Fleet',   value: total,        accent: 'border-l-slate-300',        val: 'text-brand-teal' },
              { label: 'Moving',        value: movingCount,  accent: 'border-l-brand-green',      val: 'text-brand-green' },
              { label: 'Standby',       value: standbyCount, accent: 'border-l-blue-400',         val: 'text-blue-600' },
              { label: 'Dispatched',    value: busyCount,    accent: 'border-l-amber-400',        val: 'text-amber-600' },
              { label: 'Out of Service',value: offlineCount, accent: 'border-l-status-danger',    val: 'text-status-danger' },
            ].map(card => (
              <div key={card.label} className={`bg-white p-5 border border-surface-border border-l-4 ${card.accent} rounded-xl`}>
                <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">{card.label}</p>
                <p className={`text-3xl font-bold leading-none ${card.val}`}>{card.value}</p>
                {card.label === 'Total Fleet' && liveVehicles.length > 0 && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-brand-green font-semibold">
                    <ArrowUpRight size={12} weight="bold" />
                    {liveVehicles.length} with GPS
                  </div>
                )}
                {card.label !== 'Total Fleet' && total > 0 && (
                  <div className="w-full bg-slate-100 h-1 rounded-full mt-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        card.label === 'Moving'         ? 'bg-brand-green' :
                        card.label === 'Standby'        ? 'bg-blue-400'    :
                        card.label === 'Dispatched'     ? 'bg-amber-400'   :
                        'bg-status-danger'
                      }`}
                      style={{ width: `${Math.round((card.value / total) * 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Vehicle Table */}
          <div className="bg-white border border-surface-border rounded-xl overflow-hidden shadow-sm">
            {/* Toolbar */}
            <div className="px-5 py-4 border-b border-surface-border flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <h3 className="font-semibold text-brand-teal whitespace-nowrap">Active Vehicles</h3>
                <div className="flex items-center bg-slate-50 border border-surface-border rounded-lg px-3 py-2 group focus-within:border-brand-green transition-all">
                  <MagnifyingGlass size={16} className="text-slate-400 group-focus-within:text-brand-green shrink-0" />
                  <input
                    className="border-none focus:ring-0 text-sm bg-transparent outline-none pl-2 w-52 font-semibold text-brand-teal placeholder:text-slate-400"
                    placeholder="Search registration or IMEI..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                  className="border border-surface-border rounded-lg px-3 py-2 text-xs font-black uppercase tracking-widest text-brand-teal bg-slate-50 outline-none focus:ring-2 focus:ring-brand-green cursor-pointer"
                >
                  <option value="ALL">All Status</option>
                  <option value="moving">Moving</option>
                  <option value="stopped">Standby</option>
                  <option value="busy">Dispatched</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="offline">Offline</option>
                </select>
                <button
                  onClick={exportCSV}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-brand-teal transition-all border border-surface-border"
                  title="Download CSV"
                >
                  <Download size={18} weight="bold" />
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[860px]">
                <thead className="bg-slate-50 border-b border-surface-border">
                  <tr>
                    {['Ambulance Unit', 'Status', 'Registration', 'Tracker IMEI', 'Last Seen', 'Location', ''].map(h => (
                      <th key={h} className="px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border/60">
                  {isLoading ? (
                    <tr><td colSpan={7} className="p-12 text-center text-slate-400 font-semibold">Syncing fleet database...</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={7} className="p-12 text-center text-slate-400 font-semibold">No units match your search.</td></tr>
                  ) : filtered.map(v => {
                    const live  = liveVehicles.find(lv => lv.registration === v.registrationNumber);
                    const s     = live ? getVehicleTrackingStatus(live) : v.status === 'MAINTENANCE' ? 'maintenance' : v.isActive ? 'stopped' : 'offline';
                    const cfg   = STATUS_CFG[s];
                    const lat   = live?.lat ?? v.lastLat;
                    const lng   = live?.lng ?? v.lastLng;
                    const ts    = live?.timestamp ?? v.lastLocationAt;
                    const unitLabel = `UNIT-${v.registrationNumber.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(-4)}`;
                    const isSelected = selected?.id === v.id;

                    return (
                      <tr
                        key={v.id}
                        onClick={() => setSelected(isSelected ? null : v)}
                        className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${isSelected ? 'bg-brand-teal/5 border-l-2 border-l-brand-teal' : ''}`}
                      >
                        {/* Unit */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              <NavigationArrow
                                size={18}
                                weight="fill"
                                className={s === 'moving' ? 'text-brand-green' : s === 'busy' ? 'text-amber-500' : s === 'offline' ? 'text-slate-300' : 'text-slate-400'}
                                style={{ transform: live?.heading ? `rotate(${live.heading}deg)` : undefined }}
                              />
                            </div>
                            <div>
                              <p className="font-bold text-brand-teal text-sm">{unitLabel}</p>
                              <p className="text-xs text-slate-400 mt-0.5">Ambulance</p>
                            </div>
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-bold ${cfg.row}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} ${s === 'moving' ? 'animate-pulse' : ''}`} />
                            {cfg.label}
                          </span>
                        </td>

                        {/* Registration */}
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-brand-teal">{v.registrationNumber}</p>
                        </td>

                        {/* IMEI */}
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-400 font-mono">{v.imei}</p>
                        </td>

                        {/* Last Seen + speed */}
                        <td className="px-6 py-4">
                          <p className="text-sm text-brand-teal font-semibold">
                            {ts ? formatDistanceToNow(new Date(ts), { addSuffix: true }) : 'N/A'}
                          </p>
                          {live && live.speed > 0 && (
                            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                              <Gauge size={11} weight="bold" />
                              {live.speed} km/h
                            </p>
                          )}
                        </td>

                        {/* Location */}
                        <td className="px-6 py-4">
                          <p className={`text-xs font-mono ${lat && lng ? 'text-brand-green' : 'text-slate-300'}`}>
                            {lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : 'No signal'}
                          </p>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-4 text-right">
                          <button
                            title="Locate on map"
                            disabled={!lat || !lng}
                            onClick={e => { e.stopPropagation(); if (lat && lng) setFocusPos([lat, lng]); }}
                            className="p-1.5 text-slate-300 hover:text-brand-green hover:bg-brand-green/10 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                          >
                            <Crosshair size={16} weight="bold" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-surface-border flex justify-between items-center">
              <p className="text-xs text-slate-400 font-semibold">
                Showing {filtered.length} of {total} vehicle{total !== 1 ? 's' : ''}
              </p>
              {lastUpdatedAt && (
                <p className="text-xs text-slate-400">
                  GPS updated {formatDistanceToNow(lastUpdatedAt, { addSuffix: true })}
                </p>
              )}
            </div>
          </div>

          {/* Bottom: Telemetry + Map */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Telemetry chart */}
            <div className="lg:col-span-2 bg-white p-6 border border-surface-border rounded-xl">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="font-semibold text-brand-teal">Real-time Telemetry</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Current vehicle states</p>
                </div>
                <span className="text-xs font-bold text-brand-green bg-brand-green/10 px-2.5 py-1 rounded-full">Live</span>
              </div>
              <div className="h-48 flex items-end gap-2 px-2">
                {liveVehicles.length > 0 ? liveVehicles.map(v => {
                  const s = getVehicleTrackingStatus(v);
                  const h = s === 'moving'  ? Math.max(40, Math.min(95, 40 + (v.speed / 120) * 55))
                          : s === 'busy'    ? 65
                          : s === 'stopped' ? 35
                          : 12;
                  const color = s === 'moving'      ? 'bg-brand-green hover:bg-brand-green/70'
                              : s === 'busy'        ? 'bg-amber-400 hover:bg-amber-300'
                              : s === 'stopped'     ? 'bg-blue-300 hover:bg-blue-200'
                              : s === 'maintenance' ? 'bg-slate-300'
                              : 'bg-slate-200';
                  return (
                    <div
                      key={v.vehicleId}
                      className={`flex-1 ${color} rounded-t transition-all duration-700 cursor-pointer`}
                      style={{ height: `${h}%` }}
                      title={`${v.registration} — ${STATUS_CFG[s]?.label ?? s}${s === 'moving' ? ` · ${v.speed} km/h` : ''}`}
                    />
                  );
                }) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-2">
                    <NavigationArrow size={32} weight="thin" />
                    <span className="text-sm">Awaiting GPS data</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between mt-4 pt-4 border-t border-surface-border">
                <div className="flex gap-6 text-sm">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Moving</p>
                    <p className="font-bold text-brand-green">{movingCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Dispatched</p>
                    <p className="font-bold text-amber-500">{busyCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Standby</p>
                    <p className="font-bold text-blue-500">{standbyCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Offline</p>
                    <p className="font-bold text-status-danger">{offlineCount}</p>
                  </div>
                </div>
                <button onClick={exportCSV} className="text-xs text-slate-400 hover:text-brand-teal transition-colors font-semibold">
                  Download CSV
                </button>
              </div>
            </div>

            {/* Live map panel */}
            <div className="bg-brand-sidebar p-6 rounded-xl flex flex-col">
              <div className="flex items-center gap-2 mb-4">
                <MapTrifold size={18} weight="bold" className="text-brand-green" />
                <h3 className="font-semibold text-white">Live Map</h3>
                <span className="ml-auto flex items-center gap-1 text-xs font-bold text-brand-green">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                  Live
                </span>
              </div>
              <div className="flex-1 min-h-72 rounded-lg overflow-hidden border border-white/10 mb-4">
                <Map
                  center={[-1.2921, 36.8219]}
                  zoom={11}
                  vehicleMarkers={liveVehicles}
                  layerType="dark"
                  showLiveBadge
                  showLegend
                  focusPosition={focusPos}
                  lastUpdatedAt={lastUpdatedAt}
                />
              </div>
              <p className="text-xs text-slate-400 mb-4">
                {movingCount} unit{movingCount !== 1 ? 's' : ''} currently moving across the metropolitan area.
              </p>
              <button
                onClick={() => setIsFullscreen(true)}
                className="w-full py-2.5 border border-brand-green/30 text-brand-green text-sm font-semibold rounded-lg hover:bg-brand-green hover:text-brand-sidebar transition-all"
              >
                Launch Full Screen Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Vehicle Detail Drawer ── */}
      {selected && (
        <div className="fixed right-0 top-0 h-screen w-[360px] bg-white border-l border-surface-border shadow-2xl z-30 flex flex-col overflow-y-auto">
          <div className="px-6 py-5 border-b border-surface-border flex items-center justify-between sticky top-0 bg-white z-10">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">Vehicle Detail</p>
              <h3 className="font-bold text-brand-teal mt-0.5">{selected.registrationNumber}</h3>
            </div>
            <button
              onClick={() => setSelected(null)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-brand-teal transition-all"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          <div className="p-6 flex flex-col gap-6">
            {/* Status */}
            {(() => {
              const s   = selectedLive ? getVehicleTrackingStatus(selectedLive) : selected.status === 'MAINTENANCE' ? 'maintenance' : selected.isActive ? 'stopped' : 'offline';
              const cfg = STATUS_CFG[s];
              return (
                <div className={`flex items-center gap-2 px-4 py-3 rounded-xl ${cfg.row} font-semibold text-sm`}>
                  <span className={`w-2 h-2 rounded-full ${cfg.dot} ${s === 'moving' ? 'animate-pulse' : ''}`} />
                  {cfg.label}
                  {selectedLive?.speed ? ` · ${selectedLive.speed} km/h` : ''}
                </div>
              );
            })()}

            {/* Mini map */}
            {(selectedLive?.lat ?? selected.lastLat) && (selectedLive?.lng ?? selected.lastLng) && (
              <div className="h-44 rounded-xl overflow-hidden border border-surface-border">
                <Map
                  center={[selectedLive?.lat ?? selected.lastLat!, selectedLive?.lng ?? selected.lastLng!]}
                  zoom={14}
                  vehicleMarkers={selectedLive ? [selectedLive] : []}
                />
              </div>
            )}

            {/* Info rows */}
            <div className="flex flex-col gap-3">
              {[
                { icon: Hash,               label: 'IMEI',         value: selected.imei },
                { icon: NavigationArrow,    label: 'Heading',      value: selectedLive?.heading != null ? `${selectedLive.heading}°` : '—' },
                { icon: Gauge,              label: 'Speed',        value: selectedLive?.speed != null ? `${selectedLive.speed} km/h` : '—' },
                { icon: MapTrifold,         label: 'Coordinates',  value: (selectedLive?.lat ?? selected.lastLat) ? `${(selectedLive?.lat ?? selected.lastLat)!.toFixed(5)}, ${(selectedLive?.lng ?? selected.lastLng)!.toFixed(5)}` : 'No signal' },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-center gap-3 py-3 border-b border-surface-border/50 last:border-0">
                  <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                    <Icon size={16} weight="bold" className="text-slate-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-brand-teal truncate">{value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Current Crew */}
            <div className="rounded-xl border border-surface-border overflow-hidden">
              <div className="px-4 py-3 bg-slate-50 border-b border-surface-border">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Current Crew</p>
              </div>
              <div className="divide-y divide-surface-border/60">
                {[
                  { role: 'Driver', person: selected.currentDriver },
                  { role: 'EMT',    person: selected.currentEmt },
                  { role: 'Nurse',  person: selected.currentNurse },
                ].map(({ role, person }) => (
                  <div key={role} className="flex items-center justify-between px-4 py-3">
                    <span className="text-xs text-slate-400 font-semibold w-14">{role}</span>
                    {person ? (
                      <div className="text-right">
                        <p className="text-sm font-semibold text-brand-teal">{person.name}</p>
                        {person.phone && <p className="text-xs text-slate-400 mt-0.5">{person.phone}</p>}
                      </div>
                    ) : (
                      <span className="text-xs text-slate-300 italic">Not checked in</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Last seen */}
            {(selectedLive?.timestamp ?? selected.lastLocationAt) && (
              <p className="text-xs text-center text-slate-400">
                Last GPS ping {formatDistanceToNow(new Date(selectedLive?.timestamp ?? selected.lastLocationAt!), { addSuffix: true })}
              </p>
            )}

            {/* Locate on map */}
            <button
              disabled={!selectedLive?.lat && !selected.lastLat}
              onClick={() => {
                const lat = selectedLive?.lat ?? selected.lastLat;
                const lng = selectedLive?.lng ?? selected.lastLng;
                if (lat && lng) { setFocusPos([lat, lng]); setSelected(null); }
              }}
              className="w-full py-3 bg-brand-teal text-white text-sm font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-brand-teal/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Crosshair size={16} weight="bold" />
              Locate on Map
            </button>
          </div>
        </div>
      )}

      <AddVehicleModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Fullscreen Map Overlay */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="flex items-center justify-between px-6 py-3 bg-brand-sidebar border-b border-white/10">
            <div className="flex items-center gap-2">
              <MapTrifold size={18} weight="bold" className="text-brand-green" />
              <span className="font-semibold text-white text-sm">Live Fleet Map</span>
              <span className="flex items-center gap-1 text-xs font-bold text-brand-green ml-2">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse" />
                Live
              </span>
            </div>
            <button
              onClick={() => setIsFullscreen(false)}
              className="p-2 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition-all"
            >
              <X size={20} weight="bold" />
            </button>
          </div>
          <div className="flex-1">
            <Map
              center={[-1.2921, 36.8219]}
              zoom={11}
              vehicleMarkers={liveVehicles}
              layerType="dark"
              showLiveBadge
              showLegend
              focusPosition={focusPos}
              lastUpdatedAt={lastUpdatedAt}
            />
          </div>
        </div>
      )}
    </div>
  );
}
