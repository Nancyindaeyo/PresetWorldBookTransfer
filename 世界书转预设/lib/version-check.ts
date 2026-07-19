import { compareSemver, fetchLatestExtensionVersion, isNewerVersion, PM_DISPLAY_VERSION } from '../version';

export async function checkPresetMemoUpdate(): Promise<{ latest: string | null; hasUpdate: boolean }> {
  const latest = await fetchLatestExtensionVersion();
  if (!latest) return { latest: null, hasUpdate: false };
  return {
    latest,
    hasUpdate: isNewerVersion(latest, PM_DISPLAY_VERSION),
  };
}

export { compareSemver, isNewerVersion, PM_DISPLAY_VERSION };
