export interface User {
  id: string;
  email: string;
  role: 'PATIENT' | 'ADMIN';
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}

export type AppointmentStatus = 'OPEN' | 'SCHEDULED' | 'OFFERED' | 'CANCELLED' | 'COMPLETED';

export interface Appointment {
  id: string;
  patientId: string | null;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  offerExpiresAt: string | null;
  patient?: { id: string; name: string; email: string } | null;
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

export interface MyWaitlistStatus {
  inQueue: boolean;
  status?: 'WAITING' | 'OFFERED';
  position?: number;
  entry?: WaitlistEntry;
  offer?: Appointment;
}
