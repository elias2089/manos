import { describe, expect, it } from 'vitest';

import { CATEGORIES, ZONES } from './seed-data.js';

const SLUG_FORMAT = /^[a-z]+(-[a-z]+)*$/;

describe('seed data', () => {
  it('has the eight categories', () => {
    expect(CATEGORIES).toHaveLength(8);
  });

  it('has the sixteen boroughs of Mexico City', () => {
    expect(ZONES).toHaveLength(16);
    expect(new Set(ZONES.map((zone) => zone.state))).toEqual(new Set(['Ciudad de México']));
  });

  it.each([
    ['category', CATEGORIES.map((category) => category.slug)],
    ['zone', ZONES.map((zone) => zone.slug)],
  ])('has unique %s slugs in lowercase ASCII with hyphens', (_kind, slugs) => {
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const slug of slugs) {
      expect(slug).toMatch(SLUG_FORMAT);
    }
  });
});
