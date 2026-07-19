/** 预设备忘录主题: 7 个用户 token + CSS 派生 + 预设色板 (参考世界书管理器) */

export type PmThemeMode = 'light' | 'dark';

/** custom = 面板自带配色；tavern = 跟随酒馆 SmartTheme 美化变量 */
export type PmThemeStyle = 'custom' | 'tavern';

export const PM_THEME_STYLE_TAVERN: PmThemeStyle = 'tavern';
export const PM_TAVERN_FOLLOW_PRESET_ID = 'tavern-follow';

/** 用户可调 7 项; 悬停/导入导出/成功色等由 CSS 派生 */
export type PmThemeTokens = {
  primary: string;
  surface: string;
  itemBg: string;
  text: string;
  muted: string;
  border: string;
  danger: string;
};

export type PmThemePreset = {
  id: string;
  label?: string;
  dark: PmThemeTokens;
  light: PmThemeTokens;
  builtIn?: boolean;
};

export type PmThemeSettings = {
  mode: PmThemeMode;
  /** 配色来源：内置预设/自定义，或跟随酒馆美化 */
  style: PmThemeStyle;
  dark: PmThemeTokens;
  light: PmThemeTokens;
  customPresets: PmThemePreset[];
  /** 跟随酒馆时，SmartTheme 未覆盖的面板专用色（成功/警告/危险等） */
  tavernManual: Record<PmThemeMode, PmTavernManualColors>;
};

/** 跟随酒馆美化时仍可微调、且不由 SmartTheme 驱动的颜色 */
export type PmTavernManualColors = {
  success: string;
  warning: string;
  warningBg: string;
  warningText: string;
  danger: string;
};

export type PmTavernManualField = {
  key: keyof PmTavernManualColors;
  label: string;
  hint: string;
  cssVar: string;
  pickerFallback?: string;
};

export const PM_TAVERN_MANUAL_FIELDS: PmTavernManualField[] = [
  { key: 'success', label: '成功色', hint: '保存成功、完成状态', cssVar: '--pm-success', pickerFallback: '#4caf50' },
  { key: 'warning', label: '警告色', hint: '警告强调、待处理标记', cssVar: '--pm-warning', pickerFallback: '#e6a700' },
  {
    key: 'warningBg',
    label: '警告背景',
    hint: '警告条、提示框底色',
    cssVar: '--pm-warning-bg',
    pickerFallback: '#e6a700',
  },
  {
    key: 'warningText',
    label: '警告文字',
    hint: '警告提示内文字颜色',
    cssVar: '--pm-warning-text',
    pickerFallback: '#92400e',
  },
  {
    key: 'danger',
    label: '危险色',
    hint: '删除按钮等（覆盖 SmartTheme 下划线映射）',
    cssVar: '--pm-danger-base',
    pickerFallback: '#ff6b6b',
  },
];

export function defaultPmTavernManualColors(mode: PmThemeMode): PmTavernManualColors {
  if (mode === 'light') {
    return {
      success: '#4caf50',
      warning: '#e6a700',
      warningBg: 'rgba(230, 167, 0, 0.12)',
      warningText: '#92400e',
      danger: '#e55353',
    };
  }
  return {
    success: '#4caf50',
    warning: '#e6a700',
    warningBg: 'rgba(230, 167, 0, 0.15)',
    warningText: '#e6d5a8',
    danger: '#ff6b6b',
  };
}

export function buildPmTavernManualCssVars(colors: PmTavernManualColors): Record<string, string> {
  const map: Record<string, string> = {};
  for (const field of PM_TAVERN_MANUAL_FIELDS) {
    map[field.cssVar] = colors[field.key];
  }
  map['--pm-danger'] = colors.danger;
  map['--pm-danger-soft'] = colors.danger;
  return map;
}

export type PmTokenField = {
  key: keyof PmThemeTokens;
  label: string;
  hint: string;
  /** color input 不支持 rgba 时用于取色器近似色 */
  pickerFallback?: string;
};

