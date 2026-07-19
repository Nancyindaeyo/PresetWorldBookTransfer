import type { InsertDraftSaveSummaryItem } from './preset-draft';
import { renderSaveSummaryNameTag, renderSaveSummaryNameTags } from './save-summary-tags';

export type InsertSaveSummary = {
  added: InsertDraftSaveSummaryItem[];
  deleted: string[];
  enabled: string[];
  disabled: string[];
};

export function renderInsertSaveSummaryHtml(summary: InsertSaveSummary): string {
  const renderTags = (items: InsertDraftSaveSummaryItem[]) =>
    `<div class="pm-save-summary-tags">${items
      .map(it =>
        renderSaveSummaryNameTag(it.name, {
          variant: it.duplicateName ? 'duplicate' : 'add',
          title: it.duplicateName ? '与预设中已有条目重名' : undefined,
        }),
      )
      .join('')}</div>`;

  const renderNameTags = (items: string[], variant: 'del' | 'enable' | 'disable' = 'del') =>
    renderSaveSummaryNameTags(items, variant);

  const renderDeletedSection = (items: string[]) => {
    if (items.length === 0) return '';
    return `
        <div class="pm-save-summary-section">
            <div class="pm-save-summary-heading pm-save-summary-heading--del">删除（${items.length}）</div>
            ${renderNameTags(items, 'del')}
        </div>`;
  };

  const renderAddedSection = (items: InsertDraftSaveSummaryItem[]) => {
    if (items.length === 0) return '';
    return `
        <div class="pm-save-summary-section">
            <div class="pm-save-summary-heading pm-save-summary-heading--add">新增（${items.length}）</div>
            ${renderTags(items)}
        </div>`;
  };

  const renderEnabledSection = (items: string[]) => {
    if (items.length === 0) return '';
    return `
        <div class="pm-save-summary-section">
            <div class="pm-save-summary-heading pm-save-summary-heading--enable">启用（${items.length}）</div>
            ${renderNameTags(items, 'enable')}
        </div>`;
  };

  const renderDisabledSection = (items: string[]) => {
    if (items.length === 0) return '';
    return `
        <div class="pm-save-summary-section">
            <div class="pm-save-summary-heading pm-save-summary-heading--disable">禁用（${items.length}）</div>
            ${renderNameTags(items, 'disable')}
        </div>`;
  };

  const onlyEdits =
    summary.added.length === 0 &&
    summary.deleted.length === 0 &&
    summary.enabled.length === 0 &&
    summary.disabled.length === 0;
  const hasDuplicateNames = summary.added.some(it => it.duplicateName);
  const duplicateWarn = hasDuplicateNames
    ? '<div class="pm-save-summary-warn"><i class="fa-solid fa-triangle-exclamation"></i> 部分新增条目与预设中已有条目<strong>重名</strong>，保存后会出现同名多条，请确认是否符合预期。</div>'
    : '';
  const sections =
    renderAddedSection(summary.added) +
    renderDeletedSection(summary.deleted) +
    renderEnabledSection(summary.enabled) +
    renderDisabledSection(summary.disabled);

  return `
        <div class="pm-save-summary-lead">以下变更将写入当前预设</div>
        ${duplicateWarn}
        ${sections || '<div class="pm-save-summary-empty">无新增、删除或启用状态变更</div>'}
        ${onlyEdits ? '<div class="pm-save-summary-note">另有条目内容或顺序已修改，未单独列出</div>' : ''}
    `;
}
