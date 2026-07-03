import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { ZodValidationException } from 'nestjs-zod';
import { AllExceptionsFilter } from './all-exceptions.filter';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  };
  new AllExceptionsFilter().catch(exception, host as never);
  return { statusCode: status.mock.calls[0]?.[0], body: json.mock.calls[0]?.[0] };
}

describe('AllExceptionsFilter', () => {
  it('maps zod validation failures to the envelope with field details', () => {
    const parse = z.object({ title: z.string().min(1) }).safeParse({ title: '' });
    if (parse.success) throw new Error('expected failure');
    const { statusCode, body } = run(new ZodValidationException(parse.error));

    expect(statusCode).toBe(400);
    expect(body.message).toBe('Validation failed');
    expect(body.details[0].path).toBe('title');
  });

  it('passes through HttpExceptions with reason phrases', () => {
    const { statusCode, body } = run(new NotFoundException('Task not found'));
    expect(statusCode).toBe(404);
    expect(body).toMatchObject({ error: 'Not Found', message: 'Task not found' });
  });

  it('flattens array messages from HttpExceptions', () => {
    const { body } = run(new BadRequestException({ message: ['a', 'b'] }));
    expect(body.message).toBe('a; b');
  });

  it('hides internals on unexpected errors', () => {
    const { statusCode, body } = run(new Error('mongo connection string leaked'));
    expect(statusCode).toBe(500);
    expect(body.message).toBe('Internal server error');
    expect(JSON.stringify(body)).not.toContain('mongo');
  });
});
