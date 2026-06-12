import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CaretRight, MapPin, PencilSimple, PaperPlaneRight, Printer, ArrowCircleUp, CheckCircle, Phone, ClockCounterClockwise, CaretDown, ShareNetwork, XCircle } from '@phosphor-icons/react';
import api from '../../api/client';
import { Incident, Vehicle, User, AuditLog } from '../../types/api';
import EndCaseModal from '../../components/shared/EndCaseModal';
import { formatDistanceToNow } from 'date-fns';
import Map from '../../components/shared/Map';
import { useNotificationStore } from '../../stores/notificationStore';
import { LiveVehicle } from '../../hooks/useVehicleTracking';
import { socket } from '../../lib/socket';

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { addNotification } = useNotificationStore();

  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [dispatcherComments, setDispatcherComments] = useState('');
  const [isEditingBrief, setIsEditingBrief] = useState(false);
  const [editedComplaint, setEditedComplaint] = useState('');
  const [editedLocation, setEditedLocation] = useState('');
  const [editedPlaceOfReferral, setEditedPlaceOfReferral] = useState('');
  const [editedDispatcherChallenges, setEditedDispatcherChallenges] = useState('');
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [resolveReason, setResolveReason] = useState('');
  const [showEndCaseModal, setShowEndCaseModal] = useState(false);
  const [showAssignPartnerModal, setShowAssignPartnerModal] = useState(false);
  const [selectedPartnerAgencyId, setSelectedPartnerAgencyId] = useState('');
  const [partnerAssignReason, setPartnerAssignReason] = useState('');
  const [dialModal, setDialModal] = useState<{ number: string } | null>(null);
  const [dialExt, setDialExt] = useState('');

  // Fetch Incident
  const { data: incident, isLoading } = useQuery({
    queryKey: ['incident', id],
    queryFn: async () => {
      const res = await api.get(`/incidents/${id}`);
      const data = res.data.data as Incident;
      setEditedComplaint(data.chiefComplaint);
      setEditedLocation(data.locationName);
      setEditedPlaceOfReferral(data.placeOfReferral ?? '');
      setEditedDispatcherChallenges(data.dispatcherChallenges ?? '');
      return data;
    },
    enabled: !!id,
  });

  const { data: auditLog = [] } = useQuery({
    queryKey: ['incident', id, 'audit-log'],
    queryFn: async () => {
      const res = await api.get(`/incidents/${id}/audit-log`);
      return res.data.data as AuditLog[];
    },
    enabled: !!id && showAuditLog,
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

  // Real-time: keep incident fresh when status changes or crew is assigned
  useEffect(() => {
    if (!id) return;
    function onIncidentUpdate(updated: Incident) {
      if (updated.id !== id) return;
      queryClient.setQueryData(['incident', id], (old: Incident | undefined) =>
        old ? { ...old, ...updated } : old
      );
    }
    function onTaskAssigned(task: { incidentId: string }) {
      if (task.incidentId !== id) return;
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
    }
    socket.on('incident:update', onIncidentUpdate);
    socket.on('task:assigned', onTaskAssigned);
    return () => {
      socket.off('incident:update', onIncidentUpdate);
      socket.off('task:assigned', onTaskAssigned);
    };
  }, [id, queryClient]);

  // Dispatch Mutation — creates a Task (crew pulled automatically from vehicle check-in)
  const dispatchMutation = useMutation({
    mutationFn: async () => {
      return api.post('/tasks', {
        incidentId: id,
        vehicleId: selectedVehicleId,
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

  const { data: partnerAgencies = [] } = useQuery({
    queryKey: ['incidents', 'partner-agencies'],
    queryFn: async () => {
      const res = await api.get('/incidents/partner-agencies');
      return res.data.data as { id: string; name: string; location?: string }[];
    },
  });

  const assignPartnerMutation = useMutation({
    mutationFn: () =>
      api.post(`/incidents/${id}/assign-partner`, {
        partnerAgencyId: selectedPartnerAgencyId,
        reason: partnerAssignReason,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['incident', id] });
      setShowAssignPartnerModal(false);
      setSelectedPartnerAgencyId('');
      setPartnerAssignReason('');
      addNotification({ type: 'success', title: 'Assigned', message: 'Case forwarded to partner agency.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Failed', message: err?.response?.data?.message || 'Could not assign to partner.' });
    },
  });

  const dialMutation = useMutation({
    mutationFn: ({ extId, outNumber }: { extId: string; outNumber: string }) =>
      api.post('/pbx/dial', { extId, outNumber, incidentId: id }),
    onSuccess: () => {
      setDialModal(null);
      setDialExt('');
      addNotification({ type: 'success', title: 'Call Initiated', message: 'Your phone will ring first, then connect to the number.' });
    },
    onError: (err: any) => {
      addNotification({ type: 'error', title: 'Call Failed', message: err?.response?.data?.message || 'Could not initiate call.' });
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
            onClick={() => setShowAssignPartnerModal(true)}
            disabled={incident.status === 'RESOLVED'}
            className="px-4 py-2 border border-brand-teal/30 text-brand-teal text-sm font-medium rounded-lg hover:bg-brand-teal hover:text-white transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShareNetwork size={16} weight="bold" />
            Assign to Partner
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
          <button
            onClick={() => setShowEndCaseModal(true)}
            disabled={incident.status === 'RESOLVED'}
            className="px-4 py-2 bg-status-danger text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={16} weight="fill" />
            End Case
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
                    onClick={() => updateMutation.mutate({
                      chiefComplaint: editedComplaint,
                      locationName: editedLocation,
                      placeOfReferral: editedPlaceOfReferral || undefined,
                      dispatcherChallenges: editedDispatcherChallenges || undefined,
                    })}
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
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Referral Facility</label>
                {isEditingBrief ? (
                  <input
                    type="text"
                    value={editedPlaceOfReferral}
                    onChange={e => setEditedPlaceOfReferral(e.target.value)}
                    placeholder="e.g. Kenyatta National Hospital"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <p className="text-sm text-brand-teal">{incident.placeOfReferral || '—'}</p>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 block mb-1.5">Dispatcher Challenges</label>
                {isEditingBrief ? (
                  <input
                    type="text"
                    value={editedDispatcherChallenges}
                    onChange={e => setEditedDispatcherChallenges(e.target.value)}
                    placeholder="e.g. Traffic on Uhuru Highway"
                    className="w-full bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-sm text-brand-teal focus:ring-2 focus:ring-brand-teal/20 focus:border-brand-teal outline-none transition-all"
                  />
                ) : (
                  <p className="text-sm text-brand-teal">{incident.dispatcherChallenges || '—'}</p>
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
              {incident.patientContact && (
                <div>
                  <label className="text-xs font-medium text-slate-text block mb-1">Patient Contact</label>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-brand-teal">{incident.patientContact}</p>
                    <button
                      onClick={() => setDialModal({ number: incident.patientContact! })}
                      className="p-1.5 rounded-lg bg-brand-green/10 text-brand-green hover:bg-brand-green hover:text-white transition-all"
                      title={`Call ${incident.patientContact}`}
                    >
                      <Phone size={13} weight="fill" />
                    </button>
                  </div>
                </div>
              )}
              {incident.nextOfKin && (
                <div className="col-span-2">
                  <label className="text-xs font-medium text-slate-text block mb-1">Next of Kin</label>
                  <p className="text-sm text-brand-teal">{incident.nextOfKin}</p>
                </div>
              )}
            </div>
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
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Vehicle Unit</label>
                <select
                  className="w-full bg-white border border-surface-border rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-brand-green outline-none"
                  value={selectedVehicleId}
                  onChange={e => setSelectedVehicleId(e.target.value)}
                >
                  <option value="">Select available unit...</option>
                  {(nearestVehicles || []).map(v => (
                    <option key={v.id} value={v.id}>
                      {v.registrationNumber}{v.currentDriver ? ` — ${v.currentDriver.name}` : ' — no crew'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Crew Preview — shows who is checked in to the selected vehicle */}
              {selectedVehicleId && (() => {
                const sv = (nearestVehicles || []).find(v => v.id === selectedVehicleId);
                if (!sv) return null;
                const hasCrew = sv.currentDriver && sv.currentEmt;
                return (
                  <div className={`rounded-lg p-4 border text-sm ${hasCrew ? 'bg-brand-green/5 border-brand-green/20' : 'bg-status-warning/5 border-status-warning/30'}`}>
                    <p className="text-xs font-black uppercase tracking-widest mb-3 text-slate-400">Crew on board</p>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Driver</span>
                        <span className={`text-xs font-semibold ${sv.currentDriver ? 'text-brand-teal' : 'text-status-danger'}`}>
                          {sv.currentDriver?.name ?? 'Not checked in'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">EMT</span>
                        <span className={`text-xs font-semibold ${sv.currentEmt ? 'text-brand-teal' : 'text-status-danger'}`}>
                          {sv.currentEmt?.name ?? 'Not checked in'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">Nurse</span>
                        <span className="text-xs font-semibold text-slate-400">
                          {sv.currentNurse?.name ?? '—'}
                        </span>
                      </div>
                    </div>
                    {!hasCrew && (
                      <p className="text-xs text-status-warning font-medium mt-3">
                        Driver and EMT must be checked in via the mobile app before dispatching.
                      </p>
                    )}
                  </div>
                );
              })()}

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
                disabled={
                  !selectedVehicleId ||
                  !(nearestVehicles || []).find(v => v.id === selectedVehicleId)?.currentDriver ||
                  !(nearestVehicles || []).find(v => v.id === selectedVehicleId)?.currentEmt ||
                  dispatchMutation.isPending ||
                  step >= 3
                }
                className="w-full bg-brand-green text-white text-sm py-3 rounded-lg font-semibold hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PaperPlaneRight size={18} weight="fill" />
                {step >= 3 ? 'Already Dispatched' : dispatchMutation.isPending ? 'Dispatching...' : 'Dispatch Vehicle'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scene Map — full width, tall panel */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-surface-border bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} weight="fill" className="text-status-danger" />
            <h3 className="font-semibold text-brand-teal">Scene Map</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-slate-text">
              <span className="w-2 h-2 bg-status-danger rounded-full animate-pulse"></span>
              Scene
            </div>
            {(nearestVehicles ?? []).filter(v => v.lastLat && v.lastLng).length > 0 && (
              <div className="flex items-center gap-1.5 text-xs text-brand-green font-medium">
                <span className="w-2 h-2 bg-brand-green rounded-full"></span>
                {(nearestVehicles ?? []).filter(v => v.lastLat && v.lastLng).length} nearby units
              </div>
            )}
          </div>
        </div>
        <div className="h-[440px] relative">
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

      {/* Audit Log */}
      <div className="bg-white border border-surface-border rounded-xl shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAuditLog(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ClockCounterClockwise size={16} weight="bold" className="text-slate-400" />
            <span className="font-semibold text-brand-teal text-sm">Change History</span>
            {auditLog.length > 0 && (
              <span className="text-xs font-bold bg-brand-teal/10 text-brand-teal px-2 py-0.5 rounded-full">{auditLog.length}</span>
            )}
          </div>
          <CaretDown
            size={16}
            weight="bold"
            className={`text-slate-400 transition-transform duration-200 ${showAuditLog ? 'rotate-180' : ''}`}
          />
        </button>

        {showAuditLog && (
          <div className="border-t border-surface-border divide-y divide-surface-border/50">
            {auditLog.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-slate-400">No changes recorded yet.</p>
            ) : auditLog.map(entry => (
              <div key={entry.id} className="px-6 py-4 flex gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-white ${
                  entry.action === 'CREATE' ? 'bg-brand-green' :
                  entry.action === 'STATUS_CHANGE' ? 'bg-brand-teal' :
                  'bg-slate-400'
                }`}>
                  {entry.action === 'CREATE' ? '+' : entry.action === 'STATUS_CHANGE' ? '→' : '✎'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-brand-teal">{entry.user.name}</span>
                    <span className="text-xs text-slate-400 uppercase tracking-wide">{entry.user.role.replace('_', ' ')}</span>
                    <span className="ml-auto text-xs text-slate-400 whitespace-nowrap">
                      {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {entry.action === 'CREATE' && 'Incident created'}
                    {entry.action === 'STATUS_CHANGE' && `Status changed: ${String(entry.oldValues?.status ?? '')} → ${String(entry.newValues?.status ?? '')}`}
                    {entry.action === 'UPDATE' && (
                      Object.keys(entry.newValues ?? {}).map(k =>
                        `${k}: "${String(entry.oldValues?.[k] ?? '—')}" → "${String(entry.newValues?.[k] ?? '')}"`
                      ).join(' · ')
                    )}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
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

      {/* Assign to Partner Modal */}
      {showAssignPartnerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl border border-surface-border w-full max-w-md mx-4 p-6 flex flex-col gap-4">
            <div>
              <h3 className="text-lg font-bold text-brand-teal flex items-center gap-2">
                <ShareNetwork size={20} weight="fill" className="text-brand-teal" />
                Assign to Partner
              </h3>
              <p className="text-sm text-slate-text mt-1">
                Forward case <span className="font-semibold text-brand-teal">{incident.caseNumber}</span> to a partner agency for handling.
              </p>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1.5">Partner Agency</label>
              <select
                value={selectedPartnerAgencyId}
                onChange={e => setSelectedPartnerAgencyId(e.target.value)}
                className="w-full border border-surface-border rounded-lg px-3 py-2.5 text-sm text-brand-teal outline-none focus:ring-2 focus:ring-brand-teal bg-slate-50"
              >
                <option value="">Select a partner agency...</option>
                {partnerAgencies.map(a => (
                  <option key={a.id} value={a.id}>{a.name}{a.location ? ` — ${a.location}` : ''}</option>
                ))}
              </select>
              {partnerAgencies.length === 0 && (
                <p className="text-xs text-slate-400 mt-1">No active partner agencies found.</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-slate-text block mb-1.5">Reason for Assignment</label>
              <textarea
                autoFocus
                className="w-full border border-surface-border rounded-lg p-3 text-sm h-24 resize-none outline-none focus:ring-2 focus:ring-brand-teal transition-all"
                placeholder="e.g. Patient requires specialist care beyond EOC capacity..."
                value={partnerAssignReason}
                onChange={e => setPartnerAssignReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => { setShowAssignPartnerModal(false); setSelectedPartnerAgencyId(''); setPartnerAssignReason(''); }}
                className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={() => assignPartnerMutation.mutate()}
                disabled={!selectedPartnerAgencyId || partnerAssignReason.trim().length < 5 || assignPartnerMutation.isPending}
                className="px-5 py-2 bg-brand-teal text-white text-sm font-semibold rounded-lg hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShareNetwork size={16} weight="fill" />
                {assignPartnerMutation.isPending ? 'Assigning...' : 'Forward to Partner'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click-to-Call modal */}
      {dialModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm border border-surface-border">
            <h3 className="text-base font-bold text-brand-teal mb-1 flex items-center gap-2">
              <Phone size={18} weight="fill" className="text-brand-green" />
              Initiate Call
            </h3>
            <p className="text-xs text-slate-text mb-4">
              Your extension will ring first. Once you answer, it connects to the number below.
            </p>
            <div className="flex flex-col gap-3 mb-5">
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Your Extension</label>
                <input
                  type="text"
                  placeholder="e.g. 101"
                  autoFocus
                  value={dialExt}
                  onChange={e => setDialExt(e.target.value)}
                  className="w-full border border-surface-border rounded-lg px-4 py-2.5 text-sm font-semibold text-brand-teal focus:ring-2 focus:ring-brand-green outline-none"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-text block mb-1">Calling</label>
                <p className="px-4 py-2.5 bg-slate-50 rounded-lg text-sm font-bold text-brand-teal border border-surface-border">
                  {dialModal.number}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { setDialModal(null); setDialExt(''); }}
                className="flex-1 px-4 py-2.5 border border-surface-border rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => dialMutation.mutate({ extId: dialExt, outNumber: dialModal.number })}
                disabled={!dialExt.trim() || dialMutation.isPending}
                className="flex-1 px-4 py-2.5 bg-brand-green text-white rounded-lg text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Phone size={16} weight="fill" />
                {dialMutation.isPending ? 'Calling...' : 'Call Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {incident && (
        <EndCaseModal
          incidentId={incident.id}
          caseNumber={incident.caseNumber}
          isOpen={showEndCaseModal}
          onClose={() => setShowEndCaseModal(false)}
          onSuccess={() => navigate('/dashboard')}
          invalidateKeys={[['incidents']]}
        />
      )}
    </div>
  );
}
