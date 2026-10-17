import { Injectable } from '@nestjs/common';
import { assessRisk, RiskTier } from '@solace/shared';
import { PrismaService } from '../prisma/prisma.service';

export type SafetySource = 'checkin' | 'journal' | 'letter' | 'contact_log' | 'self_report' | 'client';

@Injectable()
export class SafetyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Server-side backstop for the on-device check. Records only an anonymous counter. */
  async screen(text: string | null | undefined, source: SafetySource, locale?: string | null): Promise<RiskTier> {
    if (!text) return 'none';
    const { tier } = assessRisk(text);
    if (tier !== 'none') await this.record(tier, source, locale);
    return tier;
  }

  async record(tier: Exclude<RiskTier, 'none'>, source: SafetySource, locale?: string | null) {
    const hour = new Date();
    hour.setUTCMinutes(0, 0, 0);
    await this.prisma.safetyEvent.create({ data: { tier, source, locale: locale ?? null, hourBucket: hour } });
  }
}
