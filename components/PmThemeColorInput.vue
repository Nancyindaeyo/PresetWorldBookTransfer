<template>
  <div class="pm-theme-color-input" @click.stop @mousedown.stop @pointerdown.stop>
    <input
      type="color"
      class="pm-theme-color-picker"
      :value="pickerValue"
      @pointerdown.stop="emit('picker-active')"
      @input="onColorInput"
      @focus="emit('picker-active')"
      @blur="emit('picker-idle')"
    />
    <input
      type="text"
      class="text_pole pm-theme-color-text"
      :value="modelValue"
      spellcheck="false"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { colorPickerValue } from '../theme';

const props = defineProps<{
  modelValue: string;
  pickerFallback?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'picker-active': [];
  'picker-idle': [];
}>();

const pickerValue = computed(() => colorPickerValue(props.modelValue, props.pickerFallback ?? '#888888'));

function onColorInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}
</script>

<style scoped>
.pm-theme-color-input {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  min-width: 0;
}

.pm-theme-color-picker {
  width: 36px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--pm-border);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  flex-shrink: 0;
  appearance: auto;
  -webkit-appearance: auto;
}

.pm-theme-color-text {
  width: 108px;
  min-width: 0;
  padding: 4px 8px !important;
  font-size: 0.82rem !important;
  font-family: ui-monospace, monospace;
}
</style>
