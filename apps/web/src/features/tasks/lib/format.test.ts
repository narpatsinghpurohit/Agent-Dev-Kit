import { describe, expect, it } from 'vitest';
import { formatDueDate, nextStatus } from './format';

describe('formatDueDate', () => {
  it('formats ISO dates and rejects garbage', () => {
    expect(formatDueDate('2026-07-04T10:00:00.000Z')).toMatch(/Jul/);
    expect(formatDueDate(undefined)).toBeNull();
    expect(formatDueDate('not-a-date')).toBeNull();
  });
});

describe('nextStatus', () => {
  it('cycles todo → in_progress → done → todo', () => {
    expect(nextStatus('todo')).toBe('in_progress');
    expect(nextStatus('in_progress')).toBe('done');
    expect(nextStatus('done')).toBe('todo');
  });
});
