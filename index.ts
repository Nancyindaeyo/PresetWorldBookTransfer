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
        $('#preset-memo-close-btn, #preset-memo-modal-overlay').off('click').on('click', closeModal);
        $('#preset-memo-modal-content').off('click').on('click', (e) => e.stopPropagation());
        
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
        $('#preset-memo-import-btn').off('click').on('click', function() {
            const targetFolder = $('#preset-memo-import-wb-folder').val() as string || '默认';
            const selectedEntries: any[] = [];
            $('.wb-entry-checkbox:checked').each(function() {
                const $item = $(this).closest('.wb-entry-item');
                selectedEntries.push($item.data('entry'));
            });
            
            if (selectedEntries.length > 0) {
                const memo = getMemoData();
                const folders = getFolders();
                if (!folders.includes(targetFolder)) {
                    folders.push(targetFolder);
                    saveFolders(folders);
                }

                selectedEntries.forEach(entry => {
                    memo.push({
                        id: 'memo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name: entry.name || '未命名条目',
                        content: entry.content || '',
                        enabled: true,
                        role: 'system',
                        position: { type: 'relative' },
                        folder: targetFolder
                    });
                });
                saveMemoData(memo);
                toastr.success(`成功导入 ${selectedEntries.length} 个条目到备忘录的 "${targetFolder}" 文件夹`);
                currentFolder = targetFolder;
                switchTab('tab-memo');
                renderFoldersBar();
                renderMemoList();
            } else {
                toastr.warning('请先勾选要导入的条目');
            }
        });

        // 绑定导入预设按钮事件 (只绑定一次)
        $('#preset-memo-import-preset-btn').off('click').on('click', function() {
            const targetFolder = $('#preset-memo-import-preset-folder').val() as string || '默认';
            const selectedEntries: any[] = [];
            $('.preset-entry-checkbox:checked').each(function() {
                const $item = $(this).closest('.wb-entry-item');
                selectedEntries.push($item.data('entry'));
            });
            
            if (selectedEntries.length > 0) {
                const memo = getMemoData();
                const folders = getFolders();
                if (!folders.includes(targetFolder)) {
                    folders.push(targetFolder);
                    saveFolders(folders);
                }

                selectedEntries.forEach(entry => {
                    memo.push({
                        id: 'memo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name: entry.name || entry.id || '未命名条目',
                        content: entry.content || '',
                        enabled: true,
                        role: entry.role || 'system',
                        position: { type: 'relative' },
                        folder: targetFolder
                    });
                });
                saveMemoData(memo);
                toastr.success(`成功导入 ${selectedEntries.length} 个条目到备忘录的 "${targetFolder}" 文件夹`);
                currentFolder = targetFolder;
                switchTab('tab-memo');
                renderFoldersBar();
                renderMemoList();
            } else {
                toastr.warning('请先勾选要导入的条目');
            }
        });

        // 绑定新建文件夹按钮
        function handleNewFolderClick(selectId: string) {
            const name = prompt('请输入新文件夹名称:');
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

        // 绑定批量移动按钮事件
        $('#preset-memo-batch-move-select').off('change').on('change', function() {
            const targetFolder = $(this).val() as string;
            if (!targetFolder) return;
            
            const selectedIndices: number[] = [];
            $('.memo-entry-checkbox:checked').each(function() {
                selectedIndices.push(parseInt($(this).data('index')));
            });
            
            if (selectedIndices.length === 0) {
                toastr.warning('请先勾选要移动的条目');
                $(this).val('');
                return;
            }
            
            const memo = getMemoData();
            selectedIndices.forEach(idx => {
                memo[idx].folder = targetFolder;
            });
            saveMemoData(memo);
            toastr.success(`已将 ${selectedIndices.length} 个条目移动到 "${targetFolder}"`);
            $(this).val('');
            renderMemoList();
        });

        // 绑定批量删除按钮事件
        $('#preset-memo-batch-delete-btn').off('click').on('click', function() {
            const selectedIndices: number[] = [];
            $('.memo-entry-checkbox:checked').each(function() {
                selectedIndices.push(parseInt($(this).data('index')));
            });
            
            if (selectedIndices.length === 0) {
                toastr.warning('请先勾选要删除的条目');
                return;
            }
            
            if (confirm(`确定要删除选中的 ${selectedIndices.length} 个条目吗？\n此操作不可恢复！`)) {
                const memo = getMemoData();
                // 过滤掉被选中的索引
                const newMemo = memo.filter((_, i) => !selectedIndices.includes(i));
                saveMemoData(newMemo);
                toastr.success(`已删除 ${selectedIndices.length} 个条目`);
                renderMemoList();
            }
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
        
        switchTab('tab-memo');
        renderFoldersBar();
        updateFolderSelects();
        renderMemoList();
    } catch (e) {
        console.error('Preset Memo Error:', e);
        toastr.error('打开备忘录失败，请查看控制台');
    }
}

function closeModal() {
    $(`#${MODAL_ID}`).css('display', 'none');
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
}

// --- Tab 1: 备忘录管理 ---
function updateFolderSelects() {
    const folders = getFolders();
    
    // Batch move
    const $batchMove = $('#preset-memo-batch-move-select');
    $batchMove.empty().append('<option value="">批量移动到...</option>');
    folders.forEach(f => {
        if (f !== currentFolder) $batchMove.append(`<option value="${f}">${f}</option>`);
    });
    
    // Import WB
    const $wbSelect = $('#preset-memo-import-wb-folder');
    const wbVal = $wbSelect.val() || '默认';
    $wbSelect.empty();
    folders.forEach(f => $wbSelect.append(`<option value="${f}">${f}</option>`));
    if (folders.includes(wbVal as string)) $wbSelect.val(wbVal);
    else $wbSelect.val('默认');
    
    // Import Preset
    const $presetSelect = $('#preset-memo-import-preset-folder');
    const presetVal = $presetSelect.val() || '默认';
    $presetSelect.empty();
    folders.forEach(f => $presetSelect.append(`<option value="${f}">${f}</option>`));
    if (folders.includes(presetVal as string)) $presetSelect.val(presetVal);
    else $presetSelect.val('默认');
}

function renderFoldersBar() {
    const folders = getFolders();
    const $bar = $('#preset-memo-folders-bar');
    $bar.empty();

    folders.forEach(folder => {
        const isDefault = folder === '默认';
        const $tab = $(`
            <div class="pm-folder-tab ${folder === currentFolder ? 'active' : ''}" data-folder="${folder}">
                <i class="fa-solid fa-folder"></i> <span class="folder-name">${folder}</span>
                ${!isDefault ? `
                    <i class="fa-solid fa-pen folder-edit" title="重命名文件夹"></i>
                    <i class="fa-solid fa-xmark folder-delete" title="删除文件夹"></i>
                ` : ''}
            </div>
        `);

        $tab.on('click', function(e) {
            if ($(e.target).hasClass('folder-delete') || $(e.target).hasClass('folder-edit')) return;
            currentFolder = folder;
            renderFoldersBar();
            updateFolderSelects();
            renderMemoList();
        });

        if (!isDefault) {
            $tab.find('.folder-edit').on('click', function(e) {
                e.stopPropagation();
                const newName = prompt('请输入新的文件夹名称:', folder);
                if (newName && newName.trim() && newName.trim() !== folder) {
                    const trimmed = newName.trim();
                    if (folders.includes(trimmed)) {
                        toastr.warning('文件夹名已存在');
                        return;
                    }
                    // Update folders
                    const idx = folders.indexOf(folder);
                    if (idx !== -1) folders[idx] = trimmed;
                    saveFolders(folders);
                    
                    // Update memos
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

            $tab.find('.folder-delete').on('click', function(e) {
                e.stopPropagation();
                if (confirm(`确定要删除文件夹 "${folder}" 吗？\n其中的条目将被移动到"默认"文件夹。`)) {
                    // 移动条目
                    const memo = getMemoData();
                    memo.forEach(entry => {
                        if (entry.folder === folder) {
                            entry.folder = '默认';
                        }
                    });
                    saveMemoData(memo);

                    // 删除文件夹
                    const newFolders = folders.filter(f => f !== folder);
                    saveFolders(newFolders);

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
        <div class="pm-folder-tab" style="border-style: dashed;">
            <i class="fa-solid fa-plus"></i> 新建文件夹
        </div>
    `);
    $newBtn.on('click', function() {
        const name = prompt('请输入新文件夹名称:');
        if (name && name.trim()) {
            const folderName = name.trim();
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
}

function renderMemoList() {
    const memo = getMemoData();
    const folders = getFolders();
    const $list = $('#preset-memo-list');
    $list.empty();
    
    // 过滤当前文件夹的条目
    const currentMemo = memo.filter(entry => (entry.folder || '默认') === currentFolder);
    
    if (currentMemo.length === 0) {
        $list.append('<div class="pm-empty-state">当前文件夹为空。</div>');
        return;
    }
    
    currentMemo.forEach((entry) => {
        // 找到在原始数组中的索引，以便修改和删除
        const index = memo.findIndex(e => e.id === entry.id);
        if (index === -1) return;

        const $item = $(`
            <div class="memo-entry-item">
                <div class="memo-header">
                    <div class="memo-left">
                        <input type="checkbox" class="memo-entry-checkbox" data-index="${index}">
                        <input type="text" class="text_pole memo-entry-name" value="${entry.name}">
                    </div>
                    <div class="memo-right">
                        <select class="text_pole memo-entry-folder" title="所属文件夹">
                            ${folders.map(f => `<option value="${f}" ${f === (entry.folder || '默认') ? 'selected' : ''}>${f}</option>`).join('')}
                        </select>
                        <select class="text_pole memo-entry-role">
                            <option value="system" ${entry.role === 'system' ? 'selected' : ''}>System</option>
                            <option value="user" ${entry.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="assistant" ${entry.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                        </select>
                        <div class="menu_button fa-solid fa-trash text-red-500 memo-entry-delete interactable" data-index="${index}" title="删除"></div>
                    </div>
                </div>
                <textarea class="text_pole memo-entry-content">${entry.content}</textarea>
            </div>
        `);
        
        // 绑定修改事件
        $item.find('.memo-entry-name').on('change', function() {
            memo[index].name = $(this).val() as string;
            saveMemoData(memo);
        });
        $item.find('.memo-entry-role').on('change', function() {
            memo[index].role = $(this).val() as 'system' | 'user' | 'assistant';
            saveMemoData(memo);
        });
        $item.find('.memo-entry-folder').on('change', function() {
            memo[index].folder = $(this).val() as string;
            saveMemoData(memo);
            renderMemoList(); // 重新渲染以移出当前列表
        });
        $item.find('.memo-entry-content').on('change', function() {
            memo[index].content = $(this).val() as string;
            saveMemoData(memo);
        });
        
        // 绑定删除事件
        $item.find('.memo-entry-delete').on('click', function() {
            if (confirm(`确定要删除条目 "${entry.name}" 吗？`)) {
                memo.splice(index, 1);
                saveMemoData(memo);
                renderMemoList();
                toastr.success('已删除条目');
            }
        });
        
        $list.append($item);
    });
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
                const $opt = $(`<div class="pm-select-option">${opt}</div>`);
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
            <div class="wb-entry-item" data-index="${index}">
                <div class="wb-entry-header">
                    <input type="checkbox" class="wb-entry-checkbox" data-index="${index}" style="margin-top: 4px;">
                    <div class="wb-content">
                        <div class="wb-title">${entry.name}</div>
                        <div class="wb-desc">${entry.content.substring(0, 100)}...</div>
                    </div>
                    <div class="wb-actions" title="查看/编辑">
                        <i class="fa-solid fa-pen"></i>
                    </div>
                </div>
                <div class="wb-entry-edit" style="display: none;">
                    <input type="text" class="text_pole edit-name" value="${entry.name}">
                    <textarea class="text_pole edit-content">${entry.content}</textarea>
                    <div class="save-btn save-wb-btn"><i class="fa-solid fa-floppy-disk"></i> 保存修改</div>
                </div>
            </div>
        `);

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
                // Update local data so import uses new data
                entry.name = newName;
                entry.content = newContent;
                $item.find('.wb-title').text(newName);
                $item.find('.wb-desc').text(newContent.substring(0, 100) + '...');
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
    const count = $('.wb-entry-checkbox:checked').length;
    $('#preset-memo-import-count').text(`已选中 ${count} 个条目`);
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
        const $item = $(`
            <div class="wb-entry-item" data-index="${index}">
                <div class="wb-entry-header">
                    <input type="checkbox" class="preset-entry-checkbox" data-index="${index}" style="margin-top: 4px;">
                    <div class="wb-content">
                        <div class="wb-title">${entry.name || entry.id} <span class="role-tag">(${entry.role || 'system'})</span></div>
                        <div class="wb-desc">${(entry.content || '').substring(0, 100)}...</div>
                    </div>
                    <div class="wb-actions" title="查看/编辑">
                        <i class="fa-solid fa-pen"></i>
                    </div>
                </div>
                <div class="wb-entry-edit" style="display: none;">
                    <input type="text" class="text_pole edit-name" value="${entry.name || entry.id || ''}">
                    <select class="text_pole edit-role">
                        <option value="system" ${entry.role === 'system' ? 'selected' : ''}>System</option>
                        <option value="user" ${entry.role === 'user' ? 'selected' : ''}>User</option>
                        <option value="assistant" ${entry.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                    </select>
                    <textarea class="text_pole edit-content">${entry.content || ''}</textarea>
                    <div class="save-btn save-preset-entry-btn"><i class="fa-solid fa-floppy-disk"></i> 保存修改</div>
                </div>
            </div>
        `);

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
                // Update local data so import uses new data
                entry.name = newName;
                entry.role = newRole;
                entry.content = newContent;
                $item.find('.wb-title').html(`${newName} <span class="role-tag">(${newRole})</span>`);
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
    const count = $('.preset-entry-checkbox:checked').length;
    $('#preset-memo-import-preset-count').text(`已选中 ${count} 个条目`);
}

// --- Tab 3: 插入位置选择 ---
function renderInsertView() {
    const selectedMemoIndices: number[] = [];
    // 只有当前文件夹下被勾选的才会被插入
    $('.memo-entry-checkbox:checked').each(function() {
        selectedMemoIndices.push(parseInt($(this).data('index')));
    });
    
    if (selectedMemoIndices.length === 0) {
        $('#preset-memo-insert-container').html('<div class="pm-empty-state" style="color: var(--SmartThemeQuoteColor);">请先在备忘录中勾选要插入的条目。</div>');
        return;
    }
    
    const preset = getPreset('in_use');
    const prompts = preset.prompts || [];
    const $container = $('#preset-memo-insert-container');
    $container.empty();
    
    // 渲染插入点和现有条目
    for (let i = 0; i <= prompts.length; i++) {
        // 插入点
        const $insertPoint = $(`
            <div class="insert-point" data-index="${i}">
                <div class="insert-btn interactable">
                    <i class="fa-solid fa-plus"></i> 插入到此处
                </div>
            </div>
        `);
        
        $insertPoint.on('click', async function() {
            const insertIndex = parseInt($(this).data('index'));
            await performInsert(selectedMemoIndices, insertIndex);
        });
        
        $container.append($insertPoint);
        
        // 现有条目
        if (i < prompts.length) {
            const prompt = prompts[i];
            const $promptItem = $(`
                <div class="preset-prompt-item">
                    <div class="preset-prompt-header">
                        <div class="preset-prompt-title">
                            ${prompt.name || prompt.id} <span class="role-tag">(${prompt.role})</span>
                        </div>
                        <div class="preset-prompt-actions" title="查看/编辑">
                            <i class="fa-solid fa-pen"></i>
                        </div>
                    </div>
                    <div class="preset-prompt-edit" style="display: none;">
                        <input type="text" class="text_pole edit-name" value="${prompt.name || ''}">
                        <select class="text_pole edit-role">
                            <option value="system" ${prompt.role === 'system' ? 'selected' : ''}>System</option>
                            <option value="user" ${prompt.role === 'user' ? 'selected' : ''}>User</option>
                            <option value="assistant" ${prompt.role === 'assistant' ? 'selected' : ''}>Assistant</option>
                        </select>
                        <textarea class="text_pole edit-content">${prompt.content || ''}</textarea>
                        <div class="save-btn save-preset-btn"><i class="fa-solid fa-floppy-disk"></i> 保存修改</div>
                    </div>
                </div>
            `);

            // Toggle edit view
            $promptItem.find('.preset-prompt-header').on('click', function() {
                $promptItem.find('.preset-prompt-edit').slideToggle(200);
            });

            // Save edits back to preset
            $promptItem.find('.save-preset-btn').on('click', async function(e) {
                e.stopPropagation();
                const newName = $promptItem.find('.edit-name').val() as string;
                const newRole = $promptItem.find('.edit-role').val() as 'system' | 'user' | 'assistant';
                const newContent = $promptItem.find('.edit-content').val() as string;
                
                try {
                    await updatePresetWith('in_use', (p) => {
                        const target = p.prompts[i];
                        if (target) {
                            target.name = newName;
                            target.role = newRole;
                            target.content = newContent;
                        }
                        return p;
                    });
                    toastr.success('已保存到当前预设');
                    renderInsertView(); // Re-render to reflect changes
                } catch (err) {
                    console.error(err);
                    toastr.error('保存失败');
                }
            });

            $container.append($promptItem);
        }
    }
}

async function performInsert(memoIndices: number[], insertIndex: number) {
    const memo = getMemoData();
    const entriesToInsert = memoIndices.map(i => memo[i]);
    
    try {
        await updatePresetWith('in_use', (preset) => {
            const newPrompts = [...preset.prompts];
            // 在指定位置插入
            newPrompts.splice(insertIndex, 0, ...entriesToInsert);
            preset.prompts = newPrompts;
            return preset;
        });
        
        toastr.success('成功插入预设条目！');
        closeModal();
    } catch (error) {
        console.error(error);
        toastr.error('插入失败，请查看控制台');
    }
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
        const $item = $(`
            <div class="wb-entry-item" data-index="${index}">
                <div class="wb-entry-header">
                    <input type="checkbox" class="export-entry-checkbox" data-index="${index}" style="margin-top: 4px;">
                    <div class="wb-content">
                        <div class="wb-title">${prompt.name || prompt.id} <span class="role-tag">(${prompt.role})</span></div>
                        <div class="wb-desc">${(prompt.content || '').substring(0, 100)}...</div>
                    </div>
                    <div class="wb-actions" title="查看/编辑">
                        <i class="fa-solid fa-pen"></i>
                    </div>
                </div>
                <div class="wb-entry-edit" style="display: none;">
                    <input type="text" class="text_pole edit-name" value="${prompt.name || prompt.id || ''}">
                    <textarea class="text_pole edit-content">${prompt.content || ''}</textarea>
                    <div class="save-btn save-export-btn"><i class="fa-solid fa-floppy-disk"></i> 保存修改</div>
                </div>
            </div>
        `);

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
                // Update local UI
                prompt.name = newName;
                prompt.content = newContent;
                $item.find('.wb-title').html(`${newName} <span class="role-tag">(${prompt.role})</span>`);
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
    const count = $('.export-entry-checkbox:checked').length;
    $('#preset-memo-export-count').text(`已选中 ${count} 个条目`);
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
