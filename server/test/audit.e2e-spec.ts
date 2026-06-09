import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { AuditService } from '../src/modules/audit/audit.service';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

describe('Audit Trail & Security Observability (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let auditService: AuditService;
  let configService: ConfigService;

  const testPhoneNumber = '8888888888';
  const testCountryCode = '+91';

  beforeAll(async () => {
    // Mock the ThrottlerGuard globally to bypass rate limits during testing
    jest
      .spyOn(ThrottlerGuard.prototype, 'canActivate')
      .mockImplementation(() => Promise.resolve(true));

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();

    prisma = app.get(PrismaService);
    auditService = app.get(AuditService);
    configService = app.get(ConfigService);
  });

  beforeEach(async () => {
    // Clear tables for test phone number and audit logs
    await prisma.auditLog.deleteMany({});
    await prisma.otp.deleteMany({ where: { phoneNumber: testPhoneNumber } });
    await prisma.user.deleteMany({
      where: {
        credential: {
          mobileNumber: testPhoneNumber,
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({});
    await prisma.otp.deleteMany({ where: { phoneNumber: testPhoneNumber } });
    await prisma.user.deleteMany({
      where: {
        credential: {
          mobileNumber: testPhoneNumber,
        },
      },
    });
    await app.close();
  });

  describe('Direct Audit Logging', () => {
    it('should successfully save an audit log with custom states and metadata', async () => {
      const log = await auditService.log({
        action: 'UPDATE',
        entityType: 'USER_PROFILE',
        entityId: 'some-user-id',
        roleId: 'admin-id',
        roleType: 'SUPER_ADMIN',
        previousState: { firstName: 'Rahul' },
        currentState: { firstName: 'Rahul Kumar' },
        status: 'SUCCESS',
        description: 'Updated user name',
      });

      expect(log.id).toBeDefined();
      expect(log.action).toBe('UPDATE');
      expect(log.entityType).toBe('USER_PROFILE');
      expect(log.entityId).toBe('some-user-id');
      expect(log.roleId).toBe('admin-id');
      expect(log.roleType).toBe('SUPER_ADMIN');
      expect(log.previousState).toEqual({ firstName: 'Rahul' });
      expect(log.currentState).toEqual({ firstName: 'Rahul Kumar' });
      expect(log.status).toBe('SUCCESS');
      expect(log.description).toBe('Updated user name');
    });

    it('should successfully save a security event', async () => {
      const log = await auditService.logSecurityEvent({
        eventType: 'SUSPICIOUS_LOGIN',
        severity: 'CRITICAL',
        description: 'Login from unauthorized country',
        status: 'FAILED',
        ipAddress: '1.2.3.4',
        metadata: { country: 'Unknown' },
      });

      expect(log.id).toBeDefined();
      expect(log.action).toBe('SUSPICIOUS_LOGIN');
      expect(log.severity).toBe('CRITICAL');
      expect(log.status).toBe('FAILED');
      expect(log.ipAddress).toBe('1.2.3.4');
      expect(log.metadata).toEqual({ country: 'Unknown' });
    });
  });

  describe('OTP Audit Trail Integration', () => {
    it('should log OTP_SENT when an OTP request is made', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      const allLogs = await prisma.auditLog.findMany({
        where: { action: 'OTP_SENT' },
      });
      const logs = allLogs.filter(log => (log.metadata as any)?.phoneNumber === testPhoneNumber);

      expect(logs.length).toBe(1);
      expect(logs[0].status).toBe('SUCCESS');
      expect((logs[0].metadata as any).phoneNumber).toBe(testPhoneNumber);
    });

    it('should log OTP_RESENT when an OTP is resent', async () => {
      // Mock cooldown to 0
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '0';
          return process.env[key] || defaultValue;
        });

      // 1. Initial request
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      // 2. Resend request
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      const allLogs = await prisma.auditLog.findMany({
        where: { action: 'OTP_RESENT' },
      });
      const resendLogs = allLogs.filter(log => (log.metadata as any)?.phoneNumber === testPhoneNumber);

      expect(resendLogs.length).toBe(1);
      expect(resendLogs[0].status).toBe('SUCCESS');
      expect((resendLogs[0].metadata as any).resendCount).toBe(1);

      jest.spyOn(configService, 'get').mockRestore();
    });

    it('should log OTP_VERIFICATION_FAILED when verification fails', async () => {
      // 1. Send OTP
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      // 2. Verify with wrong code
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: '000000',
        })
        .expect(400);

      const allLogs = await prisma.auditLog.findMany({
        where: { action: 'OTP_VERIFICATION_FAILED' },
      });
      const failLogs = allLogs.filter(log => (log.metadata as any)?.phoneNumber === testPhoneNumber);

      expect(failLogs.length).toBe(1);
      expect(failLogs[0].status).toBe('FAILED');
      expect((failLogs[0].metadata as any).failureReason).toBe('AUTH_INVALID_OTP');
    });

    it('should log OTP_VERIFIED when verification succeeds', async () => {
      // 1. Send OTP
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      const otpRecord = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber },
      });

      // 2. Verify with correct code
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: otpRecord?.otp,
        })
        .expect(200);

      const allLogs = await prisma.auditLog.findMany({
        where: { action: 'OTP_VERIFIED' },
      });
      const verifiedLogs = allLogs.filter(log => (log.metadata as any)?.phoneNumber === testPhoneNumber);

      expect(verifiedLogs.length).toBe(1);
      expect(verifiedLogs[0].status).toBe('SUCCESS');
      expect((verifiedLogs[0].metadata as any).phoneNumber).toBe(testPhoneNumber);
    });
  });

  describe('OTP Abuse Detection E2E', () => {
    it('should log OTP_ABUSE and block when 5 failed verification attempts occur', async () => {
      // 1. Send OTP
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      // 2. Fail verification 5 times
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/otp/verify')
          .send({
            phoneNumber: testPhoneNumber,
            countryCode: testCountryCode,
            otp: '000000',
          })
          .expect(400);
      }

      // Check if OTP_ABUSE was logged
      const allLogs = await prisma.auditLog.findMany({
        where: { action: 'OTP_ABUSE' },
      });
      const abuseLogs = allLogs.filter(log => (log.metadata as any)?.phoneNumber === testPhoneNumber);

      expect(abuseLogs.length).toBe(1);
      expect(abuseLogs[0].severity).toBe('HIGH');
      expect(abuseLogs[0].status).toBe('FAILED');
      expect((abuseLogs[0].metadata as any).attemptCount).toBe(5);
    });

    it('should log OTP_ABUSE and block when more than 5 OTP requests occur within 10 minutes', async () => {
      // Configure 0-second cooldown
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '0';
          return process.env[key] || defaultValue;
        });

      // Request OTP 5 times (should succeed)
      for (let i = 0; i < 5; i++) {
        await request(app.getHttpServer())
          .post('/api/v1/auth/otp/request')
          .send({
            phoneNumber: testPhoneNumber,
            countryCode: testCountryCode,
          })
          .expect(200);
      }

      // 6th request should fail with 400 due to abuse block
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          running_tests_abuse_block_flag: true, // Optional metadata/context
        } as any)
        .expect(400);

      // Check if OTP_ABUSE was logged
      const allLogs = await prisma.auditLog.findMany({
        where: { action: 'OTP_ABUSE' },
      });
      const abuseLogs = allLogs.filter(log => (log.metadata as any)?.phoneNumber === testPhoneNumber);

      expect(abuseLogs.length).toBe(1);
      expect(abuseLogs[0].severity).toBe('HIGH');
      expect(abuseLogs[0].status).toBe('FAILED');
      expect((abuseLogs[0].metadata as any).requestCount).toBe(5);

      jest.spyOn(configService, 'get').mockRestore();
    });
  });
});
