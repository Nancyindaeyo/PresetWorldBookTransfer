import { shallowRef } from 'vue';

export type PmDialogChoice<T extends string = string> = {
  label: string;
  value: T;
  variant?: 'primary' | 'danger' | 'default';
};

export type PmDialogState =
  | { type: 'confirm'; message: string; resolve: (v: boolean) => void }
  | { type: 'prompt'; message: string; defaultValue: string; resolve: (v: string | null) => void }
  | { type: 'choice'; message: string; options: PmDialogChoice[]; resolve: (v: string | null) => void }
  | null;

const dialogState = shallowRef<PmDialogState>(null);

function closeDialog(result: string | null) {
  const state = dialogState.value;
  if (!state) return;
  if (state.type === 'confirm') state.resolve(result !== null);
  else state.resolve(result);
  dialogState.value = null;
}

/** 可在 Vue 组件外（如 index.ts 打开面板前）调用的确认框 */
export function pmConfirmDialog(message: string): Promise<boolean> {
  return new Promise(resolve => {
    dialogState.value = { type: 'confirm', message, resolve };
  });
}

export function usePmDialog() {
  function pmConfirm(message: string): Promise<boolean> {
    return pmConfirmDialog(message);
  }

  function pmPrompt(message: string, defaultValue = ''): Promise<string | null> {
    return new Promise(resolve => {
      dialogState.value = { type: 'prompt', message, defaultValue, resolve };
    });
  }

  function pmChoice<T extends string>(message: string, options: PmDialogChoice<T>[]): Promise<T | null> {
    return new Promise(resolve => {
      dialogState.value = {
        type: 'choice',
        message,
        options: options as PmDialogChoice[],
        resolve: v => resolve(v as T | null),
      };
    });
  }

  return { dialogState, pmConfirm, pmPrompt, pmChoice, closeDialog };
}
