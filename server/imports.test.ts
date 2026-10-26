import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper shared with the build
import { checkServerImports } from '../scripts/check-server-imports.mjs';

describe('server imports work on Vercel', () => {
  it('every relative import reachable from api/ ends with .js and exists', () => {
    const { bad, files } = checkServerImports();
    expect(bad).toEqual([]);
    expect(files).toBeGreaterThan(10);
  });
});
