import { useEffect, useRef, type JSX } from "react";

import type { ExperiencePath } from "../game/experience";

/**
 * The one-time question a first launch asks (#33).
 *
 * It used to ask which *table* the player wanted: "start simple" or "the full
 * table", with a faan floor named in the second one. `ONBOARDING_DESIGN.md`
 * §3 rules that out. Choosing a rules profile is configuration, and asking a
 * novice to configure a game they have never seen — before they know what a
 * turn is, let alone what faan is — is a question they cannot answer. Apple's
 * onboarding guidance says the same thing more generally: postpone
 * nonessential setup.
 *
 * So the question is about the player instead, and everybody can answer it.
 * The three meanings are fixed by §3.1; the wording on the buttons is not.
 * Each answer settles a table, a claim band and a set of aids by itself
 * (`game/experience.ts`), so no path has a setup step.
 *
 * It renders ahead of any orientation handling, in a single centred column
 * with no breakpoint, so it works whichever way up the phone starts.
 */
export function ExperienceChoice({
  onChoose,
}: {
  readonly onChoose: (path: ExperiencePath) => void;
}): JSX.Element {
  const firstRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { firstRef.current?.focus(); }, []);

  return (
    <main className="choice" aria-labelledby="choice-title">
      <div className="choice__column">
        <h1 className="choice__title" id="choice-title">
          <span className="choice__han" aria-hidden="true">麻雀</span>
          Have you played mahjong?
        </h1>

        <button
          ref={firstRef}
          type="button"
          className="choice__option choice__option--lead"
          onClick={() => { onChoose("new"); }}
        >
          <span className="choice__label">
            New to mahjong
            <span className="choice__badge">about 3 minutes</span>
          </span>
          <span className="choice__detail">
            Start at a real table and play your first hand a step at a time.
            Nothing to read through first, and it runs straight on into a normal
            game.
          </span>
        </button>

        <button
          type="button"
          className="choice__option"
          onClick={() => { onChoose("rusty"); }}
        >
          <span className="choice__label">Played before — refresh me</span>
          <span className="choice__detail">
            A short run through this table: how to throw a tile, where claims
            appear, where everything else lives. Under a minute, then a normal
            game.
          </span>
        </button>

        <button
          type="button"
          className="choice__option"
          onClick={() => { onChoose("confident"); }}
        >
          <span className="choice__label">Start playing</span>
          <span className="choice__detail">
            Straight to a full Hong Kong Old Style table, with nothing switched
            on that you did not ask for.
          </span>
        </button>

        <p className="choice__note">
          Whichever you pick, everything is in the Menu afterwards — the
          lessons, the full rules, and every setting.
        </p>
      </div>
    </main>
  );
}
