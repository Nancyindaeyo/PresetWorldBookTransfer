import { describe, expect, it } from 'vitest';
import {
  compareSemver,
  fingerprintManifest,
  fingerprintManifestText,
  fingerprintTextContent,
  isNewerVersion,
  PM_BUNDLED_MANIFEST_FINGERPRINT,
} from '../version';

describe('version utils', () => {
  it('compares semver segments', () => {
    expect(compareSemver('6.4.2', '6.4.1')).toBeGreaterThan(0);
    expect(compareSemver('6.4.1', '6.4.1')).toBe(0);
    expect(compareSemver('6.4.0', '6.4.1')).toBeLessThan(0);
  });

  it('detects newer remote version', () => {
    expect(isNewerVersion('6.4.2', '6.4.1')).toBe(true);
    expect(isNewerVersion('6.4.1', '6.4.1')).toBe(false);
  });

  it('fingerprints manifest consistently regardless of key order', () => {
    const a = fingerprintManifest({ version: '1.0.0', author: 'test' });
    const b = fingerprintManifest({ author: 'test', version: '1.0.0' });
    expect(a).toBe(b);
  });

  it('fingerprints manifest text', () => {
    const text = JSON.stringify({ version: '6.4.2', author: 'Nancyindaeyo' });
    expect(fingerprintManifestText(text)).toBe(fingerprintManifest({ version: '6.4.2', author: 'Nancyindaeyo' }));
  });

  it('bundled manifest fingerprint matches local manifest shape', () => {
    const localText = JSON.stringify({
      display_name: '预设备忘录',
      loading_order: 100,
      requires: [],
      optional: [],
      js: 'bootstrap.js',
      author: 'Nancyindaeyo',
      version: '6.5.0',
      homePage: 'https://github.com/Nancyindaeyo/PresetWorldBookTransfer',
      auto_update: true,
      hooks: {
        delete: 'onDelete',
        disable: 'onDisable',
        enable: 'onEnable',
      },
    });
    expect(fingerprintManifestText(localText)).toBe(PM_BUNDLED_MANIFEST_FINGERPRINT);
  });

  it('fingerprints text content consistently', () => {
    expect(fingerprintTextContent('abc')).toBe(fingerprintTextContent('abc'));
    expect(fingerprintTextContent('abc')).not.toBe(fingerprintTextContent('abd'));
  });
});
