function getSillyTavernContext() {
  const win = (
    window.parent?.document && window.parent.document !== document ? window.parent : window
  ) as Window & { SillyTavern?: typeof SillyTavern };
  return win.SillyTavern?.getContext?.();
}

/** 预览宏渲染结果（含酒馆自定义宏，如 setvar / getvar） */
export async function renderMacros(content: string): Promise<string> {
  const substitute = getSillyTavernContext()?.substituteParams;
  if (substitute) {
    try {
      const out = substitute(content) as unknown;
      if (typeof out === 'string') return out;
      if (out && typeof (out as PromiseLike<string>).then === 'function') {
        const awaited = await out;
        if (typeof awaited === 'string') return awaited;
      }
    } catch (e) {
      console.warn('substituteParams 失败，回退到 substitudeMacros', e);
    }
  }
  return substitudeMacros(content);
}
