import { resolveCotPreviewDisplayContent } from './cot-macro-preview';
import { renderMacros } from './render-macros';
import { getPromptStoreId } from './preset-draft';

const PLACEHOLDER_IDS = new Set([
  'worldInfoBefore',
  'worldInfoAfter',
  'personaDescription',
  'charDescription',
  'charPersonality',
  'scenario',
  'dialogueExamples',
  'chatHistory',
]);

const COT_KEYWORD_RE = /thinking|reasoning|思维|cot/i;
const COT_TAG_RE = /<(?:redacted_)?thinking[\s>]/i;

type PromptCollectionItem = {
  identifier: string;
  name?: string;
  enabled?: boolean;
  role: 'user' | 'assistant' | 'system';
  content: string;
  marker?: boolean;
  injection_depth?: number;
  injection_order?: number;
};

export type CotPreviewItem = {
  name: string;
  identifier: string;
  role: string;
  positionLabel: string;
  content: string;
  isPlaceholder?: boolean;
};

export const COT_PREVIEW_EMPTY_LABEL =
  '(空内容 — 该预设条正文为空，可能仅为开关/标题，dry-run 也可能未展开正文)';

export const COT_PREVIEW_PLACEHOLDER_LABEL =
  '(占位符 — 正文由角色卡/世界书/聊天记录等注入，dry-run 不含对应内容，仅列出条目名)';

export type CotPreviewResult = {
  mode: 'cot' | 'preset-slice';
  source: 'dry-run' | 'static';
  items: CotPreviewItem[];
  stitchedPreview: string;
  note: string;
  emptyCount: number;
};

export function isCotPrompt(name: string, content: string): boolean {
  if (COT_TAG_RE.test(content)) return true;
  if (COT_KEYWORD_RE.test(name)) return true;
  if (COT_KEYWORD_RE.test(content)) return true;
  return false;
}

export function isPlaceholderPresetPrompt(prompt: PresetPrompt): boolean {
  if (typeof isPresetPlaceholderPrompt === 'function') {
    try {
      return isPresetPlaceholderPrompt(prompt);
    } catch {
      /* fallback below */
    }
  }
  const id = getPromptStoreId(prompt);
  return PLACEHOLDER_IDS.has(id);
}

function isCollectionPlaceholder(item: PromptCollectionItem): boolean {
  if (item.marker) return true;
  return PLACEHOLDER_IDS.has(item.identifier);
}

export function buildPresetPromptIdSet(preset: Preset): Set<string> {
  const ids = new Set<string>();
  for (const p of preset.prompts ?? []) {
    const id = getPromptStoreId(p);
    if (id) ids.add(id);
  }
  return ids;
}

export function formatPresetPosition(prompt: PresetPrompt): string {
  const pos = prompt.position;
  if (!pos || pos.type === 'relative') return '相对位置';
  if (pos.type === 'in_chat') {
    return `聊天记录 depth=${pos.depth} order=${pos.order}`;
  }
  return '相对位置';
}

function formatCollectionPosition(item: PromptCollectionItem): string {
  if (item.marker) return '占位符';
  const depth = item.injection_depth ?? 0;
  if (depth > 0) {
    return `聊天记录 depth=${depth} order=${item.injection_order ?? 0}`;
  }
  return '相对位置';
}

export function selectPreviewPromptsFromPreset(prompts: PresetPrompt[]): {
  items: PresetPrompt[];
  mode: 'cot' | 'preset-slice';
} {
  const enabled = prompts.filter(p => p.enabled ?? true);
  const hasCot = enabled.some(p => isCotPrompt(String(p.name ?? ''), String(p.content ?? '')));
  return { items: enabled, mode: hasCot ? 'cot' : 'preset-slice' };
}

export function getCotPreviewItemBody(item: CotPreviewItem): string {
  if (item.content.trim()) return item.content;
  if (item.isPlaceholder) return COT_PREVIEW_PLACEHOLDER_LABEL;
  return COT_PREVIEW_EMPTY_LABEL;
}

export function stitchCotPreview(items: CotPreviewItem[]): string {
  if (items.length === 0) return '(无条目)';
  return items
    .map((item, i) => {
      const header = `── ${i + 1}. ${item.name} · ${item.role} ──`;
      return `${header}\n${getCotPreviewItemBody(item)}`;
    })
    .join('\n\n');
}

function buildPresetPromptMap(preset: Preset): Map<string, PresetPrompt> {
  const map = new Map<string, PresetPrompt>();
  for (const p of preset.prompts ?? []) {
    const id = getPromptStoreId(p);
    if (id) map.set(id, p);
  }
  return map;
}

async function enrichItemContent(
  item: CotPreviewItem,
  presetById: Map<string, PresetPrompt>,
): Promise<CotPreviewItem> {
  const orig = presetById.get(item.identifier);
  const raw = orig ? String(orig.content ?? '') : '';
  let rendered = String(item.content ?? '').trim();
  if (!rendered && raw) {
    rendered = await renderMacros(raw);
  }
  const content = resolveCotPreviewDisplayContent(rendered, raw);
  return { ...item, content };
}

function countEmptyItems(items: CotPreviewItem[]): number {
  return items.filter(i => !String(i.content ?? '').trim()).length;
}

function countPlaceholderItems(items: CotPreviewItem[]): number {
  return items.filter(i => i.isPlaceholder).length;
}

