import { z } from 'zod';
import panelHtml from './panel.html?raw';
import cssContent from './style.scss?raw';

// 定义备忘录条目的数据结构
const MemoEntrySchema = z.object({
    id: z.string(),
    name: z.string(),
    content: z.string(),
    enabled: z.boolean(),
    role: z.enum(['system', 'user', 'assistant']),
    position: z.object({ type: z.literal('relative') }),
    folder: z.string().optional()
});

const MemoSchema = z.array(MemoEntrySchema);

type MemoEntry = z.infer<typeof MemoEntrySchema>;

// 获取和保存备忘录数据
function getMemoData(): MemoEntry[] {
    const rawData = getVariables({ type: 'script', script_id: getScriptId() });
    const parsed = MemoSchema.safeParse(rawData?.memo || []);
    if (parsed.success) {
        return parsed.data;
    }
    return [];
}

function saveMemoData(memo: MemoEntry[]) {
    const currentVars = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    replaceVariables({ ...currentVars, memo }, { type: 'script', script_id: getScriptId() });
}

function genMemoId(): string {
    return 'memo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11);
}

// 公共导入函数: 检测同名重复并询问处理方式
async function importEntriesToMemo(
    entries: { name: string; content: string; role: 'system' | 'user' | 'assistant' }[],
    targetFolder: string,
) {
    const memo = getMemoData();
    const folders = getFolders();
    if (!folders.includes(targetFolder)) {
        folders.push(targetFolder);
        saveFolders(folders);
    }

    // 目标文件夹中已有条目的 name -> entry 引用 (取最后一个同名)
    const existingByName = new Map<string, MemoEntry>();
    memo.forEach(e => {
        if ((e.folder || '默认') === targetFolder) {
            existingByName.set(e.name, e);
        }
    });
    const duplicates = entries.filter(e => existingByName.has(e.name));

    let mode: 'overwrite' | 'skip' | 'add' = 'add';
    if (duplicates.length > 0) {
        const choice = await pmChoice<'overwrite' | 'skip' | 'add'>(
            `检测到 ${duplicates.length} 个同名条目 (已存在于 "${targetFolder}" 中):\n` +
                duplicates
                    .slice(0, 5)
                    .map(d => '• ' + d.name)
                    .join('\n') +
                (duplicates.length > 5 ? `\n…还有 ${duplicates.length - 5} 个` : '') +
                '\n\n如何处理这些重复条目?',
            [
                { label: '覆盖', value: 'overwrite', variant: 'primary' },
                { label: '跳过', value: 'skip' },
                { label: '全部新增', value: 'add', variant: 'danger' },
            ],
        );
        if (choice === null) return; // 用户取消
        mode = choice;
    }

    let added = 0;
    let updated = 0;
    let skipped = 0;
    entries.forEach(entry => {
        const exist = existingByName.get(entry.name);
        if (exist) {
            if (mode === 'overwrite') {
                exist.content = entry.content;
                exist.role = entry.role;
                updated++;
            } else if (mode === 'skip') {
                skipped++;
            } else {
                memo.push({
                    id: genMemoId(),
                    name: entry.name,
                    content: entry.content,
                    enabled: true,
                    role: entry.role,
                    position: { type: 'relative' },
                    folder: targetFolder,
                });
                added++;
            }
        } else {
            memo.push({
                id: genMemoId(),
                name: entry.name,
                content: entry.content,
                enabled: true,
                role: entry.role,
                position: { type: 'relative' },
                folder: targetFolder,
            });
            added++;
        }
    });

    saveMemoData(memo);
    const parts = [];
    if (added) parts.push(`新增 ${added}`);
    if (updated) parts.push(`覆盖 ${updated}`);
    if (skipped) parts.push(`跳过 ${skipped}`);
    toastr.success(`导入完成: ${parts.join(' / ')} (目标文件夹: "${targetFolder}")`);
    currentFolder = targetFolder;
    switchTab('tab-memo');
    renderFoldersBar();
    renderMemoList();
}

// 获取和保存文件夹数据
function getFolders(): string[] {
    const rawData = getVariables({ type: 'script', script_id: getScriptId() });
    const folders = rawData?.folders || [];
    if (!folders.includes('默认')) {
        folders.unshift('默认');
    }
    return folders;
}

function saveFolders(folders: string[]) {
    const currentVars = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    replaceVariables({ ...currentVars, folders }, { type: 'script', script_id: getScriptId() });
}

let currentFolder = '默认';
// 当前备忘录搜索关键字 (按 标题 / 内容 模糊匹配)
let searchKeyword = '';
// 当前折叠展开状态: key = entry.id, value = 是否展开
const expandedMemoIds = new Set<string>();
type PresetPromptDraft = {
    id?: string;
    name: string;
    content: string;
    enabled: boolean;
    role: 'system' | 'user' | 'assistant';
    position: { type: 'relative' };
    __draftFromMemo?: boolean;
};
let insertDraftPrompts: PresetPromptDraft[] | null = null;
let insertDraftDirty = false;

// HTML 转义工具, 避免用户内容被当作 HTML 解析造成 XSS / DOM 破坏
function esc(s: unknown): string {
    if (s === undefined || s === null) return '';
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function toPresetDraftFromMemo(entry: MemoEntry): PresetPromptDraft {
    return {
        id: entry.id,
        name: entry.name || '未命名条目',
        content: entry.content || '',
        enabled: entry.enabled ?? true,
        role: entry.role || 'system',
        position: { type: 'relative' },
        __draftFromMemo: true,
    };
}

function toPresetDraft(prompt: any): PresetPromptDraft {
    return {
        id: prompt?.id,
        name: prompt?.name || prompt?.id || '未命名条目',
        content: prompt?.content || '',
        enabled: prompt?.enabled ?? true,
        role: (prompt?.role || 'system') as 'system' | 'user' | 'assistant',
        position: { type: 'relative' },
    };
}

function collectCheckedMemoEntries(): MemoEntry[] {
    const allMemo = getMemoData();
    const selectedIds: string[] = [];
    $('#preset-memo-list .memo-entry-checkbox:checked').each(function () {
        const id = $(this).attr('data-id');
        if (id) selectedIds.push(id);
    });
    return selectedIds
        .map(id => allMemo.find(e => e.id === id))
        .filter((e): e is MemoEntry => !!e);
}

function refreshInsertSaveButton() {
    const $btn = $('#preset-memo-insert-save-btn');
    const inInsertTab = $('.pm-tab-btn[data-tab="tab-insert"]').hasClass('active');
    if (!inInsertTab) {
        $btn.removeClass('is-visible is-disabled').hide();
        return;
    }
    $btn.addClass('is-visible').show();
    if (!insertDraftDirty || !insertDraftPrompts) {
        $btn.addClass('is-disabled');
    } else {
        $btn.removeClass('is-disabled');
    }
}

function resetInsertDraftState() {
    insertDraftPrompts = null;
    insertDraftDirty = false;
    refreshInsertSaveButton();
}

// 面板内自定义弹窗 (替代浏览器原生 prompt / confirm)
function pmDialog(opts: { message: string; defaultValue?: string; mode: 'confirm' | 'prompt' }): Promise<string | null> {
    return new Promise(resolve => {
        const $modal = $(`#${MODAL_ID}`);
        if ($modal.length === 0) {
            // 模态框还没挂载, 退化为原生方法
            if (opts.mode === 'prompt') {
                resolve(prompt(opts.message, opts.defaultValue ?? ''));
            } else {
                resolve(confirm(opts.message) ? 'ok' : null);
            }
            return;
        }

        const isPrompt = opts.mode === 'prompt';
        const $popup = $(`
            <div class="pm-popup-overlay">
                <div class="pm-popup">
                    <div class="pm-popup-message"></div>
                    ${isPrompt ? '<input type="text" class="text_pole pm-popup-input">' : ''}
                    <div class="pm-popup-actions">
                        <div class="menu_button interactable pm-popup-cancel">取消</div>
                        <div class="menu_button interactable pm-popup-confirm">确定</div>
                    </div>
                </div>
            </div>
        `);
        $popup.find('.pm-popup-message').text(opts.message);
        if (isPrompt) {
            $popup.find<HTMLInputElement>('.pm-popup-input').val(opts.defaultValue ?? '');
        }
        // 继承当前主题
        if ($('#preset-memo-modal-content').hasClass('pm-light-mode')) {
            $popup.addClass('pm-light-mode');
        }
        $modal.append($popup);

        const close = (v: string | null) => {
            $popup.remove();
            resolve(v);
        };

        $popup.find('.pm-popup-cancel').on('click', () => close(null));
        $popup.find('.pm-popup-confirm').on('click', () => {
            if (isPrompt) {
                close(($popup.find('.pm-popup-input').val() as string) ?? '');
            } else {
                close('ok');
            }
        });

        // 点击遮罩 (popup 之外的区域) 关闭
        $popup.on('click', function (e) {
            if (e.target === this) close(null);
        });

        // 键盘快捷键
        $popup.on('keydown', function (e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close(null);
            }
            if (e.key === 'Enter' && isPrompt) {
                e.stopPropagation();
                close(($popup.find('.pm-popup-input').val() as string) ?? '');
            }
        });

        if (isPrompt) {
            setTimeout(() => {
                $popup.find<HTMLInputElement>('.pm-popup-input').trigger('focus').trigger('select');
            }, 30);
        }
    });
}

function pmPrompt(message: string, defaultValue?: string): Promise<string | null> {
    return pmDialog({ message, defaultValue, mode: 'prompt' });
}

function pmConfirm(message: string): Promise<boolean> {
    return pmDialog({ message, mode: 'confirm' }).then(v => v !== null);
}

// 多按钮选择弹窗 (取消 = null)
function pmChoice<T extends string>(
    message: string,
    options: { label: string; value: T; variant?: 'primary' | 'danger' | 'default' }[],
): Promise<T | null> {
    return new Promise(resolve => {
        const $modal = $(`#${MODAL_ID}`);
        if ($modal.length === 0) {
            resolve(null);
            return;
        }

        const $popup = $(`
            <div class="pm-popup-overlay">
                <div class="pm-popup">
                    <div class="pm-popup-message"></div>
                    <div class="pm-popup-actions"></div>
                </div>
            </div>
        `);
        $popup.find('.pm-popup-message').text(message);
        const $actions = $popup.find('.pm-popup-actions');

        const $cancel = $('<div class="menu_button interactable pm-popup-cancel">取消</div>');
        $cancel.on('click', () => {
            $popup.remove();
            resolve(null);
        });
        $actions.append($cancel);

        options.forEach(opt => {
            const $btn = $('<div class="menu_button interactable"></div>').text(opt.label);
            if (opt.variant === 'primary') $btn.addClass('pm-popup-confirm');
            else if (opt.variant === 'danger') $btn.addClass('pm-popup-danger');
            $btn.on('click', () => {
                $popup.remove();
                resolve(opt.value);
            });
            $actions.append($btn);
        });

        $popup.on('click', function (e) {
            if (e.target === this) {
                $popup.remove();
                resolve(null);
            }
        });
        $popup.on('keydown', function (e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                $popup.remove();
                resolve(null);
            }
        });

        if ($('#preset-memo-modal-content').hasClass('pm-light-mode')) {
            $popup.addClass('pm-light-mode');
        }
        $modal.append($popup);
    });
}

// 快捷插入按钮: 在编辑区点击 -> 插入对应文本到光标位置
type Shortcut = { label: string; insert: string };

