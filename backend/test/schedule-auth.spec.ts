import 'reflect-metadata';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PassportModule } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';

import { ScheduleController } from '../src/schedule/schedule.controller';
import { ScheduleService } from '../src/schedule/schedule.service';
import { JwtStrategy } from '../src/auth/jwt.strategy';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../src/common/guards/roles.guard';

describe('Permisos para crear horarios', () => {
  let app: INestApplication;
  let jwt: JwtService;

  const testSecret = 'clave-exclusiva-para-pruebas';
  const previousSecret = process.env.JWT_SECRET;

  const horario = {
    weekday: 1,
    startTime: '09:00',
    endTime: '14:00',
  };

  const resultado = {
    id: 'horario-de-prueba',
    weekday: 1,
    startMinute: 540,
    endMinute: 840,
  };

  const scheduleServiceMock = {
    createWorkingHours: jest.fn().mockResolvedValue(resultado),
  };

  beforeAll(async () => {
    // La estrategia y los tokens usarán la misma clave de prueba.
    process.env.JWT_SECRET = testSecret;
    jwt = new JwtService({ secret: testSecret });

    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule.register({ defaultStrategy: 'jwt' })],
      controllers: [ScheduleController],
      providers: [
        JwtStrategy,
        JwtAuthGuard,
        RolesGuard,
        {
          provide: ScheduleService,
          useValue: scheduleServiceMock,
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();

    // Mismas opciones de validación que en tu main.ts.
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  beforeEach(() => {
    scheduleServiceMock.createWorkingHours.mockClear();
  });

  afterAll(async () => {
    try {
      if (app) await app.close();
    } finally {
      if (previousSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = previousSecret;
      }
    }
  });

  function tokenPara(role: string): string {
    return jwt.sign(
      {
        sub: 'usuario-de-prueba',
        email: 'prueba@example.com',
        role,
      },
      { expiresIn: '5m' },
    );
  }

  it('rechaza una petición sin token con 401', async () => {
    await request(app.getHttpServer())
      .post('/schedule/working-hours')
      .send(horario)
      .expect(401);

    expect(scheduleServiceMock.createWorkingHours)
      .not.toHaveBeenCalled();
  });

  it('rechaza un token inválido con 401', async () => {
    await request(app.getHttpServer())
      .post('/schedule/working-hours')
      .set('Authorization', 'Bearer token-invalido')
      .send(horario)
      .expect(401);

    expect(scheduleServiceMock.createWorkingHours)
      .not.toHaveBeenCalled();
  });

  it('rechaza un usuario sin rol ADMIN con 403', async () => {
    await request(app.getHttpServer())
      .post('/schedule/working-hours')
      .set('Authorization', `Bearer ${tokenPara('PATIENT')}`)
      .send(horario)
      .expect(403);

    expect(scheduleServiceMock.createWorkingHours)
      .not.toHaveBeenCalled();
  });

  it('permite al administrador crear un horario con 201', async () => {
    const response = await request(app.getHttpServer())
      .post('/schedule/working-hours')
      .set('Authorization', `Bearer ${tokenPara('ADMIN')}`)
      .send(horario)
      .expect(201);

    expect(response.body).toEqual(resultado);
    expect(scheduleServiceMock.createWorkingHours)
      .toHaveBeenCalledTimes(1);
    expect(scheduleServiceMock.createWorkingHours)
      .toHaveBeenCalledWith(horario);
  });
});