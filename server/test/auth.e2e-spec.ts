import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let configService: ConfigService;

  const testPhoneNumber = '9999999999';
  const testCountryCode = '+91';

  beforeAll(async () => {
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
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();

    prisma = app.get(PrismaService);
    configService = app.get(ConfigService);
  });

  beforeEach(async () => {
    // Clear OTPs and users related to the test phone number to keep runs stateless
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

  describe('POST /api/v1/auth/otp/request', () => {
    it('should generate and send an OTP successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeNull();
      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.requestId).toBeDefined();
      expect(response.body.meta.version).toBe('v1');

      const otpRecord = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber },
      });
      expect(otpRecord).toBeDefined();
      expect(otpRecord?.otp).toMatch(/^\d{6}$/);
      expect(otpRecord?.resendCount).toBe(0);
    });

    it('should fail with validation errors for invalid phone number format', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: 'invalid-phone',
          countryCode: testCountryCode,
        })
        .expect(400);
    });

    it('should enforce the cooldown period between request attempts', async () => {
      // 1. Configure a 30-second cooldown
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '30';
          return process.env[key] || defaultValue;
        });

      // 2. Initial request
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      // 3. Immediate request (should fail due to cooldown)
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(400);

      expect(res.body.error.message).toContain('before requesting a new OTP');

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });

    it('should allow a new request after cooldown is over and invalidate the previous OTP', async () => {
      // 1. Configure a 0-second cooldown to test without waiting
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '0';
          return process.env[key] || defaultValue;
        });

      // 2. Initial request (OTP #0)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      const otp0 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp0).toBeDefined();

      // 3. Second request after cooldown (OTP #1)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      // Validate OTP #0 was invalidated (marked as used)
      const otp0Checked = await prisma.otp.findUnique({
        where: { id: otp0?.id },
      });
      expect(otp0Checked?.isUsed).toBe(true);

      // Validate a new active OTP #1 was generated
      const otp1 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp1).toBeDefined();
      expect(otp1?.otp).not.toBe(otp0?.otp);

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });
  });

  describe('POST /api/v1/auth/otp/resend', () => {
    it('should fail if no active OTP transaction exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(400);

      expect(response.body.error.message).toContain(
        'No active OTP request found',
      );
    });

    it('should enforce the cooldown period between resend attempts', async () => {
      // 1. Configure a 30-second cooldown
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '30';
          return process.env[key] || defaultValue;
        });

      // 2. Initial send
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      // 3. Immediate resend (should fail due to cooldown)
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(400);

      expect(res.body.error.message).toContain('before resending the OTP');

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });

    it('should generate a new code, invalidate the previous code, and allow up to 3 attempts (cooldown=0)', async () => {
      // Configure 0-second cooldown to test attempts limit and logic seamlessly
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '0';
          return process.env[key] || defaultValue;
        });

      // 1. Initial send (OTP #0)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      const otp0 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp0).toBeDefined();

      // 2. First resend (OTP #1)
      let res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data).toEqual({
        resendAttempt: 1,
      });
      expect(res.body.meta).toBeDefined();
      expect(res.body.meta.requestId).toBeDefined();
      expect(res.body.meta.version).toBe('v1');

      // Validate OTP #0 was invalidated
      const otp0Checked = await prisma.otp.findUnique({
        where: { id: otp0?.id },
      });
      expect(otp0Checked?.isUsed).toBe(true);

      // Validate new OTP was generated
      const otp1 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp1).toBeDefined();
      expect(otp1?.otp).not.toBe(otp0?.otp); // Must be a new code!
      expect(otp1?.resendCount).toBe(1);

      // 3. Second resend (OTP #2)
      res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);
      expect(res.body.data.resendAttempt).toBe(2);

      // Validate OTP #1 was invalidated
      const otp1Checked = await prisma.otp.findUnique({
        where: { id: otp1?.id },
      });
      expect(otp1Checked?.isUsed).toBe(true);

      const otp2 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp2).toBeDefined();
      expect(otp2?.otp).not.toBe(otp1?.otp);

      // 4. Third resend (OTP #3)
      res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);
      expect(res.body.data.resendAttempt).toBe(3);

      const otp3 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp3).toBeDefined();
      expect(otp3?.resendCount).toBe(3);

      // 5. Fourth resend (Must fail - limit exceeded)
      res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(400);

      expect(res.body.error.message).toContain(
        'Maximum resend attempts (3) exceeded',
      );

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });
  });

  describe('POST /api/v1/auth/otp/verify', () => {
    it('should verify with the latest resent OTP successfully and fail with the invalidated older OTP', async () => {
      // Configure 0-second cooldown
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '0';
          return process.env[key] || defaultValue;
        });

      // 1. Initial send (OTP #0)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      const otp0 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });

      // 2. Resend once (OTP #1)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      const otp1 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });

      // 3. Attempt to verify with the older, invalidated OTP #0 (must fail)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: otp0?.otp,
        })
        .expect(400);

      // 4. Verify with the latest active OTP #1 (must succeed)
      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: otp1?.otp,
        })
        .expect(200);

      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.data.accessToken).toBeDefined();

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });
  });

  describe('Login Lockout Mechanics', () => {
    it('should lock login for 30 minutes after 3 resend attempts (4th attempt gets blocked & send/verify get blocked)', async () => {
      // Configure 0-second cooldown to avoid cooldown exceptions
      jest
        .spyOn(configService, 'get')
        .mockImplementation((key: string, defaultValue?: any) => {
          if (key === 'OTP_COOLDOWN_SECONDS') return '0';
          return process.env[key] || defaultValue;
        });

      // 1. Initial send (resendCount = 0)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 2. Resend 1 (resendCount = 1)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 3. Resend 2 (resendCount = 2)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 4. Resend 3 (resendCount = 3)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 5. 4th resend attempt should fail and trigger a 30-minute lockout
      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/resend')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(400);

      expect(res.body.error.message).toContain(
        'Maximum resend attempts (3) exceeded. Login is locked for 30 minutes.',
      );

      // 6. Confirm send-otp is now blocked due to lockout
      const sendRes = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(400);
      expect(sendRes.body.error.message).toContain('temporarily locked');

      // 7. Confirm verify-otp is now blocked due to lockout
      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: '123456',
        })
        .expect(400);
      expect(verifyRes.body.error.message).toContain('temporarily locked');

      jest.spyOn(configService, 'get').mockRestore();
    });

    it('should lock login for 30 minutes after 5 failed verification attempts', async () => {
      // 1. Initial send to have a valid OTP cycle (not strictly necessary but mimics real scenario)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 2. Perform 4 incorrect verification attempts (should return standard invalid OTP error)
      for (let i = 0; i < 4; i++) {
        const verifyRes = await request(app.getHttpServer())
          .post('/api/v1/auth/otp/verify')
          .send({
            phoneNumber: testPhoneNumber,
            countryCode: testCountryCode,
            otp: '000000', // incorrect otp
          })
          .expect(400);
        expect(verifyRes.body.error.message).toContain('Invalid OTP');
      }

      // 3. 5th incorrect attempt should lock login for 30 minutes
      const lockRes = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: '000000', // incorrect otp
        })
        .expect(400);
      expect(lockRes.body.error.message).toContain(
        'Too many failed attempts. Login is locked for 30 minutes.',
      );

      // 4. Confirm subsequent send-otp is also blocked
      const sendRes = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(400);
      expect(sendRes.body.error.message).toContain('temporarily locked');
    });
  });

  describe('Session Mechanics (Profile, Token Refresh, Logout)', () => {
    let accessToken: string;
    let refreshToken: string;

    beforeEach(async () => {
      // Generate OTP and verify to get valid session tokens
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      const otpRecord = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber },
      });

      const verifyRes = await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: otpRecord?.otp,
        })
        .expect(200);

      accessToken = verifyRes.body.data.accessToken;
      refreshToken = verifyRes.body.data.refreshToken;
    });

    it('GET /api/v1/auth/me - should retrieve user profile with valid token', async () => {
      const profileRes = await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(profileRes.body.data.credential.mobileNumber).toBe(
        testPhoneNumber,
      );
      expect(profileRes.body.data.credential.countryCode).toBe(testCountryCode);
    });

    it('GET /api/v1/auth/me - should reject profile request with missing or invalid token', async () => {
      await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);

      await request(app.getHttpServer())
        .get('/api/v1/auth/me')
        .set('Authorization', 'Bearer invalidtoken')
        .expect(401);
    });

    it('POST /api/v1/auth/token/refresh - should refresh access token', async () => {
      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/token/refresh')
        .send({ refreshToken })
        .expect(200);

      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
    });

    it('POST /api/v1/auth/token/refresh - should refresh access token even if expired access token is in Authorization header', async () => {
      const jwtService = app.get(require('@nestjs/jwt').JwtService);
      const expiredAccessToken = await jwtService.signAsync(
        { sub: 'test-user-id', sid: 'test-session-id' },
        {
          secret: configService.get('JWT_ACCESS_SECRET'),
          expiresIn: '0s',
        },
      );

      // Wait 1s to ensure expiration
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const refreshRes = await request(app.getHttpServer())
        .post('/api/v1/auth/token/refresh')
        .set('Authorization', `Bearer ${expiredAccessToken}`)
        .send({ refreshToken })
        .expect(200);

      expect(refreshRes.body.success).toBe(true);
      expect(refreshRes.body.data.accessToken).toBeDefined();
    });

    it('POST /api/v1/auth/token/refresh - check what happens when refresh token is in Authorization header and body is empty', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/token/refresh')
        .set('Authorization', `Bearer ${refreshToken}`)
        .send({})
        .expect(400);

      console.log('Response body:', JSON.stringify(response.body));
    });

    it('POST /api/v1/auth/token/refresh - should reject invalid refresh token', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/token/refresh')
        .send({ refreshToken: 'invalid-refresh-token' })
        .expect(401);
    });

    it('POST /api/v1/auth/logout - should perform logout successfully and say already logged out on second hit', async () => {
      // First logout hit
      const logoutRes1 = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(logoutRes1.body.success).toBe(true);
      expect(logoutRes1.body.code).toBe('LOGOUT_SUCCESS');
      expect(logoutRes1.body.message).toBe('Logged out successfully.');
      expect(logoutRes1.body.data).toBeNull();

      // Second logout hit (sequential)
      const logoutRes2 = await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(logoutRes2.body.success).toBe(true);
      expect(logoutRes2.body.code).toBe('ALREADY_LOGGED_OUT');
      expect(logoutRes2.body.message).toBe('Already logged out.');
      expect(logoutRes2.body.data).toBeNull();
    });
  });
});
