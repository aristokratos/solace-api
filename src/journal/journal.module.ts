import { Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { IsInt, IsOptional, IsString, IsUUID, Length, MaxLength, Min } from 'class-validator';
import { JournalEntry } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { PageQuery } from '../common/pagination';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';

const MAX_BODY = 20_000;

export class CreateJournalDto {
  @IsOptional() @IsUUID() id?: string;
  @IsOptional() @IsString() @MaxLength(64) promptSlot?: string;
  @IsString() @Length(1, MAX_BODY) body: string;
}

export class UpdateJournalDto {
  @IsString() @Length(1, MAX_BODY) body: string;
  /** The version the client last saw; a mismatch means another device edited it. */
  @IsInt() @Min(1) version: number;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly safety: SafetyService,
  ) {}

  async create(userId: string, dto: CreateJournalDto) {
    const id = dto.id ?? randomUUID();
    const existing = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (existing) {
      if (existing.userId !== userId) throw new ConflictException();
      return { ...(await this.view(existing)), riskTier: 'none' as const };
    }
    const row = await this.prisma.journalEntry.create({
      data: { id, userId, promptSlot: dto.promptSlot, bodyCipher: await this.cipher.encrypt(userId, 'journal.body', dto.body) },
    });
    return { ...(await this.view(row)), riskTier: await this.safety.screen(dto.body, 'journal') };
  }

  async list(userId: string, q: PageQuery) {
    const rows = await this.prisma.journalEntry.findMany({
      where: { userId, ...(q.before && { updatedAt: { lt: new Date(q.before) } }) },
      orderBy: { updatedAt: 'desc' },
      take: q.limit,
    });
    return Promise.all(rows.map((r) => this.view(r)));
  }

  async get(userId: string, id: string) {
    return this.view(await this.owned(userId, id));
  }

  async update(userId: string, id: string, dto: UpdateJournalDto) {
    const current = await this.owned(userId, id);
    const result = await this.prisma.journalEntry.updateMany({
      where: { id, userId, version: dto.version },
      data: { bodyCipher: await this.cipher.encrypt(userId, 'journal.body', dto.body), version: { increment: 1 } },
    });
    if (result.count !== 1) {
      throw new ConflictException({ message: 'Entry changed on another device', current: await this.view(current) });
    }
    return { ...(await this.get(userId, id)), riskTier: await this.safety.screen(dto.body, 'journal') };
  }

  async remove(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.journalEntry.delete({ where: { id } });
  }

  private async owned(userId: string, id: string) {
    const row = await this.prisma.journalEntry.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async view(r: JournalEntry) {
    return {
      id: r.id,
      promptSlot: r.promptSlot,
      body: await this.cipher.decrypt(r.userId, 'journal.body', r.bodyCipher),
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

@Controller('v1/journal')
export class JournalController {
  constructor(private readonly service: JournalService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateJournalDto) {
    return this.service.create(u.id, dto);
  }
  @Get() list(@CurrentUser() u: AuthUser, @Query() q: PageQuery) {
    return this.service.list(u.id, q);
  }
  @Get(':id') get(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.get(u.id, id);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJournalDto) {
    return this.service.update(u.id, id, dto);
  }
  @Delete(':id') @HttpCode(204) async remove(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.remove(u.id, id);
  }
}

@Module({ controllers: [JournalController], providers: [JournalService] })
export class JournalModule {}
