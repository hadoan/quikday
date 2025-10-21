import { Injectable, Logger } from '@nestjs/common';
import { AppMeta } from '@quikday/types';
import { getIntegrationSlugs } from '@quikday/appstore';
import { BaseApp } from './app.base';
import { AppDeps } from './app.types';
import { createSignedState, validateSignedState } from '../auth/oauth-state.util';

@Injectable()
export class AppStoreRegistry {
  private readonly logger = new Logger(AppStoreRegistry.name);
  private apps = new Map<string, BaseApp>();
  private metas = new Map<string, AppMeta>();

  async init(deps: AppDeps): Promise<void> {
    this.logger.log('Initializing AppStoreRegistry...');

    // Augment deps with OAuth state utilities
    const augmentedDeps: AppDeps = {
      ...deps,
      createSignedState,
      validateSignedState,
    };

    // Get integration slugs from centralized registry
    const slugs = getIntegrationSlugs();

    for (const slug of slugs) {
      try {
        const { metadata, create } = await this.loadIntegration(slug);

        if (!metadata?.slug) {
          this.logger.warn(`Skipping app ${slug}: missing slug in metadata`);
          continue;
        }

        const instance = create(metadata, augmentedDeps);
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

  private async loadIntegration(slug: string): Promise<{
    metadata: AppMeta;
    create: (meta: AppMeta, deps: AppDeps) => BaseApp;
  }> {
    const candidateBases = [
      `@quikday/appstore/${slug}/dist`,
      `@quikday/appstore-${slug}/dist`,
      `@quikday/appstore-${slug}`,
    ];

    let lastError: unknown;

    for (const basePath of candidateBases) {
      try {
        const [metaMod, idxMod] = await Promise.all([
          import(`${basePath}/metadata`),
          import(`${basePath}/index`),
        ]);

        const metadata = metaMod?.metadata as AppMeta | undefined;
        const create = idxMod?.default as ((meta: AppMeta, deps: AppDeps) => BaseApp) | undefined;

        if (!metadata || typeof create !== 'function') {
          throw new Error(`Invalid exports for integration ${slug} at ${basePath}`);
        }

        return { metadata, create };
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error(`Unable to resolve integration modules for ${slug}`);
  }
}
