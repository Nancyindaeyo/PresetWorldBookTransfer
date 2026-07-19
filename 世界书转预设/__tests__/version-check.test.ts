import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyPresetMemoUpdate, checkPresetMemoUpdate } from '../lib/version-check';
import { PM_EXTENSION_ID } from '../version';

describe('version-check', () => {
  beforeEach(() => {
    vi.stubGlobal('getExtensionInstallationInfo', undefined);
    vi.stubGlobal('updateExtension', undefined);
    vi.stubGlobal('triggerSlash', vi.fn());
    vi.stubGlobal('toastr', { success: vi.fn(), error: vi.fn() });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns no update when installation info is unavailable', async () => {
    await expect(checkPresetMemoUpdate()).resolves.toEqual({ hasUpdate: false });
  });

  it('uses tavern extension installation info', async () => {
    vi.stubGlobal(
      'getExtensionInstallationInfo',
      vi.fn(async (id: string) => {
        expect(id).toBe(PM_EXTENSION_ID);
        return { is_up_to_date: false, current_branch_name: 'main', current_commit_hash: 'abc', remote_url: 'x' };
      }),
    );
    await expect(checkPresetMemoUpdate()).resolves.toEqual({ hasUpdate: true });
  });

  it('returns no update when extension is up to date', async () => {
    vi.stubGlobal(
      'getExtensionInstallationInfo',
      vi.fn(async () => ({
        is_up_to_date: true,
        current_branch_name: 'main',
        current_commit_hash: 'abc',
        remote_url: 'x',
      })),
    );
    await expect(checkPresetMemoUpdate()).resolves.toEqual({ hasUpdate: false });
  });

  it('applies update via updateExtension and schedules reload', async () => {
    const updateExtension = vi.fn(async () => ({ ok: true, status: 200, text: async () => '' }));
    vi.stubGlobal('updateExtension', updateExtension);
    vi.useFakeTimers();

    const promise = applyPresetMemoUpdate();
    await expect(promise).resolves.toEqual({ ok: true });
    expect(updateExtension).toHaveBeenCalledWith(PM_EXTENSION_ID);

    vi.runAllTimers();
    expect(triggerSlash).toHaveBeenCalledWith('/reload-page');

    vi.useRealTimers();
  });
});
