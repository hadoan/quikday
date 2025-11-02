import { Prisma, PrismaClient } from '@prisma/client';
import { getIntegrationSlugs } from '@quikday/appstore';

const prisma = new PrismaClient();

const VALID_APP_CATEGORIES = [
  'calendar',
  'email',
  'messaging',
  'other',
  'payment',
  'web3',
  'automation',
  'analytics',
  'conferencing',
  'crm',
  'social',
  'cloudstorage',
  'ai',
] as const;

type ValidCategory = (typeof VALID_APP_CATEGORIES)[number];

function asValidCategories(cats: unknown): ValidCategory[] {
  if (!Array.isArray(cats)) return [];
  return (cats as string[]).filter((c): c is ValidCategory =>
    VALID_APP_CATEGORIES.includes(c as ValidCategory),
  );
}

async function createApp(
  slug: Prisma.AppCreateInput['slug'],
  dirName: Prisma.AppCreateInput['dirName'],
  categories: Prisma.AppCreateInput['categories'],
  /** Used to re-link existing credentials of this type to the new appId (slug) */
  type: Prisma.CredentialCreateInput['type'],
  keys?: Prisma.InputJsonValue,
  isTemplate?: boolean,
) {
  try {
    const foundApp = await prisma.app.findFirst({
      where: { OR: [{ slug }, { dirName }] },
    });

    const data: Prisma.AppCreateInput = {
      slug,
      dirName,
      categories,
      keys: (keys as any) ?? undefined,
      enabled: true, // seeded apps enabled for tests
    } as Prisma.AppCreateInput;

    if (!foundApp) {
      await prisma.app.create({ data });
      console.log(`📲 Created ${isTemplate ? 'template' : 'app'}: '${slug}'`);
    } else {
      // Update by slug and dirName to survive rename of either.
      await prisma.app.update({ where: { slug: foundApp.slug }, data });
      await prisma.app.update({ where: { dirName: foundApp.dirName }, data });
      console.log(`📲 Updated ${isTemplate ? 'template' : 'app'}: '${slug}'`);
    }

    // Re-link credentials whose legacy `type` matches to use the seeded appId.
    await prisma.credential.updateMany({
      where: { type },
      data: { appId: slug },
    });
  } catch (e) {
    console.log(`Could not upsert app: ${slug}. Error:`, e);
  }
}

function slugToType(slug: string): string {
  return slug.replace(/-/g, '_');
}

async function seedFromRegistry() {
  const slugs = getIntegrationSlugs();
  for (const slug of slugs) {
    try {
      // Attempt to load metadata via two resolution strategies:
      // 1) Scoped subpath (used by API registry code)
      // 2) Separate workspace package name (appstore-{slug})
      let metaMod: any;
      try {
        metaMod = await import(`@quikday/appstore/${slug}/dist/metadata`);
      } catch {
        metaMod = await import(`@quikday/appstore-${slug}/dist/metadata`);
      }
      const meta = metaMod.metadata as {
        slug: string;
        dirName: string;
        categories?: string[];
      };

      const categories = asValidCategories(meta.categories);

      // Optional provider keys by slug
  let keys: Prisma.InputJsonValue | undefined;

      if (slug === 'google-calendar' || slug === 'gmail-email') {
        try {
          const parsed = JSON.parse(process.env.GOOGLE_API_CREDENTIALS || '{}');
          const web = parsed?.web ?? {};
          const { client_id, client_secret, redirect_uris } = web;
          if (client_id && client_secret) {
            keys = { client_id, client_secret, redirect_uris } as unknown as Prisma.InputJsonValue;
          }
        } catch {
          // ignore malformed GOOGLE_API_CREDENTIALS
        }
      }

      if (slug === 'linkedin-social') {
        const client_id = process.env.LINKEDIN_CLIENT_ID;
        const client_secret = process.env.LINKEDIN_CLIENT_SECRET;
        if (client_id && client_secret) {
          const base: Record<string, unknown> =
            keys && typeof keys === 'object' && !Array.isArray(keys) ? (keys as any) : {};
          keys = { ...base, app_id: client_id, app_secret: client_secret } as unknown as Prisma.InputJsonValue;
        }
      }

      await createApp(meta.slug, meta.dirName, categories, slugToType(slug), keys);
    } catch (err) {
      console.warn(`Skipping slug '${slug}' due to error loading metadata:`, err);
    }
  }
}

export default async function main() {
  await seedFromRegistry();

  // Example of adding additional apps (not strictly tied to registry)
  // Uncomment or extend as needed for tests.
  // await createApp('x-social', 'xsocial', ['social'], 'x_social');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
