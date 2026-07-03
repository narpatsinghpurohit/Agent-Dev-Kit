import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TasksRepository } from './tasks.repository';
import { TasksService } from './tasks.service';

const OWNER = new Types.ObjectId().toString();

function leanTask(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    _id: new Types.ObjectId(),
    title: 'Task',
    status: 'todo' as const,
    ownerId: new Types.ObjectId(OWNER),
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

describe('TasksService', () => {
  let service: TasksService;
  const repo = {
    create: vi.fn(),
    findPageByOwner: vi.fn(),
    findByIdForOwner: vi.fn(),
    updateForOwner: vi.fn(),
    deleteForOwner: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [TasksService, { provide: TasksRepository, useValue: repo }],
    }).compile();
    service = moduleRef.get(TasksService);
  });

  it('maps lean docs to the wire shape (no ownerId, ISO dates, string id)', async () => {
    const doc = leanTask({ description: 'desc' });
    repo.findByIdForOwner.mockResolvedValue(doc);

    const dto = await service.get(OWNER, doc._id.toString());

    expect(dto).toEqual({
      id: doc._id.toString(),
      title: 'Task',
      description: 'desc',
      status: 'todo',
      dueDate: undefined,
      createdAt: '2026-07-01T00:00:00.000Z',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    expect(dto).not.toHaveProperty('ownerId');
  });

  it('throws 404 (not 403) when the task is missing or not owned', async () => {
    repo.findByIdForOwner.mockResolvedValue(null);
    await expect(service.get(OWNER, new Types.ObjectId().toString())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('computes nextCursor from the last item only when more pages exist', async () => {
    const docs = [leanTask(), leanTask()];
    repo.findPageByOwner.mockResolvedValue({ items: docs, hasMore: true });
    const page = await service.list(OWNER, { limit: 2 });
    expect(page.nextCursor).toBe(docs[1]!._id.toString());

    repo.findPageByOwner.mockResolvedValue({ items: docs, hasMore: false });
    const lastPage = await service.list(OWNER, { limit: 2 });
    expect(lastPage.nextCursor).toBeNull();
  });

  it('translates null description/dueDate updates into unsets', async () => {
    repo.updateForOwner.mockResolvedValue(leanTask());
    await service.update(OWNER, new Types.ObjectId().toString(), {
      description: null,
      dueDate: null,
    });
    expect(repo.updateForOwner).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.any(String),
      {
        title: undefined,
        description: null,
        status: undefined,
        dueDate: null,
      },
    );
  });

  it('delete throws 404 when nothing was deleted', async () => {
    repo.deleteForOwner.mockResolvedValue(false);
    await expect(service.delete(OWNER, new Types.ObjectId().toString())).rejects.toThrow(
      NotFoundException,
    );
  });
});
