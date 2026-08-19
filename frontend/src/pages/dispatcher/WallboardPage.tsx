import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Headset, Siren, Truck, SteeringWheel, FirstAidKit, WifiHigh,
  MapPin, Broadcast, Stack, CornersOut, X,
} from '@phosphor-icons/react';
import api from '../../api/client';
import { socket } from '../../lib/socket';
import { Vehicle } from '../../types/api';
import { usePresence } from '../../hooks/usePresence';
import { useVehicleTracking } from '../../hooks/useVehicleTracking';
// Aliased: a bare `Map` import shadows the global Map constructor, which is
// used below to build the vehicle lookup.
import OpsMap from '../../components/shared/Map';
import { fmtDate, fmtTime } from '../../lib/datetime';
import { useTheme } from '../../hooks/useTheme';

const NAIROBI_CENTER: [number, number] = [-1.2921, 36.8219];
const TRACKER_STALE_MS = 5 * 60 * 1000; // no fix in 5 min → treat as "no signal"
const MAP_LAYERS: ('light' | 'dark' | 'street')[] = ['light', 'dark', 'street'];

/** Big centred clock, ticking every second, pinned to Africa/Nairobi like the rest of the app. */
function LiveClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="col" style={{ alignItems: 'flex-end' }}>
      <div className="mono tnum" style={{ fontSize: 34, fontWeight: 700, color: 'var(--ink)', lineHeight: 1 }}>
        {fmtTime(now)}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
        {fmtDate(now)} · Africa/Nairobi
      </div>
    </div>
  );
}

function timeSince(iso?: string | null): string {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return 'just now';
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
  return fmtDate(iso);
}

/** One row in a duty-roster card (Watcher / Dispatcher on duty). */
function DutyRow({ name, since }: { name: string; since: string }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
      <div className="row" style={{ gap: 8 }}>
        <span className="dot live-dot" style={{ width: 7, height: 7, borderRadius: 99, background: 'var(--green)', display: 'inline-block' }} />
        <span style={{ color: 'var(--ink)', fontWeight: 600, fontSize: 13.5 }}>{name}</span>
      </div>
      <span className="mono tnum muted" style={{ fontSize: 12 }}>since {fmtTime(since, false)}</span>
    </div>
  );
}

