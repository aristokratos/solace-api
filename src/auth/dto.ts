import { IsEmail, IsString, Length, MaxLength } from 'class-validator';

export class RequestLinkDto {
  @IsEmail() @MaxLength(254) email: string;
}

export class VerifyLinkDto {
  @IsString() @Length(20, 200) token: string;
}

export class RefreshDto {
  @IsString() @Length(20, 200) refreshToken: string;
}
