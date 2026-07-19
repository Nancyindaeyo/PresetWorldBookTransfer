/** 从 bootstrap 自身 URL 推断 ST 安装目录名（如 test、PresetWorldBookTransfer） */
function getExtensionFolder() {
  try {
    if (typeof import.meta !== 'undefined' && import.meta.url) {
      const match = import.meta.url.match(/\/third-party\/([^/]+)\//);
      if (match) return match[1];
    }
  } catch {
    /* ignore */
  }
  return 'PresetWorldBookTransfer';
}

const EXT_FOLDER = getExtensionFolder();
const SCRIPT_NAME = '预设备忘录';
const SCRIPT_ID = 'preset-worldbook-transfer';
const EXT_SCRIPT_IMPORT = `/scripts/extensions/third-party/${EXT_FOLDER}/index.js`;
const PM_SINGLETON_KEY = '__presetMemoSingletonCleanup';
const REGISTER_TOAST_KEY = 'PresetWorldBookTransfer:register-toast-shown';
const MAX_ATTEMPTS = 60;
const RETRY_MS = 500;

/**
 * false = 注册 TH 脚本；true = 扩展直载 index.js（不在脚本树出现条目）
 * 回退：直载失败时仍会 registerPresetMemoScript
 */
const PM_DIRECT_LOAD = true;

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

/** 扩展直载：把 TavernHelper / SillyTavern 事件 API 挂到 window */
function installThGlobalsOnWindow() {
  const w = window;
  const th = w.TavernHelper;
  if (!th || typeof th !== 'object') return false;

  const CORE = [
    'getVariables',
    'insertOrAssignVariables',
    'getWorldbookNames',
    'getPresetNames',
    'getPreset',
    'getWorldbook',
    'updateScriptTreesWith',
    'getScriptTrees',
    'triggerSlash',
  ];

  let installed = 0;
  for (const name of CORE) {
    const val = th[name];
    if (typeof val === 'function' && typeof w[name] !== 'function') {
      w[name] = val.bind(th);
      installed += 1;
    }
  }
  for (const key of Object.keys(th)) {
    const val = th[key];
    if (typeof val !== 'function') continue;
    if (typeof w[key] === 'function') continue;
    w[key] = val.bind(th);
    installed += 1;
  }

  const findSt = () => {
    for (const win of [w, w.parent, w.top].filter(Boolean)) {
      try {
        if (win?.SillyTavern) return win.SillyTavern;
      } catch {
        /* ignore */
      }
    }
    return w.SillyTavern;
  };
  const st = findSt();
  if (st?.eventSource) {
    const es = st.eventSource;
    const pairs = [
      ['eventOn', 'on'],
      ['eventOnce', 'once'],
      ['eventMakeFirst', 'makeFirst'],
      ['eventMakeLast', 'makeLast'],
      ['eventRemoveListener', 'removeListener'],
      ['eventEmit', 'emit'],
      ['eventEmitAndWait', 'emitAndWait'],
    ];
    for (const [globalName, sourceName] of pairs) {
      const fn = es[sourceName];
      if (typeof fn === 'function' && typeof w[globalName] !== 'function') {
        w[globalName] = fn.bind(es);
        installed += 1;
      }
    }
  }
  if (st?.eventTypes && w.tavern_events == null) {
    w.tavern_events = st.eventTypes;
    installed += 1;
  }
  if (typeof w.getExtensionInstallationInfo !== 'function' && typeof th.getExtensionStatus === 'function') {
    w.getExtensionInstallationInfo = th.getExtensionStatus.bind(th);
    installed += 1;
  }

  if (installed > 0) {
    console.info(`[预设备忘录] bootstrap 已安装 ${installed} 个 TH 全局 API`);
  }
  return CORE.every(name => typeof w[name] === 'function');
}

/** @param {import('@types/function/script').Script} script */
function isManagedScript(script) {
  const content = script.content ?? '';
  if (script.id === SCRIPT_ID) return true;
  if (script.name !== SCRIPT_NAME) return false;
  if (!content.trim()) return true;
  return (
    content.includes('PresetWorldBookTransfer') ||
    content.includes(`third-party/${EXT_FOLDER}/index.js`) ||
    /third-party\/[^/]+\/index\.js/.test(content)
  );
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
      scripts: (node.scripts ?? []).map(script => (isManagedScript(script) ? { ...script, enabled: false } : script)),
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

function cleanupPresetMemoViaSingleton() {
  const cleanup = window[PM_SINGLETON_KEY];
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch (e) {
      console.warn('[预设备忘录] cleanupPresetMemo 失败', e);
    }
  }
}

function cleanupExtensionDom() {
  jQuery(
    '#preset-memo-btn, #preset-memo-ext-menu-btn, #preset-memo-modal, #preset-memo-style, #preset-memo-ext-menu-btn-legacy, #preset_memo_wand_container, #preset-memo-mobile-launcher',
  ).remove();
  jQuery(document.documentElement).removeClass('pm-modal-body-lock');
  jQuery(document.body).removeClass('pm-modal-body-lock');

  cleanupPresetMemoViaSingleton();
  delete window[PM_SINGLETON_KEY];
}

function registerPresetMemoScript(options = {}) {
  const { quiet = false } = options;
  const updateScriptTreesWith = getThFn('updateScriptTreesWith');
  if (!updateScriptTreesWith) return false;

  const scriptContent = `import '${EXT_SCRIPT_IMPORT}'`;
  let created = false;

  updateScriptTreesWith(
    trees => {
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
    },
    { type: 'global' },
  );

  const shouldNotify = !quiet && !hasShownRegisterToast() && created;
  if (shouldNotify) {
    console.info('[预设备忘录] 已在酒馆助手中注册脚本');
    toastr.success('已在酒馆助手中注册脚本，若未出现入口请刷新页面', SCRIPT_NAME);
    markRegisterToastShown();
  }
  return true;
}

async function loadAndInitExtensionMode() {
  try {
    installThGlobalsOnWindow();
    const mod = await import(`./index.js`);
    if (typeof mod.installTavernHelperGlobals === 'function') {
      mod.installTavernHelperGlobals();
    }
    if (typeof mod.initPresetMemo !== 'function') {
      console.error('[预设备忘录] index.js 缺少 initPresetMemo，回退脚本注册');
      console.info('[预设备忘录] runtime=fallback-register');
      registerPresetMemoScript({ quiet: true });
      return;
    }
    mod.initPresetMemo({ mode: 'extension', extensionId: EXT_FOLDER });
    if (PM_DIRECT_LOAD) {
      unregisterPresetMemoScript();
    }
  } catch (e) {
    console.error('[预设备忘录] 直载失败，回退脚本注册', e);
    console.info('[预设备忘录] runtime=fallback-register');
    registerPresetMemoScript({ quiet: true });
  }
}

function onTavernHelperReady() {
  if (PM_DIRECT_LOAD) {
    void loadAndInitExtensionMode();
    return;
  }
  registerPresetMemoScript();
}

function waitForTavernHelper(attempt = 0) {
  if (isTavernHelperReady()) {
    onTavernHelperReady();
    return;
  }

  if (attempt >= MAX_ATTEMPTS) {
    toastr.warning('未检测到酒馆助手接口。请确认已安装并启用「酒馆助手」，然后刷新页面。', SCRIPT_NAME);
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
  if (PM_DIRECT_LOAD) {
    cleanupPresetMemoViaSingleton();
  } else {
    disablePresetMemoScript();
  }
  cleanupExtensionDom();
}

export async function onEnable() {
  if (PM_DIRECT_LOAD) {
    waitForTavernHelper();
    return;
  }
  registerPresetMemoScript({ quiet: true });
}

jQuery(() => {
  waitForTavernHelper();
});
