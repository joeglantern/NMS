import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, MapPin, PaperPlaneRight, ClipboardText,
  X, Phone, User, WarningCircle, FirstAid, ListChecks, XCircle,
} from '@phosphor-icons/react';
import api from '../../api/client';
import Map from '../../components/shared/Map';
import { useNotificationStore } from '../../stores/notificationStore';
import CreatableCombobox from '../../components/shared/CreatableCombobox';

// ── Constants ────────────────────────────────────────────────────────────────

const SUB_COUNTIES = [
  'Dagoretti North','Dagoretti South','Embakasi Central','Embakasi East',
  'Embakasi North','Embakasi South','Embakasi West','Kamukunji','Kasarani',
  'Kibra',"Lang'ata",'Makadara','Mathare','Roysambu','Ruaraka','Starehe','Westlands',
];

const ALERT_MODES = ['Phone', 'Radio', 'Walk-in', 'Other'];

const ORIGIN_OPTIONS = [
  'Community', 'Hospital', 'Police', 'Fire Department', 'Other EMS', 'Self-referral', 'Other',
];

// ── Style tokens ─────────────────────────────────────────────────────────────

const inputCls = 'w-full h-11 px-4 border-2 border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none text-slate-700 placeholder:text-slate-300 bg-white transition-all';
const selectCls = inputCls;
const textareaCls = 'w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-brand-teal focus:border-brand-teal outline-none resize-none text-slate-700 placeholder:text-slate-300 bg-white transition-all';

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-sm font-bold text-brand-teal mb-2">
    {children}
    {required && <span className="text-status-danger ml-1">*</span>}
  </label>
);

const Field = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={className ?? 'flex flex-col'}>{children}</div>
);

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs text-slate-400 mt-1">{children}</p>
);

// ── Section wrapper ───────────────────────────────────────────────────────────

function FormSection({
  title, icon: Icon, step, children,
}: {
  title: string;
  icon: React.ElementType;
  step: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="bg-brand-teal px-5 py-3 flex items-center gap-3">
        <Icon size={18} weight="fill" className="text-white/80" />
        <div>
          <p className="text-[10px] font-bold text-brand-green uppercase tracking-widest">{step}</p>
          <h2 className="text-sm font-bold text-white">{title}</h2>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── Review row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value?: string | boolean }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex gap-4 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wide w-28 shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-slate-700 font-medium">{String(value)}</span>
    </div>
  );
}

// ── Form state ────────────────────────────────────────────────────────────────

type FormState = {
  alertAt: string;
  alertMode: string;
  notifierName: string;
  notifierPhone: string;
  originOfAlert: string;
  locationName: string;
  subCounty: string;
  lat: number;
  lng: number;
  patientName: string;
  patientAge: string;
  patientGender: string;
  nextOfKin: string;
  nextOfKinPhone: string;
  massCasualty: boolean;
  massCasualtyCount: string;
  chiefComplaint: string;
  alertNature: string;
  alertNatureDetail: string;
  watcherComments: string;
  preHospitalManagement: string;
  placeOfReferral: string;
};

