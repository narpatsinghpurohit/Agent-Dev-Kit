import { createZodDto } from 'nestjs-zod';
import {
  AuthConfigSchema,
  AuthResponseSchema,
  ForgotPasswordSchema,
  GoogleLoginSchema,
  LoginSchema,
  RefreshRequestSchema,
  ResendVerificationSchema,
  ResetPasswordSchema,
  SignupSchema,
  UserSchema,
  VerifyEmailSchema,
} from '@repo/schemas';

// One DTO class per shared schema — the schema in @repo/schemas stays the
// single source of truth; these classes exist for Nest DI + OpenAPI only.
export class SignupDto extends createZodDto(SignupSchema) {}
export class LoginDto extends createZodDto(LoginSchema) {}
export class AuthResponseDto extends createZodDto(AuthResponseSchema) {}
export class RefreshRequestDto extends createZodDto(RefreshRequestSchema) {}
export class ForgotPasswordDto extends createZodDto(ForgotPasswordSchema) {}
export class ResetPasswordDto extends createZodDto(ResetPasswordSchema) {}
export class VerifyEmailDto extends createZodDto(VerifyEmailSchema) {}
export class ResendVerificationDto extends createZodDto(ResendVerificationSchema) {}
export class UserDto extends createZodDto(UserSchema) {}
export class GoogleLoginDto extends createZodDto(GoogleLoginSchema) {}
export class AuthConfigDto extends createZodDto(AuthConfigSchema) {}
