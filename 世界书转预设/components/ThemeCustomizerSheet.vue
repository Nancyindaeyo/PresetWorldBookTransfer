<template>
  <div class="pm-popup-overlay pm-theme-panel-overlay">
    <div class="pm-theme-sheet-backdrop" @click="onBackdropClick"></div>
    <div class="pm-popup pm-popup-large pm-theme-panel" @click.stop @mousedown.stop @pointerdown.stop>
      <div class="pm-popup-message">
        <strong><i class="fa-solid fa-palette"></i> 主题与配色</strong>
        <div class="pm-popup-subtitle">
          可选「酒馆」跟随 SmartTheme 美化；或选预设/微调颜色。自定义配色仅在与内置十套均不同时保存为新圆标。
        </div>
      </div>
      <div class="pm-theme-mode-tabs" :class="{ 'is-tavern-locked': draft.style === 'tavern' }">
        <div
          class="pm-theme-mode-tab"
          :class="{ active: draft.mode === 'dark' }"
          @click="setMode('dark')"
        >
          <i class="fa-solid fa-moon"></i> 夜间
        </div>
        <div
          class="pm-theme-mode-tab"
          :class="{ active: draft.mode === 'light' }"
          @click="setMode('light')"
        >
          <i class="fa-solid fa-sun"></i> 日间
        </div>
      </div>
      <p v-if="draft.style === 'tavern'" class="pm-theme-editing-hint">
        已启用<strong>跟随酒馆美化</strong>：颜色与日间/夜间随酒馆 SmartTheme 自动同步，切换酒馆主题后无需再保存。
      </p>
      <p v-else class="pm-theme-editing-hint">
        正在配置 <strong>{{ draft.mode === 'light' ? '日间模式' : '夜间模式' }}</strong> 配色，调节时界面实时预览。
      </p>
      <div class="pm-theme-preset-section">
        <div class="pm-theme-preset-label">预设配色</div>
        <div class="pm-theme-preset-row">
          <button
            type="button"
            class="pm-theme-preset-swatch pm-theme-tavern-swatch"
            :class="{ active: draft.style === 'tavern' }"
            title="跟随酒馆美化（随 SmartTheme 同步）"
            @click="applyTavernStyle"
          >
            <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
            <span class="pm-theme-tavern-label">酒馆</span>
          </button>
          <button
            v-for="preset in visiblePresets"
            :key="preset.id"
            type="button"
            class="pm-theme-preset-swatch"
            :class="{ active: activePresetId === preset.id, 'is-custom': !preset.builtIn }"
            :style="presetSwatchStyle(presetTokensForMode(preset, draft.mode))"
            :title="preset.label || '预设'"
            @click="applyPreset(preset)"
          >
            <span
              v-if="!preset.builtIn"
              class="pm-theme-preset-del"
              title="删除此预设"
              @click.stop="deletePreset(preset.id)"
            >
              <i class="fa-solid fa-xmark"></i>
            </span>
          </button>
        </div>
      </div>
      <div v-if="draft.style !== 'tavern'" class="pm-theme-tweak-header">
        <span class="pm-theme-tweak-title">微调</span>
        <div class="pm-icon-toolbar pm-theme-panel-toolbar">
          <div class="menu_button interactable pm-popup-cancel" title="取消" @click="onCancel">
            <i class="fa-solid fa-xmark"></i>
          </div>
          <div class="menu_button interactable pm-theme-save-btn" title="保存主题" @click="save">
            <i class="fa-solid fa-check"></i>
          </div>
        </div>
      </div>
      <div v-if="draft.style !== 'tavern'" class="pm-theme-color-grid">
        <div v-for="field in PM_TOKEN_FIELDS" :key="field.key" class="pm-theme-color-row">
          <span class="pm-theme-color-label-wrap">
            <span class="pm-theme-color-label">{{ field.label }}</span>
            <span class="pm-theme-color-hint">{{ field.hint }}</span>
          </span>
          <PmThemeColorInput
            :model-value="draft[draft.mode][field.key]"
            :picker-fallback="fieldPickerFallback(field)"
            @update:model-value="updateToken(field.key, $event)"
            @picker-active="onColorPickerActive"
            @picker-idle="onColorPickerIdle"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import {
  clonePmThemeSettings,
  clonePmThemeTokens,
  colorPickerValue,
  findPresetIdForPair,
  genCustomPresetId,
  getBuiltinPresetsForMode,
  getDefaultPmThemeTokens,
  matchesAnyBuiltinPreset,
  PM_TOKEN_FIELDS,
  PM_THEME_STYLE_TAVERN,
  PM_TAVERN_FOLLOW_PRESET_ID,
  presetPairEqual,
  presetSwatchStyle,
  presetTokensForMode,
  type PmThemeMode,
  type PmThemePreset,
  type PmThemeSettings,
  type PmTokenField,
  type PmThemeTokens,
} from '../theme';
import { usePmDialog } from '../composables/usePmDialog';
import { applyPmThemeToModal, resetPmThemeFingerprint } from '../lib/pm-theme-modal';
import { usePresetMemoStore } from '../store';
import PmThemeColorInput from './PmThemeColorInput.vue';

const store = usePresetMemoStore();
const { pmConfirm } = usePmDialog();
const emit = defineEmits<{ close: [] }>();

