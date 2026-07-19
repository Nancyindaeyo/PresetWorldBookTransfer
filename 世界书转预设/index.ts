import { createPinia, type Pinia } from 'pinia';
import { getTavernDocument, getTavernJQuery } from '@util/tavern-context';
import App from './App.vue';
import { PM_MODAL_ID } from './lib/pm-input';
import { pmConfirmDialog } from './composables/usePmDialog';
import {
  buildPresetMemoMigrationMessage,
  executePresetMemoScriptMigration,
  getPresetMemoDuplicateMigrationPlan,
  resolvePresetMemoScriptInstance,
  suppressEnabledLegacyPresetMemoScripts,
} from './lib/script-var-migrate';
import { invalidateScriptVarsCache, readScriptVars, rememberScriptId, syncGlobalBackup } from './lib/script-vars';
import { applyPmThemeToModal } from './lib/pm-theme-modal';
import panelHtml from './panel.html?raw';
import { usePresetMemoStore } from './store';
import cssContent from './style.scss?raw';

const BUTTON_ID = 'preset-memo-btn';
const EXT_MENU_BUTTON_ID = 'preset-memo-ext-menu-btn';
const MODAL_ID = PM_MODAL_ID;
const STYLE_ID = 'preset-memo-style';
const PM_PANEL_VERSION = 4;
const PM_SINGLETON_KEY = '__presetMemoSingletonCleanup';
const PM_BODY_LOCK_CLASS = 'pm-modal-body-lock';

let app: ReturnType<typeof createApp> | null = null;
let pinia: Pinia | null = null;
let menuObserver: MutationObserver | null = null;
let menuBodyObserver: MutationObserver | null = null;
let settingsUpdatedOff: EventOnReturn | null = null;
let lastOpenAt = 0;

type PmSingletonWindow = Window & {
  [PM_SINGLETON_KEY]?: (() => void) | undefined;
};

const $pm = (selector: string): JQuery => {
  const $jq = getTavernJQuery();
  if (selector.startsWith('<')) return $jq(selector);
  return $jq(selector, getTavernDocument());
};

function hideExtensionsMenu() {
  $pm('#extensionsMenu, #extensions_menu').hide();
}

function lockTavernBodyScroll() {
  const doc = getTavernDocument();
  doc.documentElement.classList.add(PM_BODY_LOCK_CLASS);
  doc.body.classList.add(PM_BODY_LOCK_CLASS);
}

function unlockTavernBodyScroll() {
  const doc = getTavernDocument();
  doc.documentElement.classList.remove(PM_BODY_LOCK_CLASS);
  doc.body.classList.remove(PM_BODY_LOCK_CLASS);
}

function ensureModalDom() {
  if ($pm(`#${STYLE_ID}`).length === 0) {
    $pm('head').append(`<style id="${STYLE_ID}">${cssContent}</style>`);
  }

  const $existing = $pm(`#${MODAL_ID}`);
  const versionMismatch = $existing.length > 0 && Number($existing.data('pmPanelVersion') ?? 0) !== PM_PANEL_VERSION;
  if (versionMismatch) $existing.remove();

  if ($pm(`#${MODAL_ID}`).length === 0) {
    getTavernJQuery()(panelHtml).appendTo(getTavernDocument().body);
    $pm(`#${MODAL_ID}`).data('pmPanelVersion', PM_PANEL_VERSION);
    $pm('#preset-memo-modal-overlay')
      .off('click.presetMemo')
      .on('click.presetMemo', () => void closeModal());
    $pm('#preset-memo-modal-content')
      .off('click.presetMemo touchend.presetMemo')
      .on('click.presetMemo touchend.presetMemo', e => e.stopPropagation());

    $pm(`#${MODAL_ID}`)
      .off('keydown keyup keypress', 'input, textarea, select')
      .on('keydown keyup keypress', 'input, textarea, select', function (e) {
        if (e.key === 'Escape') return;
        e.stopPropagation();
      });
  }
}

function getVueMountEl(): HTMLElement | null {
  const $el = $pm('#preset-memo-vue-root');
  if ($el.length > 0) return $el[0];
  return getTavernDocument().getElementById('preset-memo-vue-root');
}

function mountVue(): boolean {
  if (app) return true;

  const el = getVueMountEl();
  if (!el) {
    console.error('[预设备忘录] 未找到挂载点 #preset-memo-vue-root');
    return false;
  }
  pinia = createPinia();
  app = createApp(App, { onClose: closeModal });
  app.use(pinia);
  app.mount(el);
  return true;
}

function hydrateStoreIfNeeded() {
  if (!pinia) return;
  const store = usePresetMemoStore(pinia);
  if (store.hydrated) return;
  try {
    invalidateScriptVarsCache();
    store.reloadFromVars();
  } catch (e) {
    console.warn('[预设备忘录] 加载备忘录数据失败:', e);
  }
}

export async function closeModal() {
  if (pinia) {
    usePresetMemoStore(pinia).teardownInsertPresetExternalSync();
  }
  unlockTavernBodyScroll();
  $pm(`#${MODAL_ID}`).removeClass('is-open');
}

