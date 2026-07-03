/** OWASP-recommended argon2id parameters — defined once, used everywhere passwords are hashed. */
export const ARGON2_OPTIONS = { memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
