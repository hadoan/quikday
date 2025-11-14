# Notion Productivity App – Configuration Guide

This package powers the `notion-productivity` app in the App Store registry. The OAuth flow expects a Notion public integration with a client id/secret that we control. Follow the steps below to make sure the app loads correctly inside the API.

## 1. Create a Notion integration

1. Visit <https://www.notion.so/my-integrations> and click **+ New integration**.
2. Choose the workspace that will own the integration.
3. Copy the generated **Client ID** and **Client Secret**. We will store both in our backend so that the OAuth flow can complete.
4. Set the **Redirect URL** to your API base URL plus `/integrations/notion-productivity/callback`. For example:
   - Local dev: `http://localhost:3000/integrations/notion-productivity/callback`
   - Production: `https://api.yourdomain.com/integrations/notion-productivity/callback`

## 2. Provide credentials to the API

The code first tries to read `client_id` / `client_secret` from the `App` record in the database. If those keys are missing it falls back to environment variables. Pick whichever workflow is easier for your environment.

### Option A: Store the keys in Postgres

```sql
-- Replace the values with the credentials from Notion.
UPDATE "App"
SET keys = jsonb_build_object(
  'client_id',    'NOTION_CLIENT_ID',
  'client_secret','NOTION_CLIENT_SECRET'
)
WHERE slug = 'notion-productivity';
```

If the `App` row does not exist yet you can insert it instead:

```sql
INSERT INTO "App" (slug, name, keys)
VALUES (
  'notion-productivity',
  'Notion',
  jsonb_build_object(
    'client_id',    'NOTION_CLIENT_ID',
    'client_secret','NOTION_CLIENT_SECRET'
  )
)
ON CONFLICT (slug) DO UPDATE
SET keys = EXCLUDED.keys;
```

### Option B: Use environment variables

Add the credentials to the API environment (e.g. `.env`, Docker secrets, Vercel env vars):

```bash
NOTION_CLIENT_ID=xxxxxxxxxxxxxxxx
NOTION_CLIENT_SECRET=yyyyyyyyyyyyyyyy
```

The integration code also reads the following env vars, so make sure they exist in your environment:

| Variable        | Purpose                                                                |
| --------------- | ---------------------------------------------------------------------- |
| `API_BASE_URL`  | Used to build redirect URLs during OAuth. Defaults to request host.    |
| `WEBAPP_URL`    | (Optional) Where the user is sent after connecting – e.g. your SPA URL |

## 3. Restart the API

After updating the database or environment variables, restart `@quikday/api` (and any workers) so the `AppStoreRegistry` reloads the `notion-productivity` metadata. You should no longer see `Cannot find module .../metadata` errors and the Notion app will appear in the app list.

## Troubleshooting

- `AppStoreRegistry` still logs “Notion OAuth credentials not configured”: confirm the `App` table row exists and that `keys` contains `client_id` and `client_secret`, or ensure the env vars are loaded (e.g. run `printenv | grep NOTION` inside the API process).
- OAuth redirect mismatch: verify the redirect URL configured in Notion **exactly** matches the URL the API generates (scheme + host + path).
- DB migrations: the `App` table is seeded via `pnpm seed:appstore`. If you dropped the table, run that seed command first, then update the keys as shown above.

With the credentials in place you can complete the OAuth flow from `/integrations/notion-productivity/add` and the resulting credential will be stored under the requesting user.
