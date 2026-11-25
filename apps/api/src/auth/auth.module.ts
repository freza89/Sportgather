import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { OtpService } from './otp.service.js';
import { SessionService } from './session.service.js';

@Global()
@Module({
  controllers: [AuthController],
  providers: [OtpService, SessionService, AuthGuard],
  exports: [SessionService, AuthGuard],
})
export class AuthModule {}
