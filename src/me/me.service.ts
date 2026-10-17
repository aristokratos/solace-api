import { Injectable, NotFoundException } from '@nestjs/common';
import { FieldCipher } from '../crypto/field-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConsentDto, UpdateProfileDto } from './dto';

@Injectable()
export class MeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: FieldCipher,
  ) {}

  async profile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, path: true, country: true, ageConfirmed: true, createdAt: true },
    });
    if (!user) throw new NotFoundException();
    const consents = await this.prisma.consent.findMany({
      where: { userId, withdrawnAt: null },
      select: { purpose: true, version: true, grantedAt: true },
    });
    return { ...user, consents };
  }

  async update(userId: string, dto: UpdateProfileDto) {
    await this.prisma.user.update({ where: { id: userId }, data: dto });
    return this.profile(userId);
  }

  async setConsent(userId: string, dto: ConsentDto) {
    await this.prisma.$transaction(async (tx) => {
      await tx.consent.updateMany({
        where: { userId, purpose: dto.purpose, withdrawnAt: null },
        data: { withdrawnAt: new Date() },
      });
      if (dto.granted) await tx.consent.create({ data: { userId, purpose: dto.purpose, version: dto.version } });
    });
    return this.profile(userId);
  }

  /** Everything we hold about the user, decrypted (PRD F-09, P-04). */
  async export(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { consents: true, checkIns: true, journal: true, letters: true, contactLog: true, feedback: true },
    });
    if (!user) throw new NotFoundException();
    const d = (field: string, v?: Uint8Array | null) => this.cipher.decryptOptional(userId, field, v);
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        email: await d('user.email', user.emailCipher),
        path: user.path,
        country: user.country,
        ageConfirmed: user.ageConfirmed,
        createdAt: user.createdAt,
      },
      consents: user.consents.map(({ purpose, version, grantedAt, withdrawnAt }) => ({ purpose, version, grantedAt, withdrawnAt })),
      checkIns: await Promise.all(
        user.checkIns.map(async (c) => ({ id: c.id, mood: c.mood, note: await d('checkin.note', c.noteCipher), createdAt: c.createdAt })),
      ),
      journal: await Promise.all(
        user.journal.map(async (j) => ({ id: j.id, promptSlot: j.promptSlot, body: await d('journal.body', j.bodyCipher), createdAt: j.createdAt, updatedAt: j.updatedAt })),
      ),
      letters: await Promise.all(
        user.letters.map(async (l) => ({
          id: l.id,
          recipient: await d('letter.recipient', l.recipientCipher),
          body: await d('letter.body', l.bodyCipher),
          state: l.state,
          createdAt: l.createdAt,
        })),
      ),
      contactLog: await Promise.all(
        user.contactLog.map(async (c) => ({ day: c.day.toISOString().slice(0, 10), contacted: c.contacted, note: await d('contact.note', c.noteCipher) })),
      ),
      feedback: user.feedback.map(({ toolSlot, rating, createdAt }) => ({ toolSlot, rating, createdAt })),
    };
  }

  /** Hard delete; every owned row cascades at the database level. */
  async delete(userId: string) {
    await this.prisma.user.delete({ where: { id: userId } });
    this.cipher.forget(userId);
  }
}
