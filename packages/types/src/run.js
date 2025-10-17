"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatBlock = exports.OutputCard = exports.UndoCard = exports.LogCard = exports.RunCard = exports.ConfigCard = exports.PlanCard = void 0;
const zod_1 = require("zod");
exports.PlanCard = zod_1.z.object({
    type: zod_1.z.literal("plan"),
    intent: zod_1.z.string(),
    tools: zod_1.z.array(zod_1.z.string()),
    actions: zod_1.z.array(zod_1.z.string()),
    mode: zod_1.z.enum(["plan", "auto"]),
});
exports.ConfigCard = zod_1.z.object({
    type: zod_1.z.literal("config"),
    fields: zod_1.z.record(zod_1.z.string(), zod_1.z.any()),
    suggestions: zod_1.z.array(zod_1.z.string()).optional(),
});
exports.RunCard = zod_1.z.object({
    type: zod_1.z.literal("run"),
    status: zod_1.z.enum(["queued", "running", "done", "failed"]),
    startedAt: zod_1.z.string().optional(),
});
exports.LogCard = zod_1.z.object({
    type: zod_1.z.literal("log"),
    entries: zod_1.z.array(zod_1.z.object({
        ts: zod_1.z.string(),
        tool: zod_1.z.string(),
        action: zod_1.z.string(),
        result: zod_1.z.any().optional(),
    })),
});
exports.UndoCard = zod_1.z.object({
    type: zod_1.z.literal("undo"),
    allowed: zod_1.z.boolean(),
    deadline: zod_1.z.string().optional(),
});
exports.OutputCard = zod_1.z.object({
    type: zod_1.z.literal("output"),
    summary: zod_1.z.string().optional(),
    data: zod_1.z.any(),
});
exports.ChatBlock = zod_1.z.discriminatedUnion("type", [
    exports.PlanCard,
    exports.ConfigCard,
    exports.RunCard,
    exports.LogCard,
    exports.UndoCard,
    exports.OutputCard,
]);
//# sourceMappingURL=run.js.map