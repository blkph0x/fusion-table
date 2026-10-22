import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mix32, modelSatisfies, seededDecider, solveCnf, type Clause } from "../lib/sat.ts";

function bruteForce(nvars: number, clauses: Clause[]): boolean[] | null {
  const total = 1 << nvars;
  const assignment = Array.from({ length: nvars + 1 }, () => false);
  for (let bits = 0; bits < total; bits += 1) {
    for (let variable = 1; variable <= nvars; variable += 1) assignment[variable] = ((bits >> (variable - 1)) & 1) === 1;
    if (modelSatisfies(clauses, assignment)) return assignment.slice();
  }
  return null;
}

describe("seeded CDCL", () => {
  it("rejects a contradiction and accepts a forced literal", () => {
    const denied = solveCnf(1, [[1], [-1]], () => ({ variable: 1, value: true }));
    assert.equal(denied.sat, false);
    const forced = solveCnf(1, [[1]], () => ({ variable: 1, value: false }));
    assert.equal(forced.sat, true);
    assert.equal(forced.assignment?.[1], true);
  });

  it("matches brute force on small random formulas and returns a real model", () => {
    for (let trial = 0; trial < 30; trial += 1) {
      const nvars = 8;
      const clauses: Clause[] = [];
      for (let count = 0; count < 22; count += 1) {
        const clause = new Set<number>();
        while (clause.size < 3) {
          const variable = (mix32(trial + 1, `v${count}:${clause.size}`) % nvars) + 1;
          const sign = (mix32(trial + 9, `s${count}:${clause.size}`) & 1) === 1 ? 1 : -1;
          clause.add(sign * variable);
        }
        clauses.push([...clause]);
      }
      const solved = solveCnf(nvars, clauses, seededDecider(Array.from({ length: nvars }, (_, index) => `v${index}`), trial + 3, "trial"));
      const brute = bruteForce(nvars, clauses);
      assert.equal(solved.sat, brute !== null, `trial ${trial}`);
      if (solved.sat && solved.assignment) assert.equal(modelSatisfies(clauses, solved.assignment), true);
    }
  });

  it("lets the seed change which member of an exactly-one group is chosen", () => {
    const names = ["lime", "lemon", "vinegar", "tamarind"];
    const clauses: Clause[] = [[1, 2, 3, 4], [-1, -2], [-1, -3], [-1, -4], [-2, -3], [-2, -4], [-3, -4]];
    const picks = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => {
      const solved = solveCnf(4, clauses, seededDecider(names, seed, "acid"));
      assert.equal(solved.sat, true);
      assert.equal(modelSatisfies(clauses, solved.assignment || []), true);
      return solved.assignment?.slice(1).map((value) => (value ? 1 : 0)).join("");
    });
    assert.equal(picks[0], solveCnf(4, clauses, seededDecider(names, 1, "acid")).assignment?.slice(1).map((value) => (value ? 1 : 0)).join(""));
    assert.ok(new Set(picks).size >= 3, picks.join(" "));
  });
});
