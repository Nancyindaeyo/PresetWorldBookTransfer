import { esc } from './search';

/** 胶囊标签：名称展示 */
export function renderSaveSummaryNameTag(
  name: string,
  opts?: {
    variant?: 'default' | 'duplicate' | 'add' | 'del' | 'enable' | 'disable';
    title?: string;
    iconClass?: string;
  },
): string {
  const variant = opts?.variant ?? 'default';
  const mod =
    variant === 'duplicate'
      ? ' pm-save-summary-tag--duplicate'
      : variant === 'add'
        ? ' pm-save-summary-tag--add'
        : variant === 'del'
          ? ' pm-save-summary-tag--del'
          : variant === 'enable'
            ? ' pm-save-summary-tag--enable'
            : variant === 'disable'
              ? ' pm-save-summary-tag--disable'
              : '';

  const title = opts?.title ? ` title="${esc(opts.title)}"` : '';

  if (variant === 'duplicate') {
    return `<span class="pm-save-summary-tag${mod}"${title}><i class="fa-solid fa-cloud pm-save-summary-tag-icon" aria-hidden="true"></i><span class="pm-save-summary-tag-text">${esc(name)}</span><i class="fa-solid fa-triangle-exclamation pm-save-summary-dup-icon" aria-hidden="true"></i></span>`;
  }

  const icon =
    opts?.iconClass ??
    (variant === 'add'
      ? 'fa-cloud'
      : variant === 'del'
        ? 'fa-trash'
        : variant === 'enable'
          ? 'fa-circle-check'
          : variant === 'disable'
            ? 'fa-ban'
            : 'fa-tag');

  return `<span class="pm-save-summary-tag${mod}"${title}><i class="fa-solid ${icon} pm-save-summary-tag-icon" aria-hidden="true"></i><span class="pm-save-summary-tag-text">${esc(name)}</span></span>`;
}

export function renderSaveSummaryNameTags(
  names: string[],
  variant: 'default' | 'duplicate' | 'add' | 'del' | 'enable' | 'disable' = 'default',
): string {
  if (names.length === 0) return '';
  return `<div class="pm-save-summary-tags">${names.map(n => renderSaveSummaryNameTag(n, { variant })).join('')}</div>`;
}
