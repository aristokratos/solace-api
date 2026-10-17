import { Body, Controller, Get, Injectable, Module, Post, Query } from '@nestjs/common';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Mood, MOODS, RiskTier } from '@solace/shared';
import { randomUUID } from 'node:crypto';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { PageQuery } from '../common/pagination';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';

export class CreateCheckInDto {
  /** Client-generated id so offline check-ins sync idempotently. */
  @IsOptional() @IsUUID() id?: string;
  @IsIn(MOODS) mood: Mood;
  @IsOptional() @IsString() @MaxLength(280) note?: string;
}

@Injectable()
export class CheckInsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly safety: SafetyService,
  ) {}

  async create(userId: string, dto: CreateCheckInDto): Promise<{ id: string; mood: Mood; note: string | null; createdAt: Date; riskTier: RiskTier }> {
    const id = dto.id ?? randomUUID();
    const noteCipher = await this.cipher.encryptOptional(userId, 'checkin.note', dto.note);
    const row = await this.prisma.checkIn.upsert({
      where: { id },
      create: { id, userId, mood: dto.mood, noteCipher },
      update: {},
    });
    if (row.userId !== userId) throw new Error('id collision');
    const riskTier = await this.safety.screen(dto.note, 'checkin');
    return { id: row.id, mood: row.mood, note: dto.note ?? null, createdAt: row.createdAt, riskTier };
  }

  async list(userId: string, q: PageQuery) {
    const rows = await this.prisma.checkIn.findMany({
      where: { userId, ...(q.before && { createdAt: { lt: new Date(q.before) } }) },
      orderBy: { createdAt: 'desc' },
      take: q.limit,
    });
    return Promise.all(
      rows.map(async (r) => ({ id: r.id, mood: r.mood, note: await this.cipher.decryptOptional(userId, 'checkin.note', r.noteCipher), createdAt: r.createdAt })),
    );
  }
}

@Controller('v1/check-ins')
export class CheckInsController {
  constructor(private readonly service: CheckInsService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCheckInDto) {
    return this.service.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() q: PageQuery) {
    return this.service.list(user.id, q);
  }
}

@Module({ controllers: [CheckInsController], providers: [CheckInsService] })
export class CheckInsModule {}
