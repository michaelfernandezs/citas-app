import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';
import { EmailService } from '../email/email.service';
import { RegisterDto, LoginDto, ForgotPasswordDto, ResetPasswordDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private email: EmailService,
  ) {}

  async forgotPassword(dto: ForgotPasswordDto) {
    const response = { message: 'Si existe una cuenta con ese correo, recibirás un enlace para recuperar tu contraseña.' };
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) return response;
    // Un envío por minuto por cuenta; el enlace anterior sigue vigente durante ese plazo.
    if (user.resetTokenExpiresAt && user.resetTokenExpiresAt.getTime() > Date.now() + 29 * 60_000) return response;
    const token = randomBytes(32).toString('hex');
    await this.prisma.user.update({
      where: { id: user.id },
      data: { resetTokenHash: createHash('sha256').update(token).digest('hex'), resetTokenExpiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    await this.email.sendPasswordResetEmail(user.email, token);
    return response;
  }

  async resetPassword(dto: ResetPasswordDto) {
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const result = await this.prisma.user.updateMany({
      where: { resetTokenHash: createHash('sha256').update(dto.token).digest('hex'), resetTokenExpiresAt: { gt: new Date() } },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiresAt: null },
    });
    if (result.count !== 1) throw new BadRequestException('El enlace es inválido o ha expirado. Solicita uno nuevo.');
    return { message: 'Contraseña actualizada. Ya puedes iniciar sesión.' };
  }

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Ya existe una cuenta con ese correo');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
      },
    });

    return this.buildToken(user.id, user.email, user.role);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    return this.buildToken(user.id, user.email, user.role);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true },
    });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  private buildToken(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };
    return {
      accessToken: this.jwt.sign(payload),
      user: { id: userId, email, role },
    };
  }
}
