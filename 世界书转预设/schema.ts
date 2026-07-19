import { z } from 'zod';

export const MemoEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  content: z.string(),
  enabled: z.boolean(),
  role: z.enum(['system', 'user', 'assistant']),
  position: z.object({ type: z.literal('relative') }),
  folder: z.string().optional(),
});

export const MemoSchema = z.array(MemoEntrySchema);

export type MemoEntry = z.infer<typeof MemoEntrySchema>;

export const ShortcutSchema = z.object({
  label: z.string(),
  insert: z.string(),
});

export type Shortcut = z.infer<typeof ShortcutSchema>;

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { label: '<user>', insert: '<user>' },
  { label: '<char>', insert: '<char>' },
  { label: '{{user}}', insert: '{{user}}' },
  { label: '{{char}}', insert: '{{char}}' },
  { label: 'getvar', insert: '{{getvar::}}' },
  { label: 'setvar', insert: '{{setvar::name::value}}' },
  { label: 'random', insert: '{{random::A::B}}' },
  { label: 'roll', insert: '{{roll:1d20}}' },
];

export type PmTabId = 'tab-memo' | 'tab-import' | 'tab-import-preset' | 'tab-insert' | 'tab-export-wb';

export function genMemoId(): string {
  return 'memo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

export function parseMemoEntryRaw(raw: unknown): MemoEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const idRaw = o.id ?? o.uid ?? o.key;
  const id = idRaw != null && String(idRaw).trim() ? String(idRaw).trim() : genMemoId();
  const parsed = MemoEntrySchema.safeParse({
    id,
    name: typeof o.name === 'string' ? o.name : '未命名条目',
    content: typeof o.content === 'string' ? o.content : '',
    enabled: typeof o.enabled === 'boolean' ? o.enabled : true,
    role: o.role === 'user' || o.role === 'assistant' ? o.role : 'system',
    position: { type: 'relative' as const },
    folder: typeof o.folder === 'string' ? o.folder : undefined,
  });
  if (parsed.success) return parsed.data;
  console.warn('[预设备忘录] memo 条目解析失败:', parsed.error.flatten(), raw);
  return null;
}

export function extractMemoArray(vars: Record<string, unknown> | null | undefined): unknown[] {
  if (!vars || typeof vars !== 'object') return [];
  const raw = vars.memo;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    const values = Object.values(raw as Record<string, unknown>);
    if (values.length > 0 && values.every(v => v && typeof v === 'object')) return values;
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      /* ignore */
    }
  }
  if (Array.isArray(vars)) return vars;
  return [];
}
