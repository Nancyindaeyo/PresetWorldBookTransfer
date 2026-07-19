const EXT_FOLDER = 'PresetWorldBookTransfer';
const SCRIPT_NAME = '预设备忘录';

jQuery(() => {
  if (typeof isInstalledExtension !== 'function' || typeof getTavernHelperExtensionId !== 'function') {
    console.warn('[预设备忘录] 当前环境不支持扩展检测，请确认已安装酒馆助手');
    return;
  }

  if (!isInstalledExtension(getTavernHelperExtensionId())) {
    toastr.warning('请先安装酒馆助手 (JS-Slash-Runner)，再启用本扩展。', SCRIPT_NAME);
    return;
  }

  if (typeof updateScriptTreesWith !== 'function') {
    toastr.error('未找到酒馆助手脚本接口，请更新酒馆助手后重试。', SCRIPT_NAME);
    return;
  }

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
});
