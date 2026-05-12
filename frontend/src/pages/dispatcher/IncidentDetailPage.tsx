import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretRight, MapPin, PencilSimple, PaperPlaneRight, Printer, ArrowCircleUp, CheckCircle } from '@phosphor-icons/react';
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
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveReason, setResolveReason] = useState('');

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
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Update Failed',
        message: err?.response?.data?.message || 'Could not update incident. Please try again.',
      });
    },
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
        dispatcherComments: dispatcherComments || undefined,
      });
    },
    onSuccess: () => {
      queryClient.setQueryData(['incident', id], (old: any) => ({ ...old, status: 'DISPATCHED' }));
      queryClient.invalidateQueries({ queryKey: ['dispatch', 'queue'] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      addNotification({
        type: 'success',
        title: 'Crew Dispatched',
        message: `Crew has been assigned and dispatched for case ${incident?.caseNumber}.`,
      });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Dispatch Failed',
        message: err?.response?.data?.message || 'Could not dispatch crew. Please try again.',
      });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: () =>
      api.patch(`/incidents/${id}/status`, { status: 'RESOLVED', comments: resolveReason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      queryClient.invalidateQueries({ queryKey: ['incidents'] });
      setShowResolveModal(false);
      setResolveReason('');
      addNotification({ type: 'success', title: 'Case Resolved', message: `Case ${incident?.caseNumber} has been marked as resolved.` });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed to Resolve', message: err?.response?.data?.message || 'Could not resolve the incident.' });
    },
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
      <div className="flex items-center justify-between bg-white p-5 rounded-xl border border-surface-border">
        <div className="flex items-center gap-3">
          <div>
            <p className="text-xs text-slate-text">Incidents / Detail</p>
            <h2 className="text-xl font-bold text-brand-teal mt-0.5">Case {incident.caseNumber}</h2>
          </div>
          {incident.massCasualty && (
            <span className="px-2.5 py-1 bg-status-danger/10 text-status-danger rounded-md font-medium text-xs flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-status-danger animate-pulse"></span>
              MCI
            </span>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="px-4 py-2 border border-surface-border text-slate-600 text-sm font-medium rounded-lg hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <Printer size={16} weight="bold" />
            Print
          </button>
          <button
            onClick={() => {
              updateMutation.mutate({ massCasualty: true });
              addNotification({
                type: 'error',
                title: 'Escalated',
                message: `Incident ${incident.caseNumber} has been escalated.`
              });
            }}
            className="px-4 py-2 border border-status-danger/30 text-status-danger text-sm font-medium rounded-lg hover:bg-status-danger hover:text-white transition-all flex items-center gap-2"
          >
            <ArrowCircleUp size={16} weight="bold" />
            Escalate
          </button>
          <button
            onClick={() => setShowResolveModal(true)}
            disabled={incident.status === 'RESOLVED'}
            className="px-4 py-2 border border-brand-green/40 text-brand-green text-sm font-medium rounded-lg hover:bg-brand-green hover:text-white transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <CheckCircle size={16} weight="bold" />
            {incident.status === 'RESOLVED' ? 'Resolved' : 'Resolve'}
          </button>
        </div>
      </div>

      {/* Status Timeline */}
      <div className="bg-white p-6 border border-surface-border rounded-xl shadow-sm">
        <div className="flex items-center w-full">
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 1 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>1</div>
              <span className={`mt-2 text-xs font-medium ${step >= 1 ? 'text-brand-green' : 'text-slate-text'}`}>Submitted</span>
            </div>
            <div className={`flex-1 h-px mx-4 ${step > 1 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 2 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>2</div>
              <span className={`mt-2 text-xs font-medium ${step >= 2 ? 'text-brand-green' : 'text-slate-text'}`}>Handling</span>
            </div>
            <div className={`flex-1 h-px mx-4 ${step > 2 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex items-center flex-1">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 3 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>3</div>
              <span className={`mt-2 text-xs font-medium ${step >= 3 ? 'text-brand-green' : 'text-slate-text'}`}>Dispatched</span>
            </div>
            <div className={`flex-1 h-px mx-4 ${step > 3 ? 'bg-brand-green' : 'bg-slate-200'}`}></div>
          </div>
          <div className="flex flex-col items-center">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${step >= 4 ? 'bg-brand-green text-white' : 'bg-slate-100 text-slate-text'}`}>4</div>
            <span className={`mt-2 text-xs font-medium ${step >= 4 ? 'text-brand-green' : 'text-slate-text'}`}>Resolved</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left Column: Details */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex justify-between items-center">
              <h3 className="font-semibold text-brand-teal">Incident Brief</h3>
              {!isEditingBrief ? (
                <button
                  onClick={() => setIsEditingBrief(true)}
                  className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-brand-teal transition-all"
                >
                  <PencilSimple size={18} weight="bold" />
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingBrief(false)}
                    className="px-3 py-1.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => updateMutation.mutate({ chiefComplaint: editedComplaint, locationName: editedLocation })}
                    disabled={updateMutation.isPending}
                    className="px-4 py-1.5 bg-brand-teal text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>
            <div className="p-6 grid grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Chief Complaint</label>
                {isEditingBrief ? (
                  <input
                    type="text"
                    value={editedComplaint}
                    onChange={(e) => setEditedComplaint(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <p className="text-sm text-brand-teal font-semibold">{incident.chiefComplaint}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Location</label>
                {isEditingBrief ? (
                  <input
                    type="text"
                    value={editedLocation}
                    onChange={(e) => setEditedLocation(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <div className="flex items-start gap-2">
                    <MapPin size={16} weight="fill" className="text-brand-green mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm text-brand-teal">{incident.locationName}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{incident.subCounty}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="col-span-2 bg-slate-50 p-4 rounded-lg border border-slate-100">
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Caller Notes</label>
                <p className="italic text-slate-500 text-sm leading-relaxed">"{incident.watcherComments || incident.dispatcherComments || 'No specific notes provided.'}"</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50">
              <h3 className="font-semibold text-brand-teal">Patient Information</h3>
            </div>
            <div className="p-6 grid grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Full Name</label>
                <p className="text-sm font-semibold text-brand-teal">{incident.patientName || 'Unknown'}</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Age</label>
                <p className="text-sm text-brand-teal">{incident.patientAge || 'Unknown'} yrs</p>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Gender</label>
                <p className="text-sm text-brand-teal">{incident.patientGender || 'Unknown'}</p>
              </div>
            </div>
          </div>

          {/* Map — incident scene + nearby vehicle positions */}
          <div className="bg-white border border-surface-border rounded-xl shadow-sm h-72 overflow-hidden relative">
            <div className="absolute top-4 left-4 z-[1000] flex gap-2">
              <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2 border border-surface-border">
                <span className="w-2 h-2 bg-status-danger rounded-full animate-pulse"></span>
                <span className="text-xs font-medium">Scene</span>
              </div>
              {(nearestVehicles ?? []).filter(v => v.lastLat && v.lastLng).length > 0 && (
                <div className="bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-2 border border-surface-border">
                  <span className="w-2 h-2 bg-brand-green rounded-full"></span>
                  <span className="text-xs font-medium">
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
          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden flex flex-col max-h-[400px]">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex justify-between items-center">
              <h3 className="font-semibold text-brand-teal">Nearest Vehicles</h3>
              <span className="flex items-center gap-1.5 text-xs text-brand-green font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-brand-green animate-pulse"></span>
                Live
              </span>
            </div>
            <div className="overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10 border-b border-surface-border">
                  <tr className="bg-slate-50">
                    <th className="px-6 py-3 text-xs font-medium text-slate-text">Unit</th>
                    <th className="px-6 py-3 text-xs font-medium text-slate-text">Status</th>
                    <th className="px-6 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(nearestVehicles || []).map(v => (
                    <tr key={v.id} className="border-b border-surface-border hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setSelectedVehicleId(v.id)}>
                      <td className="px-6 py-3">
                        <p className="font-semibold text-brand-teal text-sm">{v.registrationNumber}</p>
                        <p className="text-xs text-slate-text mt-0.5">{v.id?.substring(0,8) ?? '—'}</p>
                      </td>
                      <td className="px-6 py-3">
                        <span className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                          !v.isActive ? 'bg-slate-100 text-slate-400' : 'bg-brand-green/10 text-brand-green'
                        }`}>
                          {v.isActive ? 'Available' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <CaretRight size={16} className="text-slate-text" />
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

          <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-surface-border bg-slate-50">
              <h3 className="font-semibold text-brand-teal">Dispatch Assignment</h3>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-text block mb-1">Vehicle Unit</label>
                  <select
                    className="w-full bg-white border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-green outline-none"
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
                  <label className="text-xs font-medium text-slate-text block mb-1">Driver</label>
                  <select
                    className="w-full bg-white border border-surface-border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
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
                  <label className="text-xs font-medium text-slate-text block mb-1">EMT / Lead</label>
                  <select
                    className="w-full bg-white border border-surface-border rounded-lg px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-green"
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
                <label className="text-xs font-medium text-slate-text block mb-1">Dispatcher Notes</label>
                <textarea
                  className="w-full bg-white border border-surface-border rounded-lg px-4 py-2.5 text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-brand-green"
                  placeholder="Enter notes for the crew..."
                  value={dispatcherComments}
                  onChange={e => setDispatcherComments(e.target.value)}
                ></textarea>
              </div>
              <button
                onClick={() => dispatchMutation.mutate()}
                disabled={!selectedVehicleId || !selectedDriverId || dispatchMutation.isPending || step >= 3}
                className="w-full bg-brand-green text-white text-sm py-3 rounded-lg font-semibold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PaperPlaneRight size={18} weight="fill" />
                {step >= 3 ? 'Already Dispatched' : dispatchMutation.isPending ? 'Dispatching...' : 'Dispatch Crew'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Resolve Modal */}
      {showResolveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-surface-border w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-brand-teal">Resolve Incident</h3>
              <p className="text-sm text-slate-text mt-1">
                Provide a reason for closing case <span className="font-semibold text-brand-teal">{incident.caseNumber}</span>. This will be recorded against the incident.
              </p>
            </div>
            <textarea
              autoFocus
              className="w-full border border-surface-border rounded-lg p-3 text-sm h-28 resize-none outline-none focus:ring-2 focus:ring-brand-green transition-all"
              placeholder="e.g. Patient transferred to Kenyatta Hospital, crew released and unit returned to base..."
              value={resolveReason}
              onChange={(e) => setResolveReason(e.target.value)}
            />
            <p className="text-xs text-slate-400 -mt-2">Minimum 5 characters required.</p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowResolveModal(false); setResolveReason(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => resolveMutation.mutate()}
                disabled={resolveReason.trim().length < 5 || resolveMutation.isPending}
                className="px-5 py-2 bg-brand-green text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CheckCircle size={16} weight="bold" />
                {resolveMutation.isPending ? 'Resolving...' : 'Mark as Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
