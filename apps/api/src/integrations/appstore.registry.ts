import { Injectable, Logger } from '@nestjs/common';
import { AppMeta } from '@runfast/types';
import { BaseApp } from './app.base';
import { AppDeps } from './app.types';

@Injectable()
export class AppStoreRegistry {
  private readonly logger = new Logger(AppStoreRegistry.name);
  private apps = new Map<string, BaseApp>();
  private metas = new Map<string, AppMeta>();

  // TODO: Discover apps dynamically from filesystem and build artifacts (dist).
  // For now, use a simple static list. At runtime/build, consider resolving `dist` paths.
  private static readonly APPS_BASES: string[] = [
    // NOTE: Relative to this file at runtime. Adjust if build output structure differs.
    '../../../../packages/appstore/linkedin-social',
    '../../../../packages/appstore/gmail',
  ];

  async init(deps: AppDeps): Promise<void> {
    this.logger.log('Initializing AppStoreRegistry...');

    for (const base of AppStoreRegistry.APPS_BASES) {
      try {
        // Load metadata and factory
        const metaMod = await import(`${base}/metadata`);
        const idxMod = await import(`${base}/index`);
        const metadata: AppMeta = metaMod.metadata;
        const create: (meta: AppMeta, deps: AppDeps) => BaseApp = idxMod.default;

        if (!metadata?.slug) {
          this.logger.warn(`Skipping app at ${base}: missing slug in metadata`);
          continue;
        }

        const instance = create(metadata, deps);
        this.apps.set(metadata.slug, instance);
        this.metas.set(metadata.slug, metadata);
        this.logger.log(`Loaded app: ${metadata.slug}`);
      } catch (err) {
        this.logger.error(`Failed to load app at ${base}`, err as any);
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