const DEFAULT_SHORTCUTS: Shortcut[] = [
    { label: '<user>', insert: '<user>' },
    { label: '<char>', insert: '<char>' },
    { label: '{{user}}', insert: '{{user}}' },
    { label: '{{char}}', insert: '{{char}}' },
    { label: 'getvar', insert: '{{getvar::}}' },
    { label: 'setvar', insert: '{{setvar::name::value}}' },
    { label: 'random', insert: '{{random::A::B}}' },
    { label: 'roll', insert: '{{roll:1d20}}' },
];

function getShortcuts(): Shortcut[] {
    const vars = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    const raw = vars.shortcuts;
    if (Array.isArray(raw)) {
        const cleaned = raw
            .filter((it: any) => it && typeof it.label === 'string' && typeof it.insert === 'string')
            .map((it: any) => ({ label: String(it.label), insert: String(it.insert) }));
        return cleaned;
    }
    // 首次使用: 返回默认值
    return DEFAULT_SHORTCUTS.slice();
}

function saveShortcuts(shortcuts: Shortcut[]) {
    const currentVars = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    replaceVariables({ ...currentVars, shortcuts }, { type: 'script', script_id: getScriptId() });
}

// 把文本插入到 textarea 当前光标位置, 并触发 input/change 事件 (用于自动保存)
function insertAtCursor(el: HTMLTextAreaElement | HTMLInputElement, text: string) {
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    el.value = el.value.slice(0, start) + text + el.value.slice(end);
    // 光标移到插入文本之后
    const cursor = start + text.length;
    try {
        el.setSelectionRange(cursor, cursor);
    } catch {
        /* input 类型可能不支持 */
    }
    el.focus();
    $(el).trigger('input').trigger('change');
}

// 文件夹元数据 (置顶等)
type FolderMeta = { pinned?: boolean };
function getFolderMeta(): Record<string, FolderMeta> {
    const vars = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    const meta = vars.folderMeta;
    if (!meta || typeof meta !== 'object') return {};
    return meta as Record<string, FolderMeta>;
}

function saveFolderMeta(meta: Record<string, FolderMeta>) {
    const currentVars = getVariables({ type: 'script', script_id: getScriptId() }) || {};
    replaceVariables({ ...currentVars, folderMeta: meta }, { type: 'script', script_id: getScriptId() });
}

// 用 SillyTavern 的 substituteParamsExtended 渲染酒馆内置宏
async function renderMacros(text: string): Promise<string> {
    try {
        const fn = (SillyTavern as any)?.substituteParamsExtended;
        if (typeof fn === 'function') {
            const result = await fn.call(SillyTavern, text, {});
            if (typeof result === 'string') return result;
        }
    } catch (e) {
        console.warn('substituteParamsExtended 调用失败, 回退到本地实现', e);
    }
    // 兜底: 手动渲染常见宏
    const name1: string = (SillyTavern as any)?.name1 || 'User';
    const name2: string = (SillyTavern as any)?.name2 || 'Character';
    let out = text
        .replace(/\{\{user\}\}/gi, name1)
        .replace(/\{\{char\}\}/gi, name2)
        .replace(/<user>/gi, name1)
        .replace(/<char>/gi, name2);
    try {
        const chatVars = (getVariables({ type: 'chat' }) || {}) as Record<string, any>;
        out = out.replace(/\{\{getvar::([^}]+)\}\}/g, (_, name: string) => String(chatVars[name.trim()] ?? ''));
    } catch {
        /* ignore */
    }
    out = out.replace(/\{\{setvar::([^:]+)::([^}]*)\}\}/g, '');
    return out;
}

// 宏渲染预览弹窗
async function showMacroPreview(title: string, content: string) {
    const $modal = $(`#${MODAL_ID}`);
    if ($modal.length === 0) return;

    const $popup = $(`
        <div class="pm-popup-overlay">
            <div class="pm-popup pm-popup-large">
                <div class="pm-popup-message">
                    <strong>预览渲染:</strong> <span class="pm-preview-title"></span>
                </div>
                <div class="pm-preview-grid">
                    <div class="pm-preview-pane">
                        <div class="pm-preview-label">原始内容</div>
                        <pre class="pm-preview-raw"></pre>
                    </div>
                    <div class="pm-preview-pane">
                        <div class="pm-preview-label">渲染结果 (含自定义宏)</div>
                        <pre class="pm-preview-rendered"><i class="fa-solid fa-spinner fa-spin"></i> 渲染中…</pre>
                    </div>
                </div>
                <div class="pm-popup-actions">
                    <div class="menu_button interactable pm-popup-cancel">关闭</div>
                </div>
            </div>
        </div>
    `);
    $popup.find('.pm-preview-title').text(title);
    $popup.find('.pm-preview-raw').text(content);
    if ($('#preset-memo-modal-content').hasClass('pm-light-mode')) $popup.addClass('pm-light-mode');
    $modal.append($popup);

    const close = () => $popup.remove();
    $popup.find('.pm-popup-cancel').on('click', close);
    $popup.on('click', function (e) {
        if (e.target === this) close();
    });
    $popup.on('keydown', e => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    });

    try {
        const rendered = await renderMacros(content);
        $popup.find('.pm-preview-rendered').text(rendered);
    } catch (e) {
        console.error(e);
        $popup.find('.pm-preview-rendered').text('渲染失败: ' + String((e as Error)?.message ?? e));
    }
}

// 快捷插入管理弹窗
function openShortcutsEditor(onSaved?: () => void) {
    const $modal = $(`#${MODAL_ID}`);
    if ($modal.length === 0) return;
    const shortcuts = getShortcuts();

    const $popup = $(`
        <div class="pm-popup-overlay">
            <div class="pm-popup pm-popup-large">
                <div class="pm-popup-message">
                    <strong><i class="fa-solid fa-keyboard"></i> 快捷插入管理</strong>
                    <div class="pm-popup-subtitle">
                        编辑下方按钮: 编辑备忘录时点击按钮会把"插入文本"放到光标位置. "按钮标题"是展示在按钮上的文字.
                    </div>
                </div>
                <div class="pm-shortcuts-list"></div>
                <div class="pm-macros-actions" style="justify-content: space-between;">
                    <div class="menu_button interactable pm-btn pm-shortcuts-add"><i class="fa-solid fa-plus"></i> 新增一行</div>
                    <div class="menu_button interactable pm-btn pm-shortcuts-reset" title="恢复默认快捷键"><i class="fa-solid fa-rotate-left"></i> 恢复默认</div>
                </div>
                <div class="pm-popup-actions">
                    <div class="menu_button interactable pm-popup-cancel">取消</div>
                    <div class="menu_button interactable pm-popup-confirm pm-shortcuts-save">保存</div>
                </div>
            </div>
        </div>
    `);
    const $list = $popup.find('.pm-shortcuts-list');

    const addRow = (label = '', insert = '') => {
        const $row = $(`
            <div class="pm-shortcut-row">
                <i class="fa-solid fa-grip-vertical pm-shortcut-handle" title="拖拽排序"></i>
                <input type="text" class="text_pole pm-shortcut-label" placeholder="按钮标题">
                <span class="pm-macro-arrow">→</span>
                <input type="text" class="text_pole pm-shortcut-insert" placeholder="插入文本">
                <div class="menu_button fa-solid fa-trash text-red-500 pm-shortcut-del interactable" title="删除"></div>
            </div>
        `);
        $row.find<HTMLInputElement>('.pm-shortcut-label').val(label);
        $row.find<HTMLInputElement>('.pm-shortcut-insert').val(insert);
        $row.find('.pm-shortcut-del').on('click', () => $row.remove());
        $list.append($row);
    };

    if (shortcuts.length === 0) {
        DEFAULT_SHORTCUTS.forEach(s => addRow(s.label, s.insert));
    } else {
        shortcuts.forEach(s => addRow(s.label, s.insert));
    }

    $popup.find('.pm-shortcuts-add').on('click', () => addRow());

    $popup.find('.pm-shortcuts-reset').on('click', async () => {
        if (await pmConfirm('确定要恢复为默认快捷键吗?\n当前编辑的内容将丢失.')) {
            $list.empty();
            DEFAULT_SHORTCUTS.forEach(s => addRow(s.label, s.insert));
        }
    });

    if ($('#preset-memo-modal-content').hasClass('pm-light-mode')) $popup.addClass('pm-light-mode');
    $modal.append($popup);

    // 拖拽排序
    const $listEl: any = $list;
    if (typeof $listEl.sortable === 'function') {
        $listEl.sortable({
            handle: '.pm-shortcut-handle',
            items: '> .pm-shortcut-row',
            placeholder: 'pm-shortcut-placeholder',
            forcePlaceholderSize: true,
            tolerance: 'pointer',
        });
    }

    const close = () => $popup.remove();
    $popup.find('.pm-popup-cancel').on('click', close);
    $popup.on('click', function (e) {
        if (e.target === this) close();
    });
    $popup.on('keydown', e => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    });

    $popup.find('.pm-shortcuts-save').on('click', () => {
        const newShortcuts: Shortcut[] = [];
        $list.find('.pm-shortcut-row').each(function () {
            const label = String($(this).find('.pm-shortcut-label').val() ?? '').trim();
            const insert = String($(this).find('.pm-shortcut-insert').val() ?? '');
            if (!label && !insert) return; // 空行跳过
            newShortcuts.push({ label: label || insert, insert });
        });
        saveShortcuts(newShortcuts);
        toastr.success(`已保存 ${newShortcuts.length} 个快捷键`);
        close();
        onSaved && onSaved();
    });
}

// UI 挂载与卸载逻辑
const BUTTON_ID = 'preset-memo-btn';
const MODAL_ID = 'preset-memo-modal';

