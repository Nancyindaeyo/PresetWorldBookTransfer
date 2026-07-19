/** 界面右下角展示的版本号（与 PresetWorldBookTransfer/manifest.json 保持一致） */
export const PM_DISPLAY_VERSION = '6.4.2';

export const PM_HOMEPAGE = 'https://github.com/Nancyindaeyo/PresetWorldBookTransfer';

export const PM_REPO_MANIFEST_URL =
  'https://raw.githubusercontent.com/Nancyindaeyo/PresetWorldBookTransfer/main/manifest.json';

export const PM_REPO_MANIFEST_CDN_URL =
  'https://cdn.jsdelivr.net/gh/Nancyindaeyo/PresetWorldBookTransfer@main/manifest.json';

export function compareSemver(a: string, b: string): number {
  const parse = (v: string) => v.trim().replace(/^v/i, '').split('.').map(part => parseInt(part, 10) || 0);
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareSemver(latest, current) > 0;
}

export async function fetchLatestExtensionVersion(): Promise<string | null> {
  const urls = [PM_REPO_MANIFEST_URL, PM_REPO_MANIFEST_CDN_URL];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const manifest = (await res.json()) as { version?: unknown };
      if (typeof manifest.version === 'string') return manifest.version;
    } catch {
      /* try next */
    }
  }
  return null;
}