export const PM_TOKEN_FIELDS: PmTokenField[] = [
  { key: 'primary', label: '主色调', hint: '按钮、选中、勾选框填充、链接强调' },
  { key: 'surface', label: '背景底色', hint: '面板、标签栏、列表区背景' },
  {
    key: 'itemBg',
    label: '卡片底色',
    hint: '条目卡片、输入框、按钮底',
    pickerFallback: '#1a1a1a',
  },
  { key: 'text', label: '正文颜色', hint: '标题、标签、输入文字' },
  {
    key: 'muted',
    label: '次要文字',
    hint: '内容预览、提示、占位说明',
    pickerFallback: '#888888',
  },
  { key: 'border', label: '边框颜色', hint: '卡片、输入框、分割线' },
  { key: 'danger', label: '危险色', hint: '删除按钮、危险操作' },
];

export const PM_TOKEN_KEYS = PM_TOKEN_FIELDS.map(f => f.key);

export const PM_TOKEN_VAR_MAP: Record<keyof PmThemeTokens, string> = {
  primary: '--pm-accent-base',
  surface: '--pm-surface',
  itemBg: '--pm-item-bg-base',
  text: '--pm-text-base',
  muted: '--pm-muted-base',
  border: '--pm-border-base',
  danger: '--pm-danger-base',
};

export const PM_DEFAULT_DARK: PmThemeTokens = {
  primary: '#0066cc',
  surface: '#1a1a1a',
  itemBg: 'rgba(0, 0, 0, 0.5)',
  text: '#eeeeee',
  muted: 'rgba(255, 255, 255, 0.55)',
  border: '#444444',
  danger: '#ff6b6b',
};

export const PM_DEFAULT_LIGHT: PmThemeTokens = {
  primary: '#0066cc',
  surface: '#f5f5f5',
  itemBg: '#ffffff',
  text: '#333333',
  muted: 'rgba(0, 0, 0, 0.5)',
  border: '#cccccc',
  danger: '#e55353',
};

export const PM_BUILTIN_DARK_PRESETS: PmThemePreset[] = [
  { id: 'dark-default', label: '经典蓝', builtIn: true, dark: PM_DEFAULT_DARK, light: PM_DEFAULT_LIGHT },
  {
    id: 'dark-forest',
    label: '墨绿',
    builtIn: true,
    dark: {
      primary: '#2d8659',
      surface: '#141a16',
      itemBg: 'rgba(0, 0, 0, 0.45)',
      text: '#e8eee8',
      muted: 'rgba(232, 238, 232, 0.55)',
      border: '#2a3d32',
      danger: '#e57373',
    },
    light: PM_DEFAULT_LIGHT,
  },
  {
    id: 'dark-violet',
    label: '紫夜',
    builtIn: true,
    dark: {
      primary: '#7c5cbf',
      surface: '#1a1525',
      itemBg: 'rgba(0, 0, 0, 0.45)',
      text: '#ece8f5',
      muted: 'rgba(236, 232, 245, 0.55)',
      border: '#3d3555',
      danger: '#f06292',
    },
    light: PM_DEFAULT_LIGHT,
  },
  {
    id: 'dark-warm',
    label: '暖炭',
    builtIn: true,
    dark: {
      primary: '#c67c4e',
      surface: '#1f1a18',
      itemBg: 'rgba(0, 0, 0, 0.45)',
      text: '#f0ebe8',
      muted: 'rgba(240, 235, 232, 0.55)',
      border: '#4a3f38',
      danger: '#ef5350',
    },
    light: PM_DEFAULT_LIGHT,
  },
  {
    id: 'dark-pure',
    label: '纯黑',
    builtIn: true,
    dark: {
      primary: '#4a9eff',
      surface: '#0d0d0d',
      itemBg: '#1a1a1a',
      text: '#f5f5f5',
      muted: 'rgba(245, 245, 245, 0.55)',
      border: '#333333',
      danger: '#ff5252',
    },
    light: PM_DEFAULT_LIGHT,
  },
];

