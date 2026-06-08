export interface SmsAdapter {
  sendOtp(
    destination: string,
    otp: string,
    expirationMinutes: number,
  ): Promise<boolean>;
}
