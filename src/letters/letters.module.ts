import { Body, ConflictException, Controller, Delete, Get, HttpCode, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { LetterState, UnsentLetter } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser, CurrentUser } from '../common/current-user.decorator';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { SafetyService } from '../safety/safety.service';

const STATES: LetterState[] = ['draft', 'kept', 'sealed'];

export class CreateLetterDto {
  @IsOptional() @IsUUID() id?: string;
  @IsString() @Length(1, 80) recipient: string;
  @IsString() @Length(1, 20_000) body: string;
}

export class UpdateLetterDto {
  @IsOptional() @IsString() @Length(1, 80) recipient?: string;
  @IsOptional() @IsString() @Length(1, 20_000) body?: string;
  @IsOptional() @IsIn(STATES) state?: LetterState;
  @IsInt() @Min(1) version: number;
}

/**
 * Unsent letters are never sendable (PRD F-06). "Release" is a hard delete.
 * A sealed letter can no longer be edited, only kept or released.
 */
@Injectable()
export class LettersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
    private readonly safety: SafetyService,
  ) {}

  async create(userId: string, dto: CreateLetterDto) {
    const id = dto.id ?? randomUUID();
    const existing = await this.prisma.unsentLetter.findUnique({ where: { id } });
    if (existing) {
      if (existing.userId !== userId) throw new ConflictException();
      return { ...(await this.view(existing)), riskTier: 'none' as const };
    }
    const row = await this.prisma.unsentLetter.create({
      data: {
        id,
        userId,
        recipientCipher: await this.cipher.encrypt(userId, 'letter.recipient', dto.recipient),
        bodyCipher: await this.cipher.encrypt(userId, 'letter.body', dto.body),
      },
    });
    return { ...(await this.view(row)), riskTier: await this.safety.screen(dto.body, 'letter') };
  }

  async list(userId: string) {
    const rows = await this.prisma.unsentLetter.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' } });
    return Promise.all(rows.map((r) => this.view(r)));
  }

  async update(userId: string, id: string, dto: UpdateLetterDto) {
    const current = await this.owned(userId, id);
    if (current.state === 'sealed' && (dto.body !== undefined || dto.recipient !== undefined || dto.state === 'draft')) {
      throw new ConflictException({ message: 'A sealed letter cannot be edited' });
    }
    const result = await this.prisma.unsentLetter.updateMany({
      where: { id, userId, version: dto.version },
      data: {
        ...(dto.recipient !== undefined && { recipientCipher: await this.cipher.encrypt(userId, 'letter.recipient', dto.recipient) }),
        ...(dto.body !== undefined && { bodyCipher: await this.cipher.encrypt(userId, 'letter.body', dto.body) }),
        ...(dto.state && { state: dto.state }),
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) throw new ConflictException({ message: 'Letter changed on another device', current: await this.view(current) });
    return { ...(await this.view(await this.owned(userId, id))), riskTier: await this.safety.screen(dto.body, 'letter') };
  }

  async release(userId: string, id: string) {
    await this.owned(userId, id);
    await this.prisma.unsentLetter.delete({ where: { id } });
  }

  private async owned(userId: string, id: string) {
    const row = await this.prisma.unsentLetter.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException();
    return row;
  }

  private async view(r: UnsentLetter) {
    return {
      id: r.id,
      recipient: await this.cipher.decrypt(r.userId, 'letter.recipient', r.recipientCipher),
      body: await this.cipher.decrypt(r.userId, 'letter.body', r.bodyCipher),
      state: r.state,
      version: r.version,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}

@Controller('v1/letters')
export class LettersController {
  constructor(private readonly service: LettersService) {}

  @Post() create(@CurrentUser() u: AuthUser, @Body() dto: CreateLetterDto) {
    return this.service.create(u.id, dto);
  }
  @Get() list(@CurrentUser() u: AuthUser) {
    return this.service.list(u.id);
  }
  @Patch(':id') update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateLetterDto) {
    return this.service.update(u.id, id, dto);
  }
  @Delete(':id') @HttpCode(204) async release(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    await this.service.release(u.id, id);
  }
}

@Module({ controllers: [LettersController], providers: [LettersService] })
export class LettersModule {}
