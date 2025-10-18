**App Store Package — Architecture & Replication Guide**

- Modular integration framework: each app lives in its own folder with metadata, zod schemas, API handlers, and a small library.
- Auto‑generated registries wire apps into UI, server handlers, zod schemas, and posting/commenting registries via the App Store CLI.
- DB‑backed configuration: `App` rows in Prisma store `enabled` and per‑app `keys`; code loads them by `slug`.

**High‑Level Flow**
- Define an app under `packages/app-store/<appDir>` with `_metadata.ts`, `zod.ts`, `api/`, `lib/`, and assets.
- Run `yarn app-store:build` to generate registries and schema maps.
- Seed or insert an `App` row (slug, categories, optional keys) so the app appears as installed/enabled when appropriate.
- Use exported maps and helpers to render UI (install buttons, setup pages) and call server handlers.

**Directory Layout**
- `packages/app-store/_appRegistry.ts`: Combines DB `App` rows with local metadata; returns lists for UI, merges credential info, computes most‑popular.
- `packages/app-store/appStoreMetaData.ts`: Normalizes/generated metadata, resolves logo paths with `getAppAssetFullPath`.
- `packages/app-store/components.tsx`: Shared UI (InstallAppButton, AppDependencyComponent) using generated component maps.
- `packages/app-store/postRegistry*.ts`: Registry of `post(postId)` handlers per app; generated from each app’s `lib`.
- `packages/app-store/commentRegistry*.ts`: Registry of comment/reply handlers; generated similarly.
- `packages/app-store/apps.*.generated.*`: Auto‑generated maps (metadata, zod schemas, browser components, server API handlers, key schemas).
- `packages/app-store/_pages/setup/*`: Dynamic mapping to app‑specific setup pages.
- `packages/app-store/_components/*`: Dynamic wrappers for app configuration UI.
- `packages/app-store/utils.ts`: App lookups, safe aggregations, location options, helpers.
- Per‑app directories (examples): `linkedinsocial`, `instagramsocial`, `facebooksocial`, `threadssocial`, `xconsumerkeyssocial`, `chatgptai`, etc.

**Per‑App Structure**
- `_metadata.ts`: Exports `metadata: AppMeta` with fields:
  - `name`, `description`, `type` (e.g., `linkedin_social`), `title`, `variant` (e.g., `social`, `conferencing`), `category` and `categories` (e.g., `["social"]`).
  - `logo` (e.g., `icon.svg`), `publisher`, `slug` (e.g., `linkedin-social`), `dirName`, `email`, `url`.
  - Optional: `dependencies`, `isTemplate`, `__template`, `appData`.
- `zod.ts`: Defines two zod schemas:
  - `appDataSchema`: app‑specific data shape (may be `{}` if not used).
  - `appKeysSchema`: required keys for OAuth/API (e.g., `client_id`, `client_secret`). Used for validation and UI to request keys.
- `api/`: Next.js API handlers for install flows and operations (e.g., `add.ts`, `callback.ts`, `post.ts`, `index.ts` re‑exports).
- `lib/`: Core logic (credential schema, `getClient`, `*Manager.ts` exporting `post`, optional reply/comment functions, helpers).
- `static/`: Assets like `icon.svg`.
- `package.json`: Independent name/description; CLI adjusts name to `@quillsocial/<slug>` when scaffolding.
- Optional: `pages/setup` for app setup UI.

**Generated Files (via CLI)**
- `apps.metadata.generated.ts`: Aggregates `_metadata.ts` or `config.json` into `appStoreMetadata`.
- `apps.schemas.generated.ts`: Gathers `appDataSchema` per app.
- `apps.keys-schemas.generated.ts`: Gathers `appKeysSchema` per app for validation and forms.
- `apps.browser.generated.tsx`: Builds lazy `InstallAppButtonMap`, `AppSettingsComponentsMap`, `EventTypeAddonMap`.
- `apps.server.generated.ts`: Dynamic `apiHandlers` import map for server.
- `postRegistry.generated.ts`: Populates `POST_HANDLERS` by scanning `lib` for `post` exports.
- `commentRegistry.generated.ts`: Populates `COMMENT_HANDLERS` by scanning for `reply`, `comment`, etc.; also exports `PLATFORMS_WITHOUT_COMMENT_SUPPORT`.

Run generators:
- `yarn app-store:build` to generate once.
- `yarn app-store:watch` to watch for changes.
- CLI lives at `packages/app-store-cli` and scans `packages/app-store/*`.

