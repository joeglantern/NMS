import { useState, useEffect, Fragment } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CheckCircle, MapPin, PaperPlaneRight, ClipboardText,
  X, Phone, User, WarningCircle, FirstAid, ListChecks, XCircle,
  ArrowRight, ArrowLeft, PencilSimple, Eye,
} from '@phosphor-icons/react';
import api from '../../api/client';
import Map from '../../components/shared/Map';
import { useNotificationStore } from '../../stores/notificationStore';

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

const inputCls = [
  'w-full h-11 px-4 rounded-lg text-sm font-medium outline-none transition-all',
  'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]',
  'placeholder:text-[var(--muted-2)]',
  'focus:ring-2 focus:ring-brand-green focus:border-brand-green',
].join(' ');

const selectCls = inputCls;

const textareaCls = [
  'w-full px-4 py-3 rounded-lg text-sm font-medium outline-none resize-none transition-all',
  'border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)]',
  'placeholder:text-[var(--muted-2)]',
  'focus:ring-2 focus:ring-brand-green focus:border-brand-green',
].join(' ');

const Label = ({ children, required }: { children: React.ReactNode; required?: boolean }) => (
  <label className="block text-[10px] font-black uppercase tracking-widest mb-1.5" style={{ color: 'var(--muted)' }}>
    {children}
    {required && <span className="text-status-danger ml-1">*</span>}
  </label>
);

const Field = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={className ?? 'flex flex-col'}>{children}</div>
);

const Hint = ({ children }: { children: React.ReactNode }) => (
  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{children}</p>
);

// ── Review row ────────────────────────────────────────────────────────────────

function ReviewRow({ label, value }: { label: string; value?: string | boolean }) {
  if (!value && value !== false) return null;
  return (
    <div className="flex gap-4 py-2 border-b border-[var(--border)] last:border-0">
      <span className="text-[10px] font-black uppercase tracking-widest w-28 shrink-0 pt-0.5" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{String(value)}</span>
    </div>
  );
}

// ── Wizard stepper ────────────────────────────────────────────────────────────

const STEPS = ['Patient', 'Location', 'Review'];

