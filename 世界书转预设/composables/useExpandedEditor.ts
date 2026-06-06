import { ref } from 'vue';
import type { PresetVarLintContext } from '../components/ExpandedEditorSheet.vue';

export type ExpandedEditorState = {
  title: string;
  content: string;
  onApply: (content: string) => void;
  presetVarLint?: PresetVarLintContext;
} | null;

export function provideExpandedEditor() {
  const state = ref<ExpandedEditorState>(null);

  function openExpandedEditor(opts: NonNullable<ExpandedEditorState>) {
    state.value = opts;
  }

  function closeExpandedEditor() {
    state.value = null;
  }

  return { state, openExpandedEditor, closeExpandedEditor };
}
