export function esc(s: unknown): string {
  if (s === undefined || s === null) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function normalizeSearchKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

export function entryMatchesKeyword(keyword: string, name: string, content: string): boolean {
  const k = normalizeSearchKeyword(keyword);
  if (!k) return true;
  return (name || '').toLowerCase().includes(k) || (content || '').toLowerCase().includes(k);
}
