/**
 * Builds the two EOC incident downloads.
 *
 * - The incident feed report: seven columns the EOC asked for, as Excel or PDF.
 * - The full export: every captured field, as Excel.
 */
import { PassThrough } from 'node:stream';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';

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

/** "19/11/2026 09:30", the way the EOC writes dates. */
export function asLocalDateTime(v: unknown): string {
  const d = toDate(v);
  if (!d) return '';
  const p = partsOf(d);
  return `${p.d}/${p.m}/${p.y} ${p.hh}:${p.mm}`;
}

const yesNo = (v: unknown) => (v == null ? '' : v ? 'Yes' : 'No');

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

const referralPlace = (inc: any) => inc.targetFacility?.name ?? inc.placeOfReferral ?? '';

// The free-text field is set by offline/partner dispatches and manual entry;
// fall back to the tracked vehicle's registration when it's a GPS unit.
const ambulanceUsed = (inc: any) =>
  inc.ambulanceUsed ??
  primaryTask(inc)?.vehicle?.registrationNumber ??
  (inc.tasks ?? []).find((t: any) => t.vehicle?.registrationNumber)?.vehicle?.registrationNumber ??
  '';

/** The incident feed report, exactly the indicators the EOC listed. */
const SUMMARY_COLUMNS: Column[] = [
  { header: 'Date and time', value: (inc) => asLocalDateTime(inc.alertAt ?? inc.createdAt) },
  { header: 'Nature of alert', value: (inc) => inc.alertNature },
  { header: 'Specific nature', value: (inc) => inc.alertNatureDetail },
  { header: 'Location of incident', value: (inc) => inc.locationName },
  { header: 'Place of referral', value: referralPlace },
  { header: 'Ambulance used', value: ambulanceUsed },
  { header: 'Case outcome', value: (inc) => inc.closureReason },
];

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
  { header: 'Referral Place', value: referralPlace },
  { header: 'Ambulance used', value: ambulanceUsed },
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

const text = (v: unknown) => (v == null ? '' : String(v));

function table(columns: Column[], incidents: any[]) {
  return {
    headers: columns.map((c) => c.header),
    rows: incidents.map((inc, i) => columns.map((c) => c.value(inc, i))),
  };
}

/**
 * Writes the sheet row by row and pauses every 200 rows, so a large export
 * does not hold up dispatch requests on the same server while it builds.
 * Empty cells are skipped, and column widths come from the first 300 rows.
 */
async function toXlsx(sheetName: string, columns: Column[], incidents: any[]): Promise<Buffer> {
  const headers = columns.map((c) => c.header);
  const chunks: Buffer[] = [];
  const sink = new PassThrough();
  sink.on('data', (c: Buffer) => chunks.push(c));
  const closed = new Promise<void>((resolve, reject) => {
    sink.on('end', resolve);
    sink.on('error', reject);
  });

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: sink, useSharedStrings: false, useStyles: true });
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });

  const widths = headers.map((h) => h.length);
  incidents.slice(0, 300).forEach((inc, i) => {
    columns.forEach((c, k) => {
      widths[k] = Math.max(widths[k], text(c.value(inc, i)).length);
    });
  });
  ws.columns = widths.map((w) => ({ width: Math.min(Math.max(w + 2, 12), 48) }));
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  const head = ws.addRow(headers);
  head.font = { bold: true };
  head.commit();

  for (let i = 0; i < incidents.length; i++) {
    // Numbers stay numbers; everything else is written as text so phone
    // numbers and IDs keep their leading zero or plus sign.
    const cells = columns.map((c) => {
      const v = c.value(incidents[i], i);
      if (typeof v === 'number') return v;
      return v == null || v === '' ? null : String(v);
    });
    ws.addRow(cells).commit();
    if (i % 200 === 199) await new Promise((resume) => setImmediate(resume));
  }

  ws.commit();
  await wb.commit();
  await closed;
  return Buffer.concat(chunks);
}

export const buildFeedReportXlsx = (incidents: any[]) => toXlsx('Incident report', SUMMARY_COLUMNS, incidents);
export const buildFullExportXlsx = (incidents: any[]) => toXlsx('All case data', COLUMNS, incidents);

// pdfkit's built-in Helvetica only covers Latin-1; anything else would print as garbage.
const pdfSafe = (v: unknown) =>
  text(v).replace(/[–—]/g, '-').replace(/[^\t\n\x20-\x7E\xA0-\xFF]/g, '?');

/** The incident feed report as an A4 landscape PDF table. */
export function buildFeedReportPdf(incidents: any[], subtitle: string): Promise<Buffer> {
  const { headers, rows } = table(SUMMARY_COLUMNS, incidents);
  const widths = [88, 118, 112, 150, 122, 80, 100];
  const margin = 36, pad = 5;
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  const bottom = doc.page.height - margin - 16;

  const drawRow = (cells: string[], y: number, header: boolean) => {
    doc.font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
    const h = Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: widths[i] - pad * 2 }))) + pad * 2;
    if (header) doc.rect(margin, y, widths.reduce((a, b) => a + b, 0), h).fill('#eeeeec');
    doc.fillColor('#141816');
    let x = margin;
    cells.forEach((c, i) => {
      doc.text(c, x + pad, y + pad, { width: widths[i] - pad * 2 });
      x += widths[i];
    });
    doc.moveTo(margin, y + h).lineTo(x, y + h).lineWidth(0.5).strokeColor('#cfcfcc').stroke();
    return h;
  };
  const rowHeight = (cells: string[]) => {
    doc.font('Helvetica').fontSize(9);
    return Math.max(...cells.map((c, i) => doc.heightOfString(c, { width: widths[i] - pad * 2 }))) + pad * 2;
  };

  doc.font('Helvetica-Bold').fontSize(15).fillColor('#141816').text('Nairobi City County EOC: incident report', margin, margin);
  doc.font('Helvetica').fontSize(9).fillColor('#4a524e').text(pdfSafe(subtitle), margin, doc.y + 4);
  let y = doc.y + 12;
  y += drawRow(headers, y, true);
  for (const r of rows) {
    const cells = r.map(pdfSafe);
    if (y + rowHeight(cells) > bottom) {
      doc.addPage();
      y = margin;
      y += drawRow(headers, y, true);
    }
    y += drawRow(cells, y, false);
  }
  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#4a524e').text('No cases match these filters.', margin, y + 12);
  }

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.font('Helvetica').fontSize(8).fillColor('#69716d')
      .text(`Page ${i + 1} of ${range.count}`, margin, doc.page.height - margin - 12, { lineBreak: false });
  }
  doc.end();
  return finished;
}
