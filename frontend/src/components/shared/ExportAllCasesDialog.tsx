import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DownloadSimple, X } from '@phosphor-icons/react';
import api from '../../api/client';
import { useNotificationStore } from '../../stores/notificationStore';

type Period = 'today' | 'week' | 'month' | 'lastMonth' | 'all' | 'custom';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'all', label: 'All time' },
  { key: 'custom', label: 'Custom' },
];

/** Above this many cases the file takes long enough that the wait is worth naming. */
const LARGE_EXPORT = 2000;

/** Today's date in Nairobi, whatever the browser's own time zone (en-CA formats as YYYY-MM-DD). */
function nairobiToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function shiftDays(isoDate: string, days: number): string {
  // Midday UTC keeps the calendar day stable while adding or removing days.
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function resolvePeriod(period: Period, customFrom: string, customTo: string): { from?: string; to?: string } {
  const today = nairobiToday();
  const monthStart = `${today.slice(0, 8)}01`;
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'week': {
      // The EOC week starts on Monday. getUTCDay is 0 for Sunday.
      const weekday = new Date(`${today}T12:00:00Z`).getUTCDay();
      return { from: shiftDays(today, -((weekday + 6) % 7)), to: today };
    }
    case 'month':
      return { from: monthStart, to: today };
    case 'lastMonth': {
      const lastDay = shiftDays(monthStart, -1);
      return { from: `${lastDay.slice(0, 8)}01`, to: lastDay };
    }
    case 'custom':
      return { from: customFrom || undefined, to: customTo || undefined };
    default:
      return {};
  }
}

/** 2026-11-14 becomes 14/11/2026, the way dates are written everywhere else in the EOC. */
const dmy = (iso: string) => iso.split('-').reverse().join('/');

function describePeriod(from?: string, to?: string): string {
  if (!from && !to) return 'all time';
  if (from && to) return from === to ? dmy(from) : `${dmy(from)} to ${dmy(to)}`;
  return from ? `from ${dmy(from)}` : `up to ${dmy(to!)}`;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ExportAllCasesDialog({ isOpen, onClose }: Props) {
  const { addNotification } = useNotificationStore();
  const [period, setPeriod] = useState<Period>('month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [exporting, setExporting] = useState(false);

  const { from, to } = useMemo(
    () => resolvePeriod(period, customFrom, customTo),
    [period, customFrom, customTo],
  );
  const wrongOrder = !!from && !!to && from > to;

  const count = useQuery({
    queryKey: ['export-all-count', from ?? '', to ?? ''],
    queryFn: async () => {
      const res = await api.get('/incidents/export/all/count', {
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
      });
      return res.data.data.cases as number;
    },
    enabled: isOpen && !wrongOrder,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !exporting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, exporting, onClose]);

  if (!isOpen) return null;

  const cases = count.data;
  const nothingToExport = cases === 0;
  // If the count could not be fetched the export is still allowed: the file itself may be fine.
  const canExport = !exporting && !wrongOrder && !nothingToExport && !count.isLoading;

  async function exportNow() {
    setExporting(true);
    try {
      const res = await api.get('/incidents/export/all', {
        responseType: 'blob',
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `EOC_All_Case_Data_${from && to ? `${from}_to_${to}` : nairobiToday()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      addNotification({
        type: 'success',
        title: 'Export saved',
        message: `${cases != null ? `${cases.toLocaleString('en-KE')} case${cases === 1 ? '' : 's'}, ` : ''}${describePeriod(from, to)}, as an Excel file.`,
      });
      onClose();
    } catch {
      addNotification({ type: 'error', title: 'Export not saved', message: 'The file could not be prepared. Try again, or choose a shorter period.' });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="drawer-back" style={{ position: 'absolute' }} onClick={() => { if (!exporting) onClose(); }} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-all-title"
        className="card"
        style={{ position: 'relative', zIndex: 61, width: '100%', maxWidth: 600, boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="card-head">
          <div>
            <div id="export-all-title" className="card-title" style={{ fontSize: 16 }}>Export all case data</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 3 }}>Everything entered for every case, in one Excel file.</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={exporting} aria-label="Close" style={{ width: 34, padding: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div className="card-pad col" style={{ gap: 16 }}>
          <div>
            <div className="muted" style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}>Period</div>
            <div className="seg" style={{ flexWrap: 'wrap' }}>
              {PERIODS.map((p) => (
                <button key={p.key} type="button" className={period === p.key ? 'on' : ''} disabled={exporting} onClick={() => setPeriod(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {period === 'custom' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600 }} className="muted">
                From
                <input type="date" className="input" style={{ marginTop: 6 }} value={customFrom} max={customTo || undefined} disabled={exporting} onChange={(e) => setCustomFrom(e.target.value)} />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600 }} className="muted">
                To
                <input
                  type="date"
                  className="input"
                  style={{ marginTop: 6, ...(wrongOrder ? { borderColor: 'var(--red)' } : {}) }}
                  value={customTo}
                  min={customFrom || undefined}
                  disabled={exporting}
                  aria-invalid={wrongOrder}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
                {wrongOrder && <span style={{ display: 'block', marginTop: 6, color: 'var(--red)', fontWeight: 500 }}>This is before the From date.</span>}
              </label>
            </div>
          )}

          {/* One line that always says what the button will do. */}
          <div aria-live="polite" style={{ minHeight: 30, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
            {wrongOrder ? null : count.isLoading ? (
              <span className="muted">Counting cases…</span>
            ) : count.isError ? (
              <span className="muted">The number of cases could not be checked. You can still export {describePeriod(from, to)}.</span>
            ) : nothingToExport ? (
              <span className="muted">No cases entered {period === 'all' ? 'yet' : `for ${describePeriod(from, to)}`}.</span>
            ) : (
              <>
                <span style={{ fontSize: 22, fontWeight: 650, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', letterSpacing: '-.01em' }}>
                  {cases!.toLocaleString('en-KE')}
                </span>
                <span className="muted">
                  case{cases === 1 ? '' : 's'}, {describePeriod(from, to)}.
                  {cases! > LARGE_EXPORT ? ' A file this size takes about 10 seconds.' : ''}
                </span>
              </>
            )}
          </div>

          <div className="row" style={{ justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={exporting}>Cancel</button>
            {/* The shared button style has no disabled look, so it is given one here. */}
            <button
              type="button"
              className="btn btn-primary"
              onClick={exportNow}
              disabled={!canExport}
              style={canExport ? undefined : { opacity: 0.45, cursor: 'not-allowed', boxShadow: 'none' }}
            >
              <DownloadSimple size={16} /> {exporting ? 'Preparing the file…' : 'Export to Excel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
