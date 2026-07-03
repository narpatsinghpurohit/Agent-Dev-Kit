export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Injectable mail abstraction (abstract class = DI token). The kit ships the
 * console driver; production apps swap in SMTP/Resend/SES by providing a new
 * implementation in MailerModule — callers never change.
 */
export abstract class Mailer {
  abstract send(message: MailMessage): Promise<void>;
}
