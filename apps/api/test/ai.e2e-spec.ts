import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app';

/**
 * Copilot e2e on the keyless mock provider: SSE protocol, tool-approval
 * round-trip that really creates a task, persistence, usage rows.
 */
describe('ai copilot (e2e, mock provider)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];
  let token: string;

  beforeAll(async () => {
    app = await createTestApp('ai-e2e');
    server = app.getHttpServer();
    const res = await request(server)
      .post('/api/auth/signup')
      .send({ email: 'pilot@example.com', password: 'longenough-pass', name: 'Pilot' })
      .expect(201);
    token = res.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  function chatBody(chatId: string, messages: unknown[]) {
    return { id: chatId, messages };
  }

  function userMessage(id: string, text: string) {
    return { id, role: 'user', parts: [{ type: 'text', text }] };
  }

  /** Parse the UI-message SSE body into its JSON chunks. */
  function sseChunks(body: string): Array<Record<string, unknown>> {
    return body
      .split('\n')
      .filter((line) => line.startsWith('data: ') && !line.includes('[DONE]'))
      .map((line) => JSON.parse(line.slice(6)));
  }

  it('rejects unauthenticated chat', async () => {
    await request(server)
      .post('/api/ai/chat')
      .send(chatBody('chat-anon', [userMessage('m1', 'hi')]))
      .expect(401);
  });

  it('exposes model info (mock mode)', async () => {
    const res = await request(server)
      .get('/api/ai/models')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const copilot = res.body.features.find(
      (f: { feature: string }) => f.feature === 'copilot-chat',
    );
    expect(copilot.model).toBe('mock:copilot-chat');
  });

  it('streams the UI-message protocol and persists the conversation', async () => {
    const res = await request(server)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send(chatBody('chat-echo', [userMessage('m1', 'hello copilot')]))
      .expect(200);

    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['x-vercel-ai-ui-message-stream']).toBe('v1');

    const chunks = sseChunks(res.text);
    const text = chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(text).toContain('hello copilot');
    expect(chunks.at(-1)?.type).toBe('finish');

    // Conversation + messages persisted.
    const conversations = await request(server)
      .get('/api/ai/conversations')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(conversations.body.map((c: { id: string }) => c.id)).toContain('chat-echo');

    const messages = await request(server)
      .get('/api/ai/conversations/chat-echo/messages')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(messages.body).toHaveLength(2); // user + assistant
    expect(messages.body[1].role).toBe('assistant');
  });

  it('runs the full tool-approval loop: request → approve → task exists', async () => {
    // 1) Ask the copilot to create a task — the mutating tool needs approval.
    const first = await request(server)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send(chatBody('chat-tool', [userMessage('m1', 'Create a task called E2E Copilot Task')]))
      .expect(200);

    const approvalRequest = sseChunks(first.text).find(
      (c) => c.type === 'tool-approval-request',
    ) as { approvalId: string } | undefined;
    expect(approvalRequest).toBeDefined();

    // No task yet — execution is paused on approval.
    const before = await request(server)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(before.body.items).toHaveLength(0);

    // 2) Approve: flip the tool part to approval-responded (what
    //    addToolApprovalResponse does client-side) and continue the chat.
    const stored = await request(server)
      .get('/api/ai/conversations/chat-tool/messages')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const assistant = stored.body.at(-1);
    expect(assistant.role).toBe('assistant');
    for (const part of assistant.parts) {
      if (part.state === 'approval-requested') {
        part.state = 'approval-responded';
        part.approval = { id: part.approval.id, approved: true };
      }
    }

    const second = await request(server)
      .post('/api/ai/chat')
      .set('Authorization', `Bearer ${token}`)
      .send(chatBody('chat-tool', [...stored.body.slice(0, -1), assistant]))
      .expect(200);

    const chunks = sseChunks(second.text);
    const outputAvailable = chunks.find((c) => c.type === 'tool-output-available');
    expect(outputAvailable).toBeDefined();
    const confirmation = chunks
      .filter((c) => c.type === 'text-delta')
      .map((c) => c.delta)
      .join('');
    expect(confirmation).toContain('Done');

    // 3) The task genuinely exists — same service the REST API uses.
    const after = await request(server)
      .get('/api/tasks')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(after.body.items).toHaveLength(1);
    expect(after.body.items[0].title).toBe('E2E Copilot Task');
  });

  it('records usage rows for chat calls', async () => {
    const { getModelToken } = await import('@nestjs/mongoose');
    const usageModel = app.get<{
      countDocuments: (f: Record<string, unknown>) => { exec: () => Promise<number> };
    }>(getModelToken('AiUsage'));

    // Usage settlement runs asynchronously after the stream closes — poll.
    let count = 0;
    for (let attempt = 0; attempt < 30 && count === 0; attempt += 1) {
      count = await usageModel.countDocuments({ feature: 'copilot-chat' }).exec();
      if (count === 0) await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(count).toBeGreaterThan(0);
  });

  it('serves speech endpoints in mock mode', async () => {
    const tts = await request(server)
      .post('/api/ai/tts')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'hello' })
      .expect(201);
    expect(tts.headers['content-type']).toContain('audio/wav');
    expect(tts.body.slice(0, 4).toString()).toBe('RIFF');

    const stt = await request(server)
      .post('/api/ai/transcribe')
      .set('Authorization', `Bearer ${token}`)
      .attach('audio', Buffer.from('fake-audio'), { filename: 'a.webm', contentType: 'audio/webm' })
      .expect(201);
    expect(stt.body.text).toContain('mock transcription');
  });
});
