import { z } from 'zod';
import { UserSchema } from './user';

export const emailSchema = z.email().max(254);
export const passwordSchema = z.string().min(8, 'password must be at least 8 characters').max(128);

export const SignupSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().min(1).max(100),
});
export type SignupInput = z.infer<typeof SignupSchema>;

export const LoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});
export type LoginInput = z.infer<typeof LoginSchema>;

/**
 * Login/refresh response. `refreshToken` is present only for cookie-less
 * clients (mobile); browser clients get it as an httpOnly cookie instead.
 */
export const AuthResponseSchema = z.object({
  accessToken: z.string(),
  user: UserSchema,
  refreshToken: z.string().optional(),
});
export type AuthResponse = z.infer<typeof AuthResponseSchema>;

/**
 * Cookie clients send nothing (Express 5 leaves the body undefined — the
 * default makes that parse); cookie-less clients send the body token.
 */
export const RefreshRequestSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .default({});
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;

/**
 * Google sign-in: the GIS button hands the SPA an ID-token `credential`,
 * which the API verifies server-side (signature, iss, aud, exp) and
 * exchanges for the app's own tokens. ~1.6KB typical, 4KB hard cap.
 */
export const GoogleLoginSchema = z.object({
  credential: z.string().min(20).max(4096),
});
export type GoogleLoginInput = z.infer<typeof GoogleLoginSchema>;

/** Public auth capabilities for the login screen — no auth required. */
export const AuthConfigSchema = z.object({
  /** Google OAuth web client ID (public by design); null = Google sign-in disabled. */
  googleClientId: z.string().nullable(),
});
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export const ForgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;

export const ResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;

export const VerifyEmailSchema = z.object({ token: z.string().min(1) });
export type VerifyEmailInput = z.infer<typeof VerifyEmailSchema>;

export const ResendVerificationSchema = z.object({ email: emailSchema });
export type ResendVerificationInput = z.infer<typeof ResendVerificationSchema>;
