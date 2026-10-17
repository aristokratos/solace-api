import { Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { open, seal } from './aead';
import { MasterKeyProvider } from './master-key.provider';

const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Application-layer encryption for user content (PRD S-02). Each user has a data key,
 * stored only in wrapped form. Every ciphertext is bound to (userId, field) through AAD,
 * so a value copied to another row or user fails to decrypt.
 */
@Injectable()
export class FieldCipher {
  private readonly cache = new Map<string, { key: Buffer; expires: number }>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly masterKey: MasterKeyProvider,
  ) {}

  /** Generates a new data key and returns it wrapped, for storing on a new user. */
  async newWrappedKey(userId: string): Promise<{ key: Buffer; wrapped: Buffer }> {
    const key = randomBytes(32);
    const wrapped = await this.masterKey.wrap(key, `user:${userId}`);
    this.cache.set(userId, { key, expires: Date.now() + CACHE_TTL_MS });
    return { key, wrapped };
  }

  async encrypt(userId: string, field: string, value: string): Promise<Buffer> {
    return seal(await this.keyFor(userId), Buffer.from(value, 'utf8'), `${userId}:${field}`);
  }

  async encryptOptional(userId: string, field: string, value?: string | null) {
    return value == null || value === '' ? null : this.encrypt(userId, field, value);
  }

  async decrypt(userId: string, field: string, sealed: Uint8Array): Promise<string> {
    return open(await this.keyFor(userId), Buffer.from(sealed), `${userId}:${field}`).toString('utf8');
  }

  async decryptOptional(userId: string, field: string, sealed?: Uint8Array | null) {
    return sealed ? this.decrypt(userId, field, sealed) : null;
  }

  forget(userId: string) {
    this.cache.delete(userId);
  }

  private async keyFor(userId: string): Promise<Buffer> {
    const hit = this.cache.get(userId);
    if (hit && hit.expires > Date.now()) return hit.key;
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { wrappedKey: true } });
    if (!user) throw new NotFoundException();
    const key = await this.masterKey.unwrap(Buffer.from(user.wrappedKey), `user:${userId}`);
    this.cache.set(userId, { key, expires: Date.now() + CACHE_TTL_MS });
    return key;
  }
}