const snapshot = clonePmThemeSettings(store.themeSettings);
const draft = ref<PmThemeSettings>(clonePmThemeSettings(store.themeSettings));
const activePresetId = ref<string | null>(
  draft.value.style === PM_THEME_STYLE_TAVERN
    ? PM_TAVERN_FOLLOW_PRESET_ID
    : findPresetIdForPair({ dark: draft.value.dark, light: draft.value.light }, draft.value.customPresets),
);
const presetTweaked = ref(false);

const visiblePresets = computed(() => [
  ...getBuiltinPresetsForMode(draft.value.mode),
  ...draft.value.customPresets,
]);

const pickerFallbackByField = computed(() => {
  const mode = draft.value.mode;
  const defaults = getDefaultPmThemeTokens(mode);
  const map = {} as Record<keyof PmThemeTokens, string>;
  for (const field of PM_TOKEN_FIELDS) {
    const raw = field.pickerFallback ?? defaults[field.key];
    map[field.key] = colorPickerValue(raw, '#888888');
  }
  return map;
});

let previewTimer: ReturnType<typeof setTimeout> | null = null;
let backdropCloseBlocked = false;
let backdropUnblockTimer: ReturnType<typeof setTimeout> | null = null;

function onColorPickerActive() {
  if (backdropUnblockTimer) {
    clearTimeout(backdropUnblockTimer);
    backdropUnblockTimer = null;
  }
  backdropCloseBlocked = true;
}

function onColorPickerIdle() {
  if (backdropUnblockTimer) clearTimeout(backdropUnblockTimer);
  // 原生选色弹层在 input blur 后仍可能短暂叠在遮罩上，延迟恢复点击关闭
  backdropUnblockTimer = setTimeout(() => {
    backdropCloseBlocked = false;
    backdropUnblockTimer = null;
  }, 500);
}

function onBackdropClick() {
  if (backdropCloseBlocked) return;
  onCancel();
}

function syncPreviewNow() {
  if (previewTimer) {
    clearTimeout(previewTimer);
    previewTimer = null;
  }
  store.setThemeSettings({
    mode: draft.value.mode,
    style: draft.value.style,
    dark: draft.value.dark,
    light: draft.value.light,
    customPresets: draft.value.customPresets,
  });
  applyPmThemeToModal(store.themeSettings, true);
}

function syncPreviewDebounced() {
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(syncPreviewNow, 120);
}

function fieldPickerFallback(field: PmTokenField): string {
  return pickerFallbackByField.value[field.key];
}

function refreshActivePresetId() {
  if (draft.value.style === PM_THEME_STYLE_TAVERN) {
    activePresetId.value = PM_TAVERN_FOLLOW_PRESET_ID;
    return;
  }
  activePresetId.value = findPresetIdForPair(
    { dark: draft.value.dark, light: draft.value.light },
    draft.value.customPresets,
  );
}

function applyTavernStyle() {
  draft.value.style = PM_THEME_STYLE_TAVERN;
  activePresetId.value = PM_TAVERN_FOLLOW_PRESET_ID;
  presetTweaked.value = false;
  syncPreviewNow();
}

function setMode(mode: PmThemeMode) {
  if (draft.value.style === PM_THEME_STYLE_TAVERN) return;
  if (draft.value.mode === mode) return;
  draft.value.mode = mode;
  refreshActivePresetId();
  syncPreviewNow();
}

function applyPreset(preset: PmThemePreset) {
  draft.value.style = 'custom';
  if (preset.builtIn) {
    draft.value[draft.value.mode] = clonePmThemeTokens(presetTokensForMode(preset, draft.value.mode));
  } else {
    draft.value.dark = clonePmThemeTokens(preset.dark);
    draft.value.light = clonePmThemeTokens(preset.light);
  }
  activePresetId.value = preset.id;
  presetTweaked.value = false;
  syncPreviewNow();
}

async function deletePreset(id: string) {
  if (!(await pmConfirm('确定删除这个自定义预设吗？'))) return;
  draft.value.customPresets = draft.value.customPresets.filter(p => p.id !== id);
  if (activePresetId.value === id) activePresetId.value = null;
}

function updateToken(key: keyof PmThemeTokens, value: string) {
  draft.value.style = 'custom';
  draft.value[draft.value.mode][key] = value;
  activePresetId.value = null;
  presetTweaked.value = true;
  syncPreviewDebounced();
}

function onCancel() {
  resetPmThemeFingerprint();
  store.setThemeSettings(snapshot);
  applyPmThemeToModal(store.themeSettings, true);
  emit('close');
}

function save() {
  const pair = { dark: clonePmThemeTokens(draft.value.dark), light: clonePmThemeTokens(draft.value.light) };
  const shouldAddCustom =
    presetTweaked.value &&
    !matchesAnyBuiltinPreset(pair) &&
    !draft.value.customPresets.some(p => presetPairEqual(p, pair));

  if (shouldAddCustom) {
    const n = draft.value.customPresets.length + 1;
    draft.value.customPresets.push({
      id: genCustomPresetId(),
      label: `自定义 ${n}`,
      dark: pair.dark,
      light: pair.light,
    });
  }
  resetPmThemeFingerprint();
  store.setThemeSettings(draft.value);
  applyPmThemeToModal(store.themeSettings, true);
  toastr.success(shouldAddCustom ? '主题已保存，并新增自定义预设' : '主题已保存');
  emit('close');
}

onUnmounted(() => {
  if (previewTimer) clearTimeout(previewTimer);
  if (backdropUnblockTimer) clearTimeout(backdropUnblockTimer);
});
</script>
