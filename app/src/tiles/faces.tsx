import type { JSX } from "react";

import type { TileKind } from "@engine";

/**
 * The engraved faces, drawn on a shared 60x80 field.
 *
 * These are the product's real typography: the interface around them is
 * deliberately quiet so that the faces carry the character of the set. Every
 * decision here answers one question first, from PRD §8: can this be
 * identified at actual phone size without zooming?
 *
 * Suits are separated by FORM before colour. Characters carry a numeral over
 * the 萬 radical, dots are counted circles, bamboo are counted culms, and the
 * honours are single glyphs. A player who cannot see hue can still read every
 * tile in the set.
 */

const INK = "var(--ink)";
const RED = "var(--vermillion)";
const GREEN = "var(--bamboo-green)";
const BLUE = "var(--cobalt)";

/* ---------------------------------------------------------------- pips --- */

/** One dot: an ink ring with a coloured centre, so the count reads at any size. */
function Pip({ x, y, r, fill }: { x: number; y: number; r: number; fill: string }): JSX.Element {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill={fill} />
      <circle cx={x} cy={y} r={r} fill="none" stroke={INK} strokeWidth={r * 0.28} />
      <circle cx={x} cy={y} r={r * 0.34} fill={INK} opacity={0.55} />
    </g>
  );
}

/** Grid of pips. Columns and rows are explicit so each rank keeps its shape. */
function PipGrid({
  columns,
  rows,
  r,
  fill,
  top = 18,
  bottom = 66,
}: {
  columns: number;
  rows: number;
  r: number;
  fill: string;
  top?: number;
  bottom?: number;
}): JSX.Element {
  const cells: JSX.Element[] = [];
  const spanY = bottom - top;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = 30 + (column - (columns - 1) / 2) * (r * 2 + 4);
      const y = top + (rows === 1 ? spanY / 2 : (row * spanY) / (rows - 1));
      cells.push(<Pip key={`${String(row)}-${String(column)}`} x={x} y={y} r={r} fill={fill} />);
    }
  }
  return <g>{cells}</g>;
}

/* -------------------------------------------------------------- bamboo --- */

/** One culm: a segmented stick with a node, not a plain bar. */
function Culm({
  x,
  y,
  h,
  w,
  fill,
}: {
  x: number;
  y: number;
  h: number;
  w: number;
  fill: string;
}): JSX.Element {
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={w * 0.35} fill={fill} />
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={w * 0.35}
        fill="none"
        stroke={INK}
        strokeWidth={1}
        opacity={0.65}
      />
      <line
        x1={x - w / 2}
        x2={x + w / 2}
        y1={y}
        y2={y}
        stroke={INK}
        strokeWidth={1.4}
        opacity={0.8}
      />
    </g>
  );
}

function CulmGrid({
  columns,
  rows,
  fill,
  top = 20,
  bottom = 64,
  h = 15,
  w = 8,
}: {
  columns: number;
  rows: number;
  fill: string;
  top?: number;
  bottom?: number;
  h?: number;
  w?: number;
}): JSX.Element {
  const cells: JSX.Element[] = [];
  const spanY = bottom - top;
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = 30 + (column - (columns - 1) / 2) * (w + 6);
      const y = top + (rows === 1 ? spanY / 2 : (row * spanY) / (rows - 1));
      cells.push(<Culm key={`${String(row)}-${String(column)}`} x={x} y={y} h={h} w={w} fill={fill} />);
    }
  }
  return <g>{cells}</g>;
}

/* ----------------------------------------------------------- engraving --- */

/**
 * Han engraving. The set's glyphs come from the platform CJK face rather than
 * an embedded webfont: the PWA must work offline with no network request, and
 * a CJK face is megabytes. Every Android device ships one.
 */
function Han({
  children,
  y,
  size,
  fill = INK,
  weight = 700,
}: {
  children: string;
  y: number;
  size: number;
  fill?: string;
  weight?: number;
}): JSX.Element {
  return (
    <text
      x={30}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontFamily="var(--font-han)"
      fontSize={size}
      fontWeight={weight}
      fill={fill}
    >
      {children}
    </text>
  );
}

const HAN_DIGITS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"] as const;

/* --------------------------------------------------------------- faces --- */

function charactersFace(rank: number): JSX.Element {
  return (
    <g>
      <Han y={26} size={26}>
        {HAN_DIGITS[rank] ?? ""}
      </Han>
      <Han y={57} size={28} fill={RED}>
        萬
      </Han>
    </g>
  );
}

