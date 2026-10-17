import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from '../src/index';

describe('classification-engine', () => {
  it('exposes a semver engine version', () => {
    expect(ENGINE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
