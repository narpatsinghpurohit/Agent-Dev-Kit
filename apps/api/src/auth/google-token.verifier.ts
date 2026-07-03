import { Injectable } from '@nestjs/common';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  /** Google's stable account id (`sub` claim) — never reused, unlike email. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Verifies a GIS ID-token credential: RS256 signature against Google's
 * JWKS (cached by the client), both legal `iss` forms, `aud` === our
 * client ID, `exp`. Wrapped in an injectable so e2e tests substitute a
 * fake — the only place google-auth-library is imported.
 *
 * The audience is a parameter (not constructor state) because the client
 * ID is a runtime setting and can change without a restart.
 */
@Injectable()
export class GoogleTokenVerifier {
  private readonly client = new OAuth2Client();

  /** Returns null for ANY invalid credential — callers map that to one generic 401. */
  async verify(credential: string, audience: string): Promise<GoogleProfile | null> {
    try {
      const ticket = await this.client.verifyIdToken({ idToken: credential, audience });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email) return null;
      return {
        sub: payload.sub,
        email: payload.email,
        // The library validates signature/iss/aud/exp but NOT this claim.
        emailVerified: payload.email_verified === true,
        name: payload.name,
      };
    } catch {
      return null;
    }
  }
}
