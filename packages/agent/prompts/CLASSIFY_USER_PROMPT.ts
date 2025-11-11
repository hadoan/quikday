type Answers = Record<string, unknown>;

export function buildClassifyUserPrompt(
  text: string,
  answers: Answers = {},
  meta?: { timezone?: string; todayISO?: string },
): string {
  const answersBlock = Object.keys(answers).length
    ? `\nUser-provided answers (dot-path keys):\n${JSON.stringify(answers, null, 2)}\n`
    : '';

  const metaBlock =
    meta && (meta.timezone || meta.todayISO)
      ? `\nMeta:\n- timezone: ${meta.timezone ?? 'UTC'}\n- nowISO: ${meta.todayISO ?? ''}\n`
      : '';
  return ['User:', text, answersBlock, metaBlock].join('\n');
}
