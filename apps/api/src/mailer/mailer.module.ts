import { Module } from '@nestjs/common';
import { ConsoleMailer } from './console.mailer';
import { Mailer } from './mailer.service';

@Module({
  providers: [{ provide: Mailer, useClass: ConsoleMailer }],
  exports: [Mailer],
})
export class MailerModule {}