function initUI() {
    // 0. 注入样式到酒馆主窗口
    if ($('#preset-memo-style').length === 0) {
        $('head').append(`<style id="preset-memo-style">${cssContent}</style>`);
    }

    // 1. 注入入口按钮
    const $footer = $('.completion_prompt_manager_footer');
    if ($footer.length && $(`#${BUTTON_ID}`).length === 0) {
        const $btn = $(`<div id="${BUTTON_ID}" class="menu_button fa-solid fa-book-bookmark interactable" title="预设备忘录" tabindex="0" role="button"></div>`);
        $btn.on('click', openModal);
        $footer.append($btn);
    }

    // 2. 注入模态框 HTML
    if ($(`#${MODAL_ID}`).length === 0) {
        $('body').append(panelHtml);
        
        // 绑定模态框关闭事件
        $('#preset-memo-close-btn').off('click').on('click', closeModal);
        // 点击遮罩层关闭 (需求5)
        $('#preset-memo-modal-overlay').off('click').on('click', closeModal);
        $('#preset-memo-modal-content').off('click').on('click', (e) => e.stopPropagation());
        
        // 绑定 FAB 悬浮球事件
        const $fabContainer = $('#pm-fab-container');
        const $fabToggle = $('#pm-fab-toggle');
        const $fabMenu = $('.pm-fab-menu');
        
        // 点击切换展开/折叠
        $fabToggle.off('click').on('click', function(e) {
            // 如果是在拖拽结束时触发的 click，则忽略
            if ($(this).data('is-dragging')) return;
            $(this).toggleClass('is-open');
            $fabMenu.toggleClass('is-open');
        });

        // 简单的拖拽实现 (兼容鼠标和触摸)
        let isDragging = false;
        let startX = 0, startY = 0;
        let initialLeft = 0, initialTop = 0;

        const onDragStart = (e: JQuery.TriggeredEvent | MouseEvent | TouchEvent) => {
            if ($(e.target).closest('.pm-fab-menu').length) return; // 不允许拖拽菜单区域
            if (window.innerWidth > 768) return; // 桌面端不启用拖拽
            
            const evt = (e as any).originalEvent || e;
            const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
            const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
            
            startX = clientX;
            startY = clientY;
            
            // 如果是 fixed 定位，需要使用 offset() 获取相对于文档的位置
            const isFixed = $fabContainer.css('position') === 'fixed';
            const pos = isFixed ? $fabContainer.offset()! : $fabContainer.position();
            
            // 如果是在移动端（fixed定位），我们需要考虑滚动偏移
            if (isFixed) {
                initialLeft = pos.left - $(window).scrollLeft()!;
                initialTop = pos.top - $(window).scrollTop()!;
            } else {
                initialLeft = pos.left;
                initialTop = pos.top;
            }
            
            isDragging = true;
            $fabToggle.data('is-dragging', false);
            
            $(document).on('mousemove.pmfab touchmove.pmfab', onDragMove);
            $(document).on('mouseup.pmfab touchend.pmfab', onDragEnd);
        };

        const onDragMove = (e: JQuery.TriggeredEvent | MouseEvent | TouchEvent) => {
            if (!isDragging) return;
            
            const evt = (e as any).originalEvent || e;
            const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
            const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
            
            const dx = clientX - startX;
            const dy = clientY - startY;
            
            // 如果移动距离超过 3px，认为是拖拽而不是点击
            if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                $fabToggle.data('is-dragging', true);
                $fabContainer.addClass('is-dragging');
                $fabMenu.removeClass('is-open'); // 拖拽时收起菜单
                $fabToggle.removeClass('is-open');
                
                // 确保不超出 modal-content 边界 (如果是 fixed 定位则使用 window 边界)
                const isFixed = $fabContainer.css('position') === 'fixed';
                const maxX = isFixed ? $(window).width()! - $fabContainer.outerWidth()! : $('#preset-memo-modal-content').innerWidth()! - $fabContainer.outerWidth()!;
                const maxY = isFixed ? $(window).height()! - $fabContainer.outerHeight()! : $('#preset-memo-modal-content').innerHeight()! - $fabContainer.outerHeight()!;
                
                let newLeft = initialLeft + dx;
                let newTop = initialTop + dy;
                
                newLeft = Math.max(0, Math.min(newLeft, maxX));
                newTop = Math.max(0, Math.min(newTop, maxY));
                
                $fabContainer.css({
                    left: newLeft + 'px',
                    top: newTop + 'px',
                    right: 'auto', // 覆盖默认的 right: 20px
                    bottom: 'auto' // 覆盖移动端默认的 bottom: 20px
                });
            }
        };

        const onDragEnd = () => {
            if (!isDragging) return;
            isDragging = false;
            $fabContainer.removeClass('is-dragging');
            $(document).off('.pmfab');
            
            // 延迟清除 dragging 标记，防止触发 click
            setTimeout(() => {
                $fabToggle.data('is-dragging', false);
            }, 50);
        };

        $fabToggle.on('mousedown touchstart', onDragStart);

        $('#preset-memo-insert-save-btn')
            .off('click')
            .on('click', async () => {
                if (!insertDraftPrompts || !insertDraftDirty) return;
                try {
                    await updatePresetWith('in_use', preset => {
                        preset.prompts = insertDraftPrompts!.map(p => ({
                            id: p.id,
                            name: p.name,
                            content: p.content,
                            enabled: p.enabled,
                            role: p.role,
                            position: { type: 'relative' as const },
                        }));
                        return preset;
                    });
                    toastr.success('已保存到当前预设');
                    insertDraftDirty = false; // 避免触发未保存提示
                    closeModal();
                } catch (error) {
                    console.error(error);
                    toastr.error('保存失败，请查看控制台');
                }
            });
        
        // 绑定主题切换事件
        $('#preset-memo-theme-btn').off('click').on('click', function() {
            const $content = $('#preset-memo-modal-content');
            $content.toggleClass('pm-light-mode');
            const isLight = $content.hasClass('pm-light-mode');
            localStorage.setItem('preset-memo-theme', isLight ? 'light' : 'dark');
            
            if (isLight) {
                $(this).removeClass('fa-sun').addClass('fa-moon');
            } else {
                $(this).removeClass('fa-moon').addClass('fa-sun');
            }
        });
        
        // 绑定 Tab 切换事件
        $('.pm-tab-btn').off('click').on('click', function() {
            const targetTab = $(this).data('tab');
            switchTab(targetTab);
        });
        
        // 绑定导入世界书按钮事件 (只绑定一次)
        $('#preset-memo-import-btn').off('click').on('click', async function () {
            const targetFolder = ($('#preset-memo-import-wb-folder').val() as string) || '默认';
            const selectedEntries: any[] = [];
            $('.wb-entry-checkbox:checked').each(function () {
                const $item = $(this).closest('.wb-entry-item');
                selectedEntries.push($item.data('entry'));
            });
            if (selectedEntries.length === 0) {
                toastr.warning('请先勾选要导入的条目');
                return;
            }
            await importEntriesToMemo(
                selectedEntries.map(entry => ({
                    name: entry.name || '未命名条目',
                    content: entry.content || '',
                    role: 'system' as const,
                })),
                targetFolder,
            );
        });

        // 绑定导入预设按钮事件 (只绑定一次)
        $('#preset-memo-import-preset-btn').off('click').on('click', async function () {
            const targetFolder = ($('#preset-memo-import-preset-folder').val() as string) || '默认';
            const selectedEntries: any[] = [];
            $('.preset-entry-checkbox:checked').each(function () {
                const $item = $(this).closest('.wb-entry-item');
                selectedEntries.push($item.data('entry'));
            });
            if (selectedEntries.length === 0) {
                toastr.warning('请先勾选要导入的条目');
                return;
            }
            await importEntriesToMemo(
                selectedEntries.map(entry => ({
                    name: entry.name || entry.id || '未命名条目',
                    content: entry.content || '',
                    role: (entry.role || 'system') as 'system' | 'user' | 'assistant',
                })),
                targetFolder,
            );
        });

        // 绑定新建文件夹按钮
        async function handleNewFolderClick(selectId: string) {
            const name = await pmPrompt('请输入新文件夹名称:');
            if (name && name.trim()) {
                const folderName = name.trim();
                const folders = getFolders();
                if (folders.includes(folderName)) {
                    toastr.warning('文件夹已存在');
                } else {
                    folders.push(folderName);
                    saveFolders(folders);
                    updateFolderSelects();
                    renderFoldersBar();
                }
                $(`#${selectId}`).val(folderName);
            }
        }
        $('#preset-memo-import-wb-new-folder-btn').off('click').on('click', () => handleNewFolderClick('preset-memo-import-wb-folder'));
        $('#preset-memo-import-preset-new-folder-btn').off('click').on('click', () => handleNewFolderClick('preset-memo-import-preset-folder'));

        // 收集当前列表中已勾选条目的 id
        const getSelectedMemoIds = (): string[] => {
            const ids: string[] = [];
            $('#preset-memo-list .memo-entry-checkbox:checked').each(function () {
                const id = $(this).attr('data-id');
                if (id) ids.push(id);
            });
            return ids;
        };

        // 绑定批量移动按钮事件
        $('#preset-memo-batch-move-select').off('change').on('change', function () {
            const targetFolder = $(this).val() as string;
            if (!targetFolder) return;

            const selectedIds = getSelectedMemoIds();
            if (selectedIds.length === 0) {
                toastr.warning('请先勾选要移动的条目');
                $(this).val('');
                return;
            }

            const memo = getMemoData();
            memo.forEach(e => {
                if (selectedIds.includes(e.id)) e.folder = targetFolder;
            });
            saveMemoData(memo);
            toastr.success(`已将 ${selectedIds.length} 个条目移动到 "${targetFolder}"`);
            $(this).val('');
            renderMemoList();
        });

        // 绑定批量删除按钮事件
        $('#preset-memo-batch-delete-btn').off('click').on('click', async function () {
            const selectedIds = getSelectedMemoIds();
            if (selectedIds.length === 0) {
                toastr.warning('请先勾选要删除的条目');
                return;
            }

            if (await pmConfirm(`确定要删除选中的 ${selectedIds.length} 个条目吗？\n此操作不可恢复！`)) {
                const memo = getMemoData();
                const newMemo = memo.filter(e => !selectedIds.includes(e.id));
                selectedIds.forEach(id => expandedMemoIds.delete(id));
                saveMemoData(newMemo);
                toastr.success(`已删除 ${selectedIds.length} 个条目`);
                renderMemoList();
            }
        });

        // 全选 / 反选 (备忘录管理)
        $('#preset-memo-select-all').off('change').on('change', function () {
            const checked = $(this).prop('checked');
            $('#preset-memo-list .memo-entry-checkbox').prop('checked', checked);
            // indeterminate 状态切回正常
            $(this).prop('indeterminate', false);
        });

        // 搜索框
        $('#preset-memo-search').off('input').on('input', function () {
            searchKeyword = String($(this).val() ?? '');
            $('#preset-memo-search-clear').toggle(searchKeyword.length > 0);
            renderMemoList();
        });
        $('#preset-memo-search-clear').off('click').on('click', function () {
            searchKeyword = '';
            $('#preset-memo-search').val('');
            $(this).hide();
            renderMemoList();
        }).hide();

        // 全选 / 反选 (三个导入/导出 Tab)
        const bindSelectAll = (masterId: string, childSel: string, onChange?: () => void) => {
            $(`#${masterId}`).off('change').on('change', function () {
                const checked = $(this).prop('checked');
                $(childSel).prop('checked', checked);
                $(this).prop('indeterminate', false);
                onChange && onChange();
            });
        };
        bindSelectAll('preset-memo-import-wb-select-all', '.wb-entry-checkbox', updateImportCount);
        bindSelectAll('preset-memo-import-preset-select-all', '.preset-entry-checkbox', updateImportPresetCount);
        bindSelectAll('preset-memo-export-select-all', '.export-entry-checkbox', updateExportCount);

        // 导出全部为 JSON 文件
        $('#preset-memo-export-json-btn').off('click').on('click', function () {
            const data = {
                version: 1,
                exportedAt: new Date().toISOString(),
                folders: getFolders(),
                folderMeta: getFolderMeta(),
                memo: getMemoData(),
                shortcuts: getShortcuts(),
            };
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const now = new Date();
            const pad = (n: number) => String(n).padStart(2, '0');
            a.download = `预设备忘录_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            toastr.success('已导出 JSON 文件');
        });

        // 从 JSON 文件导入
        $('#preset-memo-import-json-btn').off('click').on('click', function () {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'application/json,.json';
            input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    const memoParsed = MemoSchema.safeParse(data.memo || []);
                    const importedFolders: string[] = Array.isArray(data.folders)
                        ? data.folders.filter((f: any) => typeof f === 'string')
                        : [];
                    if (!memoParsed.success) {
                        toastr.error('JSON 中的 memo 字段格式无效');
                        console.error(memoParsed.error);
                        return;
                    }
                    const importedMemo = memoParsed.data;
                    const choice = await pmChoice<'merge' | 'replace'>(
                        `即将导入: ${importedMemo.length} 个条目, ${importedFolders.length} 个文件夹\n\n采用哪种方式?\n- 合并: 保留已有数据, 仅追加新条目\n- 覆盖: 完全替换当前的所有备忘录数据`,
                        [
                            { label: '合并', value: 'merge', variant: 'primary' },
                            { label: '覆盖 (危险)', value: 'replace', variant: 'danger' },
                        ],
                    );
                    if (choice === null) return;

                    if (choice === 'replace') {
                        saveFolders(importedFolders.length > 0 ? importedFolders : ['默认']);
                        saveMemoData(importedMemo);
                        if (data.folderMeta && typeof data.folderMeta === 'object') {
                            saveFolderMeta(data.folderMeta);
                        }
                        if (Array.isArray(data.shortcuts)) {
                            const cleaned: Shortcut[] = data.shortcuts
                                .filter((it: any) => it && typeof it.label === 'string' && typeof it.insert === 'string')
                                .map((it: any) => ({ label: String(it.label), insert: String(it.insert) }));
                            saveShortcuts(cleaned);
                        } else if (data.customMacros && typeof data.customMacros === 'object') {
                            // 兼容旧版导出: 把旧字典转换为快捷插入
                            const converted: Shortcut[] = [];
                            Object.entries(data.customMacros).forEach(([k, v]) => {
                                if (typeof k === 'string' && typeof v === 'string') {
                                    converted.push({ label: `{{${k}}}`, insert: `{{${k}}}` });
                                }
                            });
                            if (converted.length) saveShortcuts(converted);
                        }
                    } else {
                        // 合并: folders 并集 (顺序保留)
                        const existingFolders = getFolders();
                        const mergedFolders = [...existingFolders];
                        importedFolders.forEach(f => {
                            if (!mergedFolders.includes(f)) mergedFolders.push(f);
                        });
                        saveFolders(mergedFolders);

                        // memo 合并: 已有 id 则跳过 (避免完全相同的对象被加进来), 同名条目仍会被加(用户应该用世界书/预设导入做去重)
                        const existingMemo = getMemoData();
                        const existingIds = new Set(existingMemo.map(e => e.id));
                        importedMemo.forEach(e => {
                            if (!existingIds.has(e.id)) {
                                // 若文件夹不存在则归到"默认"
                                if (!mergedFolders.includes(e.folder || '默认')) {
                                    e.folder = '默认';
                                }
                                existingMemo.push(e);
                            }
                        });
                        saveMemoData(existingMemo);
                    }
                    toastr.success('JSON 导入完成');
                    renderFoldersBar();
                    updateFolderSelects();
                    renderMemoList();
                } catch (e) {
                    console.error('JSON 导入失败:', e);
                    toastr.error('JSON 解析失败, 请检查文件格式');
                }
            };
            input.click();
        });

        // 快捷插入管理 (保存后重新渲染备忘录列表, 让快捷按钮条立即刷新)
        $('#preset-memo-macros-btn').off('click').on('click', function () {
            openShortcutsEditor(() => renderMemoList());
        });

        // 绑定新建条目按钮事件
        $('#preset-memo-new-entry-btn').off('click').on('click', function () {
            const memo = getMemoData();
            const folders = getFolders();
            // 当前文件夹不存在时, 回退到"默认"
            const targetFolder = folders.includes(currentFolder) ? currentFolder : '默认';
            // 若用户正在搜索中, 先清空, 否则新建的条目可能被搜索过滤掉看不到
            if (searchKeyword) {
                searchKeyword = '';
                $('#preset-memo-search').val('');
                $('#preset-memo-search-clear').hide();
            }
            const newEntry: MemoEntry = {
                id: 'memo_' + Date.now() + '_' + Math.random().toString(36).substring(2, 11),
                name: '新条目',
                content: '',
                enabled: true,
                role: 'system',
                position: { type: 'relative' },
                folder: targetFolder,
            };
            memo.push(newEntry);
            // 新建的条目默认展开, 方便立即编辑
            expandedMemoIds.add(newEntry.id);
            saveMemoData(memo);
            toastr.success(`已在 "${targetFolder}" 文件夹新建条目`);
            renderMemoList();

            // 渲染完成后, 滚动到刚好可见 + 聚焦标题
            // 注意: 用 block: 'nearest' 而不是 'center', 否则移动端会把元素居中导致下方留出大块空白
            setTimeout(() => {
                const $newItem = $(`#preset-memo-list .memo-entry-item[data-id="${newEntry.id}"]`);
                if (!$newItem.length) return;
                $newItem[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                $newItem.find<HTMLInputElement>('.memo-entry-name').trigger('focus').trigger('select');
                // 移动端 focus 后软键盘弹出会收缩 viewport, 这时再矫正一次滚动位置
                setTimeout(() => {
                    if ($newItem[0]) $newItem[0].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }, 350);
            }, 50);
        });
    }
}

