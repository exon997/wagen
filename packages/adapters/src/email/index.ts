/**
 * D3: Transactional email adapter interface (14.6).
 *
 * The provider (Resend/Postmark/SES class) is an open item (sekcija 20) -
 * the worker sends through this interface and the choice stays swappable.
 * Email covers ALL notification levels for web-only users (14.6: web push
 * is deliberately not built in v1).
 */

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  /** Plain-text alternative; providers derive one if omitted. */
  text?: string;
}

export interface EmailSendResult {
  /** Provider message id, for delivery tracking/debugging. */
  id: string;
}

export interface EmailAdapter {
  /** Stable provider key, e.g. 'resend', 'postmark', 'ses'. */
  readonly provider: string;
  send(message: EmailMessage): Promise<EmailSendResult>;
}

/**
 * Dev implementation: prints to the console, delivers nothing. Keeps the
 * whole notification pipeline runnable locally with zero credentials.
 */
export class ConsoleEmailAdapter implements EmailAdapter {
  readonly provider = 'console';

  private counter = 0;

  send(message: EmailMessage): Promise<EmailSendResult> {
    this.counter += 1;
    const id = `console-${this.counter}`;
    // eslint-disable-next-line no-console
    console.info(`[email:console] -> ${message.to} | ${message.subject} (${id})`);
    return Promise.resolve({ id });
  }
}
