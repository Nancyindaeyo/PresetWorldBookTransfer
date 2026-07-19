import _ from 'lodash';
import { computed, ref, type Ref } from 'vue';
import { entryMatchesKeyword } from '../lib/search';
import {
  ensureMemoFolderVisible,
  getFolderMeta,
  getFolders,
  getMemoData,
  saveCurrentFolder,
  saveFolderMeta,
  saveFolders,
  saveMemoData,
  type FolderMeta,
} from '../lib/script-vars';
import { genMemoId, type MemoEntry } from '../schema';

export function createMemoState(currentFolder: Ref<string>, selectedMemoIds: Ref<Set<string>>) {
  const searchKeyword = ref('');
  const expandedMemoIds = ref(new Set<string>());
  const memo = ref<MemoEntry[]>([]);
  const folders = ref<string[]>(['默认']);
  const folderMeta = ref<Record<string, FolderMeta>>({});

  const sortedFolders = computed(() => {
    const pinned: string[] = [];
    const normal: string[] = [];
    folders.value.forEach(f => {
      if (f === '默认') return;
      if (folderMeta.value[f]?.pinned) pinned.push(f);
      else normal.push(f);
    });
    return ['默认', ...pinned, ...normal];
  });

  const currentFolderMemo = computed(() => memo.value.filter(e => (e.folder || '默认') === currentFolder.value));

  const filteredMemoEntries = computed(() => {
    const k = searchKeyword.value;
    return currentFolderMemo.value.filter(e => entryMatchesKeyword(k, e.name, e.content));
  });

  function hydrateMemoFromVars() {
    memo.value = getMemoData();
    folders.value = getFolders();
    folderMeta.value = getFolderMeta();
    currentFolder.value = ensureMemoFolderVisible(memo.value, currentFolder.value);
  }

  function persistMemo() {
    saveMemoData(_.cloneDeep(memo.value));
  }

  function persistFolders() {
    saveFolders(_.cloneDeep(folders.value));
  }

  function persistFolderMeta() {
    saveFolderMeta(_.cloneDeep(folderMeta.value));
  }

  function setCurrentFolder(folder: string) {
    currentFolder.value = folder;
    saveCurrentFolder(folder);
    selectedMemoIds.value = new Set();
  }

  function toggleMemoExpanded(id: string) {
    const next = new Set(expandedMemoIds.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    expandedMemoIds.value = next;
  }

  function updateMemoEntry(id: string, patch: Partial<MemoEntry>) {
    const idx = memo.value.findIndex(e => e.id === id);
    if (idx === -1) return;
    memo.value[idx] = { ...memo.value[idx], ...patch };
    persistMemo();
  }

  function deleteMemoEntries(ids: string[]) {
    const idSet = new Set(ids);
    memo.value = memo.value.filter(e => !idSet.has(e.id));
    ids.forEach(id => expandedMemoIds.value.delete(id));
    expandedMemoIds.value = new Set(expandedMemoIds.value);
    selectedMemoIds.value = new Set([...selectedMemoIds.value].filter(id => !idSet.has(id)));
    persistMemo();
  }

  function copyMemoEntry(id: string) {
    const idx = memo.value.findIndex(e => e.id === id);
    if (idx === -1) return;
    const src = memo.value[idx];
    const copy: MemoEntry = {
      id: genMemoId(),
      name: src.name + ' (副本)',
      content: src.content,
      enabled: src.enabled,
      role: src.role,
      position: { type: 'relative' },
      folder: src.folder,
    };
    memo.value.splice(idx + 1, 0, copy);
    expandedMemoIds.value = new Set([...expandedMemoIds.value, copy.id]);
    persistMemo();
    return copy.id;
  }

  function createMemoEntry(folder?: string) {
    const targetFolder = folder ?? (folders.value.includes(currentFolder.value) ? currentFolder.value : '默认');
    const entry: MemoEntry = {
      id: genMemoId(),
      name: '新条目',
      content: '',
      enabled: true,
      role: 'system',
      position: { type: 'relative' },
      folder: targetFolder,
    };
    memo.value.push(entry);
    expandedMemoIds.value = new Set([...expandedMemoIds.value, entry.id]);
    persistMemo();
    return entry.id;
  }

  /** 与 sortedFolders 一致：置顶文件夹排在普通文件夹之前 */
  function reorderFolders(orderedNonDefault: string[]) {
    const meta = folderMeta.value;
    const pinned = orderedNonDefault.filter(f => meta[f]?.pinned);
    const normal = orderedNonDefault.filter(f => !meta[f]?.pinned);
    folders.value = ['默认', ...pinned, ...normal];
    persistFolders();
  }

  function reorderMemoInFolder(orderedIds: string[]) {
    const current = orderedIds.map(id => memo.value.find(e => e.id === id)).filter((e): e is MemoEntry => !!e);
    const other = memo.value.filter(e => (e.folder || '默认') !== currentFolder.value);
    memo.value = [...current, ...other];
    persistMemo();
  }

  function batchMoveMemo(targetFolder: string, ids: string[]) {
    const idSet = new Set(ids);
    memo.value.forEach(e => {
      if (idSet.has(e.id)) e.folder = targetFolder;
    });
    persistMemo();
    selectedMemoIds.value = new Set();
  }

  return {
    searchKeyword,
    expandedMemoIds,
    memo,
    folders,
    folderMeta,
    sortedFolders,
    currentFolderMemo,
    filteredMemoEntries,
    hydrateMemoFromVars,
    persistMemo,
    persistFolders,
    persistFolderMeta,
    setCurrentFolder,
    toggleMemoExpanded,
    updateMemoEntry,
    deleteMemoEntries,
    copyMemoEntry,
    createMemoEntry,
    reorderFolders,
    reorderMemoInFolder,
    batchMoveMemo,
  };
}
