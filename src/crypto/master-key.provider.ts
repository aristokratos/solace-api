import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { open, seal } from './aead';

/**
 * Wraps and unwraps per-user data keys. The local implementation holds the master
 * key in memory; production swaps in a KMS-backed provider with the same contract.
 */
export abstract class MasterKeyProvider {
  abstract wrap(plaintext: Buffer, context: string): Promise<Buffer>;
  abstract unwrap(wrapped: Buffer, context: string): Promise<Buffer>;
}

@Injectable()
export class LocalMasterKeyProvider extends MasterKeyProvider {
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    super();
    this.key = Buffer.from(config.getOrThrow<string>('MASTER_KEY'), 'base64');
  }

  async wrap(plaintext: Buffer, context: string) {
    return seal(this.key, plaintext, `mk:${context}`);
  }

  async unwrap(wrapped: Buffer, context: string) {
    return open(this.key, wrapped, `mk:${context}`);
  }
}
