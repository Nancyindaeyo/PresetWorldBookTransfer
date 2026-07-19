/** 界面右下角展示的版本号（与 PresetWorldBookTransfer/manifest.json 保持一致） */
export const PM_DISPLAY_VERSION = '6.5.0';

/** SillyTavern 扩展文件夹 id */
export const PM_EXTENSION_ID = 'PresetWorldBookTransfer';

export const PM_HOMEPAGE = 'https://github.com/Nancyindaeyo/PresetWorldBookTransfer';

export const PM_REPO_MANIFEST_URL =
  'https://raw.githubusercontent.com/Nancyindaeyo/PresetWorldBookTransfer/main/manifest.json';

export const PM_REPO_MANIFEST_CDN_URL =
  'https://cdn.jsdelivr.net/gh/Nancyindaeyo/PresetWorldBookTransfer@main/manifest.json';

export const PM_LOCAL_MANIFEST_PATH = '/scripts/extensions/third-party/PresetWorldBookTransfer/manifest.json';

export const PM_LOCAL_INDEX_PATH = '/scripts/extensions/third-party/PresetWorldBookTransfer/index.js';

export const PM_REPO_INDEX_URL =
  'https://raw.githubusercontent.com/Nancyindaeyo/PresetWorldBookTransfer/main/index.js';

export const PM_REPO_INDEX_CDN_URL =
  'https://cdn.jsdelivr.net/gh/Nancyindaeyo/PresetWorldBookTransfer@main/index.js';

/** 当前安装包 manifest 指纹（发版时与 manifest.json 同步更新） */
export const PM_BUNDLED_MANIFEST_FINGERPRINT = fingerprintManifest({
  display_name: '预设备忘录',
  loading_order: 100,
  requires: [],
  optional: [],
  js: 'bootstrap.js',
  author: 'Nancyindaeyo',
  version: '6.5.0',
  homePage: 'https://github.com/Nancyindaeyo/PresetWorldBookTransfer',
  auto_update: true,
  hooks: {
    delete: 'onDelete',
    disable: 'onDisable',
    enable: 'onEnable',
  },
});

export function fingerprintManifest(manifest: Record<string, unknown>): string {
  const keys = Object.keys(manifest).sort();
  const normalized: Record<string, unknown> = {};
  for (const key of keys) normalized[key] = manifest[key];
  return JSON.stringify(normalized);
}

export function fingerprintManifestText(text: string): string {
  try {
    return fingerprintManifest(JSON.parse(text) as Record<string, unknown>);
  } catch {
    return text.trim();
  }
}

/** 对脚本/文本内容生成稳定指纹（长度 + djb2 哈希） */
export function fingerprintTextContent(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) ^ text.charCodeAt(i);
  }
  return `${text.length}:${(hash >>> 0).toString(16)}`;
}

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
