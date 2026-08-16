import { describe, expect, it } from "vitest";
import { ORG } from "@/data";
import { createSelector } from "./select";

const EMEA = ["r-marie", "r-jonas", "r-priya", "r-elena"];

describe("createSelector", () => {
  it("returns null for an empty eligible set", () => {
    expect(createSelector("FIRST_ELIGIBLE", ORG).select([])).toBeNull();
    expect(createSelector("ROUND_ROBIN", ORG).select([])).toBeNull();
  });

  it("picks in declaration order regardless of the order it was handed", () => {
    const selector = createSelector("FIRST_ELIGIBLE", ORG);
    expect(selector.select([...EMEA].reverse())).toBe("r-marie");
  });
});

describe("the reproducibility label is backed by a test, not a comment", () => {
  it("FIRST_ELIGIBLE gives the same answer to the same question", () => {
    const selector = createSelector("FIRST_ELIGIBLE", ORG);
    expect(selector.reproducible).toBe(true);
    const answers = new Set(Array.from({ length: 8 }, () => selector.select(EMEA)));
    expect(answers.size).toBe(1);
  });

  it("ROUND_ROBIN does not, and that is the whole point", () => {
    // Ask the identical question four times in one session and get four
    // different reps. Every routing tool ships this and none of them say so.
    const selector = createSelector("ROUND_ROBIN", ORG);
    expect(selector.reproducible).toBe(false);
    const answers = new Set(Array.from({ length: 4 }, () => selector.select(EMEA)));
    expect(answers.size).toBeGreaterThan(1);
  });

  it("LEAST_LOADED does not either", () => {
    const selector = createSelector("LEAST_LOADED", ORG);
    expect(selector.reproducible).toBe(false);
    const answers = new Set(Array.from({ length: 4 }, () => selector.select(EMEA)));
    expect(answers.size).toBeGreaterThan(1);
  });
});

describe("capacity", () => {
  it("prefers reps with room", () => {
    const tiny = {
      ...ORG,
      reps: ORG.reps.map((rep) => (rep.id === "r-marie" ? { ...rep, capacity: 1 } : rep)),
    };
    const selector = createSelector("ROUND_ROBIN", tiny);
    const picks = Array.from({ length: 12 }, () => selector.select(EMEA));
    expect(picks.filter((id) => id === "r-marie")).toHaveLength(1);
  });

  it("still assigns when everybody is full, rather than blocking", () => {
    // Capacity must not be able to produce an outcome. If a full team could
    // BLOCK a lead, a load figure would be changing what the analyser proves.
    const full = { ...ORG, reps: ORG.reps.map((rep) => ({ ...rep, capacity: 0 })) };
    const selector = createSelector("LEAST_LOADED", full);
    expect(selector.select(EMEA)).not.toBeNull();
  });

  it("spreads evenly under LEAST_LOADED", () => {
    const selector = createSelector("LEAST_LOADED", ORG);
    const counts = new Map<string, number>();
    for (let i = 0; i < 16; i++) {
      const picked = selector.select(EMEA);
      if (picked) counts.set(picked, (counts.get(picked) ?? 0) + 1);
    }
    expect([...counts.values()]).toEqual([4, 4, 4, 4]);
  });
});