export const PM_BUILTIN_LIGHT_PRESETS: PmThemePreset[] = [
  { id: 'light-default', label: '默认白', builtIn: true, dark: PM_DEFAULT_DARK, light: PM_DEFAULT_LIGHT },
  {
    id: 'light-paper',
    label: '米纸',
    builtIn: true,
    dark: PM_DEFAULT_DARK,
    light: {
      primary: '#8b9467',
      surface: '#f5f2e9',
      itemBg: '#edeae0',
      text: '#4a453a',
      muted: '#707070',
      border: '#ddd5c8',
      danger: '#c62828',
    },
  },
  {
    id: 'light-mint',
    label: '薄荷',
    builtIn: true,
    dark: PM_DEFAULT_DARK,
    light: {
      primary: '#2d8659',
      surface: '#f0f7f4',
      itemBg: '#ffffff',
      text: '#2d3b35',
      muted: 'rgba(45, 59, 53, 0.55)',
      border: '#c5ddd2',
      danger: '#e53935',
    },
  },
  {
    id: 'light-lavender',
    label: '雾紫',
    builtIn: true,
    dark: PM_DEFAULT_DARK,
    light: {
      primary: '#7c5cbf',
      surface: '#f5f2fa',
      itemBg: '#ffffff',
      text: '#3a3545',
      muted: 'rgba(58, 53, 69, 0.55)',
      border: '#d8d0e8',
      danger: '#d32f2f',
    },
  },
  {
    id: 'light-slate',
    label: '冷灰',
    builtIn: true,
    dark: PM_DEFAULT_DARK,
    light: {
      primary: '#4a6fa5',
      surface: '#eef1f5',
      itemBg: '#ffffff',
      text: '#2b3038',
      muted: 'rgba(43, 48, 56, 0.55)',
      border: '#c8d0dc',
      danger: '#e57373',
    },
  },
];

export function clonePmThemeTokens(tokens: PmThemeTokens): PmThemeTokens {
  return { ...tokens };
}

export function clonePmThemeSettings(settings: PmThemeSettings): PmThemeSettings {
  return {
    mode: settings.mode,
    style: settings.style ?? 'custom',
    dark: clonePmThemeTokens(settings.dark),
    light: clonePmThemeTokens(settings.light),
    customPresets: settings.customPresets.map(p => ({
      ...p,
      dark: clonePmThemeTokens(p.dark),
      light: clonePmThemeTokens(p.light),
    })),
    tavernManual: {
      dark: { ...(settings.tavernManual?.dark ?? defaultPmTavernManualColors('dark')) },
      light: { ...(settings.tavernManual?.light ?? defaultPmTavernManualColors('light')) },
    },
  };
}

export function getDefaultPmThemeTokens(mode: PmThemeMode): PmThemeTokens {
  return clonePmThemeTokens(mode === 'light' ? PM_DEFAULT_LIGHT : PM_DEFAULT_DARK);
}

function tokensEqual(a: PmThemeTokens, b: PmThemeTokens): boolean {
  return PM_TOKEN_KEYS.every(k => a[k] === b[k]);
}

export function presetPairEqual(a: PmThemePreset, b: Pick<PmThemePreset, 'dark' | 'light'>): boolean {
  return tokensEqual(a.dark, b.dark) && tokensEqual(a.light, b.light);
}

export function getBuiltinPresetsForMode(mode: PmThemeMode): PmThemePreset[] {
  return mode === 'light' ? PM_BUILTIN_LIGHT_PRESETS : PM_BUILTIN_DARK_PRESETS;
}

/** 全部 10 套内置预设 (夜间 5 + 日间 5) */
export const PM_ALL_BUILTIN_PRESETS: PmThemePreset[] = [...PM_BUILTIN_DARK_PRESETS, ...PM_BUILTIN_LIGHT_PRESETS];

export function matchesAnyBuiltinPreset(pair: Pick<PmThemePreset, 'dark' | 'light'>): boolean {
  return PM_ALL_BUILTIN_PRESETS.some(p => presetPairEqual(p, pair));
}

