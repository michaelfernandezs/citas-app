import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppointmentsService } from '../../core/services/appointments.service';
import { WaitlistService } from '../../core/services/waitlist.service';
import { AuthService } from '../../core/services/auth.service';
import { Appointment, MyWaitlistStatus } from '../../core/models/models';
import { TicketComponent } from '../../shared/ticket/ticket.component';
import { WeekCalendarComponent } from '../../shared/week-calendar/week-calendar.component';

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, TicketComponent, WeekCalendarComponent],
  templateUrl: './patient-dashboard.component.html',
  styleUrl: './patient-dashboard.component.css',
})
export class PatientDashboardComponent implements OnInit {
  openSlots = signal<Appointment[]>([]);
  myAppointments = signal<Appointment[]>([]);
  waitlistStatus = signal<MyWaitlistStatus>({ inQueue: false });
  loading = signal(true);
  actionError = signal<string | null>(null);

  // formulario para unirse a la fila
  joinMode: 'any' | 'specific' = 'any';
  preferredWeekday = 1; // lunes
  preferredStartTime = '09:00';
  preferredEndTime = '13:00';

  readonly weekdays = [
    { value: 0, label: 'Domingo' },
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
  ];

  constructor(
    private appointmentsService: AppointmentsService,
    private waitlistService: WaitlistService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.refreshAll();
  }

  refreshAll() {
    this.loading.set(true);
    this.appointmentsService.listOpen().subscribe((slots) => this.openSlots.set(slots));
    this.appointmentsService.listMine().subscribe((mine) => this.myAppointments.set(mine));
    this.waitlistService.myStatus().subscribe({
      next: (status) => {
        this.waitlistStatus.set(status);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  book(id: string) {
    this.actionError.set(null);
    this.appointmentsService.book(id).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo agendar'),
    });
  }

  cancel(id: string) {
    this.actionError.set(null);
    this.appointmentsService.cancel(id).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo cancelar'),
    });
  }

  joinWaitlist() {
    this.actionError.set(null);
    const preference =
      this.joinMode === 'specific'
        ? {
            preferredWeekday: this.preferredWeekday,
            preferredStartTime: this.preferredStartTime,
            preferredEndTime: this.preferredEndTime,
          }
        : undefined;

    this.waitlistService.join(preference).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo unir a la fila'),
    });
  }

  preferenceLabel(): string {
    const entry = this.waitlistStatus().entry;
    if (!entry || entry.preferredWeekday === null) return 'Cualquier día y horario';
    const day = this.weekdays.find((w) => w.value === entry.preferredWeekday)?.label ?? '';
    if (entry.preferredStartMinute === null || entry.preferredEndMinute === null) return day;
    return `${day}, ${this.minutesToLabel(entry.preferredStartMinute)}–${this.minutesToLabel(entry.preferredEndMinute)}`;
  }

  private minutesToLabel(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const period = h >= 12 ? 'pm' : 'am';
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${m.toString().padStart(2, '0')}${period}`;
  }

  leaveWaitlist(entryId: string) {
    this.actionError.set(null);
    this.waitlistService.leave(entryId).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo salir de la fila'),
    });
  }

  respondOffer(entryId: string, accept: boolean) {
    this.actionError.set(null);
    this.waitlistService.respond(entryId, accept).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo responder a la oferta'),
    });
  }

  logout() {
    this.auth.logout();
  }

  hasScheduled(): boolean {
    return this.myAppointments().some((a) => a.status === 'SCHEDULED');
  }

  hourLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }

  dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  }
}
