import { Injectable, Logger } from '@nestjs/common';
import { PostHog } from 'posthog-node';
import { ConfigService } from '../config/config.service';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);
  private readonly client?: PostHog;

  constructor(config: ConfigService) {
    const key = config.env.POSTHOG_API_KEY;
    if (key) this.client = new PostHog(key);
  }

  async track(event: string, properties?: Record<string, any>) {
    if (!this.client) {
      this.logger.debug(`Telemetry disabled: ${event}`);
      return;
    }
    this.client.capture({ event, distinctId: 'quikday-backend', properties });
  }
}
