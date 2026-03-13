import {
  IsString,
  IsBoolean,
  IsOptional,
  IsEmail,
  IsPhoneNumber,
  IsUUID,
  IsIn
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  username?: string | null;

  @IsOptional()
  @IsString()
  firstName?: string | null;

  @IsOptional()
  @IsString()
  lastName?: string | null;

  @IsOptional()
  @IsString()
  photoUrl?: string | null;

  @IsOptional()
  @IsString()
  bannerUrl?: string | null;

  @IsOptional()
  @IsEmail()
  email?: string | null;

  @IsOptional()
  @IsPhoneNumber()
  phone?: string | null;

  @IsOptional()
  cityId?: string | null;

  @IsOptional()
  @IsBoolean()
  subscribedToNewsletter?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  emailVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  isBanned?: boolean;

  @IsOptional()
  @IsString()
  emailVerificationCode?: string | null;

  @IsOptional()
  @IsString()
  resetPasswordCode?: string | null;

  @IsOptional()
  @IsString()
  passwordHash?: string | null;

  @IsOptional()
  @IsIn(['user', 'shop', 'admin'])
  role?: string;
}
