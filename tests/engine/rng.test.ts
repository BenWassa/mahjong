import { describe, expect, it } from 'vitest';
import { makeRng, shuffle } from '../../src/engine/rng.js';
import { buildWall } from '../../src/engine/wall.js';
import { DEFAULT_PROFILE } from '../../src/engine/config.js';

describe('seeded rng', () => {
  it('RULE-DET-1: the same seed produces the same stream', () => {
    const a = makeRng('abc');
    const b = makeRng('abc');
    for (let i = 0; i < 500; i++) expect(a()).toBe(b());
  });

  it('different seeds diverge', () => {
    const a = makeRng('abc');
    const b = makeRng('abd');
    const left = Array.from({ length: 20 }, () => a());
    const right = Array.from({ length: 20 }, () => b());
    expect(left).not.toEqual(right);
  });

  it('shuffle is a permutation and is seed-stable', () => {
    const source = Array.from({ length: 144 }, (_, i) => i);
    const one = shuffle([...source], makeRng('wall'));
    const two = shuffle([...source], makeRng('wall'));
    expect(one).toEqual(two);
    expect([...one].sort((x, y) => x - y)).toEqual(source);
  });

  it('RULE-DET-1: each hand of a match gets its own reproducible wall', () => {
    const first = buildWall(DEFAULT_PROFILE, 'seed', 0);
    const second = buildWall(DEFAULT_PROFILE, 'seed', 1);
    expect(first).not.toEqual(second);
    expect(buildWall(DEFAULT_PROFILE, 'seed', 1)).toEqual(second);
  });
});