function dotsFace(rank: number): JSX.Element {
  switch (rank) {
    case 1:
      // The single dot is the set's one ornamental face. Kept large and
      // concentric so it is never mistaken for a nine at a glance.
      return (
        <g>
          <circle cx={30} cy={42} r={17} fill={BLUE} />
          <circle cx={30} cy={42} r={17} fill="none" stroke={INK} strokeWidth={2.2} />
          <circle cx={30} cy={42} r={10} fill="var(--tile-face)" />
          <circle cx={30} cy={42} r={10} fill="none" stroke={INK} strokeWidth={1.6} />
          <circle cx={30} cy={42} r={4.5} fill={RED} />
        </g>
      );
    case 2:
      return <PipGrid columns={1} rows={2} r={7.5} fill={GREEN} top={26} bottom={58} />;
    case 3:
      return (
        <g>
          <Pip x={17} y={24} r={6.5} fill={GREEN} />
          <Pip x={30} y={42} r={6.5} fill={GREEN} />
          <Pip x={43} y={60} r={6.5} fill={GREEN} />
        </g>
      );
    case 4:
      return <PipGrid columns={2} rows={2} r={7} fill={GREEN} top={26} bottom={58} />;
    case 5:
      return (
        <g>
          <PipGrid columns={2} rows={2} r={6.5} fill={BLUE} top={22} bottom={62} />
          <Pip x={30} y={42} r={6.5} fill={RED} />
        </g>
      );
    case 6:
      return <PipGrid columns={2} rows={3} r={6} fill={GREEN} top={22} bottom={62} />;
    case 7:
      return (
        <g>
          <Pip x={19} y={20} r={5.5} fill={RED} />
          <Pip x={30} y={26} r={5.5} fill={RED} />
          <Pip x={41} y={32} r={5.5} fill={RED} />
          <PipGrid columns={2} rows={2} r={5.5} fill={GREEN} top={48} bottom={66} />
        </g>
      );
    case 8:
      return <PipGrid columns={2} rows={4} r={5.2} fill={BLUE} top={20} bottom={64} />;
    default:
      return <PipGrid columns={3} rows={3} r={5.2} fill={RED} top={22} bottom={62} />;
  }
}

function bambooFace(rank: number): JSX.Element {
  switch (rank) {
    case 1:
      // One Bamboo is the sparrow in every traditional set. Replacing it with
      // a ninth culm would be novelty at the cost of a convention players read
      // instantly. Drawn as a bold silhouette with almost no interior detail,
      // because it also has to survive being 22px wide inside a meld.
      return (
        <g>
          {/* tail */}
          <path
            d="M18 60l-8 9c-1 1 0 3 2 3l11-3z"
            fill={GREEN}
            stroke={INK}
            strokeWidth={1.4}
            strokeLinejoin="round"
          />
          {/* body */}
          <path
            d="M38 22c6 4 8 12 5 20-3 8-9 14-16 18l-7-6c4-8 6-18 8-24 2-6 5-9 10-8z"
            fill={GREEN}
            stroke={INK}
            strokeWidth={1.8}
            strokeLinejoin="round"
          />
          {/* wing */}
          <path
            d="M35 32c3 4 3 11-1 17"
            fill="none"
            stroke={INK}
            strokeWidth={1.6}
            strokeLinecap="round"
          />
          {/* head and beak */}
          <circle cx={39} cy={20} r={6.5} fill={GREEN} stroke={INK} strokeWidth={1.8} />
          <circle cx={41} cy={19} r={1.7} fill={INK} />
          <path
            d="M45 21l7 3-7 2z"
            fill={RED}
            stroke={INK}
            strokeWidth={1.1}
            strokeLinejoin="round"
          />
          {/* perch */}
          <path d="M16 70h30" stroke={RED} strokeWidth={3} strokeLinecap="round" />
        </g>
      );
    case 2:
      return <CulmGrid columns={1} rows={2} fill={GREEN} top={28} bottom={56} h={18} />;
    case 3:
      return (
        <g>
          <Culm x={30} y={24} h={16} w={8} fill={GREEN} />
          <Culm x={22} y={54} h={16} w={8} fill={GREEN} />
          <Culm x={38} y={54} h={16} w={8} fill={GREEN} />
        </g>
      );
    case 4:
      return <CulmGrid columns={2} rows={2} fill={GREEN} top={26} bottom={58} h={17} />;
    case 5:
      return (
        <g>
          <Culm x={20} y={24} h={15} w={8} fill={GREEN} />
          <Culm x={40} y={24} h={15} w={8} fill={GREEN} />
          <Culm x={30} y={42} h={15} w={8} fill={RED} />
          <Culm x={20} y={60} h={15} w={8} fill={GREEN} />
          <Culm x={40} y={60} h={15} w={8} fill={GREEN} />
        </g>
      );
    case 6:
      return <CulmGrid columns={3} rows={2} fill={GREEN} top={24} bottom={60} h={18} w={7} />;
    case 7:
      return (
        <g>
          <Culm x={30} y={20} h={14} w={7} fill={RED} />
          <CulmGrid columns={3} rows={2} fill={GREEN} top={40} bottom={62} h={14} w={7} />
        </g>
      );
    case 8:
      return (
        <g>
          <CulmGrid columns={4} rows={1} fill={GREEN} top={26} bottom={26} h={16} w={7} />
          <CulmGrid columns={4} rows={1} fill={GREEN} top={58} bottom={58} h={16} w={7} />
        </g>
      );
    default:
      return <CulmGrid columns={3} rows={3} fill={GREEN} top={22} bottom={62} h={13} w={7} />;
  }
}

