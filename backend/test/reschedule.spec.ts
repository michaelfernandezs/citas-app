import { AppointmentsService } from '../src/appointments/appointments.service';
import { Prisma } from '@prisma/client';

describe('Reprogramación de citas', () => {
  const startsAt = new Date(Date.now() + 7 * 86400000);
  const endsAt = new Date(startsAt.getTime() + 1800000);
  const original = { id: 'old', patientId: 'patient', status: 'SCHEDULED', startsAt: new Date(Date.now() + 86400000), endsAt: new Date(Date.now() + 88200000) };
  const tx = { appointment: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn(), create: jest.fn() } };
  const prisma = { $transaction: jest.fn() };
  const waitlist = { assignNextForCancelledAppointment: jest.fn() };
  const schedule = { computeAvailability: jest.fn() };
  const realtime = { broadcastAvailabilityUpdate: jest.fn() };
  const service = new AppointmentsService(prisma as any, waitlist as any, schedule as any, realtime as any);
  beforeEach(() => {
    jest.resetAllMocks();
    schedule.computeAvailability.mockResolvedValue([{ startsAt, endsAt }]);
    tx.appointment.findUnique.mockResolvedValue(original);
    tx.appointment.findFirst.mockResolvedValue(null);
    tx.appointment.create.mockResolvedValue({ id: 'new', startsAt, endsAt });
    prisma.$transaction.mockImplementation(fn => fn(tx));
  });
  const change = () => service.reschedule('patient', 'old', { startsAt: startsAt.toISOString() });

  it('confirma el cambio dentro de una transacción y ofrece el horario anterior a su fila', async () => {
    await expect(change()).resolves.toMatchObject({ id: 'new' });
    expect(prisma.$transaction.mock.calls[0][1]).toEqual({ isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    expect(tx.appointment.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'old' }, data: expect.objectContaining({ status: 'CANCELLED' }) }));
    expect(waitlist.assignNextForCancelledAppointment).toHaveBeenCalledWith('old', original.startsAt, original.endsAt);
    expect(realtime.broadcastAvailabilityUpdate).toHaveBeenCalled();
  });
  it.each([
    ['ajena', { ...original, patientId: 'someone' }],
    ['cancelada', { ...original, status: 'CANCELLED' }],
    ['pasada', { ...original, startsAt: new Date(0) }],
  ])('rechaza una cita %s sin modificarla', async (_, appointment) => {
    tx.appointment.findUnique.mockResolvedValue(appointment);
    await expect(change()).rejects.toThrow();
    expect(tx.appointment.update).not.toHaveBeenCalled();
  });
  it('conserva la cita cuando el nuevo espacio se ocupa antes de confirmar', async () => {
    tx.appointment.findFirst.mockResolvedValue({ id: 'conflict' });
    await expect(change()).rejects.toThrow('se acaba de ocupar');
    expect(tx.appointment.update).not.toHaveBeenCalled();
    expect(waitlist.assignNextForCancelledAppointment).not.toHaveBeenCalled();
  });
  it('maneja conflictos de concurrencia sin enviar avisos de un cambio fallido', async () => {
    prisma.$transaction.mockRejectedValue({ code: 'P2034' });
    await expect(change()).rejects.toThrow('tu cita anterior se conserva');
    expect(waitlist.assignNextForCancelledAppointment).not.toHaveBeenCalled();
  });
  it('rechaza horarios fuera de la disponibilidad', async () => {
    schedule.computeAvailability.mockResolvedValue([]);
    await expect(change()).rejects.toThrow('no está disponible');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
