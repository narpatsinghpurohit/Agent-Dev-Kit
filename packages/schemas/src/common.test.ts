import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { CursorQuerySchema, cursorPage, objectIdString } from './common';

describe('objectIdString', () => {
  it('accepts 24-char hex ids case-insensitively', () => {
    expect(objectIdString.safeParse('507f1f77bcf86cd799439011').success).toBe(true);
    expect(objectIdString.safeParse('507F1F77BCF86CD799439011').success).toBe(true);
  });

  it('rejects other strings', () => {
    expect(objectIdString.safeParse('short').success).toBe(false);
    expect(objectIdString.safeParse('507f1f77bcf86cd79943901z').success).toBe(false);
  });
});

describe('cursorPage', () => {
  it('builds the standard page shape', () => {
    const page = cursorPage(z.object({ id: z.string() }));
    expect(page.safeParse({ items: [{ id: 'a' }], nextCursor: null }).success).toBe(true);
    expect(page.safeParse({ items: [], nextCursor: 'abc' }).success).toBe(true);
    expect(page.safeParse({ items: [] }).success).toBe(false);
  });
});

describe('CursorQuerySchema', () => {
  it('defaults and bounds limit', () => {
    expect(CursorQuerySchema.parse({}).limit).toBe(20);
    expect(CursorQuerySchema.safeParse({ limit: '0' }).success).toBe(false);
  });
});
