import { describe, expect, it } from 'vitest';
import { compareSemver, isNewerVersion } from '../version';

describe('version', () => {
  it('compares semver segments', () => {
    expect(compareSemver('6.4.2', '6.4.1')).toBeGreaterThan(0);
    expect(compareSemver('6.4.1', '6.4.1')).toBe(0);
    expect(compareSemver('6.4.0', '6.4.1')).toBeLessThan(0);
  });

  it('detects newer remote version', () => {
    expect(isNewerVersion('6.4.2', '6.4.1')).toBe(true);
    expect(isNewerVersion('6.4.1', '6.4.1')).toBe(false);
  });
});
