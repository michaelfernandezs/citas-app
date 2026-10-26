import { AuthService } from '../src/auth/auth.service';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';

describe('Recuperación de contraseña', () => {
  const prisma = { user: { findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() } };
  const email = { sendPasswordResetEmail: jest.fn() };
  const service = new AuthService(prisma as any, {} as any, email as any);
  beforeEach(() => jest.resetAllMocks());

  it('no revela si el correo existe y almacena solo el hash del enlace', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'u', email: 'u@example.com' });
    const absent = await service.forgotPassword({ email: 'absent@example.com' });
    const present = await service.forgotPassword({ email: 'u@example.com' });
    expect(present).toEqual(absent);
    const token = email.sendPasswordResetEmail.mock.calls[0][1];
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(prisma.user.update.mock.calls[0][0].data.resetTokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  });

  it('limita solicitudes repetidas sin invalidar el enlace anterior', async () => {
    prisma.user.findUnique.mockResolvedValue({ resetTokenExpiresAt: new Date(Date.now() + 30 * 60_000) });
    await service.forgotPassword({ email: 'u@example.com' });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(email.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('cambia la contraseña y consume el enlace de forma atómica', async () => {
    prisma.user.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const input = { token: 'a'.repeat(64), password: 'nueva-clave-123' };
    await service.resetPassword(input);
    const query = prisma.user.updateMany.mock.calls[0][0];
    expect(query.where.resetTokenExpiresAt.gt).toBeInstanceOf(Date);
    expect(query.data.resetTokenHash).toBeNull();
    expect(query.data.resetTokenExpiresAt).toBeNull();
    expect(await bcrypt.compare(input.password, query.data.passwordHash)).toBe(true);
    await expect(service.resetPassword(input)).rejects.toThrow('inválido o ha expirado');
  });

  it('rechaza enlaces vencidos o desconocidos', async () => {
    prisma.user.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.resetPassword({ token: 'b'.repeat(64), password: 'otra-clave-123' })).rejects.toThrow('inválido o ha expirado');
  });
});
