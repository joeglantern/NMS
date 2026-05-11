import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusCircle, MagnifyingGlass, Funnel, Download, DotsThreeVertical, ArrowUpRight, MapTrifold } from '@phosphor-icons/react';
import api from '../../api/client';
import { Vehicle } from '../../types/api';
import { socket } from '../../lib/socket';
import { formatDistanceToNow } from 'date-fns';
import Map from '../../components/shared/Map';
import { useNotificationStore } from '../../stores/notificationStore';
import AddVehicleModal from '../../components/shared/AddVehicleModal';
import { useVehicleTracking } from '../../hooks/useVehicleTracking';

export default function FleetPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();
  const { vehicles: liveVehicles, lastUpdatedAt } = useVehicleTracking();

  const { data: vehicles, isLoading } = useQuery({
    queryKey: ['admin', 'vehicles'],
    queryFn: async () => {
      const res = await api.get('/admin/vehicles');
      return res.data.data as Vehicle[];
    },
  });

  useEffect(() => {
    socket.connect();
    return () => { socket.off('fleet:pos'); };
  }, [queryClient]);

  const filteredVehicles = vehicles?.filter(v => 
    v.registrationNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
    v.id.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const totalCount = vehicles?.length || 0;
  // Derive counts from live GPS data (status field not in DB schema)
  const activeCount = liveVehicles.filter(v => v.ignition && v.speed > 2).length;
  const idleCount = liveVehicles.filter(v => v.ignition && v.speed <= 2).length;
  const offlineCount = liveVehicles.filter(v => !v.ignition).length || (vehicles?.filter(v => !v.isActive).length ?? 0);


  const exportFleetToCSV = () => {
    if (!vehicles || vehicles.length === 0) return;
    
    const headers = ['Unit ID', 'Registration', 'Status', 'IMEI', 'Last Check-in', 'Coordinates'];
    const rows = filteredVehicles.map(v => [
      `UNIT-${v.id.substring(0,4).toUpperCase()}`,
      v.registrationNumber,
      v.status,
      v.imei,
      v.lastLocationAt ? new Date(v.lastLocationAt).toLocaleString() : 'N/A',
      v.lastLat && v.lastLng ? `${v.lastLat}, ${v.lastLng}` : 'SIGNAL LOST'
    ]);

    const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Fleet_Deployment_Roster_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    addNotification({ type: 'success', title: 'Export Complete', message: 'Deployment roster has been downloaded.' });
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 flex flex-col gap-4 sm:gap-6 lg:gap-8 max-w-[1600px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 bg-white p-4 sm:p-6 lg:p-8 rounded-xl border border-surface-border shadow-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1.5 h-6 bg-brand-green rounded-full"></div>
            <p className="font-sans text-[11px] font-black tracking-[0.2em] text-slate-text uppercase">Operational Intelligence</p>
          </div>
          <h2 className="font-sans text-2xl sm:text-3xl lg:text-4xl font-black text-brand-teal tracking-tight uppercase">Fleet Status</h2>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-green hover:bg-brand-sidebar hover:text-white text-brand-sidebar font-black text-xs uppercase tracking-widest px-8 py-4 rounded-xl flex items-center gap-3 transition-all shadow-md active:scale-95"
        >
          <PlusCircle size={22} weight="bold" />
          Register Unit
        </button>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-6">
        <div className="bg-white p-6 border border-surface-border rounded-xl shadow-sm border-b-4 border-b-brand-teal">
          <p className="font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase mb-2">Total Fleet</p>
          <p className="font-sans text-4xl font-black text-brand-teal leading-none">{totalCount}</p>
          <div className="flex items-center gap-1 mt-4 text-brand-green font-black text-[10px] uppercase tracking-tighter">
            <ArrowUpRight size={14} weight="bold" />
            <span>2 Units Pending Approval</span>
          </div>
        </div>
        <div className="bg-white p-6 border border-surface-border rounded-xl shadow-sm border-b-4 border-b-brand-green">
          <p className="font-sans text-[10px] font-black tracking-[0.2em] text-brand-green uppercase mb-2">En-route / Active</p>
          <p className="font-sans text-4xl font-black text-brand-green leading-none">{activeCount}</p>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-5 overflow-hidden">
            <div className="bg-brand-green h-full rounded-full transition-all duration-1000" style={{ width: `${totalCount ? (activeCount/totalCount)*100 : 0}%` }}></div>
          </div>
        </div>
        <div className="bg-white p-6 border border-surface-border rounded-xl shadow-sm border-b-4 border-b-status-info">
          <p className="font-sans text-[10px] font-black tracking-[0.2em] text-status-info uppercase mb-2">Standby / Idle</p>
          <p className="font-sans text-4xl font-black text-status-info leading-none">{idleCount}</p>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-5 overflow-hidden">
            <div className="bg-status-info h-full rounded-full transition-all duration-1000" style={{ width: `${totalCount ? (idleCount/totalCount)*100 : 0}%` }}></div>
          </div>
        </div>
        <div className="bg-white p-6 border border-surface-border rounded-xl shadow-sm border-b-4 border-b-status-danger">
          <p className="font-sans text-[10px] font-black tracking-[0.2em] text-status-danger uppercase mb-2">Out of Service</p>
          <p className="font-sans text-4xl font-black text-status-danger leading-none">{offlineCount}</p>
          <div className="w-full bg-slate-100 h-1.5 rounded-full mt-5 overflow-hidden">
            <div className="bg-status-danger h-full rounded-full transition-all duration-1000" style={{ width: `${totalCount ? (offlineCount/totalCount)*100 : 0}%` }}></div>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-white border border-surface-border rounded-xl overflow-hidden shadow-sm flex flex-col">
          <div className="px-4 sm:px-8 py-4 sm:py-6 bg-[#f8fafb] border-b border-surface-border flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-6">
            <h3 className="font-sans text-lg sm:text-xl font-black text-brand-teal uppercase tracking-tight">Deployment Roster</h3>
            <div className="flex items-center bg-white border border-surface-border rounded-lg px-4 py-2 shadow-inner group focus-within:border-brand-green transition-all">
              <MagnifyingGlass size={20} className="text-slate-400 group-focus-within:text-brand-green" />
              <input 
                className="border-none focus:ring-0 text-sm w-full sm:w-72 bg-transparent outline-none pl-3 font-semibold text-brand-teal placeholder:text-slate-400" 
                placeholder="Search Unit ID or Registration..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={() => addNotification({ type: 'info', title: 'Filters applied', message: 'Advanced filters panel opened.' })}
              className="p-3 hover:bg-brand-teal hover:text-white rounded-xl text-slate-500 transition-all shadow-sm border border-surface-border"
            >
              <Funnel size={22} weight="bold" />
            </button>
            <button 
              onClick={exportFleetToCSV}
              className="p-3 hover:bg-brand-teal hover:text-white rounded-xl text-slate-500 transition-all shadow-sm border border-surface-border"
            >
              <Download size={22} weight="bold" />
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50 border-b border-surface-border">
                <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Tactical Unit</th>
                <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Status</th>
                <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Identifier</th>
                <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Telemetry (IMEI)</th>
                <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Last Check-in</th>
                <th className="px-8 py-5 font-sans text-[10px] font-black tracking-[0.2em] text-slate-text uppercase">Coordinates</th>
                <th className="px-8 py-5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border/50">
              {isLoading ? (
                <tr><td colSpan={7} className="p-12 text-center font-bold text-slate-400">Syncing with Fleet Database...</td></tr>
              ) : filteredVehicles.length === 0 ? (
                <tr><td colSpan={7} className="p-12 text-center font-bold text-slate-400">No units found matching criteria.</td></tr>
              ) : (
                filteredVehicles.map(v => (
                  <tr key={v.id} className="hover:bg-brand-green/5 transition-all group cursor-default">
                    <td className="px-8 py-5">
                      <div className="flex flex-col">
                        <p className="font-black text-brand-teal text-sm uppercase tracking-tight">UNIT-{v.id.substring(0,4).toUpperCase()}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ALS AMBULANCE</p>
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-black tracking-widest uppercase shadow-sm border ${
                        v.status === 'READY' ? 'bg-brand-green/10 text-brand-green border-brand-green/20' :
                        v.status === 'BUSY' ? 'bg-status-warning/10 text-status-warning border-status-warning/20' :
                        'bg-status-danger/10 text-status-danger border-status-danger/20'
                      }`}>
                        {v.status}
                      </span>
                    </td>
                    <td className="px-8 py-5 text-sm font-bold text-brand-teal">{v.registrationNumber}</td>
                    <td className="px-8 py-5 text-[11px] font-mono font-bold text-slate-400">{v.imei}</td>
                    <td className="px-8 py-5 text-sm font-bold text-brand-teal">
                      {v.lastLocationAt ? formatDistanceToNow(new Date(v.lastLocationAt), { addSuffix: true }) : 'N/A'}
                    </td>
                    <td className="px-8 py-5">
                      <div className="bg-slate-100 px-3 py-1 rounded text-[10px] font-mono font-bold text-slate-500 inline-block border border-surface-border/50">
                        {v.lastLat && v.lastLng ? `${v.lastLat.toFixed(4)}, ${v.lastLng.toFixed(4)}` : 'SIGNAL LOST'}
                      </div>
                    </td>
                    <td className="px-8 py-5 text-right">
                      <button 
                        onClick={() => addNotification({ type: 'info', title: 'Vehicle Options', message: 'Vehicle management menu opened.' })}
                        className="p-2 text-slate-400 hover:text-brand-teal hover:bg-white rounded-lg transition-all shadow-sm"
                      >
                        <DotsThreeVertical size={24} weight="bold" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-white p-8 border border-surface-border rounded-xl shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="font-sans text-xl font-black text-brand-teal uppercase tracking-tight">Fleet Utilization</h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Efficiency Metrics (Last 24 Hours)</p>
            </div>
            <span className="font-sans text-[10px] font-black tracking-widest text-brand-green uppercase bg-brand-green/10 px-4 py-1.5 rounded-full border border-brand-green/20">Active Link</span>
          </div>
          {/* Mock Graph */}
          <div className="h-56 flex items-end gap-3 px-2">
            {[40, 65, 85, 92, 70, 45, 30, 55, 75, 88].map((h, i) => (
              <div 
                key={i}
                className={`flex-1 ${h > 80 ? 'bg-brand-green' : 'bg-brand-green/30'} hover:scale-y-110 transition-all duration-500 rounded-t-lg cursor-pointer shadow-sm`}
                style={{ height: `${h}%` }}
                title={`Utilization: ${h}%`}
              ></div>
            ))}
          </div>
          <div className="flex justify-between mt-8 border-t border-surface-border pt-6">
            <div className="flex gap-8">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Peak Demand</p>
                <p className="text-xl font-black text-brand-teal leading-none">92%</p>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Avg Idle</p>
                <p className="text-xl font-black text-brand-teal leading-none">14%</p>
              </div>
            </div>
            <button className="text-[10px] font-black uppercase tracking-widest text-brand-green hover:underline">Download Detailed CSV</button>
          </div>
        </div>

        <div className="bg-brand-sidebar p-8 rounded-xl shadow-2xl flex flex-col justify-between border border-brand-teal">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-brand-green/20 p-2 rounded-lg">
                <MapTrifold size={24} weight="bold" className="text-brand-green" />
              </div>
              <h3 className="font-sans text-xl font-black text-white uppercase tracking-tight">Tactical Map</h3>
            </div>
            <div className="w-full h-48 rounded-xl relative overflow-hidden mb-6 border border-white/10 shadow-inner group">
              <div className="absolute inset-0 bg-brand-sidebar/40 z-10 pointer-events-none group-hover:bg-transparent transition-all"></div>
              <Map
                center={[-1.2921, 36.8219]}
                zoom={11}
                vehicleMarkers={liveVehicles}
                layerType="dark"
                showLiveBadge
                showLegend
                lastUpdatedAt={lastUpdatedAt}
              />
            </div>
            <p className="font-sans text-xs font-bold text-slate-400 leading-relaxed uppercase tracking-wide">
              Real-time monitoring of <span className="text-brand-green">{activeCount} tactical units</span> currently deployed across the metropolitan area.
            </p>
          </div>
          <button 
            onClick={() => addNotification({ type: 'info', title: 'Map Expanded', message: 'Full screen tactical map launched.' })}
            className="w-full py-4 border-2 border-brand-green text-brand-green font-black text-xs uppercase tracking-widest rounded-xl mt-8 hover:bg-brand-green hover:text-brand-sidebar transition-all shadow-lg active:scale-95"
          >
            Launch Full-Scale Radar
          </button>
        </div>
      </div>
      
      <AddVehicleModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
      />
    </div>
  );
}
