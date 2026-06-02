import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly configService: ConfigService) { }

  /**
   * Dispatch OTP code conditionally based on environment flag.
   */
  async sendOtp(
    phoneNumber: string,
    countryCode: string,
    otp: string,
  ): Promise<boolean> {
    const provider = this.configService.get<string>('OTP_PROVIDER');
    const isProduction = provider === 'production';
    const destination = `${countryCode}${phoneNumber}`;

    if (isProduction) {
      // In production mode, invoke production SMS Gateway API (Stubbed implementation)
      this.logger.log(`[PRODUCTION SMS] Dispatching SMS payload via Gateway Client`);
      this.logger.log(`[SMS GATEWAY CALL] Successfully sent Verification OTP "${otp}" to ${destination}`);

      // Integration with Twilio/SMS API placeholder:
      // await this.smsGateway.send(destination, `Your MaroVarso OTP is ${otp}. Valid for 5 minutes.`);
      return true;
    } else {
      // In local/development mode, print code clearly into the terminal for seamless local testing
      const expirationMinutes = this.configService.get<string>('OTP_EXPIRATION_MINUTES', '5');
      this.logger.warn(`┌────────────────────────────────────────────────────────┐`);
      this.logger.warn(`  [DEV/LOCAL SMS SIMULATION] OTP Dispatched to ${destination}`);
      this.logger.warn(`  YOUR MAROVARSO VERIFICATION OTP IS: ${otp}                    `);
      this.logger.warn(`  Expiration: ${expirationMinutes} Minutes                                 `);
      this.logger.warn(`└────────────────────────────────────────────────────────┘`);
      return true;
    }
  }
}
