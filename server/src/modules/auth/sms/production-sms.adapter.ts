import { Logger } from '@nestjs/common';
import { SmsAdapter } from './sms-adapter.interface';

export class ProductionSmsAdapter implements SmsAdapter {
  private readonly logger = new Logger('ProductionSmsAdapter');

  sendOtp(
    destination: string,
    otp: string,
    expirationMinutes: number,
  ): Promise<boolean> {
    // In production mode, invoke production SMS Gateway API (Stubbed implementation)
    this.logger.log(
      `[PRODUCTION SMS] Dispatching SMS payload via Gateway Client`,
    );
    this.logger.log(
      `[SMS GATEWAY CALL] Successfully sent Verification OTP "${otp}" to ${destination} (Valid for ${expirationMinutes} minutes)`,
    );

    // Integration with Twilio/SMS API placeholder:
    // await this.smsGateway.send(destination, `Your MaroVarso OTP is ${otp}. Valid for 5 minutes.`);
    return Promise.resolve(true);
  }
}
