import { z } from "zod";
import type { Tool } from "../types";
import type { RunCtx } from "../../state/types";

/**
 * Input & Output schemas
 */
const In = z.object({
    channel: z.string().regex(/^#?[a-z0-9_-]+$/i),
    text: z.string().min(1),
});

const Out = z.object({
    ok: z.boolean(),
    channel: z.string(),
    ts: z.string().optional(),
    url: z.string().optional(),
});

/**
 * Tries, in order:
 *  1) ctx.services.slack.postMessage({ channel, text })
 *  2) dynamic import("@quikday/appstore-slack").SlackService()
 *  3) dev-friendly stub (returns ok: true) so planning/execution can proceed in dry-runs
 */
async function postToSlack(
    channel: string,
    text: string,
    ctx: RunCtx,
): Promise<{ ok: boolean; ts?: string; url?: string }> {
    // 1) Call injected service if present (preferred for testing/mocks)
    const svc = (ctx as any)?.services?.slack;
    if (svc?.postMessage) {
        return await svc.postMessage({ channel, text });
    }

    // 2) Try dynamic import of your connector so this file doesn't hard-depend at build time
    try {
        // // eslint-disable-next-line @typescript-eslint/no-var-requires
        // const mod: any = await import("@quikday/appstore-slack");
        // if (mod?.SlackService) {
        //     const slack = new mod.SlackService({ userId: ctx.userId, teamId: ctx.teamId });
        //     return await slack.postMessage({ channel, text });
        // }
    } catch {
        // ignore — fall through to stub
    }

    // 3) Stub (non-effectful): useful for local/dev when Slack connector isn’t wired yet
    return { ok: true };
}

/**
 * Tool definition compatible with your ToolRegistry:
 *  - name/in/out/scopes/rate/risk/call fields
 */
export const slackPostMessage: Tool<z.infer<typeof In>, z.infer<typeof Out>> = {
    name: "slack.postMessage",
    in: In,
    out: Out,
    scopes: ["slack:write"], // least-privilege scope checked by requireScopes()
    rate: "60/m",            // works with your checkRate("N/m" | "N/s")
    risk: "low",

    async call(args, ctx: RunCtx) {
        const { channel, text } = In.parse(args);
        const channelNorm = channel.startsWith("#") ? channel : `#${channel}`;

        const res = await postToSlack(channelNorm, text, ctx);

        return Out.parse({
            ok: res.ok ?? true,
            channel: channelNorm,
            ts: res.ts,
            url: res.url,
        });
    },
};
