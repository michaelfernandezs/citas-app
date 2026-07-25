export interface User {
  id: string;
  email: string;
  role: 'PATIENT' | 'ADMIN';
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export type AppointmentStatus = 'SCHEDULED' | 'CANCELLED' | 'COMPLETED';

export interface Appointment {
  id: string;
  patientId: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  patient?: { id: string; name: string; email: string } | null;
}

export interface FreeSlot {
  startsAt: string;
  endsAt: string;
}

export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED' | 'CANCELLED_BY_PATIENT';

export interface WaitlistEntry {
  id: string;
  patientId: string;
  status: WaitlistStatus;
  createdAt: string;
  preferredWeekday: number | null;
  preferredStartMinute: number | null;
  preferredEndMinute: number | null;
}

export interface Offer {
  id: string;
  startsAt: string;
  endsAt: string;
  expiresAt: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REJECTED';
}

export interface MyWaitlistStatus {
  inQueue: boolean;
  status?: 'WAITING' | 'OFFERED';
  position?: number;
  entry?: WaitlistEntry;
  offer?: Offer;
}

export interface WorkingHours {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface ScheduleException {
  id: string;
  date: string;
  isClosed: boolean;
  startMinute: number | null;
  endMinute: number | null;
}

export interface ScheduleConfig {
  id: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  minNoticeHours: number;
  maxAdvanceDays: number;
}