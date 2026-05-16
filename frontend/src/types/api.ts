export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'WATCHER' | 'DISPATCHER' | 'PARTNER';
export type AgencyType = 'INTERNAL' | 'PARTNER';

export type IncidentStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'DISPATCH_HANDLING'
  | 'DISPATCH_ON_HOLD'
  | 'DISPATCHED'
  | 'RESOLVED';

export type TaskStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'AT_SCENE'
  | 'PATIENT_PICKED'
  | 'AT_HOSPITAL'
  | 'COMPLETED'
  | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  phone?: string;
  role: Role;
  agencyId: string;
  agency?: Agency;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface Agency {
  id: string;
  name: string;
  type: AgencyType;
  location?: string;
  contactInfo?: Record<string, unknown>;
  isActive: boolean;
}

export interface Vehicle {
  id: string;
  registrationNumber: string;
  imei: string;
  isActive: boolean;
  status?: 'READY' | 'BUSY' | 'MAINTENANCE';
  lastLat?: number;
  lastLng?: number;
  lastLocationAt?: string;
  updatedAt?: string;
  createdAt?: string;
  agencyId: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface Facility {
  id: string;
  name: string;
  type: string;
  kephLevel: number;
  subCounty: string;
  lat: number;
  lng: number;
  isActive: boolean;
}

export interface Incident {
  id: string;
  caseNumber: string;
  status: IncidentStatus;
  chiefComplaint: string;
  locationName: string;
  subCounty: string;
  lat?: number;
  lng?: number;
  alertMode?: string;
  alertAt?: string;
  notifierDetails?: Array<Record<string, string>>;
  patientName?: string;
  patientAge?: string;
  patientGender?: string;
  patientNhif?: string;
  patientContact?: string;
  nextOfKin?: string;
  massCasualty: boolean;
  massCasualtyCount?: number;
  watcherComments?: string;
  dispatcherComments?: string;
  preHospitalManagement?: string;
  createdAt: string;
  watcher?: Pick<User, 'id' | 'name' | 'phone'>;
  dispatcher?: Pick<User, 'id' | 'name' | 'phone'>;
  tasks?: Task[];
}

export interface Task {
  id: string;
  status: TaskStatus;
  receivedAt: string;
  acceptedAt?: string;
  sceneArrivalAt?: string;
  patientPickAt?: string;
  facilityArrivalAt?: string;
  completedAt?: string;
  incidentId: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  emtId: string;
  nurseId: string;
  driver?: Pick<User, 'name' | 'phone'>;
}

export type CallDirection = 'INBOUND' | 'OUTBOUND' | 'INTERNAL';
export type CallStatus = 'RINGING' | 'ANSWERED' | 'NO_ANSWER' | 'BUSY' | 'FAILED';

export interface CallLog {
  id: string;
  callId: string;
  direction: CallDirection;
  callFrom: string;
  callTo: string;
  startedAt: string;
  endedAt?: string;
  duration: number;
  talkDuration: number;
  status: CallStatus;
  recording?: string;
  trunkName?: string;
  didNumber?: string;
  notes?: string;
  createdAt: string;
  incidentId?: string;
  incident?: { id: string; caseNumber: string };
}

export interface ActiveCall {
  callId: string;
  direction: CallDirection;
  callFrom: string;
  callTo: string;
  status: 'RINGING' | 'ANSWERED';
  startedAt: string;
}
