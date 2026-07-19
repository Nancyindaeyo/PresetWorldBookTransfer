import cloneDeep from 'lodash/cloneDeep';
import type { PartialDeep } from 'type-fest';
import { renderSaveSummaryNameTag } from './lib/save-summary-tags';

export type ExportWbSourceType = 'preset' | 'memo' | 'worldbook';

export type ExportWbDraft = {
  sourceType: ExportWbSourceType;
  /** preset 索引 / memo id / worldbook uid */
  sourceKey: string;
  name: string;
  content: string;
  enabled: boolean;
  strategyType: 'constant' | 'selective';
  keysText: string;
  positionType: WorldbookEntry['position']['type'];
  positionRole: 'system' | 'assistant' | 'user';
  positionDepth: number;
  positionOrder: number;
  preventIncoming: boolean;
  preventOutgoing: boolean;
  /** 世界书来源: 保留未在 UI 暴露的字段 */
  sourceEntry?: WorldbookEntry;
  /** 预设来源: 用于标题展示 */
  presetRole?: string;
  /** 预设来源: prompts 数组下标 (变量 lint / 跳转) */
  presetIndex?: number;
};

export const EXPORT_STRATEGY_OPTIONS: { value: '' | 'constant' | 'selective'; label: string }[] = [
  { value: '', label: '（不修改）' },
  { value: 'constant', label: '🔵 蓝灯' },
  { value: 'selective', label: '🟢 绿灯' },
];

export const EXPORT_POSITION_OPTIONS: { value: ExportWbDraft['positionType'] | ''; label: string }[] = [
  { value: '', label: '（不修改）' },
  { value: 'before_character_definition', label: '角色定义前' },
  { value: 'after_character_definition', label: '角色定义后' },
  { value: 'before_example_messages', label: '示例消息前' },
  { value: 'after_example_messages', label: '示例消息后' },
  { value: 'before_author_note', label: '作者注释前' },
  { value: 'after_author_note', label: '作者注释后' },
  { value: 'at_depth', label: '@D 指定深度' },
];

export function normalizeExportNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function keysArrayToText(keys: (string | RegExp)[] | undefined): string {
  return (keys ?? [])
    .map(k => (typeof k === 'string' ? k : k.source))
    .filter(Boolean)
    .join(', ');
}

export function keysTextToArray(text: string): string[] {
  return text
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean);
}

function defaultWbFields(): Pick<
  ExportWbDraft,
  | 'strategyType'
  | 'keysText'
  | 'positionType'
  | 'positionRole'
  | 'positionDepth'
  | 'positionOrder'
  | 'preventIncoming'
  | 'preventOutgoing'
> {
  return {
    strategyType: 'selective',
    keysText: '',
    positionType: 'after_character_definition',
    positionRole: 'system',
    positionDepth: 0,
    positionOrder: 100,
    preventIncoming: false,
    preventOutgoing: false,
  };
}

export function draftFromWorldbookEntry(entry: WorldbookEntry): ExportWbDraft {
  return {
    sourceType: 'worldbook',
    sourceKey: String(entry.uid),
    name: entry.name ?? '',
    content: entry.content ?? '',
    enabled: entry.enabled ?? true,
    strategyType: entry.strategy?.type === 'constant' ? 'constant' : 'selective',
    keysText: keysArrayToText(entry.strategy?.keys),
    positionType: entry.position?.type ?? 'after_character_definition',
    positionRole: entry.position?.role ?? 'system',
    positionDepth: entry.position?.depth ?? 0,
    positionOrder: entry.position?.order ?? 100,
    preventIncoming: entry.recursion?.prevent_incoming ?? false,
    preventOutgoing: entry.recursion?.prevent_outgoing ?? false,
    sourceEntry: cloneDeep(entry),
  };
}

export function draftFromMemo(entry: {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
}): ExportWbDraft {
  return {
    sourceType: 'memo',
    sourceKey: entry.id,
    name: entry.name || '未命名条目',
    content: entry.content || '',
    enabled: entry.enabled ?? true,
    ...defaultWbFields(),
  };
}

