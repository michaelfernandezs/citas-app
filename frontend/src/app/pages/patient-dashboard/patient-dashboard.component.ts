import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AppointmentsService } from '../../core/services/appointments.service';
import { WaitlistService } from '../../core/services/waitlist.service';
import { ScheduleService } from '../../core/services/schedule.service';
import { AuthService } from '../../core/services/auth.service';
import { RealtimeService } from '../../core/services/realtime.service';
import { Appointment, BookedSlot, FreeSlot, MyWaitlistStatus } from '../../core/models/models';
import { TicketComponent } from '../../shared/ticket/ticket.component';
import { WeekCalendarComponent } from '../../shared/week-calendar/week-calendar.component';

const DAYS_AHEAD_TO_SHOW = 14;

@Component({
  selector: 'app-patient-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, TicketComponent, WeekCalendarComponent],
  templateUrl: './patient-dashboard.component.html',
  styleUrl: './patient-dashboard.component.css',
})
export class PatientDashboardComponent implements OnInit, OnDestroy {
  openSlots = signal<FreeSlot[]>([]);
  bookedSlots = signal<BookedSlot[]>([]);
  myAppointments = signal<Appointment[]>([]);
  waitlistStatus = signal<MyWaitlistStatus>({ inQueue: false });
  loading = signal(true);
  actionError = signal<string | null>(null);

  private realtimeSub?: Subscription;

  constructor(
    private appointmentsService: AppointmentsService,
    private waitlistService: WaitlistService,
    private scheduleService: ScheduleService,
    private realtimeService: RealtimeService,
    public auth: AuthService,
  ) {}

  ngOnInit() {
    this.refreshAll();

    this.realtimeService.connect();
    this.realtimeSub = this.realtimeService.onUpdate().subscribe(() => {
      this.refreshAll();
    });
  }

  ngOnDestroy() {
    this.realtimeSub?.unsubscribe();
    this.realtimeService.disconnect();
  }

  refreshAll() {
    this.loading.set(true);

    const from = new Date();
    const to = new Date();
    to.setDate(to.getDate() + DAYS_AHEAD_TO_SHOW);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    this.scheduleService.getAvailability(fromIso, toIso).subscribe((slots) => this.openSlots.set(slots));
    this.appointmentsService.listBooked(fromIso, toIso).subscribe((slots) => this.bookedSlots.set(slots));
    this.appointmentsService.listMine().subscribe((mine) => this.myAppointments.set(mine));

    this.waitlistService.myStatus().subscribe({
      next: (status) => {
        this.waitlistStatus.set(status);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  book(startsAt: string) {
    this.actionError.set(null);
    this.appointmentsService.book(startsAt).subscribe({
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

  watchAppointment(appointmentId: string) {
    this.actionError.set(null);
    this.waitlistService.join(appointmentId).subscribe({
      next: () => this.refreshAll(),
      error: (err) => this.actionError.set(err?.error?.message ?? 'No se pudo unir a la fila'),
    });
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

  hasScheduled(): boolean {
    return this.myAppointments().some((a) => a.status === 'SCHEDULED');
  }

  logout() {
    this.auth.logout();
  }

  hourLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }

  dayLabel(iso: string): string {
    return new Date(iso).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
  }
}
