import {
  fingerprintTextContent,
  PM_HOMEPAGE,
  PM_LOCAL_INDEX_PATH,
  PM_REPO_INDEX_CDN_URL,
  PM_REPO_INDEX_URL,
} from '../version';

export type PresetMemoUpdateCheck = {
  hasUpdate: boolean;
};

async function fetchText(url: string): Promise<string | null> {
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(`${url}${sep}_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function fetchRemoteIndexText(): Promise<string | null> {
  for (const url of [PM_REPO_INDEX_URL, PM_REPO_INDEX_CDN_URL]) {
    const text = await fetchText(url);
    if (text) return text;
  }
  return null;
}

async function fetchLocalInstalledIndexText(): Promise<string | null> {
  return fetchText(PM_LOCAL_INDEX_PATH);
}

/**
 * 静默联网检测扩展是否有更新。
 * 对比 GitHub 与本地已安装 index.js 的内容指纹；两者均读取成功才判定，避免误报。
 */
export async function checkPresetMemoUpdate(): Promise<PresetMemoUpdateCheck> {
  const [remoteText, localText] = await Promise.all([fetchRemoteIndexText(), fetchLocalInstalledIndexText()]);
  if (!remoteText || !localText) return { hasUpdate: false };

  const remoteFp = fingerprintTextContent(remoteText);
  const localFp = fingerprintTextContent(localText);
  return { hasUpdate: remoteFp !== localFp };
}

export { PM_HOMEPAGE };
