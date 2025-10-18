// Minimal, framework-agnostic callback helper for LinkedIn.
// This file intentionally avoids app/server-specific imports so it compiles cleanly.

export interface LinkedinCallbackOpts {
  query: Record<string, unknown>;
  session: { user?: { id?: number | string } } | null | undefined;
}

// Simple no-op callback that validates input and redirects to the app page.
// Persisting tokens and fetching user/pages should be implemented in the app's
// index.ts (BaseApp.callback) using server-side dependencies (e.g., Prisma).
export async function linkedinCallback(
  opts: LinkedinCallbackOpts,
  redirect: (url: string) => Promise<void> | void
): Promise<{ status?: number; body?: any } | void> {
  const { query, session } = opts;
  const { code } = (query || {}) as { code?: string };

  if (code && typeof code !== 'string') {
    return { status: 400, body: { message: '`code` must be a string' } };
  }
  if (!session?.user?.id) {
    return { status: 401, body: { message: 'You must be logged in to do this' } };
  }

  if (typeof code !== 'string') {
    return { status: 400, body: { message: 'Missing authorization code' } };
  }

  // In this package, just redirect to the installed app screen.
  await redirect(`/apps/social/linkedin-social`);
}

export default linkedinCallback;