function finishOpen() {
  lockTavernBodyScroll();
  hydrateStoreIfNeeded();
  if (pinia) {
    const store = usePresetMemoStore(pinia);
    store.setupInsertPresetExternalSync();
    try {
      store.syncInsertDraftFromInUseIfClean();
    } catch {
      /* 无 in_use 预设时忽略 */
    }
  }
  getTavernDocument().dispatchEvent(new CustomEvent('preset-memo-panel-open'));
}

export function openModal() {
  void openModalAsync();
}

async function openModalAsync() {
  const now = Date.now();
  let $modal = $pm(`#${MODAL_ID}`);
  if (now - lastOpenAt < 350 && $modal.hasClass('is-open')) return;
  lastOpenAt = now;

  ensureModalDom();
  $modal = $pm(`#${MODAL_ID}`);

  if ($modal.length === 0) {
    console.error('[预设备忘录] 模态框未创建');
    return;
  }

  const migrationPlan = getPresetMemoDuplicateMigrationPlan();
  if (migrationPlan) {
    if (!mountVue()) {
      toastr.error('预设备忘录界面加载失败，请刷新酒馆后重试');
      return;
    }

    $modal.addClass('is-open');
    lockTavernBodyScroll();

    const confirmed = await pmConfirmDialog(buildPresetMemoMigrationMessage(migrationPlan));
    if (!confirmed) {
      $modal.removeClass('is-open');
      unlockTavernBodyScroll();
      return;
    }

    executePresetMemoScriptMigration(migrationPlan);
    suppressEnabledLegacyPresetMemoScripts(migrationPlan.canonical.id);
    toastr.success('数据已合并，即将刷新酒馆页面…', '预设备忘录');
    _.delay(() => triggerSlash('/reload-page'), 1200);
    return;
  }

  // 已预挂载：同步只做显示，其余全部放到下一帧，保证魔法棒点击后面板立刻弹出
  if (app) {
    $modal.addClass('is-open');
    requestAnimationFrame(() => finishOpen());
    return;
  }

  // 首次尚未挂载：与世界书管理器一致，先 mount 再显示
  if (!mountVue()) {
    toastr.error('预设备忘录界面加载失败，请刷新酒馆后重试');
    return;
  }

  $modal.addClass('is-open');
  requestAnimationFrame(() => finishOpen());
}

function handleOpenModalEvent(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  hideExtensionsMenu();
  openModal();
}

function bindOpenTrigger(el: HTMLElement | null, force = false) {
  if (!el) return;
  const key = '__presetMemoOpenBound';
  const tagged = el as HTMLElement & { [key]?: boolean };
  if (tagged[key] && !force) return;
  tagged[key] = true;

  const handler = (ev: Event) => handleOpenModalEvent(ev);
  el.onclick = handler;
  el.addEventListener('touchend', handler, { capture: true, passive: false });
  el.addEventListener('click', handler, { capture: true });
}

function getExtensionsMenu(): JQuery {
  const $menu = $pm('#extensionsMenu');
  return $menu.length ? $menu : $pm('#extensions_menu');
}

function ensurePmFooterButton() {
  const $footer = $pm('.completion_prompt_manager_footer');
  if (!$footer.length) return;
  let $btn = $pm(`#${BUTTON_ID}`);
  if ($btn.length === 0) {
    $btn = getTavernJQuery()(
      `<div id="${BUTTON_ID}" class="menu_button interactable" title="预设备忘录" tabindex="0" role="button"><i class="fa-solid fa-book-bookmark"></i></div>`,
    );
    $footer.append($btn);
  }
  bindOpenTrigger($btn.get(0) ?? null, true);
}

function ensureExtensionsMenuListItem() {
  const $menu = getExtensionsMenu();
  if (!$menu.length) return;

  let $btn = $pm(`#${EXT_MENU_BUTTON_ID}`);
  if ($btn.length === 0) {
    $btn = getTavernJQuery()(
      `<div id="${EXT_MENU_BUTTON_ID}" class="list-group-item flex-container flexGap5 interactable" title="预设备忘录" tabindex="0" role="listitem">` +
        `<div class="fa-fw fa-solid fa-book-bookmark"></div><span>预设备忘录</span></div>`,
    );
    $menu.append($btn);
  }
  bindOpenTrigger($btn.get(0) ?? null, true);
}

function removePmLegacyEntryPoints() {
  $pm('#preset-memo-ext-menu-btn-legacy').remove();
  $pm('#preset_memo_wand_container').remove();
  $pm('#preset-memo-mobile-launcher').remove();
}

function attachExtensionsMenuObserver() {
  const doc = getTavernDocument();
  const menu = doc.querySelector('#extensionsMenu, #extensions_menu');
  if (!menu) return false;
  ensureExtensionsMenuListItem();
  if (!menuObserver) {
    menuObserver = new MutationObserver(() => ensureExtensionsMenuListItem());
    menuObserver.observe(menu, { childList: true });
  }
  if (menuBodyObserver) {
    menuBodyObserver.disconnect();
    menuBodyObserver = null;
  }
  return true;
}

