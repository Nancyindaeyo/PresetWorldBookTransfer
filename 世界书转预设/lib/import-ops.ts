import { genMemoId, type MemoEntry } from '../schema';
import { getFolders, getMemoData, saveFolders, saveMemoData } from './script-vars';

export type ImportDuplicateMode = 'overwrite' | 'skip' | 'add';

export type ImportEntryInput = {
  name: string;
  content: string;
  role: 'system' | 'user' | 'assistant';
};

export function applyImportToMemo(
  entries: ImportEntryInput[],
  targetFolder: string,
  mode: ImportDuplicateMode,
): { added: number; updated: number; skipped: number } {
  const memo = getMemoData();
  const folders = getFolders();
  if (!folders.includes(targetFolder)) {
    folders.push(targetFolder);
    saveFolders(folders);
  }

  const existingByName = new Map<string, MemoEntry>();
  memo.forEach(e => {
    if ((e.folder || '默认') === targetFolder) existingByName.set(e.name, e);
  });

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
  return { added, updated, skipped };
}

export function findImportDuplicates(entries: ImportEntryInput[], targetFolder: string): ImportEntryInput[] {
  const memo = getMemoData();
  const existingNames = new Set(
    memo.filter(e => (e.folder || '默认') === targetFolder).map(e => e.name),
  );
  return entries.filter(e => existingNames.has(e.name));
}