function WizardStepper({ current }: { current: number }) {
  return (
    <div
      className="flex items-start px-6 py-4 border-b shrink-0"
      style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
    >
      {STEPS.map((label, i) => {
        const num = i + 1;
        const done = num < current;
        const active = num === current;
        return (
          <Fragment key={label}>
            <div className="flex flex-col items-center gap-1.5 shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                  done
                    ? 'bg-brand-green text-white'
                    : active
                    ? 'bg-brand-green text-white shadow-[0_0_0_4px_rgba(0,90,50,0.18)]'
                    : 'bg-[var(--surface-3)] text-[var(--muted)]'
                }`}
              >
                {done ? <CheckCircle size={15} weight="fill" /> : num}
              </div>
              <span
                className={`text-[9px] font-black uppercase tracking-widest ${
                  active || done ? 'text-brand-green' : 'text-[var(--muted)]'
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`h-0.5 flex-1 mx-3 mt-4 rounded-full transition-all ${
                  num < current ? 'bg-brand-green' : 'bg-[var(--border)]'
                }`}
              />
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ── Section card ──────────────────────────────────────────────────────────────

function SectionCard({
  title, icon: Icon, children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div className="card-head">
        <div className="flex items-center gap-2.5">
          <Icon size={16} weight="fill" className="text-brand-green" />
          <h3 className="card-title">{title}</h3>
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

// ── Review card ───────────────────────────────────────────────────────────────

function ReviewCard({
  title, onEdit, children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div
        className="px-4 py-3 border-b flex items-center justify-between"
        style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
      >
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: 'var(--muted)' }}>
          {title}
        </span>
        <button
          onClick={onEdit}
          className="flex items-center gap-1 text-[10px] font-bold text-brand-green hover:text-brand-teal uppercase tracking-widest transition-colors"
        >
          <PencilSimple size={11} weight="bold" /> Edit
        </button>
      </div>
      <div className="px-4 py-1">{children}</div>
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
  ambulanceUsed: string;
  targetFacilityId: string;
  facilityChangeReason: string;
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
  ambulanceUsed: '',
  targetFacilityId: '',
  facilityChangeReason: '',
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function NewIncidentWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addNotification } = useNotificationStore();

  const submitted     = (location.state as any)?.submitted;
  const submittedCase = (location.state as any)?.caseNumber;
  const ended         = (location.state as any)?.ended;
  const surveillance  = (location.state as any)?.surveillance;

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [suggestions, setSuggestions]           = useState<Array<{ display_name: string; lat: string; lon: string; address?: Record<string, string> }>>([]);
  const [showSuggestions, setShowSuggestions]   = useState(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState(false);
  const [showEndReason, setShowEndReason]         = useState(false);
  const [endReason, setEndReason]                 = useState('');
  const [showSurveillance, setShowSurveillance]   = useState(false);
  const [surveillanceNote, setSurveillanceNote]   = useState('');
  const [originalFacilityId, setOriginalFacilityId] = useState('');

  const set = (updates: Partial<FormState>) => setForm(prev => ({ ...prev, ...updates }));

  const handleFacilityChange = (newId: string) => {
    if (!originalFacilityId && newId) setOriginalFacilityId(newId);
    set({ targetFacilityId: newId, facilityChangeReason: '' });
  };

  const facilityWasChanged = !!originalFacilityId && !!form.targetFacilityId && form.targetFacilityId !== originalFacilityId;

  // ── Facilities list ────────────────────────────────────────────────────────
  const { data: facilities = [] } = useQuery<Array<{ id: string; name: string; type: string; subCounty: string }>>({
    queryKey: ['facilities-active'],
    queryFn: async () => {
      const res = await api.get('/incidents/facilities');
      return res.data.data ?? [];
    },
    staleTime: 10 * 60_000,
  });

  // ── Nature of alert options (fixed list) ──────────────────────────────────
  // ── Nature of alert options (from DB) ──────────────────────────────────────
const { data: natureOptions = [] } = useQuery<{ id: string; nature: string; detail: string | null }[]>({
  queryKey: ['nature-options'],
  queryFn: async () => {
    const res = await api.get('/admin/nature-options');
    return res.data.data;
  },
});

const uniqueNatures = [...new Set(natureOptions.map(o => o.nature))];
const detailsForNature = natureOptions
  .filter(o => o.nature === form.alertNature && o.detail)
  .map(o => o.detail as string);



  // ── Step validation ────────────────────────────────────────────────────────
  const canGoToStep2 = !!form.alertAt && !!form.alertMode && !!form.chiefComplaint.trim()
    && !!form.alertNature && !!form.placeOfReferral.trim() && !!form.ambulanceUsed.trim();
  const canGoToStep3 = !!form.locationName.trim() && !!form.subCounty;
  const canSubmit    = canGoToStep2 && canGoToStep3
    && (!facilityWasChanged || !!form.facilityChangeReason.trim());

  const step1Missing = [
    !form.alertAt          && 'date & time',
    !form.alertMode        && 'alert mode',
    !form.alertNature      && 'nature of alert',
    !form.chiefComplaint   && 'chief complaint',
    !form.placeOfReferral  && 'place of referral',
    !form.ambulanceUsed    && 'ambulance used',
  ].filter(Boolean) as string[];

  const step2Missing = [
    !form.locationName && 'location',
    !form.subCounty    && 'sub-county',
  ].filter(Boolean) as string[];

  // ── Sub-county detection ───────────────────────────────────────────────────
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

  // ── Location autocomplete ──────────────────────────────────────────────────
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
    const name        = s.display_name.split(',').slice(0, 2).join(',').trim();
    const detectedSub = detectSubCounty(s.address ?? {});
    set({ locationName: name, lat: parseFloat(s.lat), lng: parseFloat(s.lon), ...(detectedSub ? { subCounty: detectedSub } : {}) });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  // ── Map click reverse geocode ──────────────────────────────────────────────
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

  // ── Payload builder ────────────────────────────────────────────────────────
  const buildPayload = () => ({
    alertMode:             form.alertMode,
    alertAt:               form.alertAt,
    originOfAlert:         form.originOfAlert || undefined,
    notifierDetails:       form.notifierName ? [{ name: form.notifierName, phone: form.notifierPhone }] : undefined,
    locationName:          form.locationName,
    subCounty:             form.subCounty,
    lat:                   form.lat,
    lng:                   form.lng,
    patientName:           form.patientName  || undefined,
    patientAge:            form.patientAge   || undefined,
    patientGender:         form.patientGender || undefined,
    nextOfKin:             form.nextOfKin    || undefined,
    nextOfKinPhone:        form.nextOfKinPhone || undefined,
    massCasualty:          form.massCasualty,
    massCasualtyCount:     form.massCasualtyCount ? parseInt(form.massCasualtyCount, 10) : undefined,
    chiefComplaint:        form.chiefComplaint,
    alertNature:           form.alertNature  || undefined,
    alertNatureDetail:     form.alertNatureDetail || undefined,
    watcherComments:       form.watcherComments || undefined,
    preHospitalManagement: form.preHospitalManagement || undefined,
    placeOfReferral:       form.placeOfReferral || undefined,
    ambulanceUsed:         form.ambulanceUsed || undefined,
    targetFacilityId:      form.targetFacilityId || undefined,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
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

  const surveillanceMutation = useMutation({
    mutationFn: () => api.post('/incidents', { ...buildPayload(), surveillanceNote }),
    onSuccess: (res) => {
      const caseNumber = res?.data?.data?.caseNumber ?? '';
      navigate('/watcher/new-incident', { state: { submitted: true, caseNumber, surveillance: true } });
    },
    onError: (err: any) => {
      addNotification({
        type: 'error',
        title: 'Surveillance Alert Failed',
        message: err?.response?.data?.message || 'Could not send surveillance alert.',
      });
    },
  });

  // ── Success screen ─────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-8 gap-6 text-center">
        <div className={`w-20 h-20 rounded-full flex items-center justify-center ${ended ? 'bg-status-danger/10' : surveillance ? 'bg-amber-500/10' : 'bg-brand-green/10'}`}>
          {surveillance
            ? <Eye size={48} weight="fill" className="text-amber-500" />
            : <CheckCircle size={48} weight="fill" className={ended ? 'text-status-danger' : 'text-brand-green'} />
          }
        </div>
        <div>
          <h2 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
            {ended ? 'Case Ended' : surveillance ? 'Surveillance Alert Sent' : 'Alert Submitted'}
          </h2>
          {submittedCase && (
            <p className="text-sm mt-2" style={{ color: 'var(--muted)' }}>
              Case <span className="font-bold text-brand-green">#{submittedCase}</span>{' '}
              {ended ? 'has been recorded and closed.' : surveillance ? 'has been flagged for surveillance.' : 'is now in the dispatch queue.'}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => { setForm(defaultForm); navigate('/watcher/new-incident', { replace: true, state: {} }); }}
            className="btn btn-ghost flex items-center gap-2"
          >
            <PaperPlaneRight size={16} /> New Alert
          </button>
          <button
            onClick={() => navigate('/watcher')}
            className="btn btn-primary"
          >
            My Alerts
          </button>
        </div>
      </div>
    );
  }

  // ── Step titles ────────────────────────────────────────────────────────────
  const stepTitle = step === 1
    ? 'Patient & Alert Details'
    : step === 2
    ? 'Incident Location'
    : 'Review & Submit';

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: 'var(--bg)' }}>

      {/* ── Wizard header ── */}
      <div
        className="border-b px-6 py-3 flex items-center gap-4 shrink-0"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        <div className="flex-1">
          <p className="text-[9px] font-black uppercase tracking-widest mb-0.5" style={{ color: 'var(--muted)' }}>
            New Incident · Step {step} of 3
          </p>
          <h1 className="text-base font-bold text-brand-green">{stepTitle}</h1>
        </div>
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-lg transition-all hover:bg-[var(--red-soft)] hover:text-status-danger"
          style={{ color: 'var(--muted)' }}
        >
          <X size={20} weight="bold" />
        </button>
      </div>

      {/* ── Step indicator ── */}
      <WizardStepper current={step} />

      {/* ── Step content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 lg:p-5">

        {/* ─────────────── STEP 1: Patient & Alert ─────────────── */}
        {step === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">

            {/* Left column */}
            <div className="space-y-4">

              <SectionCard title="Alert" icon={Phone}>
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
              </SectionCard>

              <SectionCard title="Patient" icon={User}>
                <Field>
                  <Label>Patient Name</Label>
                  <input type="text" placeholder="Full name" className={inputCls} value={form.patientName} onChange={e => set({ patientName: e.target.value })} />
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field>
                    <Label>Age</Label>
                    <select className={selectCls} value={form.patientAge} onChange={e => set({ patientAge: e.target.value })}>
                      <option value="">Select age...</option>
                      <option value="Below 1 Month">Below 1 Month</option>
                      <option value="1-6 Months">1-6 Months</option>
                      <option value="6-13 Months">6-13 Months</option>
                      {Array.from({ length: 149 }, (_, i) => i + 2).map(yr => (
                        <option key={yr} value={String(yr)}>{yr}</option>
                      ))}
                    </select>
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
                    <input
                      type="tel"
                      inputMode="tel"
                      pattern="[0-9+\-\s]*"
                      placeholder="07XXXXXXXX"
                      className={inputCls}
                      value={form.nextOfKinPhone}
                      onChange={e => { const v = e.target.value.replace(/[^0-9+\-\s]/g, ''); set({ nextOfKinPhone: v }); }}
                    />
                  </Field>
                </div>

                <label
                  className="flex items-start gap-4 p-4 border rounded-xl cursor-pointer transition-all"
                  style={{
                    borderColor: form.massCasualty ? 'var(--red)' : 'var(--border)',
                    background: form.massCasualty ? 'var(--red-soft)' : 'transparent',
                  }}
                >
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
                    <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>Multiple victims requiring heavy response.</p>
                  </div>
                </label>

                {form.massCasualty && (
                  <Field>
                    <Label>Approximate Number of Casualties</Label>
                    <input type="number" min="2" inputMode="numeric" placeholder="e.g. 5" className={inputCls} value={form.massCasualtyCount}
                      onKeyDown={e => ['e','E','+','-','.'].includes(e.key) && e.preventDefault()}
                      onChange={e => set({ massCasualtyCount: e.target.value.replace(/[^0-9]/g, '') })} />
                  </Field>
                )}
              </SectionCard>
            </div>

            {/* Right column */}
            <div className="space-y-4">
              <SectionCard title="Incident Details" icon={FirstAid}>
                <div className="grid grid-cols-2 gap-3">
                  {/* Nature of Alert */}
                  <Field>
                    <Label required>Nature of Alert</Label>
                    <select
                      className={selectCls}
                      value={form.alertNature}
                      onChange={e => set({ alertNature: e.target.value, alertNatureDetail: '' })}
                    >
                      <option value="">Select nature…</option>
                      {uniqueNatures.map(n => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                  </Field>

                  {/* Specific Nature — dropdown if DB has details, else free text */}
                  <Field>
                    <Label>Specific Nature</Label>
                    {detailsForNature.length > 0 ? (
                      <select
                        className={selectCls}
                        value={form.alertNatureDetail}
                        disabled={!form.alertNature}
                        onChange={e => set({ alertNatureDetail: e.target.value })}
                      >
                        <option value="">Select specific…</option>
                        {detailsForNature.map(d => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        className={inputCls}
                        placeholder={form.alertNature ? 'Describe further…' : 'Pick nature first'}
                        disabled={!form.alertNature}
                        value={form.alertNatureDetail}
                        onChange={e => set({ alertNatureDetail: e.target.value })}
                      />
                    )}
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
                  <Label required>Place of Referral</Label>
                  <input
                    type="text"
                    placeholder="e.g. Kenyatta National Hospital"
                    className={inputCls}
                    value={form.placeOfReferral}
                    onChange={e => set({ placeOfReferral: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label required>Ambulance Used</Label>
                  <input
                    type="text"
                    placeholder="e.g. KCB 001A"
                    className={inputCls}
                    value={form.ambulanceUsed}
                    onChange={e => set({ ambulanceUsed: e.target.value })}
                  />
                </Field>

                <Field>
                  <Label>Destination Facility</Label>
                  <select
                    className={selectCls}
                    value={form.targetFacilityId}
                    onChange={e => handleFacilityChange(e.target.value)}
                  >
                    <option value="">Select facility…</option>
                    {facilities.map(f => (
                      <option key={f.id} value={f.id}>{f.name} — {f.type}</option>
                    ))}
                  </select>
                </Field>

                {facilityWasChanged && (
                  <Field>
                    <Label required>Reason for Facility Change</Label>
                    <textarea
                      rows={2}
                      placeholder="Why was the destination facility changed?"
                      className={textareaCls}
                      value={form.facilityChangeReason}
                      onChange={e => set({ facilityChangeReason: e.target.value })}
                    />
                  </Field>
                )}
              </SectionCard>
            </div>
          </div>
        )}

        {/* ─────────────── STEP 2: Location ─────────────── */}
        {step === 2 && (
          <div className="max-w-3xl mx-auto space-y-4">
            <SectionCard title="Incident Location" icon={MapPin}>
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
                  {isReverseGeocoding && (
                    <div className="absolute right-3 top-3 w-5 h-5 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
                  )}
                  {showSuggestions && suggestions.length > 0 && (
                    <div
                      className="absolute top-full left-0 right-0 z-50 mt-1 rounded-xl shadow-xl overflow-hidden card"
                    >
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          type="button"
                          className="w-full text-left px-4 py-3 text-sm border-b border-[var(--border)] last:border-0 flex items-start gap-3 transition-colors hover:bg-[var(--surface-2)]"
                          onMouseDown={() => selectSuggestion(s)}
                        >
                          <MapPin size={14} weight="fill" className="text-brand-green mt-0.5 shrink-0" />
                          <span className="font-medium leading-snug" style={{ color: 'var(--ink)' }}>
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

              {/* Map */}
              <div className="card overflow-hidden">
                <div
                  className="px-3 py-2 border-b flex items-center gap-2"
                  style={{ background: 'var(--surface-2)', borderColor: 'var(--border)' }}
                >
                  <MapPin size={12} weight="fill" className="text-brand-green shrink-0" />
                  <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>
                    Click anywhere on the map to pin the scene — address fills automatically
                  </span>
                </div>
                <Map
                  center={[form.lat, form.lng]}
                  zoom={14}
                  markers={[{ id: 'scene', lat: form.lat, lng: form.lng, title: form.locationName || 'Scene', type: 'incident' }]}
                  onLocationSelect={handleMapClick}
                  layerType="street"
                  className="h-80 w-full"
                />
                {form.locationName && !isReverseGeocoding && (
                  <div
                    className="px-4 py-2.5 border-t text-xs font-bold flex items-center gap-1.5 text-brand-green"
                    style={{ background: 'var(--green-light)', borderColor: 'var(--border)' }}
                  >
                    <MapPin size={12} weight="fill" /> {form.locationName} · {form.lat.toFixed(4)}, {form.lng.toFixed(4)}
                  </div>
                )}
                {isReverseGeocoding && (
                  <div
                    className="px-4 py-2.5 border-t text-xs flex items-center gap-2"
                    style={{ background: 'var(--surface-2)', borderColor: 'var(--border)', color: 'var(--muted)' }}
                  >
                    <div className="w-3 h-3 border-2 border-brand-green border-t-transparent rounded-full animate-spin" />
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
            </SectionCard>
          </div>
        )}

        {/* ─────────────── STEP 3: Review & Submit ─────────────── */}
        {step === 3 && (
          <div className="max-w-4xl mx-auto space-y-4">

            {/* Bento review grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <ReviewCard title="Step 1 · Alert Info" onEdit={() => setStep(1)}>
                <ReviewRow label="Alert Time" value={form.alertAt} />
                <ReviewRow label="Mode"       value={form.alertMode} />
                <ReviewRow label="Origin"     value={form.originOfAlert} />
                <ReviewRow label="Notifier"   value={form.notifierName ? `${form.notifierName} · ${form.notifierPhone}` : undefined} />
              </ReviewCard>

              <ReviewCard title="Step 2 · Location" onEdit={() => setStep(2)}>
                <ReviewRow label="Location"   value={form.locationName} />
                <ReviewRow label="Sub-County" value={form.subCounty} />
                <ReviewRow label="Coords"     value={form.lat ? `${form.lat.toFixed(4)}, ${form.lng.toFixed(4)}` : undefined} />
              </ReviewCard>

              <ReviewCard title="Step 1 · Patient" onEdit={() => setStep(1)}>
                <ReviewRow label="Name"        value={form.patientName} />
                <ReviewRow label="Age / Sex"   value={[form.patientAge, form.patientGender].filter(Boolean).join(' · ') || undefined} />
                <ReviewRow label="Next of Kin" value={form.nextOfKin ? `${form.nextOfKin} · ${form.nextOfKinPhone}` : undefined} />
                <ReviewRow label="MCI"         value={form.massCasualty ? `Yes (${form.massCasualtyCount || '?'} casualties)` : undefined} />
              </ReviewCard>

              <ReviewCard title="Step 1 · Incident Details" onEdit={() => setStep(1)}>
                <ReviewRow label="Nature"    value={[form.alertNature, form.alertNatureDetail].filter(Boolean).join(' → ') || undefined} />
                <ReviewRow label="Complaint" value={form.chiefComplaint} />
                <ReviewRow label="Pre-hosp." value={form.preHospitalManagement} />
                <ReviewRow label="Referral"  value={form.placeOfReferral} />
              </ReviewCard>
            </div>

            {/* Chief complaint highlight */}
            {form.chiefComplaint && (
              <div className="card card-pad">
                <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: 'var(--muted)' }}>
                  Chief Complaint
                </p>
                <div className="border-l-4 border-brand-green pl-4 py-1">
                  <p className="text-sm font-semibold text-brand-green">{form.chiefComplaint}</p>
                </div>
              </div>
            )}

            {mutation.isError && (
              <div className="bg-status-danger/10 border border-status-danger/30 text-status-danger px-4 py-3 rounded-xl text-sm font-semibold">
                Submission failed — check your connection and try again.
              </div>
            )}

            {/* Confirmation notice */}
            <div className="card card-pad flex items-start gap-3">
              <ListChecks size={18} className="text-[var(--muted)] mt-0.5 shrink-0" />
              <p className="text-xs" style={{ color: 'var(--muted)' }}>
                By clicking <strong style={{ color: 'var(--ink)' }}>Submit Alert</strong>, you confirm all critical details are accurate.
                This action will trigger immediate dispatch routing.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Alert Surveillance panel (Step 3 only) ── */}
      {showSurveillance && step === 3 && (
        <div
          className="border-t-2 border-amber-500/30 px-6 py-4 shrink-0"
          style={{ background: 'var(--surface)' }}
        >
          <div className="flex items-start gap-3 max-w-2xl mx-auto">
            <div className="flex-1">
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Eye size={14} weight="fill" /> Surveillance Alert Notes
              </p>
              <textarea
                autoFocus
                rows={2}
                placeholder="Describe the surveillance concern (e.g. suspected outbreak, unusual disease pattern)…"
                className={`${textareaCls} border-amber-500/40 focus:ring-amber-500 focus:border-amber-500`}
                value={surveillanceNote}
                onChange={e => setSurveillanceNote(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <button
                type="button"
                onClick={() => { setShowSurveillance(false); setSurveillanceNote(''); }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => surveillanceMutation.mutate()}
                disabled={surveillanceMutation.isPending}
                className="btn btn-sm flex items-center gap-1.5 text-amber-700 border-amber-400 hover:bg-amber-50"
                style={{ borderWidth: '1px', borderStyle: 'solid' }}
              >
                <Eye size={14} weight="fill" />
                {surveillanceMutation.isPending ? 'Sending…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── End Case reason panel (Step 3 only) ── */}
      {showEndReason && step === 3 && (
        <div
          className="border-t-2 border-status-danger/30 px-6 py-4 shrink-0"
          style={{ background: 'var(--surface)' }}
        >
          <div className="flex items-start gap-3 max-w-2xl mx-auto">
            <div className="flex-1">
              <p className="text-xs font-bold text-status-danger uppercase tracking-widest mb-2">
                Reason for Ending Case <span className="text-status-danger">*</span>
              </p>
              <textarea
                autoFocus
                rows={2}
                placeholder="e.g. Caller confirmed false alarm, no response required…"
                className={`${textareaCls} border-status-danger/40 focus:ring-status-danger focus:border-status-danger`}
                value={endReason}
                onChange={e => setEndReason(e.target.value)}
              />
              <p className={`text-xs mt-1 ${endReason.trim().length < 10 && endReason.length > 0 ? 'text-status-danger' : ''}`}
                style={endReason.trim().length >= 10 || endReason.length === 0 ? { color: 'var(--muted)' } : {}}>
                {endReason.trim().length} / 10 characters minimum
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-6">
              <button
                type="button"
                onClick={() => { setShowEndReason(false); setEndReason(''); }}
                className="btn btn-ghost btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => endCaseMutation.mutate()}
                disabled={endReason.trim().length < 10 || endCaseMutation.isPending}
                className="btn btn-danger btn-sm flex items-center gap-1.5"
              >
                <XCircle size={14} weight="fill" />
                {endCaseMutation.isPending ? 'Ending…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky footer ── */}
      <div
        className="border-t px-6 py-3 flex items-center justify-between shrink-0"
        style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}
      >
        {/* Back / Cancel */}
        <button
          type="button"
          onClick={() => step === 1 ? navigate(-1) : setStep((s) => (s - 1) as 1 | 2 | 3)}
          className="btn btn-ghost"
        >
          {step === 1 ? (
            'Cancel'
          ) : (
            <><ArrowLeft size={16} weight="bold" /> Previous</>
          )}
        </button>

        <div className="flex items-center gap-3">

          {/* Step 1 → 2 */}
          {step === 1 && (
            <>
              {!canGoToStep2 && step1Missing.length > 0 && (
                <p className="text-xs max-w-xs text-right hidden sm:block" style={{ color: 'var(--muted)' }}>
                  Required: {step1Missing.join(', ')}
                </p>
              )}
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!canGoToStep2}
                className="btn btn-primary"
              >
                Continue <ArrowRight size={16} weight="bold" />
              </button>
            </>
          )}

          {/* Step 2 → 3 */}
          {step === 2 && (
            <>
              {!canGoToStep3 && step2Missing.length > 0 && (
                <p className="text-xs max-w-xs text-right hidden sm:block" style={{ color: 'var(--muted)' }}>
                  Required: {step2Missing.join(', ')}
                </p>
              )}
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canGoToStep3}
                className="btn btn-primary"
              >
                Review <ArrowRight size={16} weight="bold" />
              </button>
            </>
          )}

          {/* Step 3 actions */}
          {step === 3 && (
            <>
              <button
                type="button"
                onClick={() => { setShowEndReason(v => !v); setShowSurveillance(false); setEndReason(''); }}
                disabled={!canSubmit}
                className="btn btn-ghost flex items-center gap-2 border-status-danger/50 text-status-danger hover:bg-[var(--red-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <XCircle size={16} weight="fill" />
                End Case
              </button>
              <button
                type="button"
                onClick={() => { setShowSurveillance(v => !v); setShowEndReason(false); setSurveillanceNote(''); }}
                disabled={!canSubmit}
                className="btn btn-ghost flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ borderColor: 'rgba(217,119,6,0.5)', color: 'rgb(180,100,0)' }}
              >
                <Eye size={16} weight="fill" />
                Alert Surveillance
              </button>
              <button
                type="button"
                onClick={() => mutation.mutate()}
                disabled={mutation.isPending || !canSubmit}
                className="btn btn-primary"
              >
                <ClipboardText size={18} weight="bold" />
                {mutation.isPending ? 'Submitting...' : 'Submit Alert'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
