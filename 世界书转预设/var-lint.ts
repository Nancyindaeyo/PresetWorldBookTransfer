/** 预设条目内 setvar / getvar 静态引用分析 */

export type PresetVarLintEntry = {
  index: number;
  name: string;
  content: string;
  enabled: boolean;
  pendingDelete?: boolean;
};

export type VarLintRef = {
  index: number;
  entryName: string;
  enabled: boolean;
  pendingDelete?: boolean;
  macroKind: 'set' | 'get';
  count: number;
};

export type VarLintDuplicateSet = {
  index: number;
  entryName: string;
  enabled: boolean;
  pendingDelete?: boolean;
  count: number;
  /** 相对当前条目的顺序，用于说明 setvar 覆盖关系 */
  relativeOrder: 'before' | 'after';
};

export type VarLintDuplicateGet = VarLintDuplicateSet;

export type VarLintItem = {
  varName: string;
  macroKind: 'set' | 'get';
  localCount: number;
  status: 'ok' | 'missing';
  refs: VarLintRef[];
  duplicateSets: VarLintDuplicateSet[];
  duplicateGets: VarLintDuplicateGet[];
};

export type VarLintReport = {
  items: VarLintItem[];
};

const RE_SETVAR = /\{\{setvar::([^:}]+)::/gi;
const RE_GETVAR = /\{\{getvar::([^}]+)\}\}/gi;

export function normalizeVarName(raw: string): string {
  return raw.trim();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countMacroMatches(content: string, re: RegExp): Map<string, number> {
  const counts = new Map<string, number>();
  const regex = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    const name = normalizeVarName(m[1] ?? '');
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return counts;
}

export function extractSetvarCounts(content: string): Map<string, number> {
  return countMacroMatches(content, RE_SETVAR);
}

export function extractGetvarCounts(content: string): Map<string, number> {
  return countMacroMatches(content, RE_GETVAR);
}

function macroRegex(varName: string, macroKind: 'set' | 'get'): RegExp {
  const name = escapeRegex(normalizeVarName(varName));
  if (macroKind === 'set') {
    return new RegExp(`\\{\\{setvar::${name}::[\\s\\S]*?\\}\\}`, 'gi');
  }
  return new RegExp(`\\{\\{getvar::${name}\\}\\}`, 'gi');
}

/** 提取条目中与变量名匹配的宏文本片段位置 */
export function getVarMacroMatches(
  content: string,
  varName: string,
  macroKind: 'set' | 'get',
): { start: number; end: number; text: string }[] {
  const re = macroRegex(varName, macroKind);
  const matches: { start: number; end: number; text: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    matches.push({ start: m.index, end: m.index + m[0].length, text: m[0] });
  }
  return matches;
}

/** 围绕首个匹配截取预览文本 */
export function buildVarMacroPreviewSnippet(
  content: string,
  varName: string,
  macroKind: 'set' | 'get',
  maxLen = 420,
): string {
  const text = content ?? '';
  const matches = getVarMacroMatches(text, varName, macroKind);
  if (matches.length === 0) {
    const plain = text.replace(/\s+/g, ' ').trim();
    return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
  }

  const first = matches[0];
  const anchor = matches[Math.min(matches.length - 1, 1)];
  let start = Math.max(0, first.start - 72);
  let end = Math.min(text.length, anchor.end + 96);
  if (end - start > maxLen) end = start + maxLen;

  let snippet = text.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < text.length) snippet = `${snippet}…`;
  return snippet;
}

function entryDisplayName(entry: PresetVarLintEntry): string {
  return entry.name?.trim() || '未命名条目';
}

function buildEntryMacroIndex(entries: PresetVarLintEntry[]) {
  const sets = entries.map(e => ({
    entry: e,
    counts: extractSetvarCounts(e.content),
  }));
  const gets = entries.map(e => ({
    entry: e,
    counts: extractGetvarCounts(e.content),
  }));
  return { sets, gets };
}

export function analyzePresetVarLint(
  entries: PresetVarLintEntry[],
  currentIndex: number,
  currentContent: string,
): VarLintReport {
  const normalized = entries.map(e => ({ ...e, content: e.content ?? '' }));
  if (currentIndex >= 0 && currentIndex < normalized.length) {
    normalized[currentIndex] = { ...normalized[currentIndex], content: currentContent };
  }

  const current = normalized[currentIndex];
  if (!current) return { items: [] };

  const currentSets = extractSetvarCounts(currentContent);
  const currentGets = extractGetvarCounts(currentContent);
  const { sets, gets } = buildEntryMacroIndex(normalized);
  const items: VarLintItem[] = [];

  currentSets.forEach((localCount, varName) => {
    const refs: VarLintRef[] = [];
    gets.forEach(({ entry, counts }) => {
      if (entry.index <= currentIndex) return;
      const count = counts.get(varName);
      if (!count) return;
      refs.push({
        index: entry.index,
        entryName: entryDisplayName(entry),
        enabled: entry.enabled,
        pendingDelete: entry.pendingDelete,
        macroKind: 'get',
        count,
      });
    });

    const duplicateSets: VarLintDuplicateSet[] = [];
    sets.forEach(({ entry, counts }) => {
      if (entry.index === currentIndex) return;
      const count = counts.get(varName);
      if (!count) return;
      duplicateSets.push({
        index: entry.index,
        entryName: entryDisplayName(entry),
        enabled: entry.enabled,
        pendingDelete: entry.pendingDelete,
        count,
        relativeOrder: entry.index < currentIndex ? 'before' : 'after',
      });
    });

    items.push({
      varName,
      macroKind: 'set',
      localCount,
      status: refs.length > 0 ? 'ok' : 'missing',
      refs,
      duplicateSets,
      duplicateGets: [],
    });
  });

  currentGets.forEach((localCount, varName) => {
    const refs: VarLintRef[] = [];
    sets.forEach(({ entry, counts }) => {
      if (entry.index >= currentIndex) return;
      const count = counts.get(varName);
      if (!count) return;
      refs.push({
        index: entry.index,
        entryName: entryDisplayName(entry),
        enabled: entry.enabled,
        pendingDelete: entry.pendingDelete,
        macroKind: 'set',
        count,
      });
    });

    const duplicateGets: VarLintDuplicateGet[] = [];
    gets.forEach(({ entry, counts }) => {
      if (entry.index === currentIndex) return;
      const count = counts.get(varName);
      if (!count) return;
      duplicateGets.push({
        index: entry.index,
        entryName: entryDisplayName(entry),
        enabled: entry.enabled,
        pendingDelete: entry.pendingDelete,
        count,
        relativeOrder: entry.index < currentIndex ? 'before' : 'after',
      });
    });

    items.push({
      varName,
      macroKind: 'get',
      localCount,
      status: refs.length > 0 ? 'ok' : 'missing',
      refs,
      duplicateSets: [],
      duplicateGets,
    });
  });

  items.sort((a, b) => {
    if (a.macroKind !== b.macroKind) return a.macroKind === 'set' ? -1 : 1;
    return a.varName.localeCompare(b.varName, 'zh-CN');
  });

  return { items };
}