const WIND_GLYPH = { east: "東", south: "南", west: "西", north: "北" } as const;

function windFace(wind: keyof typeof WIND_GLYPH): JSX.Element {
  return (
    <Han y={42} size={36}>
      {WIND_GLYPH[wind]}
    </Han>
  );
}

function dragonFace(colour: "red" | "green" | "white"): JSX.Element {
  if (colour === "red") {
    return (
      <Han y={42} size={38} fill={RED}>
        中
      </Han>
    );
  }
  if (colour === "green") {
    return (
      <Han y={42} size={36} fill={GREEN}>
        發
      </Han>
    );
  }
  // The White Dragon is a cobalt frame around an empty face. Its blankness is
  // the identity, so the frame is drawn heavy enough to read as deliberate
  // rather than as a tile that failed to render.
  return (
    <g>
      <rect
        x={12}
        y={16}
        width={36}
        height={52}
        rx={3}
        fill="none"
        stroke={BLUE}
        strokeWidth={3.4}
      />
      <rect
        x={17}
        y={21}
        width={26}
        height={42}
        rx={2}
        fill="none"
        stroke={BLUE}
        strokeWidth={1.2}
        opacity={0.5}
      />
    </g>
  );
}

const FLOWER_GLYPH = ["", "梅", "蘭", "菊", "竹"] as const;
const SEASON_GLYPH = ["", "春", "夏", "秋", "冬"] as const;

/**
 * Bonus tiles carry their index as an arabic numeral as well as the subject
 * glyph, and flowers and seasons differ in glyph and in numeral placement, so
 * the two groups are never told apart by ink colour alone.
 */
function bonusFace(group: "flower" | "season", index: number): JSX.Element {
  const glyph = group === "flower" ? FLOWER_GLYPH[index] : SEASON_GLYPH[index];
  const colour = group === "flower" ? GREEN : RED;
  return (
    <g>
      <Han y={38} size={30} fill={colour}>
        {glyph ?? ""}
      </Han>
      {group === "season" && (
        <rect
          x={22}
          y={56}
          width={16}
          height={16}
          rx={2}
          fill="none"
          stroke={INK}
          strokeWidth={1.3}
          opacity={0.75}
        />
      )}
      <text
        x={30}
        y={64}
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="var(--font-ui)"
        fontSize={13}
        fontWeight={700}
        fill={INK}
      >
        {index}
      </text>
    </g>
  );
}

/** The engraving layer for one tile kind. */
export function tileFace(kind: TileKind): JSX.Element {
  const suited = /^(characters|bamboo|dots)-([1-9])$/.exec(kind);
  if (suited) {
    const rank = Number(suited[2]);
    if (suited[1] === "characters") return charactersFace(rank);
    if (suited[1] === "dots") return dotsFace(rank);
    return bambooFace(rank);
  }
  const wind = /^wind-(east|south|west|north)$/.exec(kind);
  if (wind) return windFace(wind[1] as keyof typeof WIND_GLYPH);
  const dragon = /^dragon-(red|green|white)$/.exec(kind);
  if (dragon) return dragonFace(dragon[1] as "red" | "green" | "white");
  const bonus = /^(flower|season)-([1-4])$/.exec(kind);
  if (bonus) return bonusFace(bonus[1] as "flower" | "season", Number(bonus[2]));
  return <g />;
}
