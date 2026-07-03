import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opts a handler out of the global AuthGuard. Authentication is opt-OUT in
 * this API: every endpoint requires a valid access token unless explicitly
 * marked @Public().
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
