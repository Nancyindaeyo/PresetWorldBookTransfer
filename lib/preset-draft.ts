import type { MemoEntry } from '../schema';

export type PresetPromptDraft = {
  id?: string;
  name: string;
  content: string;
  enabled: boolean;
  role: 'system' | 'user' | 'assistant';
  position: PresetPrompt['position'] | { type: 'relative' };
  __draftFromMemo?: boolean;
  __pendingDelete?: boolean;
};

export const PRESET_UPDATE_RENDER = { render: 'debounced' as const };
export const PRESET_SAVE_RENDER = { render: 'immediate' as const };

export function getPromptStoreId(prompt: { id?: string; identifier?: string } | null | undefined): string {
  return String(prompt?.identifier ?? prompt?.id ?? '');
}

export function getExportPresetSourceKey(
  prompt: { id?: string; identifier?: string } | null | undefined,
  index: number,
): string {
  const id = getPromptStoreId(prompt);
  return id || `__idx_${index}`;
}

function ensurePromptIdentifiers(prompts: unknown[]) {
  prompts.forEach(p => {
    if (!p || typeof p !== 'object') return;
    const prompt = p as Record<string, unknown>;
    const key = getPromptStoreId(prompt as { id?: string; identifier?: string });
    if (!key) return;
    prompt.identifier = key;
    prompt.id = prompt.id ?? key;
  });
}

export function applyInsertDraftToPreset(preset: Preset & Record<string, unknown>, drafts: PresetPromptDraft[]) {
  const origPrompts: unknown[] = Array.isArray(preset.prompts) ? preset.prompts : [];
  const origById = new Map<string, PresetPrompt & Record<string, unknown>>();
  origPrompts.forEach(p => {
    if (!p || typeof p !== 'object') return;
    const key = getPromptStoreId(p as { id?: string; identifier?: string });
    if (key) origById.set(key, p as PresetPrompt & Record<string, unknown>);
  });

  const finalDrafts = drafts.filter(d => !d.__pendingDelete);
  const pendingDeleteIds = new Set(drafts.filter(d => d.__pendingDelete && d.id).map(d => String(d.id)));
  const nextPrompts: PresetPrompt[] = [];
  const usedKeys = new Set<string>();

  finalDrafts.forEach(d => {
    const draftKey = d.id ? String(d.id) : '';
    const orig = draftKey ? origById.get(draftKey) : undefined;
    let prompt: PresetPrompt & Record<string, unknown>;

    if (orig) {
      prompt = {
        ...orig,
        name: d.name,
        content: d.content,
        role: d.role,
        enabled: d.enabled,
      };
      const storeId = getPromptStoreId(prompt);
      if (storeId) {
        if (!prompt.id) prompt.id = storeId;
        if (!prompt.identifier) prompt.identifier = storeId;
      }
    } else {
      const newId = builtin.uuidv4();
      prompt = {
        id: newId,
        identifier: newId,
        name: d.name,
        content: d.content,
        enabled: d.enabled,
        role: d.role,
        position: d.position ?? { type: 'relative' },
      };
    }

    const orderId = getPromptStoreId(prompt);
    if (!orderId) return;
    usedKeys.add(orderId);
    nextPrompts.push(prompt);
  });

  origPrompts.forEach(p => {
    if (!p || typeof p !== 'object') return;
    const key = getPromptStoreId(p as { id?: string; identifier?: string });
    if (key && !usedKeys.has(key) && !pendingDeleteIds.has(key)) nextPrompts.push(p as PresetPrompt);
  });

  ensurePromptIdentifiers(nextPrompts);

  preset.prompts = nextPrompts;
  syncInUsePromptOrder(
    preset,
    nextPrompts
      .map(p => ({
        identifier: getPromptStoreId(p),
        enabled: p.enabled ?? true,
      }))
      .filter(e => e.identifier),
  );
}

export function syncInUsePromptOrder(
  preset: Record<string, unknown>,
  order: { identifier: string; enabled: boolean }[],
) {
  const CHARACTER_ID = 100001;
  if (!Array.isArray(preset.prompt_order)) preset.prompt_order = [];
  let group = (preset.prompt_order as { character_id?: number; order?: unknown[] }[]).find(
    g => g?.character_id === CHARACTER_ID,
  );
  if (!group) {
    group = { character_id: CHARACTER_ID, order: [] };
    (preset.prompt_order as unknown[]).push(group);
  }
  group.order = order;
}

export async function syncInUseToLoadedPresetFile() {
  const name = getLoadedPresetName()?.trim();
  if (!name) return;
  const inUse = getPreset('in_use');
  await createOrReplacePreset(name, inUse, { render: 'none' });
}

export async function saveInUsePresetPrompts(drafts: PresetPromptDraft[]) {
  await updatePresetWith(
    'in_use',
    preset => {
      applyInsertDraftToPreset(preset as Preset & Record<string, unknown>, drafts);
      return preset;
    },
    PRESET_SAVE_RENDER,
  );
  await syncInUseToLoadedPresetFile();
}

