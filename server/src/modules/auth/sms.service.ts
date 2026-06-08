import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsAdapter } from './sms/sms-adapter.interface';
import { LocalSmsAdapter } from './sms/local-sms.adapter';
import { ProductionSmsAdapter } from './sms/production-sms.adapter';

@Injectable()
export class SmsService {
  private readonly adapter: SmsAdapter;

  constructor(private readonly configService: ConfigService) {
    const provider = this.configService.get<string>('OTP_PROVIDER');
    this.adapter =
      provider === 'production'
        ? new ProductionSmsAdapter()
        : new LocalSmsAdapter();
  }

  /**
   * Dispatch OTP code via configured SMS adapter.
   */
  async sendOtp(
    phoneNumber: string,
    countryCode: string,
    otp: string,
  ): Promise<boolean> {
    const destination = `${countryCode}${phoneNumber}`;
    const expirationMinutes = Number(
      this.configService.get<string>('OTP_EXPIRATION_MINUTES', '5'),
    );
    return this.adapter.sendOtp(destination, otp, expirationMinutes);
  }
}
