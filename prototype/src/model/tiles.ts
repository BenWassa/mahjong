/**
 * Minimal tile vocabulary for the Issue #7 interaction prototype.
 *
 * Deliberately independent of `src/engine`: this prototype is throwaway and
 * must not create a dependency the production app (#8) would inherit. Kind
 * names mirror the engine's canonical names so scenarios stay readable next to
 * `docs/HKOS_RULES.md`.
 */

export type Suit = "characters" | "bamboo" | "dots";
export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export type SuitedKind = `${Suit}-${Rank}`;
export type WindKind = "wind-east" | "wind-south" | "wind-west" | "wind-north";
export type DragonKind = "dragon-red" | "dragon-green" | "dragon-white";
export type TileKind = SuitedKind | WindKind | DragonKind;

export interface Tile {
  readonly id: string;
  readonly kind: TileKind;
}

/** Ink colour role for a tile face. Names match the PRD token vocabulary. */
export type InkRole = "ink" | "vermillion" | "bamboo-green" | "cobalt";

export interface TileFace {
  /** Traditional glyph shown on the face, when the face is glyph-based. */
  readonly glyph: string;
  /** Secondary glyph under the numeral (the 萬 of a character tile). */
  readonly subGlyph: string | null;
  /** Pip count for pip-drawn faces (dots and bamboo). */
  readonly pips: number | null;
  readonly suit: Suit | "wind" | "dragon";
  readonly ink: InkRole;
  /** Short Latin learning label, e.g. `5B`. Shown only in corner-label modes. */
  readonly shortLabel: string;
  /** Rank-only learning label, e.g. `5`. */
  readonly rankLabel: string;
  /** Spoken name, used by the scenario prose and the decision highlight. */
  readonly name: string;
}

const CHINESE_NUMERALS = ["一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

const WIND_FACES: Readonly<Record<WindKind, { glyph: string; label: string; name: string }>> = {
  "wind-east": { glyph: "東", label: "E", name: "East wind" },
  "wind-south": { glyph: "南", label: "S", name: "South wind" },
  "wind-west": { glyph: "西", label: "W", name: "West wind" },
  "wind-north": { glyph: "北", label: "N", name: "North wind" },
};

const DRAGON_FACES: Readonly<
  Record<DragonKind, { glyph: string; label: string; name: string; ink: InkRole }>
> = {
  "dragon-red": { glyph: "中", label: "Rd", name: "Red dragon", ink: "vermillion" },
  "dragon-green": { glyph: "發", label: "Gr", name: "Green dragon", ink: "bamboo-green" },
  "dragon-white": { glyph: "白", label: "Wh", name: "White dragon", ink: "cobalt" },
};

const SUIT_LETTER: Readonly<Record<Suit, string>> = {
  characters: "C",
  bamboo: "B",
  dots: "D",
};

const SUIT_NAME: Readonly<Record<Suit, string>> = {
  characters: "characters",
  bamboo: "bamboo",
  dots: "dots",
};

export function parseSuited(kind: TileKind): { suit: Suit; rank: Rank } | null {
  const match = /^(characters|bamboo|dots)-([1-9])$/.exec(kind);
  if (match === null) return null;
  const [, suit, rank] = match;
  return { suit: suit as Suit, rank: Number(rank) as Rank };
}

/** Derives everything the tile component needs to draw one face. */
export function tileFace(kind: TileKind): TileFace {
  const suited = parseSuited(kind);
  if (suited !== null) {
    const { suit, rank } = suited;
    const shortLabel = `${String(rank)}${SUIT_LETTER[suit]}`;
    const rankLabel = String(rank);
    const name = `${String(rank)} ${SUIT_NAME[suit]}`;
    if (suit === "characters") {
      return {
        glyph: CHINESE_NUMERALS[rank - 1] ?? String(rank),
        subGlyph: "萬",
        pips: null,
        suit,
        // The numeral is ink and only the 萬 is vermillion, as on a real face.
        ink: "ink",
        shortLabel,
        rankLabel,
        name,
      };
    }
    return {
      glyph: "",
      subGlyph: null,
      pips: rank,
      suit,
      ink: suit === "bamboo" ? "bamboo-green" : "cobalt",
      shortLabel,
      rankLabel,
      name,
    };
  }

  if (kind in WIND_FACES) {
    const wind = WIND_FACES[kind as WindKind];
    return {
      glyph: wind.glyph,
      subGlyph: null,
      pips: null,
      suit: "wind",
      ink: "ink",
      shortLabel: wind.label,
      rankLabel: wind.label,
      name: wind.name,
    };
  }

  const dragon = DRAGON_FACES[kind as DragonKind];
  return {
    glyph: dragon.glyph,
    subGlyph: null,
    pips: null,
    suit: "dragon",
    ink: dragon.ink,
    shortLabel: dragon.label,
    rankLabel: dragon.label,
    name: dragon.name,
  };
}

/**
 * Builds a deterministic tile list from a compact spec, e.g.
 * `tiles("c2 c3 c4 b5 b6 b7 dr dr")`. Copy numbers are assigned in order so
 * every id in a scenario is stable and unique.
 */
export function tiles(spec: string): Tile[] {
  const counts = new Map<TileKind, number>();
  return spec
    .trim()
    .split(/\s+/)
    .map((token) => {
      const kind = expandToken(token);
      const copy = (counts.get(kind) ?? 0) + 1;
      counts.set(kind, copy);
      return { id: `${kind}#${String(copy)}`, kind };
    });
}

const TOKEN_SUITS: Readonly<Record<string, Suit>> = { c: "characters", b: "bamboo", d: "dots" };

const TOKEN_HONOURS: Readonly<Record<string, TileKind>> = {
  we: "wind-east",
  ws: "wind-south",
  ww: "wind-west",
  wn: "wind-north",
  dr: "dragon-red",
  dg: "dragon-green",
  dw: "dragon-white",
};

function expandToken(token: string): TileKind {
  const honour = TOKEN_HONOURS[token];
  if (honour !== undefined) return honour;
  const suit = TOKEN_SUITS[token[0] ?? ""];
  const rank = Number(token.slice(1));
  if (suit === undefined || !Number.isInteger(rank) || rank < 1 || rank > 9) {
    throw new Error(`Unknown tile token: ${token}`);
  }
  return `${suit}-${String(rank) as `${Rank}`}`;
}
