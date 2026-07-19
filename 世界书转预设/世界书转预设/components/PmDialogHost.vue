<template>
  <div v-if="dialogState" class="pm-popup-overlay pm-dialog-host-overlay" @click.self="onOverlayClick">
    <div class="pm-popup" :class="{ 'pm-popup-choice': dialogState.type === 'choice' }">
      <div class="pm-popup-message">{{ dialogState.message }}</div>
      <input
        v-if="dialogState.type === 'prompt'"
        ref="promptInputRef"
        v-model="promptValue"
        type="text"
        class="text_pole pm-popup-input"
        data-macros-autocomplete="hide"
        autocomplete="off"
        @keydown.enter="confirmPrompt"
        @keydown.escape="cancel"
      />
      <div class="pm-popup-actions">
        <div class="menu_button interactable pm-popup-cancel" @click="cancel">取消</div>
        <template v-if="dialogState.type === 'choice'">
          <div
            v-for="opt in dialogState.options"
            :key="opt.value"
            class="menu_button interactable"
            :class="{
              'pm-popup-confirm': opt.variant === 'primary',
              'pm-popup-danger': opt.variant === 'danger',
            }"
            @click="choose(opt.value)"
          >
            {{ opt.label }}
          </div>
        </template>
        <div v-else class="menu_button interactable pm-popup-confirm" @click="confirm">确定</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { usePmDialog } from '../composables/usePmDialog';

const { dialogState, closeDialog } = usePmDialog();
const promptValue = ref('');
const promptInputRef = ref<HTMLInputElement | null>(null);

watch(dialogState, async state => {
  if (state?.type === 'prompt') {
    promptValue.value = state.defaultValue;
    await nextTick();
    promptInputRef.value?.focus();
    promptInputRef.value?.select();
  }
});

function cancel() {
  closeDialog(null);
}

function confirm() {
  if (dialogState.value?.type === 'prompt') closeDialog(promptValue.value);
  else closeDialog('ok');
}

function confirmPrompt() {
  closeDialog(promptValue.value);
}

function choose(value: string) {
  closeDialog(value);
}

function onOverlayClick(e: MouseEvent) {
  if (e.target === e.currentTarget) cancel();
}
</script>