function finalizePreviewResult(
  mode: 'cot' | 'preset-slice',
  source: 'dry-run' | 'static',
  items: CotPreviewItem[],
): CotPreviewResult {
  const emptyCount = countEmptyItems(items);
  const placeholderCount = countPlaceholderItems(items);
  let note = buildNote(mode, source);
  if (emptyCount > 0) {
    note += ` · 其中 ${emptyCount} 条正文为空`;
    if (placeholderCount > 0) {
      note += `（含 ${placeholderCount} 个占位符，已按条目名列出）`;
    }
  }
  return {
    mode,
    source,
    items,
    stitchedPreview: stitchCotPreview(items),
    note,
    emptyCount,
  };
}

function buildNote(mode: 'cot' | 'preset-slice', source: 'dry-run' | 'static'): string {
  const modeText =
    mode === 'cot'
      ? '预设含 CoT 相关条目，已按顺序列出全部已启用条目（含占位符）'
      : '已按顺序列出全部已启用预设条（含占位符）';
  const sourceText = source === 'dry-run' ? '基于酒馆 dry-run 拼装' : '基于预设静态读取（宏展开可能不完整）';
  return `${modeText} · ${sourceText} · setvar 等长宏已折叠为变量名摘要 · 不含世界书 · 未调用 API`;
}

/**
 * 仅调用 promptManager.tryGenerate（dry-run），避免 renderPromptManager(true)
 * 在部分环境（如 preset-drag-optimizer 补丁）下因 promptOrder 未初始化而抛错。
 */
export function runPresetDryRun(timeoutMs = 12000): Promise<boolean> {
  const pm = builtin.promptManager as { tryGenerate?: () => Promise<unknown> };
  if (typeof pm?.tryGenerate !== 'function') {
    return Promise.resolve(false);
  }

  return new Promise(resolve => {
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      sub.stop();
      clearTimeout(timer);
      resolve(ok);
    };

    const sub = eventOn(tavern_events.GENERATE_AFTER_DATA, (_data, dry_run) => {
      if (dry_run) finish(true);
    });

    const timer = setTimeout(() => {
      try {
        const n = builtin.promptManager?.getPromptCollection?.()?.collection?.length ?? 0;
        finish(n > 0);
      } catch {
        finish(false);
      }
    }, timeoutMs);

    const tryGenerate = pm.tryGenerate;
    if (!tryGenerate) {
      finish(false);
      return;
    }

    tryGenerate()
      .then(() => {
        setTimeout(() => {
          if (!done) {
            try {
              const n = builtin.promptManager?.getPromptCollection?.()?.collection?.length ?? 0;
              finish(n > 0);
            } catch {
              finish(false);
            }
          }
        }, 400);
      })
      .catch((e: unknown) => {
        console.warn('[CoT预览] tryGenerate 失败，将使用静态预览', e);
        finish(false);
      });
  });
}

async function buildFromCollection(
  collection: PromptCollectionItem[],
  presetIds: Set<string>,
  preset: Preset,
): Promise<CotPreviewResult | null> {
  const presetById = buildPresetPromptMap(preset);
  const presetOnly = collection.filter(
    item => presetIds.has(item.identifier) && item.enabled !== false,
  );
  if (presetOnly.length === 0) return null;

  const mode: 'cot' | 'preset-slice' = presetOnly.some(item => {
    const name = String(item.name ?? '');
    const content = String(item.content ?? '');
    if (isCotPrompt(name, content)) return true;
    const orig = presetById.get(item.identifier);
    if (!orig) return false;
    return isCotPrompt(String(orig.name ?? ''), String(orig.content ?? ''));
  })
    ? 'cot'
    : 'preset-slice';

  const items: CotPreviewItem[] = await Promise.all(
    presetOnly.map(async item => {
      const base: CotPreviewItem = {
        name: String(item.name || item.identifier),
        identifier: item.identifier,
        role: item.role,
        positionLabel: formatCollectionPosition(item),
        content: String(item.content ?? ''),
        isPlaceholder: isCollectionPlaceholder(item),
      };
      return enrichItemContent(base, presetById);
    }),
  );

  return finalizePreviewResult(mode, 'dry-run', items);
}

async function buildFromStaticPreset(preset: Preset): Promise<CotPreviewResult> {
  const prompts = preset.prompts ?? [];
  const { items: selected, mode } = selectPreviewPromptsFromPreset(prompts);

  const items: CotPreviewItem[] = await Promise.all(
    selected.map(async p => {
      const id = getPromptStoreId(p);
      const raw = String(p.content ?? '');
      const rendered = await renderMacros(raw);
      const content = resolveCotPreviewDisplayContent(rendered, raw);
      return {
        name: String(p.name || id || '未命名条目'),
        identifier: id,
        role: p.role,
        positionLabel: formatPresetPosition(p),
        content,
        isPlaceholder: isPlaceholderPresetPrompt(p),
      };
    }),
  );

  return finalizePreviewResult(mode, 'static', items);
}

export async function buildCotPresetPreview(): Promise<CotPreviewResult> {
  const preset = getPreset('in_use');
  const presetIds = buildPresetPromptIdSet(preset);

  const dryOk = await runPresetDryRun();
  if (dryOk) {
    try {
      const collection = builtin.promptManager?.getPromptCollection?.()?.collection as
        | PromptCollectionItem[]
        | undefined;
      if (collection?.length) {
        const fromDry = await buildFromCollection(collection, presetIds, preset);
        if (fromDry) return fromDry;
      }
    } catch (e) {
      console.warn('[CoT预览] 读取 promptManager 失败', e);
    }
  }

  return buildFromStaticPreset(preset);
}
