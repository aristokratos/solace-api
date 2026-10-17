import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Min, validateSync } from 'class-validator';

export class Env {
  @IsString() @IsNotEmpty() DATABASE_URL: string;
  @Type(() => Number) @IsInt() PORT = 4000;
  @IsString() WEB_ORIGIN = 'http://localhost:3000';
  /** base64-encoded 32-byte key; in production this is replaced by a KMS-backed provider */
  @IsString() @IsNotEmpty() MASTER_KEY: string;
  @IsString() @IsNotEmpty() EMAIL_HASH_PEPPER: string;
  @IsString() @IsNotEmpty() JWT_SECRET: string;
  @Type(() => Number) @IsInt() @Min(60) ACCESS_TOKEN_TTL_SECONDS = 900;
  @Type(() => Number) @IsInt() @Min(1) REFRESH_TOKEN_TTL_DAYS = 30;
  @Type(() => Number) @IsInt() @Min(1) MAGIC_LINK_TTL_MINUTES = 15;
  @IsIn(['log']) MAILER: 'log' = 'log';
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const env = plainToInstance(Env, raw, { enableImplicitConversion: false });
  const errors = validateSync(env, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(`Invalid environment: ${errors.map((e) => e.property).join(', ')}`);
  }
  if (Buffer.from(env.MASTER_KEY, 'base64').length !== 32) {
    throw new Error('MASTER_KEY must be 32 bytes, base64-encoded');
  }
  return env;
}
