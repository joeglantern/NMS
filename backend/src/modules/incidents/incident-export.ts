/**
 * Builds the EOC incident report CSV.
 *
 * The first eight columns are the legacy "EOC System" sheet, in its order, so
 * anything built on the old export keeps reading the same positions. Every
 * other captured field follows.
 */

const NBO = 'Africa/Nairobi';

// All EOC timestamps are Nairobi wall-clock. Formatting with the server's
// local timezone put every exported time 3 hours behind on a UTC host.
function partsOf(d: Date) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: NBO,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return { y: get('year'), m: get('month'), d: get('day'), hh: get('hour'), mm: get('minute') };
}

function toDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  const d = v instanceof Date ? v : new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function asDate(v: unknown): string {
  const d = toDate(v);
  if (!d) return '';
  const p = partsOf(d);
  return `${p.d}/${p.m}/${p.y}`;
}

// The legacy sheet's "Alert Time" column holds a full timestamp
// (e.g. 2026-07-29T12:08), not just the clock time.
function asStamp(v: unknown): string {
  const d = toDate(v);
  if (!d) return '';
  const p = partsOf(d);
  return `${p.y}-${p.m}-${p.d}T${p.hh}:${p.mm}`;
}

function asDateTime(v: unknown): string {
  const d = toDate(v);
  if (!d) return '';
  const p = partsOf(d);
  return `${p.y}-${p.m}-${p.d} ${p.hh}:${p.mm}`;
}

const yesNo = (v: unknown) => (v == null ? '' : v ? 'Yes' : 'No');

/**
 * One CSV cell.
 * - Phone numbers and IDs are written as ="0712345678" so Excel keeps the
 *   leading zero or plus sign instead of turning them into a number.
 * - Text that would run as a formula (starts with = + - @) gets a leading
 *   apostrophe; these cells hold text typed by callers and crews.
 */
export function cell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^(\+\d{6,}|0\d{5,}|\d{12,})$/.test(s)) {
    s = `="${s}"`;
  } else if (/^[=+\-@]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s)) {
    s = `'${s}`;
  }
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const VITALS: Array<[string, string]> = [
  ['temperature', 'Temperature'],
  ['pulseRate', 'Pulse Rate'],
  ['respirationRate', 'Respiration Rate'],
  ['bp', 'BP'],
  ['spo2', 'SPO2'],
  ['gcs', 'GCS'],
  ['fh', 'FH'],
];

const MATERNITY: Array<[string, string]> = [
  ['admissionDateTime', 'Admission Date & Time'],
  ['parity', 'Parity'],
  ['gravid', 'Gravid'],
  ['fetalHeartRate', 'Fetal Heart Rate'],
  ['membranes', 'Membranes'],
  ['characterOfLiquor', 'Character of Liquor'],
  ['moulding', 'Moulding'],
  ['cervicalDilatation', 'Cervical Dilatation'],
  ['descent', 'Descent'],
  ['uterineContraction', 'Uterine Contraction'],
  ['medicationsFetal', 'Medications (Fetal)'],
  ['bp', 'BP'],
  ['pulse', 'Pulse'],
  ['temperature', 'Temperature'],
  ['rbs', 'RBS'],
  ['spo2', 'SPO2'],
  ['gcs', 'GCS'],
  ['proteinInUrine', 'Protein in Urine'],
  ['glucoseInUrine', 'Glucose in Urine'],
  ['urineOutput', 'Urine Output'],
  ['deliveryDateTime', 'Delivery Date & Time'],
  ['modeOfDelivery', 'Mode of Delivery'],
  ['newbornGender', 'Newborn Gender'],
  ['birthWeight', 'Birth Weight'],
  ['conditionOfBaby', 'Condition of Baby'],
  ['medicationNewborn', 'Medication (Newborn)'],
  ['apgar1Min', 'APGAR 1 min'],
  ['apgar5Min', 'APGAR 5 min'],
  ['apgar10Min', 'APGAR 10 min'],
];

const obj = (v: unknown): Record<string, any> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {};

const joinList = (v: unknown) => (Array.isArray(v) ? v.filter(Boolean).join('; ') : '');

/** Vitals the crew recorded at handover can carry keys we don't know; list them all. */
function vitalsText(v: unknown): string {
  return Object.entries(obj(v))
    .filter(([, val]) => val != null && val !== '')
    .map(([k, val]) => `${k}: ${val}`)
    .join('; ');
}

type Column = { header: string; value: (inc: any, i: number) => unknown };

/** The task the report describes: the latest one that wasn't cancelled. */
function primaryTask(inc: any) {
  const tasks: any[] = inc.tasks ?? [];
  return tasks.find((t) => t.status !== 'CANCELLED') ?? tasks[0];
}

