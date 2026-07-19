const EXT_FOLDER = 'PresetWorldBookTransfer';
const SCRIPT_NAME = '预设备忘录';
const SCRIPT_ID = 'preset-worldbook-transfer';
const MAX_ATTEMPTS = 60;
const RETRY_MS = 500;

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

function registerPresetMemoScript() {
  const updateScriptTreesWith = getThFn('updateScriptTreesWith');
  if (!updateScriptTreesWith) return false;

  const scriptContent = `import '/scripts/extensions/third-party/${EXT_FOLDER}/index.js'`;

  updateScriptTreesWith(trees => {
    let found = false;
    const next = trees.map(item => {
      if (item.type !== 'script' || item.name !== SCRIPT_NAME) return item;
      found = true;
      return {
        ...item,
        enabled: true,
        content: scriptContent,
      };
    });

    if (found) return next;

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

  console.info('[预设备忘录] 已在酒馆助手中注册脚本');
  toastr.success('已在酒馆助手中注册脚本，若未出现入口请刷新页面', SCRIPT_NAME);
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

jQuery(() => {
  waitForTavernHelper();
});
