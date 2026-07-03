import { describe, expect, it } from 'vitest';
import { GoogleLoginSchema, LoginSchema, ResetPasswordSchema, SignupSchema } from './auth';

describe('SignupSchema', () => {
  it('accepts a valid signup', () => {
    expect(
      SignupSchema.safeParse({ email: 'a@example.com', password: 'longenough1', name: 'Ada' })
        .success,
    ).toBe(true);
  });

  it('rejects short passwords', () => {
    expect(
      SignupSchema.safeParse({ email: 'a@example.com', password: 'short', name: 'Ada' }).success,
    ).toBe(false);
  });

  it('rejects invalid emails', () => {
    expect(
      SignupSchema.safeParse({ email: 'not-an-email', password: 'longenough1', name: 'Ada' })
        .success,
    ).toBe(false);
  });
});

describe('LoginSchema', () => {
  it('does not enforce password policy on login (only on set)', () => {
    expect(LoginSchema.safeParse({ email: 'a@example.com', password: 'x' }).success).toBe(true);
  });
});

describe('GoogleLoginSchema', () => {
  it('caps the credential size (Google ID tokens are ~1.6KB)', () => {
    expect(GoogleLoginSchema.safeParse({ credential: 'a'.repeat(100) }).success).toBe(true);
    expect(GoogleLoginSchema.safeParse({ credential: 'tiny' }).success).toBe(false);
    expect(GoogleLoginSchema.safeParse({ credential: 'a'.repeat(5000) }).success).toBe(false);
  });
});

describe('ResetPasswordSchema', () => {
  it('enforces the password policy on reset', () => {
    expect(ResetPasswordSchema.safeParse({ token: 't', password: 'short' }).success).toBe(false);
  });
});