const notifiers = (inc: any): Array<Record<string, any>> =>
  Array.isArray(inc.notifierDetails) ? inc.notifierDetails.map(obj) : [];

const COLUMNS: Column[] = [
  // Legacy sheet, order unchanged.
  { header: 'No', value: (_inc, i) => i + 1 },
  { header: 'Date', value: (inc) => asDate(inc.alertAt ?? inc.createdAt) },
  { header: 'Alert Time', value: (inc) => asStamp(inc.alertAt ?? inc.createdAt) },
  {
    header: 'Nature of Alert',
    value: (inc) => [inc.alertNature, inc.alertNatureDetail].filter(Boolean).join(' — '),
  },
  { header: 'Incidence Location', value: (inc) => inc.locationName },
  { header: 'Referral Place', value: (inc) => inc.targetFacility?.name ?? inc.placeOfReferral ?? '' },
  {
    // The free-text field is set by offline/partner dispatches and manual
    // entry; fall back to the tracked vehicle's registration when it's a GPS unit.
    header: 'Ambulance used',
    value: (inc) =>
      inc.ambulanceUsed ??
      primaryTask(inc)?.vehicle?.registrationNumber ??
      (inc.tasks ?? []).find((t: any) => t.vehicle?.registrationNumber)?.vehicle?.registrationNumber ??
      '',
  },
  { header: 'Case Outcome', value: (inc) => inc.closureReason ?? '' },

  // Case
  { header: 'Case Number', value: (inc) => inc.caseNumber },
  { header: 'Status', value: (inc) => inc.status },
  { header: 'Created At', value: (inc) => asDateTime(inc.createdAt) },
  { header: 'Last Updated', value: (inc) => asDateTime(inc.updatedAt) },

  // Alert
  { header: 'Mode of Alert', value: (inc) => inc.alertMode },
  { header: 'Origin of Alert', value: (inc) => inc.originOfAlert },
  { header: 'Notifier Name', value: (inc) => notifiers(inc).map((n) => n.name).filter(Boolean).join('; ') },
  {
    header: 'Notifier Phone',
    value: (inc) => notifiers(inc).map((n) => n.phone ?? n.contact).filter(Boolean).join('; '),
  },
  { header: 'Chief Complaint', value: (inc) => inc.chiefComplaint },
  { header: 'Nature', value: (inc) => inc.alertNature },
  { header: 'Nature Detail', value: (inc) => inc.alertNatureDetail },

  // Location
  { header: 'Sub-County', value: (inc) => inc.subCounty },
  { header: 'Sub-County Set By', value: (inc) => inc.subCountySource },
  { header: 'Latitude', value: (inc) => inc.lat },
  { header: 'Longitude', value: (inc) => inc.lng },

  // Patient
  { header: 'Patient Name', value: (inc) => inc.patientName },
  { header: 'Patient Age', value: (inc) => inc.patientAge },
  { header: 'Patient Gender', value: (inc) => inc.patientGender },
  { header: 'Patient National ID', value: (inc) => inc.patientNationalId },
  { header: 'Patient SHA/NHIF No', value: (inc) => inc.patientNhif },
  { header: 'Patient Contact', value: (inc) => inc.patientContact },
  { header: 'Next of Kin', value: (inc) => inc.nextOfKin },
  { header: 'Next of Kin Phone', value: (inc) => inc.nextOfKinPhone },

  // Flags
  { header: 'Mass Casualty', value: (inc) => yesNo(inc.massCasualty) },
  { header: 'Mass Casualty Count', value: (inc) => inc.massCasualtyCount },
  { header: 'GBV Case', value: (inc) => yesNo(inc.isGbvCase) },
  { header: 'Surveillance Note', value: (inc) => inc.surveillanceNote },

  // Referral
  { header: 'Referral Facility', value: (inc) => inc.targetFacility?.name },
  { header: 'Referral Facility KEPH Level', value: (inc) => inc.targetFacility?.kephLevel },
  { header: 'Place of Referral (typed)', value: (inc) => inc.placeOfReferral },
  { header: 'Hospital Level Required', value: (inc) => inc.hospitalLevelRequired },
  { header: 'Healthcare Worker Name', value: (inc) => inc.healthcareWorkerName },
  { header: 'Healthcare Worker Contact', value: (inc) => inc.healthcareWorkerContact },

  // Clinical
  ...VITALS.map(([key, label]): Column => ({
    header: `Vitals: ${label}`,
    value: (inc) => obj(inc.vitals)[key],
  })),
  { header: 'Pre-Hospital Management', value: (inc) => inc.preHospitalManagement },
  ...MATERNITY.map(([key, label]): Column => ({
    header: `Maternity: ${label}`,
    value: (inc) => obj(inc.maternityVitals)[key],
  })),

  // Notes
  { header: 'Watcher Comments', value: (inc) => inc.watcherComments },
  { header: 'Dispatcher Comments', value: (inc) => inc.dispatcherComments },
  { header: 'Dispatcher Challenges', value: (inc) => inc.dispatcherChallenges },
  { header: 'Partner Notes', value: (inc) => inc.partnerNotes },
  { header: 'PCR Link', value: (inc) => inc.pcrUrl },

  // People
  { header: 'Watcher', value: (inc) => inc.watcher?.name },
  { header: 'Dispatcher', value: (inc) => inc.dispatcher?.name },
  { header: 'Assigned Agency', value: (inc) => inc.assignedAgency?.name },
  { header: 'Closed By', value: (inc) => inc.closedBy?.name },
  {
    header: 'Forwarded To',
    value: (inc) =>
      (inc.forwardingLogs ?? [])
        .map((f: any) => [f.toAgency?.name, f.reason].filter(Boolean).join(': '))
        .join('; '),
  },

  // Dispatch
  { header: 'Dispatches', value: (inc) => (inc.tasks ?? []).length },
  { header: 'Vehicle', value: (inc) => primaryTask(inc)?.vehicle?.registrationNumber },
  { header: 'Driver', value: (inc) => primaryTask(inc)?.driver?.name },
  { header: 'EMT', value: (inc) => primaryTask(inc)?.emt?.name },
  { header: 'Nurse', value: (inc) => primaryTask(inc)?.nurse?.name },
  { header: 'Task Status', value: (inc) => primaryTask(inc)?.status },
  { header: 'Dispatched At', value: (inc) => asDateTime(primaryTask(inc)?.receivedAt) },
  { header: 'Accepted At', value: (inc) => asDateTime(primaryTask(inc)?.acceptedAt) },
  { header: 'Scene Arrival At', value: (inc) => asDateTime(primaryTask(inc)?.sceneArrivalAt) },
  { header: 'Patient Picked At', value: (inc) => asDateTime(primaryTask(inc)?.patientPickAt) },
  { header: 'Facility Arrival At', value: (inc) => asDateTime(primaryTask(inc)?.facilityArrivalAt) },
  { header: 'Completed At', value: (inc) => asDateTime(primaryTask(inc)?.completedAt) },
  { header: 'Cancel Reason', value: (inc) => primaryTask(inc)?.cancelReason },
  { header: 'Handover Vitals', value: (inc) => vitalsText(primaryTask(inc)?.handoverVitals) },
  {
    header: 'Extra Stops',
    value: (inc) => (primaryTask(inc)?.stops ?? []).map((s: any) => s.name).filter(Boolean).join('; '),
  },
  {
    header: 'PCR Files',
    value: (inc) =>
      (inc.tasks ?? []).reduce((n: number, t: any) => n + (t._count?.patientCareReports ?? 0), 0),
  },

  // GBV report
  { header: 'GBV: Survivor Residence', value: (inc) => inc.gbvReport?.survivorResidence },
  { header: 'GBV: Has Disability', value: (inc) => yesNo(inc.gbvReport?.hasDisability) },
  { header: 'GBV: Types', value: (inc) => joinList(inc.gbvReport?.gbvTypes) },
  { header: 'GBV: Violation Location', value: (inc) => inc.gbvReport?.violationLocation },
  { header: 'GBV: Referred For', value: (inc) => joinList(inc.gbvReport?.referredFor) },
  { header: 'GBV: Referral Facility', value: (inc) => inc.gbvReport?.referralFacility },
  { header: 'GBV: First Disclosed To', value: (inc) => inc.gbvReport?.firstDisclosedTo },
  { header: 'GBV: Challenges', value: (inc) => inc.gbvReport?.challenges },
  { header: 'GBV: Recommendations', value: (inc) => inc.gbvReport?.recommendations },
  { header: 'GBV: Comment', value: (inc) => inc.gbvReport?.comment },
];

export const EXPORT_HEADERS = COLUMNS.map((c) => c.header);

export function buildIncidentReportCsv(incidents: any[]): string {
  const lines = [EXPORT_HEADERS.map(cell).join(',')];
  incidents.forEach((inc, i) => {
    lines.push(COLUMNS.map((c) => cell(c.value(inc, i))).join(','));
  });
  // The BOM makes Excel read the file as UTF-8.
  return '﻿' + lines.join('\r\n');
}