/** One ambulance card: crew, GPS tracker status, last known location. */
function AmbulanceCard({ vehicle, live }: { vehicle: Vehicle; live?: { timestamp: string } }) {
  const lastFix = live?.timestamp ?? vehicle.lastLocationAt;
  const isLive = !!lastFix && Date.now() - new Date(lastFix).getTime() < TRACKER_STALE_MS;
  const hasCrew = !!(vehicle.currentDriver || vehicle.currentEmt || vehicle.currentNurse);

  const statusPill =
    vehicle.status === 'BUSY' ? 'pill-red' : vehicle.status === 'MAINTENANCE' ? 'pill-gray' : 'pill-green';

  return (
    <div className="card card-pad">
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="row" style={{ gap: 8 }}>
          <Truck size={18} color="var(--green-bright)" weight="fill" />
          <span style={{ color: 'var(--ink)', fontWeight: 700, fontSize: 14.5 }}>{vehicle.registrationNumber}</span>
        </div>
        <span className={`pill ${statusPill}`}>{vehicle.status ?? 'READY'}</span>
      </div>

      <div className="row" style={{ gap: 6, marginBottom: 8, color: isLive ? 'var(--green)' : 'var(--muted)', fontSize: 12 }}>
        <WifiHigh size={15} weight={isLive ? 'fill' : 'regular'} />
        <span>{isLive ? 'Live GPS' : 'No recent signal'}</span>
        <span className="muted">· {timeSince(lastFix)}</span>
      </div>

      {vehicle.lastLocationName && (
        <div className="row" style={{ gap: 6, marginBottom: 10, color: 'var(--muted)', fontSize: 12 }}>
          <MapPin size={14} />
          <span>{vehicle.lastLocationName}</span>
        </div>
      )}

      {hasCrew ? (
        <div className="col" style={{ gap: 5 }}>
          {vehicle.currentDriver && (
            <div className="row" style={{ gap: 7, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <SteeringWheel size={14} /> {vehicle.currentDriver.name} <span className="muted">(driver)</span>
            </div>
          )}
          {vehicle.currentEmt && (
            <div className="row" style={{ gap: 7, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <FirstAidKit size={14} /> {vehicle.currentEmt.name} <span className="muted">(EMT)</span>
            </div>
          )}
          {vehicle.currentNurse && (
            <div className="row" style={{ gap: 7, fontSize: 12.5, color: 'var(--ink-2)' }}>
              <FirstAidKit size={14} /> {vehicle.currentNurse.name} <span className="muted">(nurse)</span>
            </div>
          )}
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>No crew checked in</div>
      )}
    </div>
  );
}

export default function WallboardPage() {
  const queryClient = useQueryClient();
  const appTheme = useTheme();
  // Seeded from the app theme so the map isn't a bright square on a dark
  // wallboard; the Stack button below still lets the operator cycle it manually.
  const [mapLayer, setMapLayer] = useState<'light' | 'dark' | 'street'>(appTheme);
  const [isMapExpanded, setIsMapExpanded] = useState(false);

  // All active vehicles + crew — the source of truth for "ambulances / drivers / EMTs on duty".
  const { data: vehicles = [] } = useQuery({
    queryKey: ['dispatch', 'vehicles', 'wallboard'],
    queryFn: async () => {
      const res = await api.get('/dispatch/vehicles');
      return (res.data.data ?? res.data) as Vehicle[];
    },
    refetchInterval: 15_000,
  });

  // Live GPS positions for the map panel + "last fix" freshness on each card.
  const { vehicles: liveVehicles, lastUpdatedAt } = useVehicleTracking();
  const liveById = new Map(liveVehicles.map((v) => [v.vehicleId, v]));

  const { byRole } = usePresence();
  const watchers = byRole('WATCHER');
  const dispatchers = byRole('DISPATCHER');

  useEffect(() => {
    socket.connect();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['dispatch', 'vehicles', 'wallboard'] });
    socket.on('vehicle:crew', refresh);
    return () => { socket.off('vehicle:crew', refresh); };
  }, [queryClient]);

  const activeVehicles = vehicles.filter((v) => v.isActive);
  const onDuty = activeVehicles.filter((v) => v.currentDriver || v.currentEmt || v.currentNurse);
  const driversOnDuty = activeVehicles.filter((v) => v.currentDriver);
  const emtsOnDuty = activeVehicles.filter((v) => v.currentEmt);
  const nursesOnDuty = activeVehicles.filter((v) => v.currentNurse);
  const withTrackers = activeVehicles.filter((v) => !!v.imei);

  return (
    <>
      {/* Header: title + live clock */}
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 16 }}>
        <div className="row" style={{ gap: 12 }}>
          <Broadcast size={24} color="var(--green-bright)" weight="fill" />
          <div>
            <div className="section-title" style={{ fontSize: 20 }}>Operations Wallboard</div>
            <div className="muted" style={{ fontSize: 13.5, marginTop: 3 }}>Live call-centre overview · Nairobi EOC</div>
          </div>
        </div>
        <LiveClock />
      </div>

      {/* Top stat strip */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, marginBottom: 20 }}>
        {[
          { label: 'Ambulances on duty', value: onDuty.length, sub: `of ${activeVehicles.length} active`, Icon: Siren, bg: 'var(--green-light)', fg: 'var(--green)' },
          { label: 'With GPS tracker', value: withTrackers.length, sub: 'reporting position', Icon: WifiHigh, bg: 'var(--blue-soft)', fg: 'var(--blue)' },
          { label: 'Drivers logged in', value: driversOnDuty.length, sub: 'checked in', Icon: SteeringWheel, bg: 'var(--amber-soft)', fg: 'var(--amber)' },
          { label: 'EMTs in ambulance', value: emtsOnDuty.length, sub: 'checked in', Icon: FirstAidKit, bg: 'var(--gold-soft)', fg: 'var(--gold)' },
          { label: 'Nurses in ambulance', value: nursesOnDuty.length, sub: 'checked in', Icon: FirstAidKit, bg: 'var(--red-soft)', fg: 'var(--red)' },
        ].map(({ label, value, sub, Icon, bg, fg }) => (
          <div key={label} className="stat" style={{ flex: '1 1 190px', cursor: 'default' }}>
            <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
              <div className="stat-ico" style={{ background: bg }}>
                <Icon size={18} color={fg} weight="fill" />
              </div>
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-val">{value}</div>
            <div className="stat-foot">{sub}</div>
          </div>
        ))}
      </div>

      {/* Duty roster: Watcher + Dispatcher on duty */}
      <div className="wrap-gap" style={{ marginBottom: 20, alignItems: 'stretch' }}>
        <div className="card card-pad" style={{ flex: '1 1 320px' }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Headset size={17} color="var(--green-bright)" />
            <span className="card-title">Watcher on Duty</span>
            <span className="pill pill-green" style={{ marginLeft: 'auto' }}>{watchers.length} online</span>
          </div>
          {watchers.length === 0
            ? <div className="muted" style={{ fontSize: 12.5, fontStyle: 'italic' }}>No watcher currently logged in</div>
            : watchers.map((w) => <DutyRow key={w.userId} name={w.name} since={w.connectedAt} />)}
        </div>

        <div className="card card-pad" style={{ flex: '1 1 320px' }}>
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <Headset size={17} color="var(--green-bright)" />
            <span className="card-title">Dispatcher on Duty</span>
            <span className="pill pill-green" style={{ marginLeft: 'auto' }}>{dispatchers.length} online</span>
          </div>
          {dispatchers.length === 0
            ? <div className="muted" style={{ fontSize: 12.5, fontStyle: 'italic' }}>No dispatcher currently logged in</div>
            : dispatchers.map((d) => <DutyRow key={d.userId} name={d.name} since={d.connectedAt} />)}
        </div>
      </div>

      {/* Live fleet map */}
      <div
        className="card"
        style={{ marginBottom: 20, ...(isMapExpanded ? { position: 'fixed', inset: 16, zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)' } : {}) }}
      >
        <div className="card-head">
          <div className="row" style={{ gap: 10 }}>
            <span className="card-title">Live Fleet Map</span>
            <span className="live-badge"><span className="dot live-dot" /> Live</span>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setMapLayer(MAP_LAYERS[(MAP_LAYERS.indexOf(mapLayer) + 1) % MAP_LAYERS.length])}
            >
              <Stack size={14} /> {mapLayer}
            </button>
            <button className="btn btn-sm btn-ghost" onClick={() => setIsMapExpanded(!isMapExpanded)}>
              {isMapExpanded ? <><X size={14} /> Close</> : <><CornersOut size={14} /> Expand</>}
            </button>
          </div>
        </div>
        <div style={{ position: 'relative', height: isMapExpanded ? '100%' : 'clamp(360px, 52vh, 560px)', flex: isMapExpanded ? 1 : undefined }}>
          <OpsMap
            center={NAIROBI_CENTER}
            zoom={isMapExpanded ? 13 : 12}
            vehicleMarkers={liveVehicles}
            layerType={mapLayer}
            showLiveBadge
            showLegend
            showVehicleList
            lastUpdatedAt={lastUpdatedAt}
          />
        </div>
      </div>

      {/* Ambulance roster grid */}
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <Truck size={17} color="var(--green-bright)" weight="fill" />
        <span className="card-title">Ambulances on Duty</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 14 }}>
        {activeVehicles.length === 0 && (
          <div className="muted" style={{ fontSize: 13 }}>No active ambulances configured.</div>
        )}
        {activeVehicles.map((v) => (
          <AmbulanceCard key={v.id} vehicle={v} live={liveById.get(v.id)} />
        ))}
      </div>
    </>
  );
}
