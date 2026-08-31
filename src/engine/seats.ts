import type { Seat, Wind } from "./types.js";

export const SEATS: readonly [Seat, Seat, Seat, Seat] = [0, 1, 2, 3];
export const WINDS: readonly [Wind, Wind, Wind, Wind] = [
  "east",
  "south",
  "west",
  "north",
];

export function nextSeat(seat: Seat): Seat {
  return ((seat + 1) % 4) as Seat;
}

export function seatDistance(from: Seat, to: Seat): 0 | 1 | 2 | 3 {
  return ((to - from + 4) % 4) as 0 | 1 | 2 | 3;
}

export function seatsAfter(seat: Seat): readonly [Seat, Seat, Seat] {
  return [nextSeat(seat), nextSeat(nextSeat(seat)), nextSeat(nextSeat(nextSeat(seat)))];
}

export function seatWind(seat: Seat, dealer: Seat): Wind {
  return WINDS[seatDistance(dealer, seat)];
}

export function nextWind(wind: Wind): Wind | null {
  const index = WINDS.indexOf(wind);
  return index === WINDS.length - 1 ? null : WINDS[index + 1] ?? null;
}
