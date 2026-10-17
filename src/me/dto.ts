import { IsBoolean, IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ENABLED_PATHS, SUPPORTED_COUNTRIES } from '@solace/shared';

export class UpdateProfileDto {
  /** Only enabled paths can be chosen; Grief is designed for but not yet enabled. */
  @IsOptional() @IsIn(ENABLED_PATHS) path?: 'heartbreak';
  @IsOptional() @IsIn(SUPPORTED_COUNTRIES) country?: string;
  @IsOptional() @IsBoolean() ageConfirmed?: boolean;
}

export const CONSENT_PURPOSES = ['health_data_processing', 'product_analytics'] as const;

export class ConsentDto {
  @IsIn(CONSENT_PURPOSES) purpose: (typeof CONSENT_PURPOSES)[number];
  @IsString() @Length(1, 20) @Matches(/^[\w.-]+$/) version: string;
  @IsBoolean() granted: boolean;
}
