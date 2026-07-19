import { PM_EXTENSION_ID, PM_REPO_COMMITS_URL } from '../version';

export type PresetMemoUpdateCheck = {
  hasUpdate: boolean;
  /** 检测是否成功完成；为 false 时可重试 */
  ok: boolean;
};

export type PresetMemoUpdateApplyResult = {
  ok: boolean;
  message?: string;
};

type ExtensionInstallationInfo = {
  current_branch_name: string;
  current_commit_hash: string;
  is_up_to_date: boolean;
  remote_url: string;
};

function reloadTavernPage(delayMs = 800) {
  globalThis.setTimeout(() => {
    try {
      triggerSlash('/reload-page');
    } catch {
      globalThis.location?.reload();
    }
  }, delayMs);
}

function resolveExtensionInfoFn(): ((extensionId: string) => Promise<ExtensionInstallationInfo | null>) | null {
  if (typeof getExtensionInstallationInfo === 'function') return getExtensionInstallationInfo;
  const th = globalThis.TavernHelper;
  if (th && typeof th.getExtensionStatus === 'function') {
    return th.getExtensionStatus.bind(th);
  }
  return null;
}

function resolveUpdateExtensionFn(): ((extensionId: string) => Promise<Response>) | null {
  if (typeof updateExtension === 'function') return updateExtension;
  const th = globalThis.TavernHelper;
  if (th && typeof th.updateExtension === 'function') {
    return th.updateExtension.bind(th);
  }
  return null;
}

async function fetchRemoteHeadCommitSha(): Promise<string | null> {
  try {
    const res = await fetch(`${PM_REPO_COMMITS_URL}?_=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sha?: unknown };
    return typeof data.sha === 'string' ? data.sha : null;
  } catch {
    return null;
  }
}

function normalizeCommitSha(sha: string): string {
  return sha.trim().toLowerCase();
}

function commitsDiffer(localSha: string | undefined, remoteSha: string | null): boolean {
  if (!localSha || !remoteSha) return false;
  const local = normalizeCommitSha(localSha);
  const remote = normalizeCommitSha(remoteSha);
  if (!local || !remote) return false;
  return local !== remote && !remote.startsWith(local) && !local.startsWith(remote);
}

/** 静默检测扩展是否有更新（对齐酒馆扩展页的 git 更新判断）。 */
export async function checkPresetMemoUpdate(): Promise<PresetMemoUpdateCheck> {
  const getInfo = resolveExtensionInfoFn();
  if (!getInfo) {
    console.info('[预设备忘录] 扩展更新检测跳过：未找到 getExtensionInstallationInfo / TavernHelper.getExtensionStatus');
    return { hasUpdate: false, ok: true };
  }

  try {
    const info = await getInfo(PM_EXTENSION_ID);
    if (!info) {
      console.info('[预设备忘录] 扩展更新检测跳过：未获取到安装信息');
      return { hasUpdate: false, ok: true };
    }

    if (info.is_up_to_date === false) return { hasUpdate: true, ok: true };

    const remoteSha = await fetchRemoteHeadCommitSha();
    if (commitsDiffer(info.current_commit_hash, remoteSha)) {
      return { hasUpdate: true, ok: true };
    }

    return { hasUpdate: false, ok: true };
  } catch (e) {
    console.warn('[预设备忘录] 扩展更新检测失败', e);
    return { hasUpdate: false, ok: false };
  }
}

/** 一键更新扩展并刷新酒馆页面。 */
export async function applyPresetMemoUpdate(): Promise<PresetMemoUpdateApplyResult> {
  const updateFn = resolveUpdateExtensionFn();
  if (!updateFn) {
    return { ok: false, message: '当前环境不支持一键更新，请在酒馆「扩展」面板中手动更新' };
  }
  try {
    const res = await updateFn(PM_EXTENSION_ID);
    if (!res.ok) {
      let detail = '';
      try {
        detail = (await res.text()).trim();
      } catch {
        /* ignore */
      }
      return { ok: false, message: detail || `更新失败 (HTTP ${res.status})` };
    }
    toastr.success('扩展已更新，正在刷新页面…');
    reloadTavernPage();
    return { ok: true };
  } catch (e) {
    console.error('[预设备忘录] 扩展更新失败', e);
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
