import { createSeededRandom } from "../engine/random.js";
import { projectPublicState } from "../engine/redaction.js";
import type { GameAction, Seat } from "../engine/types.js";
import type { ActionChooser } from "../sim/driver.js";
import { createHeuristicBot } from "./heuristic.js";

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/**
 * Simulation wiring only: the trusted driver projects a fresh public view
 * before invoking a controller. Bot code never receives InternalGameState.
 */
export function createBotTableChooser(seed: string, botSeats: readonly Seat[] = SEATS): ActionChooser {
  const bots = new Map(botSeats.map((seat) => [seat, createHeuristicBot({ seat, seed: `${seed}:seat:${String(seat)}` })]));
  const randoms = new Map(SEATS.map((seat) => [seat, createSeededRandom(`${seed}:random:${String(seat)}`)]));
  return (actions, state): GameAction => {
    const system = actions.find((action) => action.type === "continue");
    const firstPlayerAction = actions.find((action) => action.type !== "continue");
    if (firstPlayerAction === undefined) {
      if (system === undefined) throw new Error("No legal bot-table action");
      return system;
    }
    const seat = firstPlayerAction.seat;
    const seatActions = actions.filter((action) => action.type !== "continue" && action.seat === seat);
    const bot = bots.get(seat);
    if (bot !== undefined) return bot.chooseAction(projectPublicState(state, seat), seatActions);
    const random = randoms.get(seat);
    if (random === undefined) throw new Error(`Missing random policy for seat ${String(seat)}`);
    const choice = seatActions[random.nextInt(seatActions.length)];
    if (choice === undefined) throw new Error("Random opponent received no legal action");
    return choice;
  };
}
