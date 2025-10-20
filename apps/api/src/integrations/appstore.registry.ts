import { Injectable, Logger } from '@nestjs/common';
import { AppMeta } from '@quikday/types';
import { getIntegrationSlugs } from '@quikday/appstore';
import { BaseApp } from './app.base';
import { AppDeps } from './app.types';

@Injectable()
export class AppStoreRegistry {
  private readonly logger = new Logger(AppStoreRegistry.name);
  private apps = new Map<string, BaseApp>();
  private metas = new Map<string, AppMeta>();

  async init(deps: AppDeps): Promise<void> {
    this.logger.log('Initializing AppStoreRegistry...');

    // Get integration slugs from centralized registry
    const slugs = getIntegrationSlugs();

    for (const slug of slugs) {
      try {
        // Convention: @quikday/appstore/{slug}/dist/
        const basePath = `@quikday/appstore/${slug}/dist`;
        
        // Load metadata and factory
        const metaMod = await import(`${basePath}/metadata`);
        const idxMod = await import(`${basePath}/index`);
        const metadata: AppMeta = metaMod.metadata;
        const create: (meta: AppMeta, deps: AppDeps) => BaseApp = idxMod.default;

        if (!metadata?.slug) {
          this.logger.warn(`Skipping app ${slug}: missing slug in metadata`);
          continue;
        }

        const instance = create(metadata, deps);
        this.apps.set(metadata.slug, instance);
        this.metas.set(metadata.slug, metadata);
        this.logger.log(`Loaded app: ${metadata.slug}`);
      } catch (err) {
        this.logger.error(`Failed to load app: ${slug}`, err as any);
      }
    }
  }

  get(slug: string): BaseApp | undefined {
    return this.apps.get(slug);
  }

  list(): AppMeta[] {
    return Array.from(this.metas.values());
  }
}