function cleanupUI() {
    $(`#${BUTTON_ID}`).remove();
    $(`#${MODAL_ID}`).remove();
    $('#preset-memo-style').remove();
}

// 模态框逻辑
function openModal() {
    console.log('Preset Memo: openModal triggered');
    try {
        const $modal = $(`#${MODAL_ID}`);
        if ($modal.length === 0) {
            console.error('Modal element not found!');
            return;
        }
        // 强制使用 flex 布局显示，避免 jQuery 动画带来的 display 属性冲突
        $modal.css('display', 'flex');
        
        // 恢复主题
        const theme = localStorage.getItem('preset-memo-theme');
        if (theme === 'light') {
            $('#preset-memo-modal-content').addClass('pm-light-mode');
            $('#preset-memo-theme-btn').removeClass('fa-sun').addClass('fa-moon');
        }
        
        // 每次打开重置搜索状态, 避免上次残留
        searchKeyword = '';
        resetInsertDraftState();
        $('#preset-memo-search').val('');
        $('#preset-memo-search-clear').hide();
        $('#preset-memo-select-all').prop('checked', false).prop('indeterminate', false);

        // 重置悬浮球位置的逻辑
        const resetFabPosition = () => {
            const $fabContainer = $('#pm-fab-container');
            const $fabToggle = $('#pm-fab-toggle');
            const $fabMenu = $('.pm-fab-menu');
            $fabContainer.css({
                left: '',
                top: '',
                right: '',
                bottom: ''
            });
            $fabToggle.removeClass('is-active');
            $fabMenu.removeClass('is-visible');
        };
        resetFabPosition();

        switchTab('tab-memo');
        renderFoldersBar();
        updateFolderSelects();
        renderMemoList();
    } catch (e) {
        console.error('Preset Memo Error:', e);
        toastr.error('打开备忘录失败，请查看控制台');
    }
}

async function closeModal() {
    if (insertDraftDirty) {
        const choice = await pmChoice<'save' | 'discard'>(
            '检测到您在 "插入到当前预设" 选项卡中有未保存的修改。\n\n是否保存这些修改并关闭？',
            [
                { label: '保存并关闭', value: 'save', variant: 'primary' },
                { label: '放弃修改', value: 'discard', variant: 'danger' }
            ]
        );
        if (choice === null) {
            return; // 中止关闭 (点击了自带的"取消"或按了Esc)
        }
        if (choice === 'save') {
            try {
                await updatePresetWith('in_use', preset => {
                    preset.prompts = insertDraftPrompts!.map(p => ({
                        id: p.id,
                        name: p.name,
                        content: p.content,
                        enabled: p.enabled,
                        role: p.role,
                        position: { type: 'relative' as const },
                    }));
                    return preset;
                });
                toastr.success('已保存到当前预设');
            } catch (error) {
                console.error(error);
                toastr.error('保存失败，请查看控制台');
                return; // 保存失败，中止关闭
            }
        }
    }

    resetInsertDraftState();
    $(`#${MODAL_ID}`).css('display', 'none');
    
    // 关闭面板时重置悬浮球状态和位置
    $('#pm-fab-container').css({ left: '', top: '', right: '', bottom: '' });
    $('#pm-fab-toggle').removeClass('is-active');
    $('.pm-fab-menu').removeClass('is-visible');
}

function switchTab(tabId: string) {
    $('.pm-tab-btn').removeClass('active');
    $(`.pm-tab-btn[data-tab="${tabId}"]`).addClass('active');
    
    $('.pm-tab-content').hide();
    $(`#${tabId}`).show();
    
    if (tabId === 'tab-import') {
        loadWorldbooks();
    } else if (tabId === 'tab-import-preset') {
        loadPresets();
    } else if (tabId === 'tab-insert') {
        renderInsertView();
    } else if (tabId === 'tab-export-wb') {
        renderExportView();
    }
    refreshInsertSaveButton();
}

// --- Tab 1: 备忘录管理 ---
function updateFolderSelects() {
    const folders = getFolders();
    const buildOpt = (val: string) => $('<option>').attr('value', val).text(val);

    // 批量移动下拉
    const $batchMove = $('#preset-memo-batch-move-select');
    $batchMove.empty().append('<option value="">批量移动到...</option>');
    folders.forEach(f => {
        if (f !== currentFolder) $batchMove.append(buildOpt(f));
    });

    // 导入到世界书文件夹
    const $wbSelect = $('#preset-memo-import-wb-folder');
    const wbVal = ($wbSelect.val() as string) || '默认';
    $wbSelect.empty();
    folders.forEach(f => $wbSelect.append(buildOpt(f)));
    $wbSelect.val(folders.includes(wbVal) ? wbVal : '默认');

    // 导入到预设文件夹
    const $presetSelect = $('#preset-memo-import-preset-folder');
    const presetVal = ($presetSelect.val() as string) || '默认';
    $presetSelect.empty();
    folders.forEach(f => $presetSelect.append(buildOpt(f)));
    $presetSelect.val(folders.includes(presetVal) ? presetVal : '默认');
}

// 计算排序后的文件夹列表: "默认" 始终最前 → 置顶项 → 其它项 (按存储顺序)
function getSortedFolders(): string[] {
    const folders = getFolders();
    const meta = getFolderMeta();
    const pinned: string[] = [];
    const normal: string[] = [];
    folders.forEach(f => {
        if (f === '默认') return; // 默认单独处理
        if (meta[f]?.pinned) pinned.push(f);
        else normal.push(f);
    });
    return ['默认', ...pinned, ...normal];
}

