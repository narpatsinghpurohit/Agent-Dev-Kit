import { describe, expect, it } from 'vitest';
import { TaskCreateSchema, TaskListQuerySchema, TaskSchema, TaskUpdateSchema } from './tasks';

const validTask = {
  id: '507f1f77bcf86cd799439011',
  title: 'Write tests',
  status: 'todo',
  createdAt: '2026-07-03T10:00:00.000Z',
  updatedAt: '2026-07-03T10:00:00.000Z',
};

describe('TaskSchema', () => {
  it('accepts a valid task', () => {
    expect(TaskSchema.parse(validTask)).toMatchObject({ title: 'Write tests' });
  });

  it('rejects a non-ObjectId id', () => {
    expect(TaskSchema.safeParse({ ...validTask, id: 'nope' }).success).toBe(false);
  });

  it('has no ownerId on the wire', () => {
    expect(Object.keys(TaskSchema.shape)).not.toContain('ownerId');
  });
});

describe('TaskCreateSchema', () => {
  it('accepts minimal input', () => {
    expect(TaskCreateSchema.parse({ title: 'a' })).toEqual({ title: 'a' });
  });

  it('rejects empty and over-long titles', () => {
    expect(TaskCreateSchema.safeParse({ title: '' }).success).toBe(false);
    expect(TaskCreateSchema.safeParse({ title: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects past dueDate on create', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(TaskCreateSchema.safeParse({ title: 'a', dueDate: past }).success).toBe(false);
  });

  it('accepts a future dueDate', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString();
    expect(TaskCreateSchema.safeParse({ title: 'a', dueDate: future }).success).toBe(true);
  });
});

describe('TaskUpdateSchema', () => {
  it('allows clearing description and dueDate with null', () => {
    const parsed = TaskUpdateSchema.parse({ description: null, dueDate: null });
    expect(parsed).toEqual({ description: null, dueDate: null });
  });

  it('rejects unknown status values', () => {
    expect(TaskUpdateSchema.safeParse({ status: 'archived' }).success).toBe(false);
  });
});

describe('TaskListQuerySchema', () => {
  it('coerces limit from query-string values and applies the default', () => {
    expect(TaskListQuerySchema.parse({ limit: '50' }).limit).toBe(50);
    expect(TaskListQuerySchema.parse({}).limit).toBe(20);
  });

  it('caps limit at 100', () => {
    expect(TaskListQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });
});
