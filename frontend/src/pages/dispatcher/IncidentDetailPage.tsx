import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretRight, MapPin, PencilSimple, PaperPlaneRight, Printer, ArrowCircleUp } from '@phosphor-icons/react';
import api from '../../api/client';
import { Incident, Vehicle, User } from '../../types/api';
import Map from '../../components/shared/Map';
import { useNotificationStore } from '../../stores/notificationStore';
import { LiveVehicle } from '../../hooks/useVehicleTracking';

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedEmtId, setSelectedEmtId] = useState('');
  const [dispatcherComments, setDispatcherComments] = useState('');
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [editedComplaint, setEditedComplaint] = useState('');
  const [editedLocation, setEditedLocation] = useState('');

  // Fetch Incident
  const { data: incident, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const res = await api.get(`/incidents/${id}`);
      const data = res.data.data as Incident;
      setEditedComplaint(data.chiefComplaint);
      setEditedLocation(data.locationName);
      return data;
    },
    enabled: !!id,
  });

  // Update Incident Mutation
  const updateMutation = useMutation({
    mutationFn: async (payload: Partial<Incident>) => {
      return api.patch(`/incidents/${id}`, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      setIsEditingBrief(false);
      addNotification({ type: 'success', title: 'Updated', message: 'Incident details updated successfully.' });
    }
  });

  // Fetch nearest vehicles — use lat/lng from incident if available, else list all
  const { data: nearestVehicles } = useQuery({
    queryKey: ['vehicles', 'nearest', incident?.id],
    queryFn: async () => {
      if (incident?.lat && incident?.lng) {
        const res = await api.get(`/dispatch/nearest-vehicles?lat=${incident.lat}&lng=${incident.lng}&limit=10`);
        return res.data.data as Vehicle[];
      }
      const res = await api.get('/admin/vehicles');
      return res.data.data as Vehicle[];
    },
    enabled: !!incident,
  });

  // Fetch available personnel (DRIVER, EMT, NURSE roles for crew selection)
  const { data: personnel } = useQuery({
    queryKey: ['users', 'personnel'],
    queryFn: async () => {
      const res = await api.get('/admin/users?role=DRIVER&limit=100');
      return res.data.data as User[];
    },
  });

  // Dispatch Mutation — creates a Task (assigns crew to incident)
  const dispatchMutation = useMutation({
    mutationFn: async () => {
      return api.post('/tasks', {
        incidentId: id,
        vehicleId: selectedVehicleId,
        driverId: selectedDriverId,
        emtId: selectedEmtId,
        nurseId: '',   // No separate nurse selector — send empty; backend handles optional
        dispatcherComments,
      });
    },
    onSuccess: () => {
      // Optimistically update incident status
      queryClient.setQueryData(['incident', id], (old: any) => ({ ...old, status: 'DISPATCHED' }));
      // Invalidate queue
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
    }
  });

  if (isLoading) return <div className="p-10 font-bold text-center text-slate-text">Loading Incident Details...</div>;
  if (!incident) return <div className="p-10 font-bold text-center text-status-danger">Incident Not Found</div>;

  const getStatusStep = () => {
    if (incident.status === 'DRAFT' || incident.status === 'SUBMITTED') return 1;
    if (incident.status === 'DISPATCH_HANDLING' || incident.status === 'DISPATCH_ON_HOLD') return 2;
    if (incident.status === 'DISPATCHED') return 3;
    if (incident.status === 'RESOLVED') return 4;
    return 1;
  };

  const step = getStatusStep();

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase">Incidents / Detail</span>
          <h2 className="font-sans text-[24px] font-bold text-brand-teal uppercase">CASE {incident.caseNumber}</h2>
          {incident.massCasualty && (
            <span className="px-3 py-1 bg-status-danger/15 text-status-danger rounded-full font-bold text-xs flex items-center gap-2 uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-status-danger animate-pulse"></span>
              Critical Priority
            </span>
          )}
        </div>
        <div className="flex gap-4">
          <button 
            onClick={() => window.print()}
            className="group px-6 py-2.5 border-2 border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest rounded-xl hover:bg-brand-teal hover:text-white hover:border-brand-teal transition-all duration-300 flex items-center gap-3 shadow-sm active:scale-95"
          >
            <Printer size={20} weight="bold" className="group-hover:animate-bounce" /> 
            Print Tactical Log
          </button>
          <button 
            onClick={() => {
              updateMutation.mutate({ massCasualty: true });
              addNotification({ 
                type: 'error', 
                title: 'High-Level Escalation', 
                message: `Incident ${incident.caseNumber} has been escalated to National Command.` 
              });
            }}
            className="group px-6 py-2.5 border-2 border-status-danger/30 text-status-danger text-xs font-black uppercase tracking-widest rounded-xl hover:bg-status-danger hover:text-white hover:border-status-danger transition-all duration-300 flex items-center gap-3 shadow-lg shadow-status-danger/10 active:scale-95"
          >
            <ArrowCircleUp size={20} weight="bold" className="group-hover:scale-125 transition-transform" /> 
            Escalate Command
          </button>
        </div>
      </div>

      {/* Status Timeline */}
      <div className="bg-white p-6 border border-surface-border rounded-lg shadow-sm">
        <div className="flex items-center w-full">
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 1 ? 'bg-brand-green text-white' : 'bg-slate-200 text-slate-text'}`}>1</div>
              <span className={`mt-2 font-sans text-[11px] font-bold tracking-widest uppercase ${step >= 1 ? 'text-brand-green' : 'text-slate-text'}`}>SUBMITTED</span>
            </div>
            <div className={`flex-1 h-[2px] mx-4 ${step > 1 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 2 ? 'bg-brand-green text-white' : 'bg-slate-200 text-slate-text'}`}>2</div>
              <span className={`mt-2 font-sans text-[11px] font-bold tracking-widest uppercase ${step >= 2 ? 'text-brand-green' : 'text-slate-text'}`}>HANDLING</span>
            </div>
            <div className={`flex-1 h-[2px] mx-4 ${step > 2 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 3 ? 'bg-brand-green text-white' : 'bg-slate-200 text-slate-text'}`}>3</div>
              <span className={`mt-2 font-sans text-[11px] font-bold tracking-widest uppercase ${step >= 3 ? 'text-brand-green' : 'text-slate-text'}`}>DISPATCHED</span>
            </div>
            <div className={`flex-1 h-[2px] mx-4 ${step > 3 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${step >= 4 ? 'bg-brand-green text-white' : 'bg-slate-200 text-slate-text'}`}>4</div>
            <span className={`mt-2 font-sans text-[11px] font-bold tracking-widest uppercase ${step >= 4 ? 'text-brand-green' : 'text-slate-text'}`}>RESOLVED</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Details */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden transition-all">
            <div className="px-6 py-4 border-b border-surface-border bg-[#f8fafb] flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-5 bg-brand-teal rounded-full"></div>
                <h3 className="font-sans text-[18px] font-black text-brand-teal uppercase tracking-tight">Incident Brief</h3>
              </div>
              {!isEditingBrief ? (
                <button 
                  onClick={() => setIsEditingBrief(true)}
                  className="p-2 hover:bg-brand-teal/10 rounded-lg text-slate-400 hover:text-brand-teal transition-all"
                >
                  <PencilSimple size={20} weight="bold" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button 
                    onClick={() => setIsEditingBrief(false)}
                    className="px-3 py-1 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={() => updateMutation.mutate({ chiefComplaint: editedComplaint, locationName: editedLocation })}
                    disabled={updateMutation.isPending}
                    className="px-4 py-1.5 bg-brand-teal text-white text-[10px] font-black uppercase rounded-lg shadow-md hover:bg-brand-sidebar transition-all disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              )}
            </div>
            <div className="p-6 grid grid-cols-2 gap-8">
              <div>
                <label className="font-sans text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-2">CHIEF COMPLAINT</label>
                {isEditingBrief ? (
                  <input 
                    type="text" 
                    value={editedComplaint}
                    onChange={(e) => setEditedComplaint(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg font-sans text-sm font-bold text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <p className="font-sans text-base text-brand-teal font-black">{incident.chiefComplaint}</p>
                )}
              </div>
              <div>
                <label className="font-sans text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-2">LOCATION DETAILS</label>
                {isEditingBrief ? (
                  <input 
                    type="text" 
                    value={editedLocation}
                    onChange={(e) => setEditedLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg font-sans text-sm font-bold text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <div className="flex items-start gap-2.5">
                    <MapPin size={20} weight="fill" className="text-brand-green mt-0.5" />
                    <p className="font-sans text-sm font-bold text-slate-600">{incident.locationName}<br/><span className="text-xs text-slate-400 font-normal uppercase tracking-wider">{incident.subCounty}</span></p>
                  </div>
                )}
              </div>
              <div className="col-span-2 bg-slate-50 p-5 rounded-xl border border-slate-100 border-dashed">
                <label className="font-sans text-[10px] font-black tracking-widest text-slate-400 uppercase block mb-2">CALLER NOTES</label>
                <p className="italic text-slate-500 text-sm leading-relaxed">"{incident.watcherComments || incident.dispatcherComments || 'No specific notes provided.'}"</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-surface-border rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-[#eaf5fb]">
              <h3 className="font-sans text-[20px] font-bold text-brand-teal">Patient Information</h3>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              <div>
                <label className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase block mb-1">FULL NAME</label>
                <p className="font-sans text-sm font-bold text-brand-teal">{incident.patientName || 'Unknown'}</p>
              </div>
              <div>
                <label className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase block mb-1">AGE</label>
                <p className="font-sans text-sm text-brand-teal">{incident.patientAge || 'Unknown'} yrs</p>
              </div>
              <div>
                <label className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase block mb-1">GENDER</label>
                <p className="font-sans text-sm text-brand-teal">{incident.patientGender || 'Unknown'}</p>
              </div>
            </div>
          </div>

          {/* Map — incident scene + nearby vehicle positions */}
          <div className="bg-white border border-surface-border rounded-lg shadow-sm h-72 overflow-hidden relative">
            <div className="absolute top-4 left-4 z-[1000] flex gap-2">
              <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm flex items-center gap-2 border border-surface-border">
                <span className="w-2.5 h-2.5 bg-status-danger rounded-full animate-pulse"></span>
                <span className="font-sans text-[10px] font-black tracking-widest uppercase">Scene</span>
              </div>
              {(nearestVehicles ?? []).filter(v => v.lastLat && v.lastLng).length > 0 && (
                <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded shadow-sm flex items-center gap-2 border border-surface-border">
                  <span className="w-2.5 h-2.5 bg-brand-green rounded-full animate-pulse"></span>
                  <span className="font-sans text-[10px] font-black tracking-widest uppercase">
                    {(nearestVehicles ?? []).filter(v => v.lastLat && v.lastLng).length} Units
                  </span>
                </div>
              )}
            </div>
            <Map
              center={[incident.lat || -1.2921, incident.lng || 36.8219]}
              zoom={14}
              markers={[{ id: incident.id, lat: incident.lat || -1.2921, lng: incident.lng || 36.8219, title: incident.caseNumber, type: 'incident' }]}
              vehicleMarkers={(nearestVehicles ?? [])
                .filter(v => v.lastLat && v.lastLng)
                .map((v): LiveVehicle => ({
                  vehicleId: v.id,
                  imei: v.imei,
                  registration: v.registrationNumber,
                  lat: v.lastLat!,
                  lng: v.lastLng!,
                  speed: 0,
                  heading: 0,
                  ignition: v.status !== 'MAINTENANCE',
                  timestamp: v.lastLocationAt ?? new Date().toISOString(),
                  dbStatus: (v.status as LiveVehicle['dbStatus']) ?? 'READY',
                  isActive: v.isActive,
                }))}
            />
          </div>
        </div>

        {/* Right Column: Dispatch Panel */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white border border-surface-border rounded-lg shadow-sm overflow-hidden flex flex-col max-h-[400px]">
            <div className="px-6 py-4 border-b border-surface-border bg-[#eaf5fb] flex justify-between items-center">
              <h3 className="font-sans text-[20px] font-bold text-brand-teal">Nearest Vehicles</h3>
              <span className="font-sans text-[11px] font-bold tracking-widest text-brand-green uppercase">LIVE RADAR</span>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10 border-b border-surface-border">
                  <tr className="bg-slate-50">
                    <th className="px-6 py-2 font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase">UNIT / DISTANCE</th>
                    <th className="px-6 py-2 font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase">STATUS</th>
                    <th className="px-6 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {(nearestVehicles || []).map(v => (
                    <tr key={v.id} className="border-b border-surface-border hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelectedVehicleId(v.id)}>
                      <td className="px-6 py-3">
                        <p className="font-bold text-brand-teal text-sm">{v.registrationNumber}</p>
                        <p className="text-xs text-slate-text uppercase tracking-wider">{v.id?.substring(0,8) ?? '—'}</p>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-widest uppercase ${
                          !v.isActive
                            ? 'bg-slate-100 text-slate-400'
                            : 'bg-brand-green/15 text-brand-green'
                        }`}>
                          {v.isActive ? 'AVAILABLE' : 'INACTIVE'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <CaretRight size={20} className="text-slate-text" />
                      </td>
                    </tr>
                  ))}
                  {(!nearestVehicles || nearestVehicles.length === 0) && (
                    <tr>
                      <td colSpan={3} className="px-6 py-6 text-center text-sm text-slate-text">No available vehicles nearby.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-surface-border rounded-lg shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-[#eaf5fb]">
              <h3 className="font-sans text-[20px] font-bold text-brand-teal">Dispatch Assignment</h3>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase block mb-1">VEHICLE UNIT</label>
                  <select 
                    className="w-full bg-white border border-surface-border rounded px-4 py-2 text-sm focus:ring-2 focus:ring-brand-green outline-none appearance-none"
                    value={selectedVehicleId}
                    onChange={e => setSelectedVehicleId(e.target.value)}
                  >
                    <option value="">Select available unit...</option>
                    {(nearestVehicles || []).map(v => (
                      <option key={v.id} value={v.id}>{v.registrationNumber}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase block mb-1">DRIVER</label>
                  <select 
                    className="w-full bg-white border border-surface-border rounded px-4 py-2 text-sm outline-none"
                    value={selectedDriverId}
                    onChange={e => setSelectedDriverId(e.target.value)}
                  >
                    <option value="">Select driver...</option>
                    {(personnel || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase block mb-1">EMT / LEAD</label>
                  <select 
                    className="w-full bg-white border border-surface-border rounded px-4 py-2 text-sm outline-none"
                    value={selectedEmtId}
                    onChange={e => setSelectedEmtId(e.target.value)}
                  >
                    <option value="">Select EMT...</option>
                    {(personnel || []).map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="font-sans text-[11px] font-bold tracking-widest text-slate-text uppercase block mb-1">DISPATCHER COMMENTS</label>
                <textarea 
                  className="w-full bg-white border border-surface-border rounded px-4 py-2 text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-brand-green" 
                  placeholder="Enter critical notes for the crew..."
                  value={dispatcherComments}
                  onChange={e => setDispatcherComments(e.target.value)}
                ></textarea>
              </div>
              <button 
                onClick={() => dispatchMutation.mutate()}
                disabled={!selectedVehicleId || !selectedDriverId || dispatchMutation.isPending || step >= 3}
                className="w-full bg-brand-green text-white font-sans text-base py-3 rounded-lg font-bold shadow-md hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PaperPlaneRight size={20} weight="fill" />
                {step >= 3 ? 'ALREADY DISPATCHED' : dispatchMutation.isPending ? 'DISPATCHING...' : 'DISPATCH CREW NOW'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
