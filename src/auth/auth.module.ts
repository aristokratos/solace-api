import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { LogMailer, Mailer } from './mailer.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { issuer: 'solace-api', audience: 'solace' },
        verifyOptions: { issuer: 'solace-api', audience: 'solace' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, { provide: Mailer, useClass: LogMailer }, { provide: APP_GUARD, useClass: JwtAuthGuard }],
  exports: [AuthService, Mailer],
})
export class AuthModule {}
