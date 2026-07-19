/** CoT 预览正文：折叠 setvar 等宏，保留变量名与短摘要 */

const SETVAR_BLOCK_RE = /\{\{setvar::([^:}]+)::([\s\S]*?)\}\}/gi;
const SHORT_SETVAR_VALUE_MAX = 72;
const SETVAR_PREVIEW_SNIPPET = 40;

function formatSetvarSummary(varName: string, body: string): string {
  if (!varName) return '〔setvar · 格式异常〕';
  const trimmed = body.trim();
  const oneLine = trimmed.replace(/\s+/g, ' ');
  if (oneLine.length <= SHORT_SETVAR_VALUE_MAX) {
    return `{{setvar::${varName}::${oneLine}}}`;
  }
  const snippet = oneLine.slice(0, SETVAR_PREVIEW_SNIPPET);
  return `〔setvar → ${varName} · ${trimmed.length} 字〕 ${snippet}…`;
}

export function hasSetvarMacros(content: string): boolean {
  return /\{\{setvar::[^:}]+::/i.test(content);
}

export function compactMacroPreview(content: string): string {
  if (!content) return content;

  let out = content.replace(SETVAR_BLOCK_RE, (_m, name: string, body: string) =>
    formatSetvarSummary(String(name).trim(), String(body)),
  );

  out = out.replace(/\{\{getvar::([^}]+)\}\}/gi, (_m, name: string) => `〔getvar → ${String(name).trim()}〕`);
  out = out.replace(
    /\{\{addvar::([^:}]+)::[\s\S]*?\}\}/gi,
    (_m, name: string) => `〔addvar → ${String(name).trim()}〕`,
  );
  out = out.replace(
    /\{\{incvar::([^:}]+)::[\s\S]*?\}\}/gi,
    (_m, name: string) => `〔incvar → ${String(name).trim()}〕`,
  );
  out = out.replace(/\{\{trim\}\}/gi, '〔trim〕');
  out = out.replace(/\{\{random::[\s\S]*?\}\}/gi, '〔random〕');
  out = out.replace(/\{\{roll:[\s\S]*?\}\}/gi, '〔roll〕');

  return out.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * 含 setvar 时优先用预设原始正文做变量名摘要；否则用已渲染/ dry-run 正文并折叠其它长宏。
 */
export function resolveCotPreviewDisplayContent(rendered: string, rawPreset: string): string {
  const raw = String(rawPreset ?? '').trim();
  const renderedTrim = String(rendered ?? '').trim();
  if (raw && hasSetvarMacros(raw)) {
    return compactMacroPreview(raw);
  }
  if (renderedTrim) return compactMacroPreview(renderedTrim);
  if (raw) return compactMacroPreview(raw);
  return '';
}
