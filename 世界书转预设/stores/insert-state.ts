import { ref } from 'vue';
import {
  createInsertDraftBaseline,
  getInsertDraftSaveSummary,
  saveInUsePresetPrompts,
  toPresetDraft,
  type PresetPromptDraft,
} from '../lib/preset-draft';

export function createInsertState() {
  const insertNavSearchKeyword = ref('');
  const insertDraftPrompts = ref<PresetPromptDraft[] | null>(null);
  const insertDraftBaselineIds = ref<Set<string> | null>(null);
  const insertDraftBaselineNames = ref<Set<string> | null>(null);
  const insertDraftBaselineEnabledById = ref<Map<string, boolean> | null>(null);
  const insertDraftDirty = ref(false);

  function loadInsertDraftFromInUse() {
    let preset: Preset;
    try {
      preset = getPreset('in_use');
    } catch (e) {
      console.error('[预设备忘录] 无法读取 in_use 预设', e);
      toastr.error('无法读取当前预设，请先在酒馆中加载一个预设');
      throw e;
    }
    const drafts = (preset.prompts || []).map(p => toPresetDraft(p as Record<string, unknown>));
    insertDraftPrompts.value = drafts;
    const baseline = createInsertDraftBaseline(drafts);
    insertDraftBaselineIds.value = baseline.ids;
    insertDraftBaselineNames.value = baseline.names;
    insertDraftBaselineEnabledById.value = baseline.enabledById;
    insertDraftDirty.value = false;
  }

  function ensureInsertDraftLoaded() {
    if (insertDraftPrompts.value) return;
    loadInsertDraftFromInUse();
  }

  /** 无本地未保存修改时，从酒馆 in_use 重新拉取（同步原生预设编辑/删除） */
  function syncInsertDraftFromInUseIfClean() {
    if (insertDraftDirty.value) return;
    loadInsertDraftFromInUse();
  }

  function resetInsertDraft() {
    insertDraftPrompts.value = null;
    insertDraftBaselineIds.value = null;
    insertDraftBaselineNames.value = null;
    insertDraftBaselineEnabledById.value = null;
    insertDraftDirty.value = false;
  }

  function insertDraftsAt(index: number, drafts: PresetPromptDraft[]) {
    ensureInsertDraftLoaded();
    insertDraftPrompts.value!.splice(index, 0, ...drafts);
    insertDraftDirty.value = true;
  }

  function getInsertSaveSummary() {
    return getInsertDraftSaveSummary(
      insertDraftPrompts.value,
      insertDraftBaselineIds.value,
      insertDraftBaselineNames.value,
      insertDraftBaselineEnabledById.value,
    );
  }

  async function saveInsertDraft() {
    if (!insertDraftPrompts.value) return;
    await saveInUsePresetPrompts(insertDraftPrompts.value);
    resetInsertDraft();
    loadInsertDraftFromInUse();
  }

  const presetSyncStops: EventOnReturn[] = [];

  function setupInsertPresetExternalSync() {
    presetSyncStops.forEach(s => s.stop());
    presetSyncStops.length = 0;
    const handler = () => syncInsertDraftFromInUseIfClean();
    presetSyncStops.push(eventOn(tavern_events.OAI_PRESET_CHANGED_AFTER, handler));
    presetSyncStops.push(eventOn(tavern_events.PRESET_CHANGED, handler));
  }

  function teardownInsertPresetExternalSync() {
    presetSyncStops.forEach(s => s.stop());
    presetSyncStops.length = 0;
  }

  return {
    insertNavSearchKeyword,
    insertDraftPrompts,
    insertDraftDirty,
    ensureInsertDraftLoaded,
    loadInsertDraftFromInUse,
    syncInsertDraftFromInUseIfClean,
    resetInsertDraft,
    insertDraftsAt,
    getInsertSaveSummary,
    saveInsertDraft,
    setupInsertPresetExternalSync,
    teardownInsertPresetExternalSync,
  };
}
