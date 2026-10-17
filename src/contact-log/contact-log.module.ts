import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Injectable, Module, Param, Put } from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';

export class LogDayDto {
  @IsBoolean() contacted: boolean;
  @IsOptional() @IsString() @MaxLength(280) note?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(day: string): Date {
  const d = new Date(`${day}T00:00:00Z`);
  if (!DAY.test(day) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== day) throw new BadRequestException('day must be YYYY-MM-DD');
  // Allow a day of slack for time zones ahead of UTC.
  if (d.getTime() > Date.now() + 86_400_000) throw new BadRequestException('day cannot be in the future');
  return d;
}

/**
 * Heartbreak path (PRD H-02): a log of days, summarised as totals. There is
 * deliberately no streak: a contact day never resets anything.
 */
@Injectable()
export class ContactLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly safety: SafetyService,
  ) {}

  async log(userId: string, day: string, dto: LogDayDto) {
    const date = parseDay(day);
    const noteCipher = await this.cipher.encryptOptional(userId, 'contact.note', dto.note);
    await this.prisma.contactLog.upsert({
      where: { userId_day: { userId, day: date } },
      create: { userId, day: date, contacted: dto.contacted, noteCipher },
      update: { contacted: dto.contacted, noteCipher },
    });
    const riskTier = await this.safety.screen(dto.note, 'contact_log');
    return { day, contacted: dto.contacted, note: dto.note ?? null, riskTier };
  }

  async remove(userId: string, day: string) {
    await this.prisma.contactLog.deleteMany({ where: { userId, day: parseDay(day) } });
  }

  async summary(userId: string) {
    const rows = await this.prisma.contactLog.findMany({ where: { userId }, orderBy: { day: 'desc' } });
    const days = await Promise.all(
      rows.map(async (r) => ({ day: r.day.toISOString().slice(0, 10), contacted: r.contacted, note: await this.cipher.decryptOptional(userId, 'contact.note', r.noteCipher) })),
    );
    return {
      noContactDays: rows.filter((r) => !r.contacted).length,
      contactDays: rows.filter((r) => r.contacted).length,
      loggedDays: rows.length,
      days,
    };
  }
}

@Controller('v1/contact-log')
export class ContactLogController {
  constructor(private readonly service: ContactLogService) {}

  @Get() summary(@CurrentUser() u: AuthUser) {
    return this.service.summary(u.id);
  }
  @Put(':day') log(@CurrentUser() u: AuthUser, @Param('day') day: string, @Body() dto: LogDayDto) {
    return this.service.log(u.id, day, dto);
  }
  @Delete(':day') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('day') day: string) {
    await this.service.remove(u.id, day);
  }
}

@Module({ controllers: [ContactLogController], providers: [ContactLogService] })
export class ContactLogModule {}
