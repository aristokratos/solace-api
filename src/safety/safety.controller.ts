import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { crisisResourceFor, CRISIS_RESOURCES, LEXICON_V0 } from '@solace/shared';
import { Public } from '../common/public.decorator';
import { SafetyService } from './safety.service';

class SafetyEventDto {
  @IsIn(['concern', 'high']) tier: 'concern' | 'high';
  @IsIn(['self_report', 'client']) source: 'self_report' | 'client';
  @IsOptional() @IsString() @Length(2, 2) locale?: string;
}

/** Everything here works without an account: crisis help must never sit behind a login. */
@Public()
@Controller('v1')
export class SafetyController {
  constructor(private readonly safety: SafetyService) {}

  @Get('crisis-resources')
  crisisResources(@Query('country') country?: string) {
    return country ? crisisResourceFor(country) : Object.values(CRISIS_RESOURCES);
  }

  /** Clients cache this and match on device (PRD: detection runs offline). */
  @Get('safety/lexicon')
  lexicon() {
    return LEXICON_V0;
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('safety/events')
  @HttpCode(202)
  async event(@Body() dto: SafetyEventDto) {
    await this.safety.record(dto.tier, dto.source, dto.locale?.toUpperCase());
    return { status: 'recorded' };
  }
}