function renderFoldersBar() {
    const $bar = $('#preset-memo-folders-bar');
    $bar.empty();
    const sorted = getSortedFolders();
    const meta = getFolderMeta();

    sorted.forEach(folder => {
        const isDefault = folder === '默认';
        const isPinned = !!meta[folder]?.pinned;
        const $tab = $(`
            <div class="pm-folder-tab ${folder === currentFolder ? 'active' : ''} ${isPinned ? 'is-pinned' : ''}">
                <i class="fa-solid ${isPinned ? 'fa-thumbtack' : 'fa-folder'} folder-icon"></i>
                <span class="folder-name"></span>
                ${!isDefault ? `
                    <i class="fa-solid fa-thumbtack folder-pin ${isPinned ? 'is-pinned' : ''}" title="${isPinned ? '取消置顶' : '置顶'}"></i>
                    <i class="fa-solid fa-pen folder-edit" title="重命名文件夹"></i>
                    <i class="fa-solid fa-xmark folder-delete" title="删除文件夹"></i>
                ` : ''}
            </div>
        `);
        $tab.attr('data-folder', folder);
        $tab.find('.folder-name').text(folder);

        $tab.on('click', function (e) {
            if (
                $(e.target).hasClass('folder-delete') ||
                $(e.target).hasClass('folder-edit') ||
                $(e.target).hasClass('folder-pin')
            )
                return;
            currentFolder = folder;
            renderFoldersBar();
            updateFolderSelects();
            renderMemoList();
        });

        if (!isDefault) {
            // 置顶切换
            $tab.find('.folder-pin').on('click', function (e) {
                e.stopPropagation();
                const m = getFolderMeta();
                if (m[folder]?.pinned) {
                    delete m[folder];
                } else {
                    m[folder] = { ...(m[folder] || {}), pinned: true };
                }
                saveFolderMeta(m);
                renderFoldersBar();
                toastr.success(m[folder]?.pinned ? '已置顶' : '已取消置顶');
            });

            $tab.find('.folder-edit').on('click', async function (e) {
                e.stopPropagation();
                const newName = await pmPrompt('请输入新的文件夹名称:', folder);
                if (newName && newName.trim() && newName.trim() !== folder) {
                    const trimmed = newName.trim();
                    const folders = getFolders();
                    if (folders.includes(trimmed)) {
                        toastr.warning('文件夹名已存在');
                        return;
                    }
                    const idx = folders.indexOf(folder);
                    if (idx !== -1) folders[idx] = trimmed;
                    saveFolders(folders);

                    // 元数据迁移
                    const m = getFolderMeta();
                    if (m[folder]) {
                        m[trimmed] = m[folder];
                        delete m[folder];
                        saveFolderMeta(m);
                    }

                    const memo = getMemoData();
                    memo.forEach(entry => {
                        if (entry.folder === folder) entry.folder = trimmed;
                    });
                    saveMemoData(memo);

                    if (currentFolder === folder) currentFolder = trimmed;
                    renderFoldersBar();
                    updateFolderSelects();
                    renderMemoList();
                    toastr.success('已重命名文件夹');
                }
            });

            $tab.find('.folder-delete').on('click', async function (e) {
                e.stopPropagation();
                if (await pmConfirm(`确定要删除文件夹 "${folder}" 吗？\n其中的条目将被移动到"默认"文件夹。`)) {
                    const memo = getMemoData();
                    memo.forEach(entry => {
                        if (entry.folder === folder) {
                            entry.folder = '默认';
                        }
                    });
                    saveMemoData(memo);

                    const folders = getFolders();
                    const newFolders = folders.filter(f => f !== folder);
                    saveFolders(newFolders);

                    // 清理元数据
                    const m = getFolderMeta();
                    if (m[folder]) {
                        delete m[folder];
                        saveFolderMeta(m);
                    }

                    if (currentFolder === folder) {
                        currentFolder = '默认';
                    }
                    renderFoldersBar();
                    updateFolderSelects();
                    renderMemoList();
                    toastr.success('已删除文件夹');
                }
            });
        }

        $bar.append($tab);
    });

    // 新建文件夹按钮
    const $newBtn = $(`
        <div class="pm-folder-tab pm-folder-new" style="border-style: dashed;">
            <i class="fa-solid fa-plus"></i> 新建文件夹
        </div>
    `);
    $newBtn.on('click', async function () {
        const name = await pmPrompt('请输入新文件夹名称:');
        if (name && name.trim()) {
            const folderName = name.trim();
            const folders = getFolders();
            if (folders.includes(folderName)) {
                toastr.warning('文件夹已存在');
                return;
            }
            folders.push(folderName);
            saveFolders(folders);
            currentFolder = folderName;
            renderFoldersBar();
            updateFolderSelects();
            renderMemoList();
        }
    });
    $bar.append($newBtn);

    // 拖拽排序: 排除 "默认" 与 "新建文件夹" 按钮
    const $barEl: any = $bar;
    if (typeof $barEl.sortable === 'function') {
        if ($barEl.sortable('instance')) $barEl.sortable('destroy');
        $barEl.sortable({
            items: '> .pm-folder-tab:not(.pm-folder-new):not([data-folder="默认"])',
            placeholder: 'pm-folder-placeholder',
            forcePlaceholderSize: true,
            tolerance: 'pointer',
            cancel: '.folder-pin, .folder-edit, .folder-delete, .pm-folder-new, [data-folder="默认"]',
            update: function () {
                // 新的顺序: 保留 "默认" 在最前, 取 DOM 中按出现顺序的非默认文件夹
                const order: string[] = ['默认'];
                $bar.find('.pm-folder-tab').each(function () {
                    const name = $(this).attr('data-folder');
                    if (name && name !== '默认') order.push(name);
                });
                // 由于排序结果已是 "默认 + 置顶 + 其它", 需要拆出置顶项 / 其它项分别保留
                const m = getFolderMeta();
                const pinned = order.filter(f => f !== '默认' && m[f]?.pinned);
                const normal = order.filter(f => f !== '默认' && !m[f]?.pinned);
                // 存储顺序: 默认 + 普通 + 置顶 (置顶在渲染时会被自动提前)
                saveFolders(['默认', ...normal, ...pinned]);
                renderFoldersBar();
            },
        });
    }
}

// 备忘录列表渲染: 折叠 / 搜索 / 按 id 操作 / 拖拽排序
function renderMemoList() {
    const memo = getMemoData();
    const folders = getFolders();
    const $list = $('#preset-memo-list');
    $list.empty();

    // 过滤当前文件夹 + 搜索关键字
    const keyword = searchKeyword.trim().toLowerCase();
    const currentMemo = memo.filter(entry => {
        if ((entry.folder || '默认') !== currentFolder) return false;
        if (!keyword) return true;
        return (
            (entry.name || '').toLowerCase().includes(keyword) ||
            (entry.content || '').toLowerCase().includes(keyword)
        );
    });

    if (currentMemo.length === 0) {
        const tip = keyword ? '没有匹配的条目' : '当前文件夹为空。';
        $list.append(`<div class="pm-empty-state">${esc(tip)}</div>`);
        updateSelectAllState();
        return;
    }

    const shortcuts = getShortcuts();

    currentMemo.forEach(entry => {
        const isExpanded = expandedMemoIds.has(entry.id);
        const $item = $(`
            <div class="memo-entry-item ${isExpanded ? 'is-expanded' : ''}">
                <div class="memo-header">
                    <div class="memo-left">
                        <i class="fa-solid fa-grip-vertical memo-drag-handle" title="拖拽排序"></i>
                        <input type="checkbox" class="memo-entry-checkbox">
                        <i class="fa-solid fa-chevron-right memo-toggle"></i>
                        <input type="text" class="text_pole memo-entry-name">
                    </div>
                    <div class="memo-right">
                        <select class="text_pole memo-entry-folder" title="所属文件夹"></select>
                        <select class="text_pole memo-entry-role">
                            <option value="system">System</option>
                            <option value="user">User</option>
                            <option value="assistant">Assistant</option>
                        </select>
                        <div class="menu_button fa-solid fa-eye memo-entry-preview interactable" title="预览 (渲染宏)"></div>
                        <div class="menu_button fa-solid fa-copy memo-entry-copy interactable" title="复制条目"></div>
                        <div class="menu_button fa-solid fa-trash text-red-500 memo-entry-delete interactable" title="删除"></div>
                    </div>
                </div>
                <div class="memo-preview"></div>
                <div class="memo-shortcuts" title="快捷插入: 点击按钮把对应文本插入到内容光标位置"></div>
                <textarea class="text_pole memo-entry-content"></textarea>
            </div>
        `);

        // 通过 attr / val / text 设置内容, 避免 XSS
        $item.attr('data-id', entry.id);
        $item.find('.memo-entry-checkbox').attr('data-id', entry.id);
        $item.find('.memo-entry-delete').attr('data-id', entry.id);
        $item.find<HTMLInputElement>('.memo-entry-name').val(entry.name);
        $item.find<HTMLTextAreaElement>('.memo-entry-content').val(entry.content);
        $item.find<HTMLSelectElement>('.memo-entry-role').val(entry.role);

        // 内容预览 (折叠时显示前 100 字)
        const previewText = (entry.content || '').replace(/\s+/g, ' ').trim();
        $item.find('.memo-preview').text(previewText.length > 120 ? previewText.slice(0, 120) + '…' : previewText || '(空内容)');

        // 快捷插入按钮条 (展开时显示, 点击把 insert 文本插入到 textarea 光标位置)
        const $shortcutsBar = $item.find('.memo-shortcuts');
        shortcuts.forEach(sc => {
            const $btn = $('<div class="menu_button interactable memo-shortcut-btn"></div>')
                .text(sc.label)
                .attr('title', `插入: ${sc.insert}`);
            $btn.on('mousedown', function (e) {
                // 用 mousedown 防止 textarea 失焦, 这样 selectionStart/End 还在
                e.preventDefault();
                const textarea = $item.find<HTMLTextAreaElement>('.memo-entry-content')[0];
                if (textarea) insertAtCursor(textarea, sc.insert);
            });
            $shortcutsBar.append($btn);
        });
        if (shortcuts.length === 0) {
            $shortcutsBar.append(
                '<span class="memo-shortcuts-empty">暂无快捷键, 可点标题栏的键盘图标添加</span>',
            );
        }

        // 文件夹下拉
        const $folderSel = $item.find('.memo-entry-folder');
        folders.forEach(f => {
            const $opt = $('<option>').attr('value', f).text(f);
            if (f === (entry.folder || '默认')) $opt.attr('selected', 'selected');
            $folderSel.append($opt);
        });

        // 通过 id 定位真正的 entry, 而不是依赖渲染时的索引
        const findIndex = () => memo.findIndex(e => e.id === entry.id);

        // 折叠 / 展开
        const toggleExpand = () => {
            if (expandedMemoIds.has(entry.id)) {
                expandedMemoIds.delete(entry.id);
                $item.removeClass('is-expanded');
            } else {
                expandedMemoIds.add(entry.id);
                $item.addClass('is-expanded');
            }
        };
        $item.find('.memo-toggle').on('click', toggleExpand);
        $item.find('.memo-preview').on('click', toggleExpand);

        // 编辑事件
        $item.find('.memo-entry-name').on('change', function () {
            const i = findIndex();
            if (i === -1) return;
            memo[i].name = $(this).val() as string;
            saveMemoData(memo);
        });
        $item.find('.memo-entry-role').on('change', function () {
            const i = findIndex();
            if (i === -1) return;
            memo[i].role = $(this).val() as 'system' | 'user' | 'assistant';
            saveMemoData(memo);
        });
        $item.find('.memo-entry-folder').on('change', function () {
            const i = findIndex();
            if (i === -1) return;
            memo[i].folder = $(this).val() as string;
            saveMemoData(memo);
            renderMemoList();
        });
        $item.find('.memo-entry-content').on('change', function () {
            const i = findIndex();
            if (i === -1) return;
            memo[i].content = $(this).val() as string;
            saveMemoData(memo);
            // 内容变更后同步刷新预览文本 (不重新渲染整个列表)
            const newPreview = (memo[i].content || '').replace(/\s+/g, ' ').trim();
            $item.find('.memo-preview').text(newPreview.length > 120 ? newPreview.slice(0, 120) + '…' : newPreview || '(空内容)');
        });

        // checkbox 变更同步全选状态
        $item.find('.memo-entry-checkbox').on('change', updateSelectAllState);

        // 复制条目: 在当前条目之后插入一份副本
        $item.find('.memo-entry-copy').on('click', function () {
            const i = findIndex();
            if (i === -1) return;
            const src = memo[i];
            const copy: MemoEntry = {
                id: genMemoId(),
                name: src.name + ' (副本)',
                content: src.content,
                enabled: src.enabled,
                role: src.role,
                position: { type: 'relative' },
                folder: src.folder,
            };
            memo.splice(i + 1, 0, copy);
            expandedMemoIds.add(copy.id);
            saveMemoData(memo);
            renderMemoList();
            toastr.success('已复制条目');
        });

        // 预览 (宏渲染)
        $item.find('.memo-entry-preview').on('click', async function () {
            const i = findIndex();
            if (i === -1) return;
            // 使用当前 textarea 中尚未保存的最新内容
            const liveContent = ($item.find('.memo-entry-content').val() as string) ?? memo[i].content;
            await showMacroPreview(memo[i].name, liveContent);
        });

        // 删除
        $item.find('.memo-entry-delete').on('click', async function () {
            if (await pmConfirm(`确定要删除条目 "${entry.name}" 吗？`)) {
                const i = findIndex();
                if (i === -1) return;
                memo.splice(i, 1);
                expandedMemoIds.delete(entry.id);
                saveMemoData(memo);
                renderMemoList();
                toastr.success('已删除条目');
            }
        });

        $list.append($item);
    });

    // 拖拽排序 (jquery-ui sortable)
    const $listEl: any = $list;
    if (typeof $listEl.sortable === 'function') {
        if ($listEl.sortable('instance')) $listEl.sortable('destroy');
        $listEl.sortable({
            handle: '.memo-drag-handle',
            items: '> .memo-entry-item',
            placeholder: 'memo-entry-placeholder',
            forcePlaceholderSize: true,
            tolerance: 'pointer',
            update: function () {
                // 收集当前 DOM 顺序对应的 entry.id 列表
                const newOrderIds: string[] = [];
                $list.find('.memo-entry-item').each(function () {
                    const id = $(this).attr('data-id');
                    if (id) newOrderIds.push(id);
                });
                // 将当前文件夹中的条目按新顺序重排, 其它文件夹位置不变
                const fresh = getMemoData();
                const currentFolderEntries = newOrderIds
                    .map(id => fresh.find(e => e.id === id))
                    .filter((e): e is MemoEntry => !!e);
                const otherEntries = fresh.filter(e => (e.folder || '默认') !== currentFolder);
                // 简化策略: 把当前文件夹条目按新顺序放在最前, 其它保持原顺序
                saveMemoData([...currentFolderEntries, ...otherEntries]);
            },
        });
    }

    updateSelectAllState();
}

