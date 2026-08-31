import type { Tile } from "./types.js";

const UINT32_RANGE = 0x1_0000_0000;

export interface DeterministicRandom {
  /** Returns an unsigned integer in the inclusive range 0..2^32-1. */
  nextUint32(): number;

  /** Returns an unbiased integer in the half-open range [0, upperBound). */
  nextInt(upperBound: number): number;
}

/**
 * Creates a small deterministic PRNG from a string seed.
 *
 * The seed hash consumes JavaScript UTF-16 code units and the generator uses
 * explicitly coerced 32-bit integer operations, making its sequence independent
 * of runtime, platform, locale, clock, and ambient randomness.
 */
export function createSeededRandom(seed: string): DeterministicRandom {
  const seedWords = hashSeed(seed);
  let a = seedWords[0];
  let b = seedWords[1];
  let c = seedWords[2];
  let d = seedWords[3];

  const nextUint32 = (): number => {
    let result = (a + b) | 0;
    d = (d + 1) | 0;
    result = (result + d) | 0;
    a = (b ^ (b >>> 9)) | 0;
    b = (c + (c << 3)) | 0;
    c = ((c << 21) | (c >>> 11)) | 0;
    c = (c + result) | 0;
    return result >>> 0;
  };

  return {
    nextUint32,
    nextInt(upperBound: number): number {
      if (!Number.isSafeInteger(upperBound) || upperBound <= 0 || upperBound > UINT32_RANGE) {
        throw new RangeError("upperBound must be a positive integer no greater than 2^32");
      }

      // Discard the short tail that cannot be divided evenly into upperBound
      // buckets. A plain modulo operation would bias lower-indexed tiles.
      const acceptanceLimit = Math.floor(UINT32_RANGE / upperBound) * upperBound;
      let value: number;
      do {
        value = nextUint32();
      } while (value >= acceptanceLimit);

      return value % upperBound;
    },
  };
}

/** Returns a deterministically shuffled copy without mutating the input. */
export function shuffleTiles(tiles: readonly Tile[], seed: string): Tile[] {
  const shuffled = [...tiles];
  const random = createSeededRandom(seed);

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(index + 1);
    const held = shuffled[index];
    shuffled[index] = shuffled[swapIndex] as Tile;
    shuffled[swapIndex] = held as Tile;
  }

  return shuffled;
}

function hashSeed(seed: string): [number, number, number, number] {
  let hash = 1_779_033_703 ^ seed.length;

  for (let index = 0; index < seed.length; index += 1) {
    hash = Math.imul(hash ^ seed.charCodeAt(index), 3_432_918_353);
    hash = (hash << 13) | (hash >>> 19);
  }

  const nextWord = (): number => {
    hash = Math.imul(hash ^ (hash >>> 16), 2_246_822_507);
    hash = Math.imul(hash ^ (hash >>> 13), 3_266_489_909);
    hash ^= hash >>> 16;
    return hash >>> 0;
  };

  return [nextWord(), nextWord(), nextWord(), nextWord()];
}
