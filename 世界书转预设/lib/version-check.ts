import { PM_EXTENSION_ID } from '../version';

export type PresetMemoUpdateCheck = {
  hasUpdate: boolean;
};

export type PresetMemoUpdateApplyResult = {
  ok: boolean;
  message?: string;
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

/** 静默检测扩展是否有更新（优先使用酒馆原生扩展安装信息）。 */
export async function checkPresetMemoUpdate(): Promise<PresetMemoUpdateCheck> {
  if (typeof getExtensionInstallationInfo !== 'function') {
    return { hasUpdate: false };
  }
  try {
    const info = await getExtensionInstallationInfo(PM_EXTENSION_ID);
    if (!info) return { hasUpdate: false };
    return { hasUpdate: info.is_up_to_date === false };
  } catch (e) {
    console.warn('[预设备忘录] 扩展更新检测失败', e);
    return { hasUpdate: false };
  }
}

/** 一键更新扩展并刷新酒馆页面。 */
export async function applyPresetMemoUpdate(): Promise<PresetMemoUpdateApplyResult> {
  if (typeof updateExtension !== 'function') {
    return { ok: false, message: '当前环境不支持一键更新，请在酒馆「扩展」面板中手动更新' };
  }
  try {
    const res = await updateExtension(PM_EXTENSION_ID);
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
