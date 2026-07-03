import { NestFactory } from '@nestjs/core';

/**
 * Idempotent demo data: a handful of tasks for the bootstrap admin.
 * The admin account itself comes from ADMIN_EMAIL/ADMIN_PASSWORD in
 * apps/api/.env — AdminBootstrapService creates it during context init,
 * so by the time this runs the account exists.
 * Usage: pnpm db:seed  (requires Mongo from `pnpm db:up`)
 */
async function main(): Promise<void> {
  const { AppModule } = await import('../app.module.js');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });

  const { ConfigService } = await import('@nestjs/config');
  const { UsersService } = await import('../users/users.service.js');
  const { TasksService } = await import('../tasks/tasks.service.js');

  const configService = app.get(ConfigService);
  const usersService = app.get(UsersService);
  const tasksService = app.get(TasksService);

  const email = configService.get<string | undefined>('ADMIN_EMAIL');
  if (!email) {
    console.error(
      'ADMIN_EMAIL/ADMIN_PASSWORD are not set in apps/api/.env — nothing to seed.\n' +
        'Copy .env.example (it ships dev-only admin credentials) and re-run.',
    );
    process.exitCode = 1;
    await app.close();
    return;
  }

  const user = await usersService.findByEmail(email);
  if (!user) {
    console.error(`Admin ${email} was not bootstrapped — check the API logs.`);
    process.exitCode = 1;
    await app.close();
    return;
  }
  console.log(`Admin account: ${email} (from ADMIN_EMAIL)`);

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