function watchPmEntryPoints() {
  ensurePmFooterButton();
  if (attachExtensionsMenuObserver()) return;
  const doc = getTavernDocument();
  if (menuBodyObserver) return;
  menuBodyObserver = new MutationObserver(() => {
    if (attachExtensionsMenuObserver()) {
      ensurePmFooterButton();
      menuBodyObserver?.disconnect();
      menuBodyObserver = null;
    }
  });
  menuBodyObserver.observe(doc.body, { childList: true, subtree: true });
}

function setupOpenDelegation() {
  const $doc = getTavernJQuery()(getTavernDocument());
  const openHandler = (e: JQuery.TriggeredEvent) => {
    const raw = e.originalEvent;
    if (raw) handleOpenModalEvent(raw);
    else handleOpenModalEvent(e as unknown as Event);
  };
  $doc
    .off('click.presetMemoOpen touchend.presetMemoOpen', `#${EXT_MENU_BUTTON_ID}, #${BUTTON_ID}`)
    .on('click.presetMemoOpen touchend.presetMemoOpen', `#${EXT_MENU_BUTTON_ID}, #${BUTTON_ID}`, openHandler);
}

function disconnectEntryObservers() {
  menuObserver?.disconnect();
  menuObserver = null;
  menuBodyObserver?.disconnect();
  menuBodyObserver = null;
}

function cleanupUI() {
  settingsUpdatedOff?.stop();
  settingsUpdatedOff = null;
  if (pinia) {
    try {
      usePresetMemoStore(pinia).teardownInsertPresetExternalSync();
    } catch {
      /* ignore */
    }
  }
  unlockTavernBodyScroll();
  removePmLegacyEntryPoints();
  disconnectEntryObservers();
  $pm(`#${BUTTON_ID}`).remove();
  $pm(`#${EXT_MENU_BUTTON_ID}`).remove();
  $pm(`#${MODAL_ID}`).remove();
  $pm(`#${STYLE_ID}`).remove();
  getTavernJQuery()(getTavernDocument()).off(
    'click.presetMemoOpen touchend.presetMemoOpen',
    `#${EXT_MENU_BUTTON_ID}, #${BUTTON_ID}`,
  );
  app?.unmount();
  app = null;
  pinia = null;
}

function initUI() {
  const $footer = $pm('.completion_prompt_manager_footer');
  const $existingBtn = $pm(`#${BUTTON_ID}`);
  if ($existingBtn.length && (!$footer.length || $footer.find(`#${BUTTON_ID}`).length === 0)) {
    $existingBtn.remove();
  }
  removePmLegacyEntryPoints();
  ensureModalDom();
  watchPmEntryPoints();
  setupOpenDelegation();

  settingsUpdatedOff?.stop();
  settingsUpdatedOff = eventOn(tavern_events.SETTINGS_UPDATED, () => {
    if (!pinia) return;
    try {
      const store = usePresetMemoStore(pinia);
      if (store.themeSettings.style !== 'tavern') return;
      applyPmThemeToModal(store.themeSettings, true);
    } catch {
      /* ignore */
    }
  });

  try {
    const disabled = suppressEnabledLegacyPresetMemoScripts(getScriptId());
    if (disabled.length > 0) {
      console.info('[预设备忘录] 已自动关闭仍启用的旧版脚本', disabled);
    }
  } catch (e) {
    console.warn('[预设备忘录] 关闭旧版脚本失败:', e);
  }

  setTimeout(() => {
    try {
      mountVue();
    } catch (e) {
      console.error('[预设备忘录] 预挂载失败:', e);
    }
  }, 0);

  const syncBackup = () => {
    try {
      syncGlobalBackup(readScriptVars());
    } catch (e) {
      console.warn('[预设备忘录] 全局备份失败:', e);
    }
  };
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(syncBackup, { timeout: 4000 });
  } else {
    setTimeout(syncBackup, 0);
  }
}

$(() => {
  try {
    rememberScriptId(getScriptId());
  } catch {
    /* ignore */
  }

  let instance = { shouldRun: true, canonicalScriptId: null as string | null };
  try {
    instance = resolvePresetMemoScriptInstance();
  } catch (e) {
    console.warn('[预设备忘录] 重复脚本检测失败:', e);
  }

  if (!instance.shouldRun) {
    console.info('[预设备忘录] 检测到重复脚本，已由扩展版本接管，本实例跳过 UI 加载');
    return;
  }

  const singletonWindow = window as PmSingletonWindow;
  const prevCleanup = singletonWindow[PM_SINGLETON_KEY];
  if (typeof prevCleanup === 'function') {
    try {
      prevCleanup();
    } catch (e) {
      console.warn('[预设备忘录] 清理旧实例失败:', e);
    }
  }
  singletonWindow[PM_SINGLETON_KEY] = cleanupUI;

  try {
    initUI();
  } catch (e) {
    console.error('[预设备忘录] initUI 失败:', e);
  }
});

$(window).on('pagehide', () => {
  const singletonWindow = window as PmSingletonWindow;
  if (singletonWindow[PM_SINGLETON_KEY] !== cleanupUI) return;
  cleanupUI();
  delete singletonWindow[PM_SINGLETON_KEY];
});