export function toPresetDraftFromMemo(entry: MemoEntry): PresetPromptDraft {
  return {
    id: entry.id,
    name: entry.name || '未命名条目',
    content: entry.content || '',
    enabled: entry.enabled ?? true,
    role: entry.role || 'system',
    position: { type: 'relative' },
    __draftFromMemo: true,
  };
}

export function toPresetDraft(prompt: Record<string, unknown>): PresetPromptDraft {
  const id = prompt?.id ?? prompt?.identifier;
  return {
    id: id ? String(id) : undefined,
    name: String(prompt?.name || id || '未命名条目'),
    content: String(prompt?.content || ''),
    enabled: (prompt?.enabled as boolean) ?? true,
    role: (prompt?.role === 'user' || prompt?.role === 'assistant' ? prompt.role : 'system') as
      | 'system'
      | 'user'
      | 'assistant',
    position:
      prompt?.position && typeof prompt.position === 'object' && (prompt.position as { type?: string }).type
        ? (prompt.position as PresetPrompt['position'])
        : { type: 'relative' },
  };
}

export function normalizeDraftNameKey(name: string): string {
  return name.trim().toLowerCase();
}

export function isInsertDraftNewItem(p: PresetPromptDraft, baselineIds: Set<string>): boolean {
  if (p.__draftFromMemo) return true;
  return !p.id || !baselineIds.has(p.id);
}

export function getDraftDisplayName(p: PresetPromptDraft): string {
  const name = String(p.name ?? '').trim();
  if (name) return name;
  if (p.id) return String(p.id);
  return '未命名条目';
}

export type InsertDraftSaveSummaryItem = { name: string; duplicateName: boolean };

export function getInsertDraftSaveSummary(
  insertDraftPrompts: PresetPromptDraft[] | null,
  insertDraftBaselineIds: Set<string> | null,
  insertDraftBaselineNames: Set<string> | null,
  insertDraftBaselineEnabledById: Map<string, boolean> | null,
): {
  added: InsertDraftSaveSummaryItem[];
  deleted: string[];
  enabled: string[];
  disabled: string[];
} {
  if (!insertDraftPrompts) return { added: [], deleted: [], enabled: [], disabled: [] };
  const baselineIds = insertDraftBaselineIds ?? new Set<string>();
  const baselineNames = insertDraftBaselineNames ?? new Set<string>();
  const baselineEnabled = insertDraftBaselineEnabledById ?? new Map<string, boolean>();
  const final = insertDraftPrompts.filter(p => !p.__pendingDelete);
  const deleted = insertDraftPrompts.filter(p => p.__pendingDelete).map(getDraftDisplayName);
  const added = final
    .filter(p => isInsertDraftNewItem(p, baselineIds))
    .map(p => {
      const name = getDraftDisplayName(p);
      return { name, duplicateName: baselineNames.has(normalizeDraftNameKey(name)) };
    });

  const enabled: string[] = [];
  const disabled: string[] = [];
  final.forEach(p => {
    const name = getDraftDisplayName(p);
    const currentEnabled = p.enabled ?? true;
    if (isInsertDraftNewItem(p, baselineIds)) {
      if (!currentEnabled) disabled.push(name);
      return;
    }
    if (!p.id) return;
    const beforeEnabled = baselineEnabled.get(p.id);
    if (beforeEnabled === undefined) return;
    if (beforeEnabled && !currentEnabled) disabled.push(name);
    else if (!beforeEnabled && currentEnabled) enabled.push(name);
  });

  return { added, deleted, enabled, disabled };
}

export function createInsertDraftBaseline(prompts: PresetPromptDraft[]) {
  return {
    ids: new Set(prompts.map(p => p.id).filter((id): id is string => !!id)),
    names: new Set(prompts.map(p => normalizeDraftNameKey(getDraftDisplayName(p)))),
    enabledById: new Map(prompts.filter(p => p.id).map(p => [p.id as string, p.enabled ?? true])),
  };
}

export async function removePresetEntriesForExport(sourceKeys: string[]) {
  const keySet = new Set(sourceKeys);
  await updatePresetWith(
    'in_use',
    preset => {
      const p = preset as Preset & Record<string, unknown>;
      const prompts: PresetPrompt[] = Array.isArray(p.prompts) ? (p.prompts as PresetPrompt[]) : [];
      const toRemoveIds = new Set<string>();

      prompts.forEach((prompt, index) => {
        const sk = getExportPresetSourceKey(prompt as { id?: string; identifier?: string }, index);
        if (keySet.has(sk) || keySet.has(String(index))) {
          const id = getPromptStoreId(prompt as { id?: string; identifier?: string });
          if (id) toRemoveIds.add(id);
        }
      });

      p.prompts = prompts.filter((prompt, index) => {
        const sk = getExportPresetSourceKey(prompt as { id?: string; identifier?: string }, index);
        return !keySet.has(sk) && !keySet.has(String(index));
      });

      if (Array.isArray(p.prompt_order)) {
        (p.prompt_order as { order?: { identifier?: string; id?: string }[] }[]).forEach(group => {
          if (Array.isArray(group.order)) {
            group.order = group.order.filter(e => !toRemoveIds.has(getPromptStoreId(e)));
          }
        });
      }
      return p;
    },
    PRESET_UPDATE_RENDER,
  );
}
