export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'WATCHER' | 'DISPATCHER' | 'PARTNER' | 'DRIVER' | 'EMT' | 'NURSE';
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
  agencyId: string | null;
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

export interface CrewMember {
  id: string;
  name: string;
  phone?: string | null;
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
  currentDriver?: CrewMember | null;
  currentEmt?: CrewMember | null;
  currentNurse?: CrewMember | null;
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

export interface GbvReport {
  id: string;
  incidentId: string;
  survivorResidence?: string | null;
  hasDisability?: boolean | null;
  gbvTypes: string[];
  violationLocation?: string | null;
  referredFor: string[];
  referralFacility?: string | null;
  firstDisclosedTo?: string | null;
  challenges?: string | null;
  recommendations?: string | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Incident {
  id: string;
  caseNumber: string;
  status: IncidentStatus;
  isGbvCase?: boolean;
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
  nextOfKinPhone?: string;
  alertNature?: string;
  alertNatureDetail?: string;
  originOfAlert?: string;
  placeOfReferral?: string;
  massCasualty: boolean;
  massCasualtyCount?: number;
  watcherComments?: string;
  dispatcherComments?: string;
  dispatcherChallenges?: string;
  preHospitalManagement?: string;
  partnerNotes?: string;
  pcrUrl?: string;
  closureReason?: string;
  closedById?: string;
  createdAt: string;
  watcher?: Pick<User, 'id' | 'name' | 'phone'>;
  dispatcher?: Pick<User, 'id' | 'name' | 'phone'>;
  tasks?: Task[];
  forwardingLogs?: ForwardingLog[];
  gbvReport?: GbvReport | null;
}

export interface ForwardingLog {
  id: string;
  incidentId: string;
  reason: string;
  createdAt: string;
  fromAgency: { id: string; name: string };
  toAgency: { id: string; name: string };
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
  cancelledAt?: string;
  cancelReason?: string;
  incidentId: string;
  vehicleId: string;
  vehicle?: Vehicle;
  driverId: string;
  emtId?: string | null;
  nurseId?: string | null;
  driver?: Pick<User, 'name' | 'phone'> | null;
  emt?: Pick<User, 'name' | 'phone'> | null;
  nurse?: Pick<User, 'name' | 'phone'> | null;
}

export interface PatientCareReport {
  id: string;
  taskId: string;
  uploaderId: string;
  note: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  action: 'CREATE' | 'UPDATE' | 'STATUS_CHANGE' | string;
  subjectType: string;
  subjectId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  createdAt: string;
  user: Pick<User, 'id' | 'name' | 'role'>;
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