// 同步 "全选" checkbox 的视觉状态 (全选/部分选/未选)
function updateSelectAllState() {
    const $boxes = $('#preset-memo-list .memo-entry-checkbox');
    const total = $boxes.length;
    const checked = $boxes.filter(':checked').length;
    const $all = $('#preset-memo-select-all');
    if (total === 0) {
        $all.prop('checked', false).prop('indeterminate', false);
    } else if (checked === 0) {
        $all.prop('checked', false).prop('indeterminate', false);
    } else if (checked === total) {
        $all.prop('checked', true).prop('indeterminate', false);
    } else {
        $all.prop('checked', false).prop('indeterminate', true);
    }
}

function setupSearchableSelect($container: JQuery, options: string[], onChange: (val: string) => void, allowCustom: boolean = false) {
    const $input = $container.find('.pm-select-input');
    const $dropdown = $container.find('.pm-select-dropdown');
    
    function renderOptions(filter: string = '') {
        $dropdown.empty();
        const filtered = options.filter(opt => opt.toLowerCase().includes(filter.toLowerCase()));
        
        if (filtered.length === 0) {
            $dropdown.append('<div class="pm-select-empty">无匹配项</div>');
        } else {
            filtered.forEach(opt => {
                const $opt = $('<div class="pm-select-option"></div>').text(opt);
                $opt.on('mousedown', function(e) {
                    e.preventDefault(); // 防止 input 失去焦点
                    $input.val(opt);
                    $dropdown.hide();
                    onChange(opt);
                });
                $dropdown.append($opt);
            });
        }
    }
    
    $input.off('focus').on('focus', function() {
        renderOptions($input.val() as string);
        $dropdown.show();
    });
    
    $input.off('input').on('input', function() {
        renderOptions($input.val() as string);
        $dropdown.show();
        if (allowCustom) {
            onChange($input.val() as string);
        }
    });
    
    $input.off('blur').on('blur', function() {
        setTimeout(() => {
            $dropdown.hide();
            if (!allowCustom) {
                const val = $input.val() as string;
                if (!options.includes(val)) {
                    $input.val('');
                    onChange('');
                } else {
                    onChange(val);
                }
            }
        }, 150);
    });
    
    // 点击箭头图标区域也触发 focus
    $input.off('click').on('click', function() {
        if (!$dropdown.is(':visible')) {
            renderOptions($input.val() as string);
            $dropdown.show();
        }
    });
}

// --- Tab 2: 从世界书导入 ---

async function loadWorldbooks() {
    try {
        const wbNames = getWorldbookNames();
        
        const $container = $('#preset-memo-wb-select-container');
        setupSearchableSelect($container, wbNames, async (val) => {
            if (val) {
                await selectWorldbook(val);
            } else {
                $('#preset-memo-wb-entries').empty().append('<div class="pm-empty-state">请先在上方选择一本世界书。</div>');
                updateImportCount();
            }
        });

        // 初始化文件夹选择器
        updateFolderSelects();

    } catch (e) {
        console.error('获取世界书列表失败:', e);
        toastr.error('获取世界书列表失败');
    }
}

async function selectWorldbook(selectedWb: string) {
    if (selectedWb) {
        try {
            const entries = await getWorldbook(selectedWb);
            renderWorldbookEntries(entries, selectedWb);
        } catch (e) {
            console.error('读取世界书失败:', e);
            toastr.error('读取世界书失败');
        }
    } else {
        $('#preset-memo-wb-entries').empty().append('<div class="pm-empty-state">请先在上方选择一本世界书。</div>');
        updateImportCount();
    }
}

function renderWorldbookEntries(entries: any[], wbName: string) {
    const $list = $('#preset-memo-wb-entries');
    $list.empty();
    
    if (!entries || entries.length === 0) {
        $list.append('<div class="pm-empty-state">该世界书为空。</div>');
        updateImportCount();
        return;
    }
    
    entries.forEach((entry, index) => {
        const $item = $(`
            <div class="wb-entry-item">
                <div class="wb-entry-header">
                    <input type="checkbox" class="wb-entry-checkbox" style="margin-top: 4px;">
                    <div class="wb-content">
                        <div class="wb-title"></div>
                        <div class="wb-desc"></div>
                    </div>
                    <div class="wb-actions" title="查看/编辑">
                        <i class="fa-solid fa-pen"></i>
                    </div>
                </div>
                <div class="wb-entry-edit" style="display: none;">
                    <input type="text" class="text_pole edit-name">
                    <textarea class="text_pole edit-content"></textarea>
                    <div class="save-btn save-wb-btn"><i class="fa-solid fa-floppy-disk"></i> 保存修改</div>
                </div>
            </div>
        `);
        $item.attr('data-index', String(index));
        $item.find('.wb-entry-checkbox').attr('data-index', String(index));
        $item.find('.wb-title').text(entry.name ?? '');
        $item.find('.wb-desc').text(((entry.content ?? '') as string).substring(0, 100) + '...');
        $item.find<HTMLInputElement>('.edit-name').val(entry.name ?? '');
        $item.find<HTMLTextAreaElement>('.edit-content').val(entry.content ?? '');

        // Toggle checkbox when clicking the content area
        $item.find('.wb-content').on('click', function() {
            const $cb = $item.find('.wb-entry-checkbox');
            $cb.prop('checked', !$cb.prop('checked'));
            updateImportCount();
        });

        $item.find('.wb-entry-checkbox').on('change', updateImportCount);

        // Toggle edit view
        $item.find('.wb-actions').on('click', function(e) {
            e.stopPropagation();
            $item.find('.wb-entry-edit').slideToggle(200);
        });

        // Save edits back to worldbook
        $item.find('.save-wb-btn').on('click', async function() {
            const newName = $item.find('.edit-name').val() as string;
            const newContent = $item.find('.edit-content').val() as string;
            
            try {
                await updateWorldbookWith(wbName, (wb) => {
                    const target = wb.find(e => e.uid === entry.uid);
                    if (target) {
                        target.name = newName;
                        target.content = newContent;
                    }
                    return wb;
                });
                toastr.success('已保存到世界书');
                entry.name = newName;
                entry.content = newContent;
                $item.find('.wb-title').text(newName);
                $item.find('.wb-desc').text((newContent ?? '').substring(0, 100) + '...');
                $item.find('.wb-entry-edit').slideUp(200);
            } catch (e) {
                console.error(e);
                toastr.error('保存失败');
            }
        });

        $item.data('entry', entry);
        $list.append($item);
    });
    
    updateImportCount();
}

function updateImportCount() {
    const total = $('.wb-entry-checkbox').length;
    const count = $('.wb-entry-checkbox:checked').length;
    $('#preset-memo-import-count').text(`已选中 ${count} 个条目`);
    syncSelectAllVisual('preset-memo-import-wb-select-all', total, count);
}

// --- Tab 2.5: 从预设导入 ---
async function loadPresets() {
    try {
        const presetNames = getPresetNames();
        
        const $container = $('#preset-memo-preset-select-container');
        setupSearchableSelect($container, presetNames, async (val) => {
            if (val) {
                await selectPreset(val);
            } else {
                $('#preset-memo-preset-entries').empty().append('<div class="pm-empty-state">请先在上方选择一个预设。</div>');
                updateImportPresetCount();
            }
        });

        // 初始化文件夹选择器
        updateFolderSelects();

    } catch (e) {
        console.error('获取预设列表失败:', e);
        toastr.error('获取预设列表失败');
    }
}

async function selectPreset(selectedPreset: string) {
    if (selectedPreset) {
        try {
            const preset = getPreset(selectedPreset);
            renderPresetEntries(preset.prompts || [], selectedPreset);
        } catch (e) {
            console.error('读取预设失败:', e);
            toastr.error('读取预设失败');
        }
    } else {
        $('#preset-memo-preset-entries').empty().append('<div class="pm-empty-state">请先在上方选择一个预设。</div>');
        updateImportPresetCount();
    }
}

function renderPresetEntries(entries: any[], presetName: string) {
    const $list = $('#preset-memo-preset-entries');
    $list.empty();
    
    if (!entries || entries.length === 0) {
        $list.append('<div class="pm-empty-state">该预设为空。</div>');
        updateImportPresetCount();
        return;
    }
    
    entries.forEach((entry, index) => {
        const displayName = entry.name || entry.id || '';
        const role = entry.role || 'system';
        const content = entry.content || '';

        const $item = $(`
            <div class="wb-entry-item">
                <div class="wb-entry-header">
                    <input type="checkbox" class="preset-entry-checkbox" style="margin-top: 4px;">
                    <div class="wb-content">
                        <div class="wb-title"></div>
                        <div class="wb-desc"></div>
                    </div>
                    <div class="wb-actions" title="查看/编辑">
                        <i class="fa-solid fa-pen"></i>
                    </div>
                </div>
                <div class="wb-entry-edit" style="display: none;">
                    <input type="text" class="text_pole edit-name">
                    <select class="text_pole edit-role">
                        <option value="system">System</option>
                        <option value="user">User</option>
                        <option value="assistant">Assistant</option>
                    </select>
                    <textarea class="text_pole edit-content"></textarea>
                    <div class="save-btn save-preset-entry-btn"><i class="fa-solid fa-floppy-disk"></i> 保存修改</div>
                </div>
            </div>
        `);
        $item.attr('data-index', String(index));
        $item.find('.preset-entry-checkbox').attr('data-index', String(index));
        $item.find('.wb-title').html(`${esc(displayName)} <span class="role-tag">(${esc(role)})</span>`);
        $item.find('.wb-desc').text(content.substring(0, 100) + '...');
        $item.find<HTMLInputElement>('.edit-name').val(displayName);
        $item.find<HTMLSelectElement>('.edit-role').val(role);
        $item.find<HTMLTextAreaElement>('.edit-content').val(content);

        // Toggle checkbox when clicking the content area
        $item.find('.wb-content').on('click', function() {
            const $cb = $item.find('.preset-entry-checkbox');
            $cb.prop('checked', !$cb.prop('checked'));
            updateImportPresetCount();
        });

        $item.find('.preset-entry-checkbox').on('change', updateImportPresetCount);

        // Toggle edit view
        $item.find('.wb-actions').on('click', function(e) {
            e.stopPropagation();
            $item.find('.wb-entry-edit').slideToggle(200);
        });

        // Save edits back to preset
        $item.find('.save-preset-entry-btn').on('click', async function() {
            const newName = $item.find('.edit-name').val() as string;
            const newRole = $item.find('.edit-role').val() as 'system' | 'user' | 'assistant';
            const newContent = $item.find('.edit-content').val() as string;
            
            try {
                await updatePresetWith(presetName, (p) => {
                    const target = p.prompts[index];
                    if (target) {
                        target.name = newName;
                        target.role = newRole;
                        target.content = newContent;
                    }
                    return p;
                });
                toastr.success('已保存到预设');
                entry.name = newName;
                entry.role = newRole;
                entry.content = newContent;
                $item.find('.wb-title').html(`${esc(newName)} <span class="role-tag">(${esc(newRole)})</span>`);
                $item.find('.wb-desc').text((newContent || '').substring(0, 100) + '...');
                $item.find('.wb-entry-edit').slideUp(200);
            } catch (e) {
                console.error(e);
                toastr.error('保存失败');
            }
        });

        $item.data('entry', entry);
        $list.append($item);
    });
    
    updateImportPresetCount();
}

