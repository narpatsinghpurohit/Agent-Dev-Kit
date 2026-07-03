import { NestFactory } from '@nestjs/core';

/**
 * Idempotent demo data: a demo user and a handful of tasks across statuses.
 * Usage: pnpm db:seed  (requires Mongo from `pnpm db:up`)
 */
async function main(): Promise<void> {
  const { AppModule } = await import('../app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const { UsersService } = await import('../users/users.service.js');
  const { TasksService } = await import('../tasks/tasks.service.js');
  const { hash } = await import('@node-rs/argon2');

  const usersService = app.get(UsersService);
  const tasksService = app.get(TasksService);

  const email = 'demo@example.com';
  const password = 'demo-password-123';

  let user = await usersService.findByEmail(email);
  if (!user) {
    user = await usersService.createUser({
      email,
      name: 'Demo User',
      passwordHash: await hash(password, { memoryCost: 65536, timeCost: 3, parallelism: 1 }),
    });
    console.log(`Created demo user ${email} (password: ${password})`);
  } else {
    console.log(`Demo user ${email} already exists`);
  }

  // The demo user administers runtime settings (/settings in the web app).
  const { getModelToken } = await import('@nestjs/mongoose');
  const userModel = app.get<{
    updateOne: (f: unknown, u: unknown) => { exec: () => Promise<unknown> };
  }>(getModelToken('User'));
  await userModel.updateOne({ _id: user._id }, { $set: { role: 'admin' } }).exec();
  console.log('Demo user has the admin role');

  const ownerId = user._id.toString();
  const existing = await tasksService.list(ownerId, { limit: 1 });
  if (existing.items.length === 0) {
    const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    const seeds = [
      { title: 'Read the architecture guidelines', description: 'docs/guidelines/architecture.md' },
      { title: 'Run the copilot demo', description: 'Ask it to create a task for you' },
      { title: 'Wire up a real mailer driver', dueDate: inDays(7) },
      { title: 'Swap the mock AI provider for Gemini', dueDate: inDays(3) },
      { title: 'Ship something', dueDate: inDays(14) },
      { title: 'Review the view/hook file standard' },
      { title: 'Explore the generated API client' },
      { title: 'Set up remote caching for turbo' },
    ];
    for (const seed of seeds) {
      await tasksService.create(ownerId, seed);
    }
    // Vary statuses for a lively demo board.
    const page = await tasksService.list(ownerId, { limit: 20 });
    const [first, second, third] = page.items;
    if (first) await tasksService.update(ownerId, first.id, { status: 'done' });
    if (second) await tasksService.update(ownerId, second.id, { status: 'in_progress' });
    if (third) await tasksService.update(ownerId, third.id, { status: 'in_progress' });
    console.log(`Seeded ${seeds.length} tasks`);
  } else {
    console.log('Tasks already seeded');
  }

  await app.close();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