**DB Integration (Prisma)**
- Apps are persisted in the `App` model: `slug` (PK), `dirName`, `categories`, `enabled`, and optional `keys` (JSON).
- Retrieve keys by slug: `getAppKeysFromSlug(slug)` reads `prisma.app.findUnique({ where: { slug } })?.keys`.
- Validate keys with per‑app `appKeysSchema` (see TRPC handler `viewer/apps/listLocal`).
- Frontend payloads hide keys (`getAppWithMetadata` drops `key` from response).
- You can seed initial app rows using `packages/prisma/seed-app-store.ts` (deprecated; used for E2E) or manage via admin flows.

**UI Integration**
- Install button: `InstallAppButton` chooses app‑specific component from `InstallAppButtonMap` or falls back to default mutation.
- App configuration: `AppConfiguration` dynamically loads `components/AppConfiguration` if provided by the app.
- Setup pages: `_pages/setup` maps slugs to app setup pages using `DynamicComponent`.
- Asset paths: `getAppAssetFullPath` prefixes `/app-store/<dirName>/...` unless absolute/URL.

**Posting & Commenting**
- Post registry: `executePost(appId, postId)` routes to the app’s `post` handler (e.g., LinkedIn/Twitter/Threads/Instagram managers).
- Comment registry: `executeComment(appId, credentialId, parentId, content)` where supported (e.g., X/Twitter’s `replyToTweet`).
- Add new platforms by exporting the expected function from `lib` and re‑running `yarn app-store:build`.

**Replicating in Another Project**
- 1) Dependencies
  - Monorepo recommended. Add workspaces: `packages/app-store`, `packages/app-store-cli`, `packages/prisma`, `packages/types`.
  - Install: `@prisma/client`, `prisma`, `zod`, Next.js (if using API routes), and your shared libs.

- 2) Prisma `App` model
  - Include a JSON `keys` field and array `categories`. Ensure `slug` is PK.
  - Add read helpers to fetch keys by slug, and expose only safe fields to the frontend.

- 3) App Store CLI
  - Add `@your-scope/app-store-cli` (or reuse this) and scripts at repo root:
    - `"app-store:build": "yarn app-store-cli build"`
    - `"app-store:watch": "yarn app-store-cli watch"`
  - Point `APP_STORE_PATH` in the CLI to your `packages/app-store` directory (default here).

- 4) Create your first app
  - Create `packages/app-store/<slug>/` (e.g., `linkedinsocial`).
  - Add `_metadata.ts`, `zod.ts`, `api/`, `lib/`, `static/icon.svg`, and a minimal `package.json`.
  - Export `post(postId)` in `lib/<AppName>Manager.ts` or `lib/index.ts` to be auto‑registered.
  - If commenting/reply is supported, export a reply/comment function.

- 5) Generate maps
  - Run `yarn app-store:build` to produce `apps.*.generated.ts*`, `postRegistry.generated.ts`, and `commentRegistry.generated.ts`.

- 6) Seed/insert DB rows
  - Insert into `App` table: `slug`, `dirName`, `categories`, `enabled`, and any `keys`.
  - Optionally adapt the deprecated `seed-app-store.ts` pattern to bulk‑insert during dev/tests.

- 7) Wire UI
  - Render catalog using `_appRegistry.ts` helpers or TRPC `listLocal` handler.
  - Use `InstallAppButton` and `AppConfiguration` for per‑app experiences.

- 8) Test flows
  - OAuth: implement `api/add.ts` and `api/callback.ts`.
  - Posting: call `executePost(slug, postId)`.
  - Commenting: call `executeComment(slug, credentialId, parentId, content)` where supported.

**Common Commands**
- Build registries: `yarn app-store:build`
- Watch registries: `yarn app-store:watch`
- List local apps with placeholder keys: see TRPC handler `packages/trpc/server/routers/viewer/apps/listLocal.handler.ts`

**Caveats & Tips**
- Keep `_metadata.ts` authoritative for `slug`, `dirName`, and `categories`; the CLI uses it to generate maps.
- Secrets: never send keys to frontend responses; rely on server loading via `getAppKeysFromSlug`.
- If you rename an app’s directory or slug, rerun `yarn app-store:build` and keep DB rows in sync.
- For custom UI, add `components/InstallAppButton.tsx` or `components/AppSettingsInterface.tsx` to an app; the CLI will map them automatically.

**Example Minimal App**
- `_metadata.ts`:
  - `export const metadata = { name: "Acme", slug: "acme-social", type: "acme_social", variant: "social", categories: ["social"], logo: "icon.svg", publisher: "Acme", email: "support@acme.com", dirName: "acmesocial", description: "..." } as AppMeta;`
- `zod.ts`:
  - `export const appDataSchema = z.object({});`
  - `export const appKeysSchema = z.object({ client_id: z.string().min(1), client_secret: z.string().min(1) });`
- `lib/index.ts`:
  - `export const post = async (postId: number) => { /* ... */ };`
- `api/index.ts`:
  - `export { default as add } from "./add"; export { default as callback } from "./callback"; export { default as post } from "./post";`