function updateImportPresetCount() {
    const total = $('.preset-entry-checkbox').length;
    const count = $('.preset-entry-checkbox:checked').length;
    $('#preset-memo-import-preset-count').text(`已选中 ${count} 个条目`);
    syncSelectAllVisual('preset-memo-import-preset-select-all', total, count);
}

// --- Tab 3: 插入位置选择 ---
async function pickEntriesForInsert(): Promise<PresetPromptDraft[] | null> {
    const memo = getMemoData();
    const folders = getSortedFolders().filter(f => memo.some(e => (e.folder || '默认') === f));
    const byFolder = new Map<string, MemoEntry[]>();
    folders.forEach(f => {
        byFolder.set(
            f,
            memo.filter(e => (e.folder || '默认') === f),
        );
    });

    return new Promise(resolve => {
        const $modal = $(`#${MODAL_ID}`);
        if ($modal.length === 0) {
            resolve(null);
            return;
        }
        const $popup = $(`
            <div class="pm-popup-overlay">
                <div class="pm-popup pm-popup-large" style="display: flex; flex-direction: column;">
                    <div class="pm-popup-message" style="margin-bottom: 0;">
                        <strong><i class="fa-solid fa-file-import"></i> 选择要插入的条目</strong>
                    </div>
                    <div class="pm-tabs" style="margin-top: 10px;">
                        <div class="pm-tab-btn active" data-pick-tab="memo">从备忘录选择</div>
                        <div class="pm-tab-btn" data-pick-tab="wb">从世界书选择</div>
                    </div>
                    
                    <!-- 备忘录 Picker -->
                    <div id="pm-pick-memo" style="display: flex; flex-direction: column; flex: 1; min-height: 0;">
                        <div class="pm-popup-subtitle" style="margin: 8px 0;">支持多选，或直接勾选文件夹标题来插入整个文件夹。</div>
                        <div class="pm-insert-picker" style="flex: 1;"></div>
                        <div class="pm-hint" id="pm-insert-picker-count" style="margin-top: 8px;">已选中 0 个条目</div>
                    </div>

                    <!-- 世界书 Picker -->
                    <div id="pm-pick-wb" style="display: none; flex-direction: column; flex: 1; min-height: 0;">
                        <div class="pm-form-group" style="margin-top: 8px; margin-bottom: 8px;">
                            <div class="pm-searchable-select" id="pm-pick-wb-select-container">
                                <input type="text" class="text_pole pm-select-input" placeholder="点击选择或输入搜索..." autocomplete="off">
                                <div class="pm-select-dropdown" style="display: none;"></div>
                            </div>
                        </div>
                        <div class="pm-list pm-wb-list pm-insert-wb-picker" style="flex: 1; overflow-y: auto;">
                            <div class="pm-empty-state">请先选择一本世界书。</div>
                        </div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
                            <label class="pm-select-all">
                                <input type="checkbox" id="pm-pick-wb-select-all">
                                <span>全选</span>
                            </label>
                            <div class="pm-hint" id="pm-pick-wb-count">已选中 0 个条目</div>
                        </div>
                    </div>

                    <div class="pm-popup-actions" style="margin-top: 10px;">
                        <div class="menu_button interactable pm-popup-cancel">取消</div>
                        <div class="menu_button interactable pm-popup-confirm">确认插入</div>
                    </div>
                </div>
            </div>
        `);
        if ($('#preset-memo-modal-content').hasClass('pm-light-mode')) $popup.addClass('pm-light-mode');
        $modal.append($popup);

        // Tabs toggle
        let activeTab = 'memo';
        $popup.find('.pm-tab-btn').on('click', function() {
            $popup.find('.pm-tab-btn').removeClass('active');
            $(this).addClass('active');
            activeTab = $(this).attr('data-pick-tab') || 'memo';
            if (activeTab === 'memo') {
                $popup.find('#pm-pick-memo').css('display', 'flex');
                $popup.find('#pm-pick-wb').css('display', 'none');
            } else {
                $popup.find('#pm-pick-memo').css('display', 'none');
                $popup.find('#pm-pick-wb').css('display', 'flex');
            }
        });

        // Memo Picker Logic
        const $picker = $popup.find('.pm-insert-picker');
        const updateCount = () => {
            const count = $popup.find('.pm-insert-picker-item-checkbox:checked').length;
            $popup.find('#pm-insert-picker-count').text(`已选中 ${count} 个条目`);
        };

        if (memo.length === 0) {
            $picker.append('<div class="pm-empty-state">备忘录为空，请先在备忘录管理中创建条目。</div>');
        } else {
            folders.forEach(folder => {
                const entries = byFolder.get(folder) || [];
                const $folder = $(`
                    <div class="pm-insert-picker-folder">
                        <div class="pm-insert-picker-folder-head">
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <i class="fa-solid fa-chevron-down pm-folder-toggle" style="cursor: pointer; width: 14px; text-align: center;"></i>
                                <label class="pm-select-all" style="margin: 0;">
                                    <input type="checkbox" class="pm-insert-folder-checkbox">
                                    <span></span>
                                </label>
                            </div>
                        </div>
                        <div class="pm-insert-picker-folder-items"></div>
                    </div>
                `);
                $folder.find('.pm-select-all span').text(`${folder} (${entries.length})`);
                const $items = $folder.find('.pm-insert-picker-folder-items');
                
                $folder.find('.pm-folder-toggle').on('click', function(e) {
                    e.stopPropagation();
                    $items.slideToggle(200);
                    $(this).toggleClass('fa-chevron-down fa-chevron-right');
                });

                entries.forEach(entry => {
                    const $row = $(`
                        <label class="pm-insert-picker-item">
                            <input type="checkbox" class="pm-insert-picker-item-checkbox">
                            <span></span>
                        </label>
                    `);
                    $row.attr('data-id', entry.id);
                    $row.find('span').text(entry.name || '未命名条目');
                    $items.append($row);
                });

                const refreshFolderState = () => {
                    const total = $items.find('.pm-insert-picker-item-checkbox').length;
                    const checked = $items.find('.pm-insert-picker-item-checkbox:checked').length;
                    const $folderCheck = $folder.find<HTMLInputElement>('.pm-insert-folder-checkbox');
                    if (checked === 0) $folderCheck.prop('checked', false).prop('indeterminate', false);
                    else if (checked === total) $folderCheck.prop('checked', true).prop('indeterminate', false);
                    else $folderCheck.prop('checked', false).prop('indeterminate', true);
                };

                $folder.find('.pm-insert-folder-checkbox').on('change', function () {
                    const checked = $(this).prop('checked');
                    $items.find('.pm-insert-picker-item-checkbox').prop('checked', checked);
                    refreshFolderState();
                    updateCount();
                });
                $items.find('.pm-insert-picker-item-checkbox').on('change', function () {
                    refreshFolderState();
                    updateCount();
                });
                refreshFolderState();
                $picker.append($folder);
            });
        }
        updateCount();

        // WB Picker Logic
        let wbEntriesData: any[] = [];
        const wbNames = getWorldbookNames();
        setupSearchableSelect($popup.find('#pm-pick-wb-select-container'), wbNames, async (val) => {
            const $wbList = $popup.find('.pm-insert-wb-picker');
            $wbList.empty();
            if (val) {
                try {
                    const entries = await getWorldbook(val);
                    wbEntriesData = entries || [];
                    if (wbEntriesData.length === 0) {
                        $wbList.append('<div class="pm-empty-state">该世界书为空。</div>');
                    } else {
                        wbEntriesData.forEach((entry, index) => {
                            const $item = $(`
                                <label class="pm-insert-picker-item" style="padding: 4px;">
                                    <input type="checkbox" class="pm-pick-wb-checkbox">
                                    <span style="flex: 1;"></span>
                                </label>
                            `);
                            $item.attr('data-index', String(index));
                            $item.find('span').text(entry.name || '未命名条目');
                            $item.find('input').on('change', updateWbCount);
                            $wbList.append($item);
                        });
                    }
                } catch (e) {
                    console.error('读取世界书失败:', e);
                    $wbList.append('<div class="pm-empty-state">读取失败。</div>');
                }
            } else {
                $wbList.append('<div class="pm-empty-state">请先选择一本世界书。</div>');
            }
            updateWbCount();
        });

        const updateWbCount = () => {
            const total = $popup.find('.pm-pick-wb-checkbox').length;
            const checked = $popup.find('.pm-pick-wb-checkbox:checked').length;
            $popup.find('#pm-pick-wb-count').text(`已选中 ${checked} 个条目`);
            const $all = $popup.find('#pm-pick-wb-select-all');
            if (total === 0 || checked === 0) $all.prop('checked', false).prop('indeterminate', false);
            else if (checked === total) $all.prop('checked', true).prop('indeterminate', false);
            else $all.prop('checked', false).prop('indeterminate', true);
        };

        $popup.find('#pm-pick-wb-select-all').on('change', function() {
            const checked = $(this).prop('checked');
            $popup.find('.pm-pick-wb-checkbox').prop('checked', checked);
            updateWbCount();
        });

        const close = (data: PresetPromptDraft[] | null) => {
            $popup.remove();
            resolve(data);
        };
        $popup.find('.pm-popup-cancel').on('click', () => close(null));
        $popup.find('.pm-popup-confirm').on('click', () => {
            const drafts: PresetPromptDraft[] = [];
            if (activeTab === 'memo') {
                const selectedIds: string[] = [];
                $popup.find('.pm-insert-picker-item-checkbox:checked').each(function () {
                    const id = $(this).closest('.pm-insert-picker-item').attr('data-id');
                    if (id) selectedIds.push(id);
                });
                if (selectedIds.length === 0) {
                    toastr.warning('请至少选择一个备忘录条目');
                    return;
                }
                const selected = selectedIds
                    .map(id => memo.find(e => e.id === id))
                    .filter((e): e is MemoEntry => !!e);
                drafts.push(...selected.map(toPresetDraftFromMemo));
            } else {
                const selectedIndices: number[] = [];
                $popup.find('.pm-pick-wb-checkbox:checked').each(function () {
                    const idx = parseInt($(this).closest('.pm-insert-picker-item').attr('data-index') || '-1');
                    if (idx >= 0) selectedIndices.push(idx);
                });
                if (selectedIndices.length === 0) {
                    toastr.warning('请至少选择一个世界书条目');
                    return;
                }
                selectedIndices.forEach(idx => {
                    const entry = wbEntriesData[idx];
                    if (entry) {
                        drafts.push({
                            id: undefined, // generating a new ID or undefined will be handled when saving if necessary
                            name: entry.name || '未命名条目',
                            content: entry.content || '',
                            enabled: true,
                            role: 'system',
                            position: { type: 'relative' },
                            __draftFromMemo: false // Optional to change badge UI
                        });
                    }
                });
            }
            close(drafts);
        });
        $popup.on('click', function (e) {
            if (e.target === this) close(null);
        });
        $popup.on('keydown', function (e) {
            if (e.key === 'Escape') {
                e.stopPropagation();
                close(null);
            }
        });
    });
}

