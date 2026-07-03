import { Injectable, Logger } from '@nestjs/common';
import { type MailMessage, Mailer } from './mailer.service';

/** Dev driver: emails land in the API log instead of an inbox. */
@Injectable()
export class ConsoleMailer extends Mailer {
  private readonly logger = new Logger('Mailer');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`to=${message.to} subject="${message.subject}"\n${message.text}`);
  }
}
