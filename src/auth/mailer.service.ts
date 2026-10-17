import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export abstract class Mailer {
  abstract sendMagicLink(email: string, link: string): Promise<void>;
}

/** Development mailer: prints the link instead of sending it. Never enabled in production. */
@Injectable()
export class LogMailer extends Mailer {
  private readonly logger = new Logger('Mailer');
  constructor(private readonly config: ConfigService) {
    super();
  }
  async sendMagicLink(_email: string, link: string) {
    if (this.config.get('NODE_ENV') !== 'test') this.logger.log(`Magic link: ${link}`);
  }
}
