import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

describe('AuthController (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let configService: ConfigService;

  const testPhoneNumber = '9999999999';
  const testCountryCode = '+91';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    configService = app.get(ConfigService);
  });

  beforeEach(async () => {
    // Clear OTPs and users related to the test phone number to keep runs stateless
    await prisma.otp.deleteMany({ where: { phoneNumber: testPhoneNumber } });
    await prisma.user.deleteMany({ where: { phoneNumber: testPhoneNumber } });
    await prisma.userLockout.deleteMany({ where: { phoneNumber: testPhoneNumber } });
  });

  afterAll(async () => {
    await prisma.otp.deleteMany({ where: { phoneNumber: testPhoneNumber } });
    await prisma.user.deleteMany({ where: { phoneNumber: testPhoneNumber } });
    await prisma.userLockout.deleteMany({ where: { phoneNumber: testPhoneNumber } });
    await app.close();
  });

  describe('POST /auth/send-otp', () => {
    it('should generate and send an OTP successfully', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'OTP sent successfully',
      });

      const otpRecord = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber },
      });
      expect(otpRecord).toBeDefined();
      expect(otpRecord?.otp).toMatch(/^\d{6}$/);
      expect(otpRecord?.resendCount).toBe(0);
    });

    it('should fail with validation errors for invalid phone number format', async () => {
      await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({
          phoneNumber: 'invalid-phone',
          countryCode: testCountryCode,
        })
        .expect(400);
    });
  });

  describe('POST /auth/resend-otp', () => {
    it('should fail if no active OTP transaction exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(400);

      expect(response.body.message).toContain('No active OTP request found');
    });

    it('should enforce the cooldown period between resend attempts', async () => {
      // 1. Configure a 30-second cooldown
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'OTP_COOLDOWN_SECONDS') return '30';
        return process.env[key] || defaultValue;
      });

      // 2. Initial send
      await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      // 3. Immediate resend (should fail due to cooldown)
      const res = await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(400);

      expect(res.body.message).toContain('before resending the OTP');

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });

    it('should generate a new code, invalidate the previous code, and allow up to 3 attempts (cooldown=0)', async () => {
      // Configure 0-second cooldown to test attempts limit and logic seamlessly
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'OTP_COOLDOWN_SECONDS') return '0';
        return process.env[key] || defaultValue;
      });

      // 1. Initial send (OTP #0)
      await request(app.getHttpServer())
        .post('/auth/send-otp')
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
        .post('/auth/resend-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);

      expect(res.body).toEqual({
        success: true,
        message: 'OTP resent successfully',
        resendAttempt: 1,
      });

      // Validate OTP #0 was invalidated
      const otp0Checked = await prisma.otp.findUnique({ where: { id: otp0?.id } });
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
        .post('/auth/resend-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);
      expect(res.body.resendAttempt).toBe(2);

      // Validate OTP #1 was invalidated
      const otp1Checked = await prisma.otp.findUnique({ where: { id: otp1?.id } });
      expect(otp1Checked?.isUsed).toBe(true);

      const otp2 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp2).toBeDefined();
      expect(otp2?.otp).not.toBe(otp1?.otp);

      // 4. Third resend (OTP #3)
      res = await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(200);
      expect(res.body.resendAttempt).toBe(3);

      const otp3 = await prisma.otp.findFirst({
        where: { phoneNumber: testPhoneNumber, isUsed: false },
        orderBy: { createdAt: 'desc' },
      });
      expect(otp3).toBeDefined();
      expect(otp3?.resendCount).toBe(3);

      // 5. Fourth resend (Must fail - limit exceeded)
      res = await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
        })
        .expect(400);

      expect(res.body.message).toContain('Maximum resend attempts (3) exceeded');

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });
  });

  describe('POST /auth/verify-otp', () => {
    it('should verify with the latest resent OTP successfully and fail with the invalidated older OTP', async () => {
      // Configure 0-second cooldown
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'OTP_COOLDOWN_SECONDS') return '0';
        return process.env[key] || defaultValue;
      });

      // 1. Initial send (OTP #0)
      await request(app.getHttpServer())
        .post('/auth/send-otp')
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
        .post('/auth/resend-otp')
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
        .post('/auth/verify-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: otp0?.otp,
        })
        .expect(400);

      // 4. Verify with the latest active OTP #1 (must succeed)
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: otp1?.otp,
        })
        .expect(200);

      expect(verifyRes.body.success).toBe(true);
      expect(verifyRes.body.accessToken).toBeDefined();

      // Cleanup mock
      jest.spyOn(configService, 'get').mockRestore();
    });
  });

  describe('Login Lockout Mechanics', () => {
    it('should lock login for 30 minutes after 3 resend attempts (4th attempt gets blocked & send/verify get blocked)', async () => {
      // Configure 0-second cooldown to avoid cooldown exceptions
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'OTP_COOLDOWN_SECONDS') return '0';
        return process.env[key] || defaultValue;
      });

      // 1. Initial send (resendCount = 0)
      await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 2. Resend 1 (resendCount = 1)
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 3. Resend 2 (resendCount = 2)
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 4. Resend 3 (resendCount = 3)
      await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 5. 4th resend attempt should fail and trigger a 30-minute lockout
      const res = await request(app.getHttpServer())
        .post('/auth/resend-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(400);

      expect(res.body.message).toContain('Maximum resend attempts (3) exceeded. Login is locked for 30 minutes.');

      // 6. Confirm send-otp is now blocked due to lockout
      const sendRes = await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(400);
      expect(sendRes.body.message).toContain('temporarily locked');

      // 7. Confirm verify-otp is now blocked due to lockout
      const verifyRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode, otp: '123456' })
        .expect(400);
      expect(verifyRes.body.message).toContain('temporarily locked');

      jest.spyOn(configService, 'get').mockRestore();
    });

    it('should lock login for 30 minutes after 5 failed verification attempts', async () => {
      // 1. Initial send to have a valid OTP cycle (not strictly necessary but mimics real scenario)
      await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(200);

      // 2. Perform 4 incorrect verification attempts (should return standard invalid OTP error)
      for (let i = 0; i < 4; i++) {
        const verifyRes = await request(app.getHttpServer())
          .post('/auth/verify-otp')
          .send({
            phoneNumber: testPhoneNumber,
            countryCode: testCountryCode,
            otp: '000000', // incorrect otp
          })
          .expect(400);
        expect(verifyRes.body.message).toContain('Invalid OTP code');
      }

      // 3. 5th incorrect attempt should lock login for 30 minutes
      const lockRes = await request(app.getHttpServer())
        .post('/auth/verify-otp')
        .send({
          phoneNumber: testPhoneNumber,
          countryCode: testCountryCode,
          otp: '000000', // incorrect otp
        })
        .expect(400);
      expect(lockRes.body.message).toContain('Too many failed attempts. Login is locked for 30 minutes.');

      // 4. Confirm subsequent send-otp is also blocked
      const sendRes = await request(app.getHttpServer())
        .post('/auth/send-otp')
        .send({ phoneNumber: testPhoneNumber, countryCode: testCountryCode })
        .expect(400);
      expect(sendRes.body.message).toContain('temporarily locked');
    });
  });
});
