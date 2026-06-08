import { Logger } from '@nestjs/common';
import { SmsAdapter } from './sms-adapter.interface';

export class LocalSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger('LocalSmsAdapter');

  sendOtp(
    destination: string,
    otp: string,
    expirationMinutes: number,
  ): Promise<boolean> {
    this.logger.warn(
      `┌────────────────────────────────────────────────────────┐`,
    );
    this.logger.warn(
      `  [DEV/LOCAL SMS SIMULATION] OTP Dispatched to ${destination}`,
    );
    this.logger.warn(
      `  YOUR MAROVARSO VERIFICATION OTP IS: ${otp}                    `,
    );
    this.logger.warn(
      `  Expiration: ${expirationMinutes} Minutes                                 `,
    );
    this.logger.warn(
      `└────────────────────────────────────────────────────────┘`,
    );
    return Promise.resolve(true);
  }
}
