import { createPinia } from 'pinia';
import {
  blurWithin,
  getTavernDocument,
  getTavernJQuery,
  suppressStaleTavernAutocomplete,
} from '../世界书管理器/lib/tavern-autocomplete';
import App from './App.vue';
import {
  cleanupPmOnClose,
  PM_MODAL_ID,
  restampPmModalAutocomplete,
  setupPmModalInputGuard,
} from './lib/pm-input';
import { readScriptVarsRaw, rememberScriptId, syncGlobalBackup } from './lib/script-vars';
import panelHtml from './panel.html?raw';
import cssContent from './style.scss?raw';

const BUTTON_ID = 'preset-memo-btn';
const EXT_MENU_BUTTON_ID = 'preset-memo-ext-menu-btn';
const LEGACY_MOBILE_LAUNCHER_ID = 'preset-memo-mobile-launcher';
const WAND_CONTAINER_ID = 'preset_memo_wand_container';
const MODAL_ID = PM_MODAL_ID;
const STYLE_ID = 'preset-memo-style';
const PM_PANEL_VERSION = 4;
const PM_SINGLETON_KEY = '__presetMemoSingletonCleanup';
const PM_BODY_LOCK_CLASS = 'pm-modal-body-lock';

let app: ReturnType<typeof createApp> | null = null;
let pmMenuObserver: MutationObserver | null = null;
let pmMenuBodyObserver: MutationObserver | null = null;
let pmScriptBindGeneration = 0;
let lastOpenModalAt = 0;

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

    // 防止输入框输入时触发酒馆全局快捷键/热键导致失去焦点 (防止 focus 被夺走)
    $pm(`#${MODAL_ID}`)
      .off('keydown keyup keypress', 'input, textarea, select')
      .on('keydown keyup keypress', 'input, textarea, select', function (e) {
        if (e.key === 'Escape') return; // 允许 Escape 键冒泡，以便支持按 Esc 关闭模态框/弹窗
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
  const el = getVueMountEl();
  if (!el) {
    console.error('[预设备忘录] 未找到挂载点 #preset-memo-vue-root');
    return false;
  }
  app?.unmount();
  app = null;
  app = createApp(App, { onClose: closeModal });
  app.use(createPinia());
  app.mount(el);
  return true;
}

export async function closeModal() {
  blurWithin(getTavernDocument().getElementById(MODAL_ID));
  suppressStaleTavernAutocomplete();
  cleanupPmOnClose();
  unlockTavernBodyScroll();
  $pm(`#${MODAL_ID}`).removeClass('is-open').css('display', 'none');
  app?.unmount();
  app = null;
}

export function openModal() {
  const $modal = $pm(`#${MODAL_ID}`);
  // 面板已打开且 Vue 仍挂载时直接返回，避免重复 mountVue 抢焦点
  if ($modal.hasClass('is-open') && app) return;

  const now = Date.now();
  if (now - lastOpenModalAt < 350 && $modal.hasClass('is-open')) return;
  lastOpenModalAt = now;

  ensureModalDom();
  ensurePmEntryPoints();

  if ($modal.length === 0) {
    console.error('[预设备忘录] 模态框未创建');
    return;
  }

  $modal.addClass('is-open').css('display', 'flex');
  lockTavernBodyScroll();

  if (!mountVue()) {
    unlockTavernBodyScroll();
    $modal.removeClass('is-open').css('display', 'none');
    toastr.error('预设备忘录界面加载失败，请刷新酒馆后重试');
    return;
  }
  requestAnimationFrame(() => restampPmModalAutocomplete());
  setupPmModalInputGuard();
}

function handleOpenModalEvent(e: Event) {
  e.preventDefault();
  e.stopPropagation();
  hideExtensionsMenu();
  openModal();
}

const pmOpenModalHandlerKey = '__presetMemoOpenHandler';

function bindOpenModalTrigger(el: HTMLElement | undefined | null) {
  if (!el) return;
  const tagged = el as HTMLElement & { [pmOpenModalHandlerKey]?: (e: Event) => void };
  const prev = tagged[pmOpenModalHandlerKey];
  if (prev) el.removeEventListener('click', prev);
  const handler = (e: Event) => handleOpenModalEvent(e);
  tagged[pmOpenModalHandlerKey] = handler;
  el.onclick = null;
  el.addEventListener('click', handler);
}

function getExtensionsMenu(): JQuery {
  const $menu = $pm('#extensionsMenu');
  return $menu.length ? $menu : $pm('#extensions_menu');
}

function ensurePmFooterButton() {
  const $footer = $pm('.completion_prompt_manager_footer');
  if (!$footer.length || $pm(`#${BUTTON_ID}`).length > 0) return;
  const $btn = getTavernJQuery()(
    `<div id="${BUTTON_ID}" class="menu_button interactable" title="预设备忘录" tabindex="0" role="button"><i class="fa-solid fa-book-bookmark"></i></div>`,
  );
  bindOpenModalTrigger($btn.get(0) ?? null);
  $footer.append($btn);
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
  bindOpenModalTrigger($btn.get(0) ?? null);
}

function removePmLegacyEntryPoints() {
  $pm(`#${EXT_MENU_BUTTON_ID}`).remove();
  $pm(`#${WAND_CONTAINER_ID}`).remove();
  $pm(`#${LEGACY_MOBILE_LAUNCHER_ID}`).remove();
}

function ensurePmEntryPoints() {
  ensurePmFooterButton();
  ensureExtensionsMenuListItem();
}

function attachPmExtensionsMenuObserver() {
  const doc = getTavernDocument();
  const menu = doc.querySelector('#extensionsMenu, #extensions_menu');
  if (!menu) return false;
  ensureExtensionsMenuListItem();
  if (!pmMenuObserver) {
    pmMenuObserver = new MutationObserver(() => ensureExtensionsMenuListItem());
    pmMenuObserver.observe(menu, { childList: true });
  }
  if (pmMenuBodyObserver) {
    pmMenuBodyObserver.disconnect();
    pmMenuBodyObserver = null;
  }
  return true;
}

function watchPmEntryPoints() {
  ensurePmEntryPoints();
  attachPmExtensionsMenuObserver();
  if (pmMenuBodyObserver) return;
  const doc = getTavernDocument();
  pmMenuBodyObserver = new MutationObserver(() => {
    attachPmExtensionsMenuObserver();
    ensurePmFooterButton();
  });
  pmMenuBodyObserver.observe(doc.body, { childList: true, subtree: true });
}

function disconnectPmEntryObservers() {
  pmMenuObserver?.disconnect();
  pmMenuObserver = null;
  pmMenuBodyObserver?.disconnect();
  pmMenuBodyObserver = null;
}

function setupExtensionsMenuDelegation() {
  getTavernJQuery()(getTavernDocument())
    .off('click.presetMemoExt touchend.presetMemoExt', `#${EXT_MENU_BUTTON_ID}`)
    .on('click.presetMemoExt touchend.presetMemoExt', `#${EXT_MENU_BUTTON_ID}`, e => {
      const raw = (e as JQuery.TriggeredEvent).originalEvent;
      if (raw) handleOpenModalEvent(raw);
      else handleOpenModalEvent(e as unknown as Event);
    });
}

function cleanupUI() {
  cleanupPmOnClose();
  unlockTavernBodyScroll();
  removePmLegacyEntryPoints();
  disconnectPmEntryObservers();
  $pm(`#${BUTTON_ID}`).remove();
  $pm(`#${MODAL_ID}`).remove();
  $pm(`#${STYLE_ID}`).remove();
  getTavernJQuery()(getTavernDocument()).off('click.presetMemoExt touchend.presetMemoExt', `#${EXT_MENU_BUTTON_ID}`);
  app?.unmount();
  app = null;
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

  const vars = readScriptVarsRaw();
  if (Array.isArray(vars.memo) && (vars.memo as unknown[]).length > 0) {
    syncGlobalBackup(vars);
  }
}

$(() => {
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

  pmScriptBindGeneration = Date.now();
  try {
    rememberScriptId(getScriptId());
  } catch {
    /* ignore */
  }
  setupExtensionsMenuDelegation();
  try {
    initUI();
  } catch (e) {
    console.error('[预设备忘录] initUI 失败:', e);
  }
});

$(window).on('pagehide', () => {
  cleanupUI();
  const singletonWindow = window as PmSingletonWindow;
  if (singletonWindow[PM_SINGLETON_KEY] === cleanupUI) {
    delete singletonWindow[PM_SINGLETON_KEY];
  }
});