export function draftFromPreset(
  prompt: { name?: string; id?: string; identifier?: string; content?: string; enabled?: boolean; role?: string },
  sourceKey: string,
  presetIndex: number,
): ExportWbDraft {
  return {
    sourceType: 'preset',
    sourceKey,
    presetIndex,
    name: prompt.name || prompt.id || '未命名条目',
    content: prompt.content || '',
    enabled: prompt.enabled ?? true,
    presetRole: prompt.role || 'system',
    ...defaultWbFields(),
  };
}

export function applyDraftFieldsToPartialEntry(draft: ExportWbDraft): PartialDeep<WorldbookEntry> {
  if (draft.sourceEntry) {
    const entry = cloneDeep(draft.sourceEntry);
    delete (entry as { uid?: number }).uid;
    applyDraftToEntry(entry, draft);
    return entry;
  }

  return {
    name: draft.name.trim() || '未命名条目',
    content: draft.content,
    enabled: draft.enabled,
    strategy: {
      type: draft.strategyType,
      keys: draft.strategyType === 'selective' ? keysTextToArray(draft.keysText) : [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    },
    position: {
      type: draft.positionType,
      role: draft.positionRole,
      depth: draft.positionDepth,
      order: draft.positionOrder,
    },
    probability: 100,
    recursion: {
      prevent_incoming: draft.preventIncoming,
      prevent_outgoing: draft.preventOutgoing,
      delay_until: null,
    },
    effect: {
      sticky: null,
      cooldown: null,
      delay: null,
    },
  };
}

export function buildTransferEntryFromDraft(
  draft: ExportWbDraft,
  sourceEntry?: WorldbookEntry,
): PartialDeep<WorldbookEntry> {
  if (sourceEntry) {
    const entry = cloneDeep(sourceEntry);
    delete (entry as { uid?: number }).uid;
    applyDraftToEntry(entry, draft);
    return entry;
  }
  return applyDraftFieldsToPartialEntry(draft);
}

export function applyDraftToEntry(entry: WorldbookEntry, draft: ExportWbDraft): void {
  entry.name = draft.name.trim() || '未命名条目';
  entry.content = draft.content;
  entry.enabled = draft.enabled;

  if (!entry.strategy) {
    entry.strategy = {
      type: 'selective',
      keys: [],
      keys_secondary: { logic: 'and_any', keys: [] },
      scan_depth: 'same_as_global',
    };
  }
  entry.strategy.type = draft.strategyType;
  entry.strategy.keys = draft.strategyType === 'selective' ? keysTextToArray(draft.keysText) : [];

  if (!entry.position) {
    entry.position = { type: 'after_character_definition', role: 'system', depth: 0, order: 100 };
  }
  entry.position.type = draft.positionType;
  entry.position.role = draft.positionRole;
  entry.position.depth = Number(draft.positionDepth) || 0;
  entry.position.order = Number(draft.positionOrder) || 0;

  if (!entry.recursion) {
    entry.recursion = { prevent_incoming: false, prevent_outgoing: false, delay_until: null };
  }
  entry.recursion.prevent_incoming = draft.preventIncoming;
  entry.recursion.prevent_outgoing = draft.preventOutgoing;
}

export function getExportPositionLabel(type: ExportWbDraft['positionType']): string {
  return EXPORT_POSITION_OPTIONS.find(o => o.value === type)?.label ?? type;
}

export function getExportStrategyBadge(draft: ExportWbDraft): string {
  return draft.strategyType === 'constant' ? '🔵' : '🟢';
}

export function renderExportDuplicateConfirmHtml(duplicateNames: string[]): string {
  const tags = duplicateNames
    .map(name =>
      renderSaveSummaryNameTag(name, {
        variant: 'duplicate',
        title: '与目标世界书中已有条目重名',
      }),
    )
    .join('');
  return `
        <div class="pm-save-summary-lead">以下 ${duplicateNames.length} 个条目与目标世界书中已有条目<strong>重名</strong></div>
        <div class="pm-save-summary-warn"><i class="fa-solid fa-triangle-exclamation"></i> 确认后将<strong>追加</strong>到目标世界书，不会覆盖已有条目。</div>
        <div class="pm-save-summary-section">
            <div class="pm-save-summary-heading pm-save-summary-heading--dup">重名条目</div>
            <div class="pm-save-summary-tags">${tags}</div>
        </div>
    `;
}
