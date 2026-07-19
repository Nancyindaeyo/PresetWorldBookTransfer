const EXT_FOLDER = 'PresetWorldBookTransfer';
const SCRIPT_NAME = '预设备忘录';
const SCRIPT_ID = 'preset-worldbook-transfer';
const EXT_SCRIPT_IMPORT = `/scripts/extensions/third-party/${EXT_FOLDER}/index.js`;
const PM_SINGLETON_KEY = '__presetMemoSingletonCleanup';
const REGISTER_TOAST_KEY = 'PresetWorldBookTransfer:register-toast-shown';
const MAX_ATTEMPTS = 60;
const RETRY_MS = 500;

function hasShownRegisterToast() {
  try {
    return localStorage.getItem(REGISTER_TOAST_KEY) === '1';
  } catch {
    return false;
  }
}

function markRegisterToastShown() {
  try {
    localStorage.setItem(REGISTER_TOAST_KEY, '1');
  } catch {
    /* ignore */
  }
}

function clearRegisterToastShown() {
  try {
    localStorage.removeItem(REGISTER_TOAST_KEY);
  } catch {
    /* ignore */
  }
}

/** @returns {Record<string, Function> | null} */
function getTavernHelper() {
  const th = window.TavernHelper;
  if (!th || typeof th !== 'object') return null;
  return th;
}

function getThFn(name) {
  const th = getTavernHelper();
  if (th && typeof th[name] === 'function') return th[name].bind(th);
  const globalFn = window[name];
  if (typeof globalFn === 'function') return globalFn;
  return null;
}

function isTavernHelperReady() {
  return typeof getThFn('updateScriptTreesWith') === 'function';
}

/** @param {import('@types/function/script').Script} script */
function isManagedScript(script) {
  const content = script.content ?? '';
  if (script.id === SCRIPT_ID) return true;
  if (script.name === SCRIPT_NAME && content.includes(EXT_SCRIPT_IMPORT)) return true;
  return content.includes(EXT_SCRIPT_IMPORT);
}

/** @param {import('@types/function/script').ScriptTree[]} trees */
function removeManagedScriptsFromTrees(trees) {
  return trees.flatMap(node => {
    if (node.type === 'script') {
      return isManagedScript(node) ? [] : [node];
    }
    return [
      {
        ...node,
        scripts: (node.scripts ?? []).filter(script => !isManagedScript(script)),
      },
    ];
  });
}

/** @param {import('@types/function/script').ScriptTree[]} trees */
function disableManagedScriptsInTrees(trees) {
  return trees.map(node => {
    if (node.type === 'script') {
      if (!isManagedScript(node)) return node;
      return { ...node, enabled: false };
    }
    return {
      ...node,
      scripts: (node.scripts ?? []).map(script =>
        isManagedScript(script) ? { ...script, enabled: false } : script,
      ),
    };
  });
}

function forEachScriptScope(run) {
  for (const scope of ['global', 'preset', 'character']) {
    try {
      run(scope);
    } catch (e) {
      console.warn(`[预设备忘录] 脚本树操作失败 (${scope})`, e);
    }
  }
}

function unregisterPresetMemoScript() {
  const updateScriptTreesWith = getThFn('updateScriptTreesWith');
  if (!updateScriptTreesWith) return;

  forEachScriptScope(scope => {
    updateScriptTreesWith(trees => removeManagedScriptsFromTrees(trees), { type: scope });
  });
}

function disablePresetMemoScript() {
  const updateScriptTreesWith = getThFn('updateScriptTreesWith');
  if (!updateScriptTreesWith) return;

  forEachScriptScope(scope => {
    updateScriptTreesWith(trees => disableManagedScriptsInTrees(trees), { type: scope });
  });
}

function cleanupExtensionDom() {
  jQuery(
    '#preset-memo-btn, #preset-memo-ext-menu-btn, #preset-memo-modal, #preset-memo-style, #preset-memo-ext-menu-btn-legacy, #preset_memo_wand_container, #preset-memo-mobile-launcher',
  ).remove();
  jQuery(document.documentElement).removeClass('pm-modal-body-lock');
  jQuery(document.body).removeClass('pm-modal-body-lock');

  const cleanup = window[PM_SINGLETON_KEY];
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch (e) {
      console.warn('[预设备忘录] 卸载 UI 清理失败', e);
    }
    delete window[PM_SINGLETON_KEY];
  }
}

function registerPresetMemoScript(options = {}) {
  const { quiet = false } = options;
  const updateScriptTreesWith = getThFn('updateScriptTreesWith');
  if (!updateScriptTreesWith) return false;

  const scriptContent = `import '${EXT_SCRIPT_IMPORT}'`;
  let created = false;

  updateScriptTreesWith(trees => {
    let found = false;
    const next = trees.map(item => {
      if (item.type !== 'script') return item;
      if (item.id !== SCRIPT_ID && item.name !== SCRIPT_NAME) return item;
      found = true;
      return {
        ...item,
        id: SCRIPT_ID,
        name: SCRIPT_NAME,
        enabled: item.enabled !== false,
        content: scriptContent,
      };
    });

    if (found) return next;

    created = true;
    return [
      ...next,
      {
        type: 'script',
        enabled: true,
        id: SCRIPT_ID,
        name: SCRIPT_NAME,
        content: scriptContent,
        info: '世界书与预设互转、备忘录、变量检查等工具。',
        button: { enabled: false, buttons: [] },
        data: {},
        export_with: { data: true, button: true },
      },
    ];
  }, { type: 'global' });

  const shouldNotify = !quiet && !hasShownRegisterToast() && created;
  if (shouldNotify) {
    console.info('[预设备忘录] 已在酒馆助手中注册脚本');
    toastr.success('已在酒馆助手中注册脚本，若未出现入口请刷新页面', SCRIPT_NAME);
    markRegisterToastShown();
  }
  return true;
}

function waitForTavernHelper(attempt = 0) {
  if (isTavernHelperReady()) {
    registerPresetMemoScript();
    return;
  }

  if (attempt >= MAX_ATTEMPTS) {
    toastr.warning(
      '未检测到酒馆助手接口。请确认已安装并启用「酒馆助手」，然后刷新页面。',
      SCRIPT_NAME,
    );
    return;
  }

  setTimeout(() => waitForTavernHelper(attempt + 1), RETRY_MS);
}

export async function onDelete() {
  unregisterPresetMemoScript();
  cleanupExtensionDom();
  clearRegisterToastShown();
}

export async function onDisable() {
  disablePresetMemoScript();
  cleanupExtensionDom();
}

export async function onEnable() {
  registerPresetMemoScript({ quiet: true });
}

jQuery(() => {
  waitForTavernHelper();
});