export function findPresetIdForPair(
  pair: Pick<PmThemePreset, 'dark' | 'light'>,
  customPresets: PmThemePreset[],
): string | null {
  for (const preset of [...PM_ALL_BUILTIN_PRESETS, ...customPresets]) {
    if (presetPairEqual(preset, pair)) return preset.id;
  }
  return null;
}

export function presetTokensForMode(preset: PmThemePreset, mode: PmThemeMode): PmThemeTokens {
  return mode === 'light' ? preset.light : preset.dark;
}

export function genCustomPresetId(): string {
  return 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

function cssColorToHex(color: string): string | null {
  const v = color.trim();
  const hex6 = v.match(/^#([0-9a-f]{6})$/i);
  if (hex6) return `#${hex6[1].toLowerCase()}`;
  const hex3 = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/i);
  if (hex3) return `#${hex3[1]}${hex3[1]}${hex3[2]}${hex3[2]}${hex3[3]}${hex3[3]}`.toLowerCase();
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (rgb) {
    const toHex = (n: number) => Math.min(255, Math.max(0, n)).toString(16).padStart(2, '0');
    return `#${toHex(Number(rgb[1]))}${toHex(Number(rgb[2]))}${toHex(Number(rgb[3]))}`;
  }
  return null;
}

/** 供 <input type="color"> 使用；rgba 等格式会转为 #rrggbb（忽略 alpha） */
export function colorPickerValue(value: string | undefined, fallback: string): string {
  const hex = cssColorToHex(value ?? '') ?? cssColorToHex(fallback) ?? '#888888';
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : '#888888';
}

/** 预览指纹：用于跳过重复 DOM 主题同步 */
export function themePreviewFingerprint(settings: PmThemeSettings): string {
  const pack = (tokens: PmThemeTokens) => PM_TOKEN_KEYS.map(k => tokens[k]).join('\0');
  const packManual = (colors: PmTavernManualColors) => PM_TAVERN_MANUAL_FIELDS.map(f => colors[f.key]).join('\0');
  return (
    `${settings.style ?? 'custom'}\0${settings.mode}\0${pack(settings.dark)}\0${pack(settings.light)}\0` +
    `${packManual(settings.tavernManual?.dark ?? defaultPmTavernManualColors('dark'))}\0` +
    `${packManual(settings.tavernManual?.light ?? defaultPmTavernManualColors('light'))}`
  );
}

/** 预设色块圆标：写入 --swatch-* 供 conic-gradient 使用 */
export function presetSwatchStyle(tokens: PmThemeTokens): Record<string, string> {
  return {
    '--swatch-primary': tokens.primary,
    '--swatch-surface': tokens.surface,
    '--swatch-item': tokens.itemBg,
    '--swatch-text': tokens.text,
  };
}

/** 将 token 写入 #preset-memo-modal 的 inline CSS 变量 */
export function buildPmThemeCssVars(tokens: PmThemeTokens): Record<string, string> {
  const styles: Record<string, string> = {};
  for (const key of PM_TOKEN_KEYS) {
    styles[PM_TOKEN_VAR_MAP[key]] = tokens[key];
  }
  styles['--pm-checkbox-fill'] = tokens.primary;
  return styles;
}

/** 从旧版配色迁移 */
export function migrateLegacyColorScheme(raw: Record<string, unknown> | undefined, mode: PmThemeMode): PmThemeTokens {
  const fallback = getDefaultPmThemeTokens(mode);
  if (!raw) return fallback;
  const pick = (key: keyof PmThemeTokens, ...aliases: string[]) => {
    for (const k of [key, ...aliases]) {
      const v = raw[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return fallback[key];
  };
  return {
    primary: pick('primary', 'accent'),
    surface: pick('surface', 'bg'),
    itemBg: pick('itemBg'),
    text: pick('text'),
    muted: pick('muted'),
    border: pick('border'),
    danger: pick('danger', 'dangerSoft'),
  };
}
