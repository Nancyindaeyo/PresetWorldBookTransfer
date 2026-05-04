import panelHtml from './panel.html?raw';
import cssContent from './style.scss?raw';
import { z } from 'zod';

// 定义备忘录条目的数据结构
const MemoEntrySchema = z.object({
    id: z.string(),
    name: z.string(),
    content: z.string(),
    enabled: z.boolean(),
    role: z.enum(['system', 'user', 'assistant']),
    position: z.object({ type: z.literal('relative') })
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
        
        // 绑定 Tab 切换事件
        $('.pm-tab-btn').off('click').on('click', function() {
            const targetTab = $(this).data('tab');
            switchTab(targetTab);
        });
        
        // 绑定导入按钮事件 (只绑定一次)
        $('#preset-memo-import-btn').off('click').on('click', function() {
            const selectedEntries: any[] = [];
            $('.wb-entry-checkbox:checked').each(function() {
                const $item = $(this).closest('.wb-entry-item');
                selectedEntries.push($item.data('entry'));
            });
            
            if (selectedEntries.length > 0) {
                const memo = getMemoData();
                selectedEntries.forEach(entry => {
                    memo.push({
                        id: 'memo_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
                        name: entry.name || '未命名条目',
                        content: entry.content || '',
                        enabled: true,
                        role: 'system',
                        position: { type: 'relative' }
                    });
                });
                saveMemoData(memo);
                toastr.success(`成功导入 ${selectedEntries.length} 个条目到备忘录`);
                switchTab('tab-memo');
                renderMemoList();
            } else {
                toastr.warning('请先勾选要导入的条目');
            }
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
        switchTab('tab-memo');
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
    } else if (tabId === 'tab-insert') {
        renderInsertView();
    }
}

// --- Tab 1: 备忘录管理 ---
function renderMemoList() {
    const memo = getMemoData();
    const $list = $('#preset-memo-list');
    $list.empty();
    
    if (memo.length === 0) {
        $list.append('<div class="pm-empty-state">备忘录为空，请从世界书导入。</div>');
        return;
    }
    
    memo.forEach((entry, index) => {
        const $item = $(`
            <div class="memo-entry-item">
                <div class="memo-header">
                    <div class="memo-left">
                        <input type="checkbox" class="memo-entry-checkbox" data-index="${index}">
                        <input type="text" class="text_pole memo-entry-name" value="${entry.name}">
                    </div>
                    <div class="memo-right">
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

// --- Tab 2: 从世界书导入 ---
async function loadWorldbooks() {
    try {
        const wbNames = getWorldbookNames();
        const $select = $('#preset-memo-wb-select');
        
        // Keep current selection if any
        const currentVal = $select.val();
        
        $select.empty();
        $select.append('<option value="">-- 请选择世界书 --</option>');
        
        wbNames.forEach(name => {
            $select.append(`<option value="${name}">${name}</option>`);
        });
        
        if (currentVal && wbNames.includes(currentVal as string)) {
            $select.val(currentVal);
        }
        
        $select.off('change').on('change', async function() {
            const selectedWb = $(this).val() as string;
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
        });
    } catch (e) {
        console.error('获取世界书列表失败:', e);
        toastr.error('获取世界书列表失败');
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

// --- Tab 3: 插入位置选择 ---
function renderInsertView() {
    const selectedMemoIndices: number[] = [];
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
