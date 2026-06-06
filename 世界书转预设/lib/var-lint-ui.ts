import { buildVarMacroPreviewSnippet, getVarMacroMatches } from '../var-lint';
import { esc } from './search';

export function dupSetOverrideHint(
  entryName: string,
  relativeOrder: 'before' | 'after',
): { label: string; title: string } {
  const name = entryName.trim() || '未命名条目';
  if (relativeOrder === 'before') {
    return {
      label: `当前在后 → 覆盖「${name}」`,
      title: `预设从上到下执行：「${name}」先 setvar，当前条目后 setvar；其后 getvar 读到的是当前条目的值。`,
    };
  }
  return {
    label: `「${name}」在后 → 覆盖当前`,
    title: `预设从上到下执行：当前条目先 setvar，「${name}」后 setvar；其后 getvar 读到的是「${name}」的值。`,
  };
}

export function varLintEntryBadges(item: { enabled: boolean; pendingDelete?: boolean }): string {
  const parts: string[] = [];
  if (item.pendingDelete) parts.push('<span class="pm-varlint-badge pm-varlint-badge--del">待删</span>');
  else if (!item.enabled) parts.push('<span class="pm-varlint-badge pm-varlint-badge--off">禁用</span>');
  return parts.join('');
}

export function renderVarMacroPreviewHtml(content: string, varName: string, macroKind: 'set' | 'get'): string {
  const snippet = buildVarMacroPreviewSnippet(content, varName, macroKind);
  const matches = getVarMacroMatches(content, varName, macroKind);
  if (matches.length === 0) return esc(snippet);

  let html = '';
  let last = 0;
  const inSnippet = snippet;
  for (const m of matches) {
    const idx = content.indexOf(m.text, last);
    if (idx === -1) continue;
    html += esc(content.slice(last, idx));
    html += `<span class="pm-varlint-hl">${esc(m.text)}</span>`;
    last = idx + m.text.length;
  }
  html += esc(content.slice(last));
  if (!html.trim()) return esc(inSnippet);
  return html;
}
