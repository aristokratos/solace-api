import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { FieldCipher } from '../crypto/field-cipher.service';
import { MasterKeyProvider } from '../crypto/master-key.provider';
import { hmac, normalizeEmail, randomToken, sha256 } from '../common/hash';
import { PrismaService } from '../prisma/prisma.service';
import { Mailer } from './mailer.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: Mailer,
    private readonly masterKey: MasterKeyProvider,
    private readonly cipher: FieldCipher,
  ) {}

  /** Always resolves the same way whether or not the account exists (no enumeration). */
  async requestMagicLink(rawEmail: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    const emailHash = this.emailHash(email);
    const token = randomToken();
    const ttl = this.config.getOrThrow<number>('MAGIC_LINK_TTL_MINUTES');
    await this.prisma.magicLink.create({
      data: {
        emailHash,
        emailCipher: await this.masterKey.wrap(Buffer.from(email), `magic:${emailHash}`),
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + ttl * 60_000),
      },
    });
    const origin = this.config.getOrThrow<string>('WEB_ORIGIN');
    await this.mailer.sendMagicLink(email, `${origin}/auth/verify#token=${token}`);
  }

  async verifyMagicLink(token: string): Promise<TokenPair> {
    const link = await this.prisma.magicLink.findUnique({ where: { tokenHash: sha256(token) } });
    if (!link || link.usedAt || link.expiresAt < new Date()) throw new UnauthorizedException('Link expired or already used');

    const claimed = await this.prisma.magicLink.updateMany({
      where: { id: link.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new UnauthorizedException('Link expired or already used');

    let user = await this.prisma.user.findUnique({ where: { emailHash: link.emailHash } });
    const isNewUser = !user;
    if (!user) {
      const email = (await this.masterKey.unwrap(Buffer.from(link.emailCipher), `magic:${link.emailHash}`)).toString();
      const id = randomUUID();
      const { wrapped } = await this.cipher.newWrappedKey(id);
      // newWrappedKey caches the fresh key, so the email can be sealed before the row exists.
      const emailCipher = await this.cipher.encrypt(id, 'user.email', email);
      user = await this.prisma.user.create({
        data: { id, emailHash: link.emailHash, wrappedKey: wrapped, emailCipher },
      });
    }
    return { ...(await this.issue(user.id, randomUUID())), isNewUser };
  }

  /** Rotating refresh tokens; presenting a revoked token revokes its whole family. */
  async refresh(refreshToken: string): Promise<Omit<TokenPair, 'isNewUser'>> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (!row) throw new UnauthorizedException();
    if (row.revokedAt) {
      await this.prisma.refreshToken.updateMany({
        where: { familyId: row.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException();
    }
    if (row.expiresAt < new Date()) throw new UnauthorizedException();
    const revoked = await this.prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (revoked.count !== 1) throw new UnauthorizedException();
    return this.issue(row.userId, row.familyId);
  }

  async logout(refreshToken: string): Promise<void> {
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256(refreshToken) } });
    if (row) {
      await this.prisma.refreshToken.updateMany({ where: { familyId: row.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
    }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  private emailHash(email: string) {
    return hmac(this.config.getOrThrow<string>('EMAIL_HASH_PEPPER'), email);
  }

  private async issue(userId: string, familyId: string) {
    const expiresIn = this.config.getOrThrow<number>('ACCESS_TOKEN_TTL_SECONDS');
    const days = this.config.getOrThrow<number>('REFRESH_TOKEN_TTL_DAYS');
    const accessToken = await this.jwt.signAsync({ sub: userId, typ: 'access' }, { expiresIn });
    const refreshToken = randomToken(48);
    await this.prisma.refreshToken.create({
      data: { userId, familyId, tokenHash: sha256(refreshToken), expiresAt: new Date(Date.now() + days * 86_400_000) },
    });
    return { accessToken, refreshToken, expiresIn };
  }
}