const defaultForm: FormState = {
  alertAt: new Date().toISOString().slice(0, 16),
  alertMode: 'Phone',
  notifierName: '',
  notifierPhone: '',
  originOfAlert: '',
  locationName: '',
  subCounty: '',
  lat: -1.2921,
  lng: 36.8219,
  patientName: '',
  patientAge: '',
  patientGender: '',
  nextOfKin: '',
  nextOfKinPhone: '',
  massCasualty: false,
  massCasualtyCount: '',
  chiefComplaint: '',
  alertNature: '',
  alertNatureDetail: '',
  watcherComments: '',
  preHospitalManagement: '',
  placeOfReferral: '',
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function NewIncidentWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotificationStore();

  const submitted    = (location.state as any)?.submitted;
  const submittedCase = (location.state as any)?.caseNumber;

  const [form, setForm] = useState<FormState>(defaultForm);
  const [suggestions, setSuggestions]             = useState<Array<{ display_name: string; lat: string; lon: string; address?: Record<string, string> }>>([]);
  const [showSuggestions, setShowSuggestions]     = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [showEndReason, setShowEndReason]         = useState(false);
  const [endReason, setEndReason]                 = useState('');

  const set = (updates: Partial<FormState>) => setForm(prev => ({ ...prev, ...updates }));

  // ── Nature options from DB (auto-seeded on first call) ────────────────────
  const queryClient = useQueryClient();
  const { data: natureOptions = [] } = useQuery({
    queryKey: ['incident-nature-options'],
    queryFn: async () => {
      const res = await api.get('/incidents/nature-options');
      return res.data.data as Array<{ nature: string; details: string[] }>;
    },
    staleTime: 5 * 60_000,
  });

  const natureList    = natureOptions.map(n => n.nature);
  const detailsForNature = (nature: string) =>
    natureOptions.find(n => n.nature === nature)?.details ?? [];

  async function addNature(nature: string) {
    await api.post('/incidents/nature-options', { nature });
    queryClient.invalidateQueries({ queryKey: ['incident-nature-options'] });
  }

  async function addDetail(nature: string, detail: string) {
    await api.post('/incidents/nature-options', { nature, detail });
    queryClient.invalidateQueries({ queryKey: ['incident-nature-options'] });
  }

  const canSubmit = !!form.alertMode && !!form.locationName.trim() && !!form.subCounty && !!form.chiefComplaint.trim();

  const missingFields = [
    !form.alertMode      && 'alert mode',
    !form.locationName   && 'location',
    !form.subCounty      && 'sub-county',
    !form.chiefComplaint && 'chief complaint',
  ].filter(Boolean) as string[];

  // Tries to match a Nominatim address object against our sub-county list
  function detectSubCounty(address: Record<string, string>): string {
    const candidates = [
      address.city_district,
      address.suburb,
      address.county,
      address.state_district,
      address.municipality,
    ].filter(Boolean).map(s => s.toLowerCase());

    for (const sub of SUB_COUNTIES) {
      const subLower = sub.toLowerCase();
      if (candidates.some(c => c.includes(subLower) || subLower.includes(c))) {
        return sub;
      }
    }
    return '';
  }

  // Debounced autocomplete as the user types — includes addressdetails so we can detect sub-county
  useEffect(() => {
    if (form.locationName.length < 3) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const res  = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(form.locationName + ', Nairobi, Kenya')}&limit=5&addressdetails=1`
        );
        const data = await res.json();
        setSuggestions(data ?? []);
        if (data?.length > 0) setShowSuggestions(true);
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [form.locationName]);

  const selectSuggestion = (s: { display_name: string; lat: string; lon: string; address?: Record<string, string> }) => {
    const name           = s.display_name.split(',').slice(0, 2).join(',').trim();
    const detectedSub    = detectSubCounty(s.address ?? {});
    set({ locationName: name, lat: parseFloat(s.lat), lng: parseFloat(s.lon), ...(detectedSub ? { subCounty: detectedSub } : {}) });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // Clicking the map: set pin + reverse geocode → auto-fills location name AND sub-county
  const handleMapClick = async (lat: number, lng: number) => {
    set({ lat, lng });
    setSuggestions([]);
    setShowSuggestions(false);
    setIsReverseGeocoding(true);
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`);
      const data = await res.json();
      if (data?.display_name) {
        const name        = data.display_name.split(',').slice(0, 2).join(',').trim();
        const detectedSub = detectSubCounty(data.address ?? {});
        set({ locationName: name, ...(detectedSub ? { subCounty: detectedSub } : {}) });
      }
    } catch {} finally {
      setIsReverseGeocoding(false);
    }
  };

  const mutation = useMutation({
    mutationFn: () => api.post('/incidents', buildPayload()),
    onSuccess: (res) => {
      const caseNumber = res?.data?.data?.caseNumber ?? '';
      navigate('/watcher/new-incident', { state: { submitted: true, caseNumber } });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Submission Failed',
        message: err?.response?.data?.message || 'Could not submit incident.',
      });
    },
  });

  // Create the incident then immediately close it — used by the "End Case" footer button
  const buildPayload = () => ({
    alertMode:            form.alertMode,
    alertAt:              form.alertAt,
    originOfAlert:        form.originOfAlert || undefined,
    notifierDetails:      form.notifierName ? [{ name: form.notifierName, phone: form.notifierPhone }] : undefined,
    locationName:         form.locationName,
    subCounty:            form.subCounty,
    lat:                  form.lat,
    lng:                  form.lng,
    patientName:          form.patientName  || undefined,
    patientAge:           form.patientAge   || undefined,
    patientGender:        form.patientGender || undefined,
    nextOfKin:            form.nextOfKin    || undefined,
    nextOfKinPhone:       form.nextOfKinPhone || undefined,
    massCasualty:         form.massCasualty,
    massCasualtyCount:    form.massCasualtyCount ? parseInt(form.massCasualtyCount, 10) : undefined,
    chiefComplaint:       form.chiefComplaint,
    alertNature:          form.alertNature  || undefined,
    alertNatureDetail:    form.alertNatureDetail || undefined,
    watcherComments:      form.watcherComments || undefined,
    preHospitalManagement: form.preHospitalManagement || undefined,
    placeOfReferral:      form.placeOfReferral || undefined,
  });

  const endCaseMutation = useMutation({
    mutationFn: async () => {
      const res = await api.post('/incidents', buildPayload());
      const incidentId = res.data?.data?.id;
      const caseNumber = res.data?.data?.caseNumber ?? '';
      await api.post(`/incidents/${incidentId}/close`, { reason: endReason });
      return caseNumber;
    },
    onSuccess: (caseNumber) => {
      navigate('/watcher/new-incident', { state: { submitted: true, caseNumber, ended: true } });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Failed to End Case',
        message: err?.response?.data?.message || 'Could not end the case.',
      });
    },
  });

  // ── Success screen ──────────────────────────────────────────────────────────

  const ended = (location.state as any)?.ended;

  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 gap-6 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${ended ? 'bg-status-danger/10' : 'bg-brand-green/10'}`}>
          <CheckCircle size={48} weight="fill" className={ended ? 'text-status-danger' : 'text-brand-green'} />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-brand-teal">{ended ? 'Case Ended' : 'Alert Submitted'}</h2>
          {submittedCase && (
            <p className="text-sm text-slate-500 mt-2">
              Case <span className="font-bold text-brand-teal">{submittedCase}</span>{' '}
              {ended ? 'has been recorded and closed.' : 'is now in the dispatch queue.'}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setForm(defaultForm); navigate('/watcher/new-incident', { replace: true, state: {} }); }}
            className="px-5 py-2.5 border-2 border-slate-200 text-brand-teal text-sm font-bold rounded-xl hover:bg-slate-50 transition-all flex items-center gap-2"
          >
            <PaperPlaneRight size={16} /> New Alert
          </button>
          <button
            onClick={() => navigate('/watcher')}
            className="px-5 py-2.5 bg-brand-teal text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all"
          >
            My Alerts
          </button>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────────

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">

      {/* Header */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 shrink-0">
        <div className="flex-1">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-widest mb-0.5">New Incident</p>
          <h1 className="text-lg font-bold text-brand-teal">Alert Intake</h1>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="p-2 text-slate-400 hover:text-status-danger hover:bg-red-50 rounded-lg transition-all"
        >
          <X size={20} weight="bold" />
        </button>
      </div>

      {/* Two-column content */}
      <div className="flex-1 min-h-0 grid grid-cols-2 gap-4 p-4 lg:gap-5 lg:p-5 overflow-hidden">

        {/* ── LEFT COLUMN: Alert + Location + Patient ─────────────────────── */}
        <div className="overflow-y-auto space-y-4 pr-1">

          {/* Step 1 — Alert */}
          <FormSection title="Alert" icon={Phone} step="Step 1 · Intake">
            <Field>
              <Label required>Alert Date &amp; Time</Label>
              <input
                type="datetime-local"
                className={inputCls}
                value={form.alertAt}
                onChange={e => set({ alertAt: e.target.value })}
              />
              <Hint>When was the alert received?</Hint>
            </Field>

            <Field>
              <Label required>Mode of Alert</Label>
              <select className={selectCls} value={form.alertMode} onChange={e => set({ alertMode: e.target.value })}>
                {ALERT_MODES.map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>

            <Field>
              <Label>Origin of Alert</Label>
              <select className={selectCls} value={form.originOfAlert} onChange={e => set({ originOfAlert: e.target.value })}>
                <option value="">Select origin...</option>
                {ORIGIN_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Notifier Name</Label>
                <input type="text" placeholder="Full name" className={inputCls} value={form.notifierName} onChange={e => set({ notifierName: e.target.value })} />
              </Field>
              <Field>
                <Label>Notifier Phone</Label>
                <input type="tel" placeholder="07XXXXXXXX" className={inputCls} value={form.notifierPhone} onChange={e => set({ notifierPhone: e.target.value })} />
              </Field>
            </div>
          </FormSection>

          {/* Step 2 — Location */}
          <FormSection title="Location" icon={MapPin} step="Step 2 · Intake">
            <Field>
              <Label required>Location of Incident</Label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Type to search, or click the map to pin…"
                  className={`${inputCls} pr-10`}
                  value={form.locationName}
                  onChange={e => { set({ locationName: e.target.value }); if (!e.target.value) setSuggestions([]); }}
                  onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  autoComplete="off"
                />
                {/* Spinner while reverse-geocoding a map click */}
                {isReverseGeocoding && (
                  <div className="absolute right-3 top-3 w-5 h-5 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                )}
                {/* Autocomplete dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white border-2 border-slate-200 rounded-xl shadow-xl overflow-hidden">
                    {suggestions.map((s, i) => (
                      <button
                        key={i}
                        type="button"
                        className="w-full text-left px-4 py-3 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-start gap-3 transition-colors"
                        onMouseDown={() => selectSuggestion(s)}
                      >
                        <MapPin size={14} weight="fill" className="text-brand-teal mt-0.5 shrink-0" />
                        <span className="text-slate-700 font-medium leading-snug">
                          {s.display_name.split(',').slice(0, 3).join(',')}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Hint>
                {isReverseGeocoding
                  ? 'Getting address for pinned location…'
                  : 'Type to search or click the map below to pin the scene'}
              </Hint>
            </Field>

            {/* Map — always visible; click anywhere to auto-fill the location */}
            <div className="border-2 border-slate-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
                <MapPin size={12} weight="fill" className="text-brand-teal shrink-0" />
                <span className="text-xs font-medium text-slate-500">
                  Click anywhere on the map to pin the scene — address fills automatically
                </span>
              </div>
              <Map
                center={[form.lat, form.lng]}
                zoom={14}
                markers={[{ id: 'scene', lat: form.lat, lng: form.lng, title: form.locationName || 'Scene', type: 'incident' }]}
                onLocationSelect={handleMapClick}
                layerType="street"
                className="h-72 w-full"
              />
              {form.locationName && !isReverseGeocoding && (
                <div className="px-4 py-2.5 bg-brand-green/5 border-t border-brand-green/20 text-xs text-brand-green font-bold flex items-center gap-1.5">
                  <MapPin size={12} weight="fill" /> {form.locationName} · {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
                </div>
              )}
              {isReverseGeocoding && (
                <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex items-center gap-2">
                  <div className="w-3 h-3 border-2 border-brand-teal border-t-transparent rounded-full animate-spin" />
                  Getting address…
                </div>
              )}
            </div>

            <Field>
              <Label required>Sub-County</Label>
              <select className={selectCls} value={form.subCounty} onChange={e => set({ subCounty: e.target.value })}>
                <option value="">Select sub-county...</option>
                {SUB_COUNTIES.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </FormSection>

          {/* Step 3 — Patient */}
          <FormSection title="Patient" icon={User} step="Step 3 · Intake">
            <Field>
              <Label>Patient Name</Label>
              <input type="text" placeholder="Full name" className={inputCls} value={form.patientName} onChange={e => set({ patientName: e.target.value })} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Age</Label>
                <input type="number" min="0" max="120" inputMode="numeric" placeholder="e.g. 34" className={inputCls} value={form.patientAge} onChange={e => set({ patientAge: e.target.value })} />
              </Field>
              <Field>
                <Label>Sex</Label>
                <select className={selectCls} value={form.patientGender} onChange={e => set({ patientGender: e.target.value })}>
                  <option value="">Select...</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Next of Kin</Label>
                <input type="text" placeholder="Full name" className={inputCls} value={form.nextOfKin} onChange={e => set({ nextOfKin: e.target.value })} />
              </Field>
              <Field>
                <Label>Next of Kin Phone</Label>
                <input type="tel" inputMode="tel" pattern="[0-9+\-\s]*" placeholder="07XXXXXXXX" className={inputCls} value={form.nextOfKinPhone} onChange={e => { const v = e.target.value.replace(/[^0-9+\-\s]/g, ''); set({ nextOfKinPhone: v }); }} />
              </Field>
            </div>

            <label className={`flex items-start gap-4 p-4 border-2 rounded-xl cursor-pointer transition-all ${
              form.massCasualty ? 'border-status-danger bg-status-danger/5' : 'border-slate-200 hover:border-status-danger/50'
            }`}>
              <input
                type="checkbox"
                className="w-5 h-5 mt-0.5 accent-red-500 shrink-0"
                checked={form.massCasualty}
                onChange={e => set({ massCasualty: e.target.checked })}
              />
              <div>
                <p className="font-bold text-status-danger text-sm flex items-center gap-1.5">
                  <WarningCircle size={16} weight="fill" /> Declare Mass Casualty Incident (MCI)
                </p>
                <p className="text-xs text-slate-400 mt-1">Multiple victims requiring heavy response.</p>
              </div>
            </label>

            {form.massCasualty && (
              <Field>
                <Label>Approximate Number of Casualties</Label>
                <input type="number" min="2" placeholder="e.g. 5" className={inputCls} value={form.massCasualtyCount} onChange={e => set({ massCasualtyCount: e.target.value })} />
              </Field>
            )}
          </FormSection>
        </div>

        {/* ── RIGHT COLUMN: Incident Details + Live Review ─────────────────── */}
        <div className="overflow-y-auto space-y-4 pl-1">

          {/* Step 4 — Incident Details */}
          <FormSection title="Incident Details" icon={FirstAid} step="Step 4 · Details">
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <Label>Nature of Alert</Label>
                <CreatableCombobox
                  options={natureList}
                  value={form.alertNature}
                  onChange={v => set({ alertNature: v, alertNatureDetail: '' })}
                  onCreateOption={addNature}
                  placeholder="Select or type new…"
                />
              </Field>
              <Field>
                <Label>Specify Nature</Label>
                <CreatableCombobox
                  options={detailsForNature(form.alertNature)}
                  value={form.alertNatureDetail}
                  onChange={v => set({ alertNatureDetail: v })}
                  onCreateOption={form.alertNature ? (detail) => addDetail(form.alertNature, detail) : undefined}
                  placeholder={form.alertNature ? 'Select or type new…' : 'Pick nature first'}
                  disabled={!form.alertNature}
                />
              </Field>
            </div>

            <Field>
              <Label required>Chief Complaint</Label>
              <textarea
                rows={3}
                placeholder="Describe the primary complaint / reason for call..."
                className={textareaCls}
                value={form.chiefComplaint}
                onChange={e => set({ chiefComplaint: e.target.value })}
              />
              <Hint>Be as specific as possible — this is what dispatchers see first.</Hint>
            </Field>

            <Field>
              <Label>Caller / Watcher Notes</Label>
              <textarea
                rows={3}
                placeholder="Any additional observations from the caller..."
                className={textareaCls}
                value={form.watcherComments}
                onChange={e => set({ watcherComments: e.target.value })}
              />
            </Field>

            <Field>
              <Label>Pre-Hospital Management Given</Label>
              <textarea
                rows={3}
                placeholder="e.g. Tourniquet applied, IV access obtained..."
                className={textareaCls}
                value={form.preHospitalManagement}
                onChange={e => set({ preHospitalManagement: e.target.value })}
              />
            </Field>

            <Field>
              <Label>Place of Referral</Label>
              <input
                type="text"
                placeholder="e.g. Kenyatta National Hospital"
                className={inputCls}
                value={form.placeOfReferral}
                onChange={e => set({ placeOfReferral: e.target.value })}
              />
            </Field>
          </FormSection>

          {/* Step 5 — Live Review */}
          <FormSection title="Review" icon={ListChecks} step="Step 5 · Summary">
            <p className="text-xs text-slate-400 -mt-1">Live summary — updates as you fill the form.</p>

            {[
              { heading: 'Alert Details', rows: [
                { label: 'Alert Time', value: form.alertAt },
                { label: 'Mode',       value: form.alertMode },
                { label: 'Origin',     value: form.originOfAlert },
                { label: 'Notifier',   value: form.notifierName ? `${form.notifierName} · ${form.notifierPhone}` : undefined },
              ]},
              { heading: 'Location', rows: [
                { label: 'Location',   value: form.locationName },
                { label: 'Sub-County', value: form.subCounty },
                { label: 'Coords',     value: form.lat ? `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` : undefined },
              ]},
              { heading: 'Patient', rows: [
                { label: 'Name',       value: form.patientName },
                { label: 'Age / Sex',  value: [form.patientAge, form.patientGender].filter(Boolean).join(' · ') || undefined },
                { label: 'Next of Kin',value: form.nextOfKin ? `${form.nextOfKin} · ${form.nextOfKinPhone}` : undefined },
                { label: 'MCI',        value: form.massCasualty ? `Yes (${form.massCasualtyCount || '?'} casualties)` : undefined },
              ]},
              { heading: 'Incident', rows: [
                { label: 'Nature',     value: [form.alertNature, form.alertNatureDetail].filter(Boolean).join(' → ') || undefined },
                { label: 'Complaint',  value: form.chiefComplaint },
                { label: 'Pre-hosp.',  value: form.preHospitalManagement },
                { label: 'Referral',   value: form.placeOfReferral },
              ]},
            ].map(section => (
              <div key={section.heading} className="border-2 border-slate-100 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-100">
                  <p className="text-xs font-black text-brand-teal uppercase tracking-widest">{section.heading}</p>
                </div>
                <div className="px-4 py-1">
                  {section.rows.map(row =>
                    row.value ? <ReviewRow key={row.label} label={row.label} value={row.value} /> : null
                  )}
                </div>
              </div>
            ))}

            {mutation.isError && (
              <div className="bg-status-danger/10 border border-status-danger/30 text-status-danger px-4 py-3 rounded-xl text-sm font-semibold">
                Submission failed — check your connection and try again.
              </div>
            )}
          </FormSection>
        </div>
      </div>

      {/* End Case reason panel — slides up above footer when active */}
      {showEndReason && (
        <div className="bg-white border-t-2 border-status-danger/30 px-6 py-4 shrink-0">
          <div className="flex items-start gap-3 max-w-2xl mx-auto">
            <div className="flex-1">
              <p className="text-xs font-bold text-status-danger uppercase tracking-widest mb-2">
                Reason for Ending Case <span className="text-status-danger">*</span>
              </p>
              <textarea
                autoFocus
                rows={2}
                placeholder="e.g. Caller confirmed false alarm, no response required…"
                className="w-full px-4 py-2.5 border-2 border-status-danger/30 rounded-xl text-sm font-medium focus:ring-2 focus:ring-status-danger focus:border-status-danger outline-none resize-none text-slate-700 placeholder:text-slate-300 bg-white transition-all"
                value={endReason}
                onChange={e => setEndReason(e.target.value)}
              />
              <p className={`text-xs mt-1 ${endReason.trim().length < 10 && endReason.length > 0 ? 'text-status-danger' : 'text-slate-400'}`}>
                {endReason.trim().length} / 10 characters minimum
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <button
                type="button"
                onClick={() => { setShowEndReason(false); setEndReason(''); }}
                className="px-4 py-2 text-xs font-bold text-slate-500 border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => endCaseMutation.mutate()}
                disabled={endReason.trim().length < 10 || endCaseMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 bg-status-danger text-white text-xs font-bold rounded-xl hover:opacity-90 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <XCircle size={14} weight="fill" />
                {endCaseMutation.isPending ? 'Ending…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sticky footer */}
      <div className="bg-white border-t border-slate-200 px-6 py-3 flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 px-5 py-2.5 border-2 border-slate-200 text-slate-600 text-sm font-bold rounded-xl hover:bg-slate-50 transition-all"
        >
          Cancel
        </button>

        <div className="flex items-center gap-3">
          {!canSubmit && missingFields.length > 0 && (
            <p className="text-xs text-slate-400 max-w-xs text-right">
              Required: {missingFields.join(', ')}
            </p>
          )}
          <button
            type="button"
            onClick={() => { setShowEndReason(v => !v); setEndReason(''); }}
            disabled={!canSubmit}
            className="flex items-center gap-2 px-5 py-2.5 border-2 border-status-danger/50 text-status-danger text-sm font-bold rounded-xl hover:bg-status-danger hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <XCircle size={16} weight="fill" />
            End Case
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !canSubmit}
            className="flex items-center gap-2 px-8 py-2.5 bg-brand-green text-white text-sm font-bold rounded-xl hover:opacity-90 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ClipboardText size={18} weight="bold" />
            {mutation.isPending ? 'Submitting...' : 'Submit Alert'}
          </button>
        </div>
      </div>
    </div>
  );
}
