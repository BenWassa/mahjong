import { describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, DEFAULT_TUTORIAL, type PersistedSettings, type PersistedTutorial } from "./persistence";
import { openingFor, parseLaunchQuery, type LaunchQuery } from "./routing";

/**
 * Who gets asked the first-launch question, who gets a walkthrough, and who
 * goes straight to a table (#33).
 *
 * This is the decision the whole issue turns on, so it is asserted here rather
 * than inferred from a rendered screen: a regression that quietly routed an
 * existing player into a scripted first run, or quietly denied a novice one,
 * would be invisible in a screenshot of either outcome.
 */

const NO_QUERY: LaunchQuery = { experience: null, mode: null, learn: null };

function settings(over: Partial<PersistedSettings> = {}): PersistedSettings {
  return { ...DEFAULT_SETTINGS, ...over };
}

function progress(over: Partial<PersistedTutorial> = {}): PersistedTutorial {
  return { ...DEFAULT_TUTORIAL, ...over };
}

describe("a fresh install", () => {
  it("asks the experience question rather than choosing a table for the player", () => {
    expect(openingFor(settings(), progress(), NO_QUERY).experience).toBeNull();
  });

  it("starts no walkthrough until the question has been answered", () => {
    expect(openingFor(settings(), progress(), NO_QUERY).onboarding).toBeNull();
  });
});

describe("each answer settles the whole table by itself", () => {
  /*
   * §3.2: no path has a setup step. A novice never chooses a rules profile, a
   * claim band or a label mode — they say they are new and the app decides all
   * of it. These assert the decisions, because "smart defaults" is only a
   * feature if the defaults are actually right.
   */
  it("puts a novice on Beginner, with the reduced claim band and the aids on", () => {
    const open = openingFor(settings(), progress(), { ...NO_QUERY, experience: "new" });
    expect(open.experience).toBe("new");
    expect(open.onboarding).toBe("novice");
    expect(open.mode).toBe("beginner");
    expect(open.showAllClaims).toBe(false);
    expect(open.assistOn).toBe(true);
    expect(open.explainOn).toBe(true);
  });

  it("puts a rusty player on the full table with a short interface refresher", () => {
    const open = openingFor(settings(), progress(), { ...NO_QUERY, experience: "rusty" });
    expect(open.onboarding).toBe("refresher");
    expect(open.mode).toBe("standard");
    expect(open.showAllClaims).toBe(true);
  });

  it("gives a confident player a clean full table and no walkthrough at all", () => {
    // §3.2 asks for "a clean full table rather than unsolicited step-by-step
    // coaching": somebody who has just said they do not want instruction
    // should not get a table that suggests their discards. Every one of these
    // is one tap away in the Menu.
    const open = openingFor(settings(), progress(), { ...NO_QUERY, experience: "confident" });
    expect(open.onboarding).toBeNull();
    expect(open.mode).toBe("standard");
    expect(open.assistOn).toBe(false);
    expect(open.explainOn).toBe(false);
  });
});

describe("an existing player is never re-onboarded", () => {
  /*
   * The load-bearing promise. #33 replaces first run with a scripted
   * walkthrough, and dropping somebody who has played fifty hands into one
   * because they updated the app would be the worst possible reading of "we
   * redesigned onboarding".
   */
  it("does not ask the question again", () => {
    const open = openingFor(settings({ experience: "confident" }), progress(), NO_QUERY);
    expect(open.experience).toBe("confident");
  });

  it("does not start a walkthrough for a stored answer with nothing in progress", () => {
    const open = openingFor(settings({ experience: "new" }), progress(), NO_QUERY);
    expect(open.onboarding).toBeNull();
  });

  it("keeps their stored table and aids rather than resetting them to a path's defaults", () => {
    const open = openingFor(
      settings({ experience: "new", mode: "standard", assistOn: false, cornerLabel: "off" }),
      progress(),
      NO_QUERY,
    );
    expect(open.mode).toBe("standard");
    expect(open.assistOn).toBe(false);
    expect(open.cornerLabel).toBe("off");
  });
});

describe("an interrupted walkthrough", () => {
  it("resumes the path it was on", () => {
    const open = openingFor(
      settings({ experience: "new" }),
      progress({ onboarding: { path: "novice", phase: "claim" } }),
      NO_QUERY,
    );
    expect(open.onboarding).toBe("novice");
  });

  it("is spent once it has been finished or skipped", () => {
    // §3.3: progress never gates the table, and a walkthrough that has been
    // left is not re-offered. The replayable lessons are the way back.
    const open = openingFor(
      settings({ experience: "new" }),
      progress({ onboarding: { path: "novice", phase: "claim" }, onboardingDone: true }),
      NO_QUERY,
    );
    expect(open.onboarding).toBeNull();
  });
});

describe("the launch query stands in for a tap, and only for a tap", () => {
  it("opens a named experience path on a fresh install", () => {
    const open = openingFor(settings(), progress(), { ...NO_QUERY, experience: "rusty" });
    expect(open.onboarding).toBe("refresher");
  });

  it("ignores an unrecognised path and asks the question", () => {
    const open = openingFor(settings(), progress(), { ...NO_QUERY, experience: "expert" });
    expect(open.experience).toBeNull();
  });

  it("never overrides a stored answer", () => {
    // A link may open a path; it may not reconfigure somebody's app.
    const open = openingFor(
      settings({ experience: "confident", mode: "standard" }),
      progress(),
      { ...NO_QUERY, experience: "new" },
    );
    expect(open.experience).toBe("confident");
    expect(open.onboarding).toBeNull();
  });

  it("makes ?mode= stand in for the whole of the tap, claim band included", () => {
    // Otherwise the link produces a "beginner" table that still offers Chow
    // and Kong, which is not a table this app has.
    const open = openingFor(settings(), progress(), { ...NO_QUERY, mode: "beginner" });
    expect(open.mode).toBe("beginner");
    expect(open.showAllClaims).toBe(false);
    expect(open.onboarding).toBeNull();
  });

  it("treats ?learn= as reaching the lessons, not as answering the question", () => {
    const open = openingFor(settings(), progress(), { ...NO_QUERY, learn: "claims" });
    expect(open.learn).toBe(true);
    expect(open.onboarding).toBeNull();
  });

  it("does not let ?learn= resume or cancel a walkthrough in progress", () => {
    const open = openingFor(
      settings({ experience: "new" }),
      progress({ onboarding: { path: "novice", phase: "table" } }),
      { ...NO_QUERY, learn: "1" },
    );
    expect(open.learn).toBe(true);
    expect(open.onboarding).toBeNull();
  });
});

describe("parsing the launch query", () => {
  it("reads the three parameters the app routes on", () => {
    expect(parseLaunchQuery("?experience=new&mode=beginner&learn=1&seed=x")).toEqual({
      experience: "new",
      mode: "beginner",
      learn: "1",
    });
  });

  it("reports an absent parameter as absent rather than as empty", () => {
    expect(parseLaunchQuery("?seed=x")).toEqual({ experience: null, mode: null, learn: null });
  });
});