async function performInsertToDraft(insertIndex: number) {
    let draftsToInsert: PresetPromptDraft[] = [];
    
    // 优先检查 Tab 1 (备忘录管理) 中是否有被勾选的备忘录条目
    let selectedEntries = collectCheckedMemoEntries();
    if (selectedEntries.length > 0) {
        draftsToInsert = selectedEntries.map(toPresetDraftFromMemo);
    } else {
        const pickedDrafts = await pickEntriesForInsert();
        if (!pickedDrafts || pickedDrafts.length === 0) return;
        draftsToInsert = pickedDrafts;
    }

    if (!insertDraftPrompts) {
        const preset = getPreset('in_use');
        insertDraftPrompts = (preset.prompts || []).map(toPresetDraft);
    }
    insertDraftPrompts.splice(insertIndex, 0, ...draftsToInsert);
    insertDraftDirty = true;
    toastr.success(`已插入 ${draftsToInsert.length} 个条目到预览草稿`);
    renderInsertView();
}

function renderInsertView() {
    if (!insertDraftPrompts) {
        const preset = getPreset('in_use');
        insertDraftPrompts = (preset.prompts || []).map(toPresetDraft);
    }
    const prompts = insertDraftPrompts;
    const checkedCount = collectCheckedMemoEntries().length;
    const $container = $('#preset-memo-insert-container');
    $container.empty();

    const $tip = $(`
        <div class="pm-hint" style="margin-bottom: 6px;">
            ${
                checkedCount > 0
                    ? `当前已从备忘录勾选 ${checkedCount} 个条目，点击任意插入点可加入草稿。`
                    : '当前未勾选备忘录条目，点击插入点时将弹出选择器（支持按文件夹整组插入）。'
            }
        </div>
    `);
    $container.append($tip);

    for (let i = 0; i <= prompts.length; i++) {
        const $insertPoint = $(`
            <div class="insert-point">
                <div class="insert-btn interactable">
                    <i class="fa-solid fa-plus"></i> 插入到此处
                </div>
            </div>
        `);
        $insertPoint.attr('data-index', String(i));
        $insertPoint.on('click', async function () {
            const insertIndex = parseInt($(this).attr('data-index') || '0');
            await performInsertToDraft(insertIndex);
        });
        $container.append($insertPoint);

        if (i < prompts.length) {
            const prompt = prompts[i];
            const $promptItem = $(`
                <div class="preset-prompt-item ${prompt.__draftFromMemo ? 'is-draft' : ''}">
                    <div class="preset-prompt-header">
                        <div class="preset-prompt-title"></div>
                        <div class="preset-prompt-actions" style="display: flex; gap: 10px;">
                            <div class="preset-prompt-edit-btn" title="查看/编辑"><i class="fa-solid fa-pen"></i></div>
                            <div class="preset-prompt-delete-btn" title="删除" style="color: var(--pm-danger);"><i class="fa-solid fa-trash"></i></div>
                        </div>
                    </div>
                    <div class="preset-prompt-edit" style="display: none;">
                        <input type="text" class="text_pole edit-name">
                        <select class="text_pole edit-role">
                            <option value="system">System</option>
                            <option value="user">User</option>
                            <option value="assistant">Assistant</option>
                        </select>
                        <textarea class="text_pole edit-content"></textarea>
                        <div class="save-btn save-preset-btn"><i class="fa-solid fa-check"></i> 应用修改</div>
                    </div>
                </div>
            `);
            const badge = prompt.__draftFromMemo ? '<span class="draft-badge">来自备忘录</span>' : '';
            $promptItem.find('.preset-prompt-title').html(
                `${esc(prompt.name)} <span class="role-tag">(${esc(prompt.role)})</span> ${badge}`,
            );
            $promptItem.find<HTMLInputElement>('.edit-name').val(prompt.name);
            $promptItem.find<HTMLSelectElement>('.edit-role').val(prompt.role);
            $promptItem.find<HTMLTextAreaElement>('.edit-content').val(prompt.content);

            $promptItem.find('.preset-prompt-title, .preset-prompt-edit-btn').on('click', function (e) {
                e.stopPropagation();
                $promptItem.find('.preset-prompt-edit').slideToggle(200);
            });
            $promptItem.find('.preset-prompt-delete-btn').on('click', function (e) {
                e.stopPropagation();
                insertDraftPrompts!.splice(i, 1);
                insertDraftDirty = true;
                renderInsertView();
                toastr.success('已删除条目');
            });
            $promptItem.find('.save-preset-btn').on('click', function (e) {
                e.stopPropagation();
                prompt.name = String($promptItem.find('.edit-name').val() ?? '').trim() || '未命名条目';
                prompt.role = ($promptItem.find('.edit-role').val() as 'system' | 'user' | 'assistant') || 'system';
                prompt.content = String($promptItem.find('.edit-content').val() ?? '');
                insertDraftDirty = true;
                renderInsertView();
                toastr.success('已更新草稿条目');
            });
            $container.append($promptItem);
        }
    }
    refreshInsertSaveButton();
}

// --- Tab 4: 导出到世界书 ---
function renderExportView() {
    const preset = getPreset('in_use');
    const prompts = preset.prompts || [];
    const $list = $('#preset-memo-export-list');
    $list.empty();
    
    if (prompts.length === 0) {
        $list.append('<div class="pm-empty-state">当前预设为空。</div>');
        updateExportCount();
        return;
    }
    
    prompts.forEach((prompt, index) => {
        const displayName = prompt.name || prompt.id || '';
        const role = prompt.role || 'system';
        const content = prompt.content || '';

        const $item = $(`
            <div class="wb-entry-item">
                <div class="wb-entry-header">
                    <input type="checkbox" class="export-entry-checkbox" style="margin-top: 4px;">
                    <div class="wb-content">
                        <div class="wb-title"></div>
                        <div class="wb-desc"></div>
                    </div>
                    <div class="wb-actions" title="查看/编辑">
                        <i class="fa-solid fa-pen"></i>
                    </div>
                </div>
                <div class="wb-entry-edit" style="display: none;">
                    <input type="text" class="text_pole edit-name">
                    <textarea class="text_pole edit-content"></textarea>
                    <div class="save-btn save-export-btn"><i class="fa-solid fa-floppy-disk"></i> 保存修改</div>
                </div>
            </div>
        `);
        $item.attr('data-index', String(index));
        $item.find('.export-entry-checkbox').attr('data-index', String(index));
        $item.find('.wb-title').html(`${esc(displayName)} <span class="role-tag">(${esc(role)})</span>`);
        $item.find('.wb-desc').text(content.substring(0, 100) + '...');
        $item.find<HTMLInputElement>('.edit-name').val(displayName);
        $item.find<HTMLTextAreaElement>('.edit-content').val(content);

        // Toggle checkbox when clicking the content area
        $item.find('.wb-content').on('click', function() {
            const $cb = $item.find('.export-entry-checkbox');
            $cb.prop('checked', !$cb.prop('checked'));
            updateExportCount();
        });

        $item.find('.export-entry-checkbox').on('change', updateExportCount);

        // Toggle edit view
        $item.find('.wb-actions').on('click', function(e) {
            e.stopPropagation();
            $item.find('.wb-entry-edit').slideToggle(200);
        });

        // Save edits back to preset
        $item.find('.save-export-btn').on('click', async function(e) {
            e.stopPropagation();
            const newName = $item.find('.edit-name').val() as string;
            const newContent = $item.find('.edit-content').val() as string;
            
            try {
                await updatePresetWith('in_use', (p) => {
                    const target = p.prompts[index];
                    if (target) {
                        target.name = newName;
                        target.content = newContent;
                    }
                    return p;
                });
                toastr.success('已保存到预设');
                prompt.name = newName;
                prompt.content = newContent;
                $item.find('.wb-title').html(`${esc(newName)} <span class="role-tag">(${esc(prompt.role || 'system')})</span>`);
                $item.find('.wb-desc').text((newContent || '').substring(0, 100) + '...');
                $item.find('.wb-entry-edit').slideUp(200);
            } catch (err) {
                console.error(err);
                toastr.error('保存失败');
            }
        });

        $item.data('prompt', prompt);
        $list.append($item);
    });
    
    updateExportCount();

    // Setup datalist for existing worldbooks
    const wbNames = getWorldbookNames();
    const $container = $('#preset-memo-export-target-container');
    setupSearchableSelect($container, wbNames, () => {
        // 允许自定义输入，不需要额外处理，因为 input 的值已经被更新
    }, true);

    // Bind export button
    $('#preset-memo-export-btn').off('click').on('click', async function() {
        const targetWbName = $('#preset-memo-export-target').val() as string;
        if (!targetWbName) {
            toastr.warning('请输入或选择目标世界书名称');
            return;
        }

        const selectedPrompts: any[] = [];
        $('.export-entry-checkbox:checked').each(function() {
            const index = parseInt($(this).data('index'));
            selectedPrompts.push(prompts[index]);
        });

        if (selectedPrompts.length === 0) {
            toastr.warning('请先勾选要导出的预设条目');
            return;
        }

        try {
            // Check if worldbook exists, if not create it
            const existingWbs = getWorldbookNames();
            if (!existingWbs.includes(targetWbName)) {
                await createWorldbook(targetWbName);
            }

            // Format entries for worldbook
            const newEntries = selectedPrompts.map(p => ({
                name: p.name || p.id || '未命名条目',
                content: p.content || ''
            }));

            await createWorldbookEntries(targetWbName, newEntries);
            toastr.success(`成功导出 ${newEntries.length} 个条目到世界书 "${targetWbName}"`);
            
            // Uncheck all after success
            $('.export-entry-checkbox').prop('checked', false);
            updateExportCount();
            
        } catch (e) {
            console.error('导出到世界书失败:', e);
            toastr.error('导出失败，请查看控制台');
        }
    });
}

function updateExportCount() {
    const total = $('.export-entry-checkbox').length;
    const count = $('.export-entry-checkbox:checked').length;
    $('#preset-memo-export-count').text(`已选中 ${count} 个条目`);
    syncSelectAllVisual('preset-memo-export-select-all', total, count);
}

// 工具: 根据 (总数, 已选数) 同步 master checkbox 的勾选/半选/未选状态
function syncSelectAllVisual(masterId: string, total: number, checked: number) {
    const $m = $(`#${masterId}`);
    if (total === 0 || checked === 0) {
        $m.prop('checked', false).prop('indeterminate', false);
    } else if (checked === total) {
        $m.prop('checked', true).prop('indeterminate', false);
    } else {
        $m.prop('checked', false).prop('indeterminate', true);
    }
}

// --- 生命周期 ---
$(() => {
    // 初始尝试注入
    initUI();
    
    // 如果预设界面是动态渲染的，可能需要定时检查确保按钮存在
    setInterval(() => {
        if ($('.completion_prompt_manager_footer').length && $(`#${BUTTON_ID}`).length === 0) {
            initUI();
        }
    }, 2000);
});

$(window).on('pagehide', () => {
    cleanupUI();
});
