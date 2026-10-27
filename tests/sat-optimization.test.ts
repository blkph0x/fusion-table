import assert from "node:assert/strict";
import { test } from "node:test";
import { enumerateCnfModels, mix32, modelSatisfies, seededDecider, selectBestCnfModel, solveCnf, verifyUnsatProof, type Clause } from "../lib/sat.ts";

function oracle(nvars: number, clauses: readonly Clause[]): boolean[][] {
  const models: boolean[][] = [];
  for (let bits = 0; bits < 2 ** nvars; bits++) {
    const assignment = [false, ...Array.from({ length: nvars }, (_, index) => Boolean(bits & 2 ** index))];
    // Independent direct Boolean evaluation, rather than the solver's checker.
    if (clauses.every((clause) => clause.some((literal) => assignment[Math.abs(literal)] === (literal > 0)))) models.push(assignment);
  }
  return models;
}
const signature = (model: readonly boolean[]) => model.slice(1).map(Number).join("");
const decide = (nvars: number, seed = 7) => seededDecider(Array.from({ length: nvars }, (_, index) => `v${index + 1}`), seed, "test");

test("all512 two-variable CNFs enumerate exactly the independent truth-table models", () => {
  const clauses: Clause[] = [];
  for (let code = 0; code < 9; code++) {
    let value = code;
    const clause: number[] = [];
    for (let variable = 1; variable <= 2; variable++) {
      const digit = value % 3; value = Math.floor(value / 3);
      if (digit) clause.push(digit === 1 ? variable : -variable);
    }
    clauses.push(clause);
  }
  for (let mask = 0; mask < 512; mask++) {
    const formula = clauses.filter((_, index) => mask & 2 ** index);
    const result = enumerateCnfModels(2, formula, decide(2, mask), { maxModels: 4 });
    assert.equal(result.complete, true, String(mask));
    assert.equal(result.termination, "exhausted");
    assert.deepEqual(result.models.map(signature).sort(), oracle(2, formula).map(signature).sort(), String(mask));
    assert.equal(new Set(result.models.map(signature)).size, result.models.length);
  }
});

test("random small models and scored optima agree with an independent exhaustive oracle", () => {
  for (let trial = 0; trial < 40; trial++) {
    const nvars = 6;
    const clauses: Clause[] = Array.from({ length: 12 }, (_, index) => Array.from({ length: 3 }, (_, slot) => {
      const variable = mix32(trial + 1, `v${index}:${slot}`) % nvars + 1;
      return mix32(trial + 99, `s${index}:${slot}`) & 1 ? variable : -variable;
    }));
    const score = (model: readonly boolean[]) => model.slice(1).reduce((sum, value, index) => sum + (value ? (index + 1) * 3 : -index), 0) - (model[1] && model[2] ? 11 : 0);
    const expected = oracle(nvars, clauses);
    const result = selectBestCnfModel(nvars, clauses, decide(nvars, trial), score, { maxModels: 64 });
    assert.equal(result.complete, true, String(trial));
    assert.deepEqual(result.models.map(signature).sort(), expected.map(signature).sort());
    assert.equal(result.score, expected.length ? Math.max(...expected.map(score)) : null);
    assert.equal(result.optimal, expected.length > 0);
    if (result.assignment) assert.equal(modelSatisfies(clauses, result.assignment), true);
  }
});

test("independent RUP replay binds an UNSAT certificate to the actual original clauses", () => {
  const formula: Clause[] = [[1, 2], [1, -2], [-1, 2], [-1, -2]];
  const result = solveCnf(2, formula, decide(2));
  assert.equal(result.status, "unsat");
  assert.ok(result.learned > 0);
  assert.ok(result.unsatProof);
  assert.equal(verifyUnsatProof(2, formula, result.unsatProof!), true);
  assert.equal(verifyUnsatProof(2, formula.slice(1), result.unsatProof!), false, "an omitted original constraint leaves this formula SAT");
  assert.equal(verifyUnsatProof(2, formula, result.unsatProof!.slice(0, -1)), false, "the final refutation is required");
  assert.equal(verifyUnsatProof(2, formula, [[3], []]), false);
  assert.equal(verifyUnsatProof(2, [[1, 2]], [[]]), false);
  assert.equal(verifyUnsatProof(2, formula, result.unsatProof!, 0), false);
});

test("resource limits and bad decisions remain UNKNOWN rather than false UNSAT claims", () => {
  const formula: Clause[] = [[1, 2]];
  assert.equal(solveCnf(2, formula, decide(2), { maxSteps: 0 }).reason, "step-limit");
  assert.equal(solveCnf(2, formula, decide(2), { maxWork: 0 }).reason, "work-limit");
  assert.equal(solveCnf(1, [[1], [-1]], decide(1), { maxProofWork: 0 }).reason, "proof-limit");
  for (const callback of [() => null, () => ({ variable: 1.5, value: true }), () => ({ variable: 0, value: true })]) {
    const result = solveCnf(2, formula, callback);
    assert.equal(result.status, "unknown");
    assert.equal(result.reason, "invalid-decider");
  }
  const result = enumerateCnfModels(2, formula, () => null);
  assert.equal(result.complete, false);
  assert.equal(result.termination, "unknown");
  assert.ok(solveCnf(2, formula, decide(2)).sat);
});

test("caps report incomplete best-known results, including the exact model-cap boundary", () => {
  const capped = selectBestCnfModel(2, [], decide(2), (model) => Number(model[1]), { maxModels: 1 });
  assert.equal(capped.models.length, 1);
  assert.equal(capped.complete, false);
  assert.equal(capped.optimal, false);
  assert.equal(capped.termination, "model-limit");
  const exact = enumerateCnfModels(1, [], decide(1), { maxModels: 2 });
  assert.equal(exact.models.length, 2);
  assert.equal(exact.solves, 3);
  assert.equal(exact.complete, true, "one final checked UNSAT query establishes exhaustion");
  assert.equal(enumerateCnfModels(2, [], decide(2), { maxSolves: 1 }).termination, "solve-limit");
  assert.equal(enumerateCnfModels(2, [], decide(2), { maxTotalSteps: 0 }).termination, "step-limit");
  assert.equal(enumerateCnfModels(2, [], decide(2), { maxTotalWork: 0 }).termination, "work-limit");
  const limited = enumerateCnfModels(3, [[1, 2], [-1, 3]], decide(3), { maxTotalWork: 30 });
  assert.ok(limited.work + limited.proofWork <= 30);
  assert.equal(limited.complete, false);
});

test("soft scores cannot violate a hard exclusion, mutate models or claim unknown optima", () => {
  const result = selectBestCnfModel(3, [[-1], [2, 3]], decide(3), (model) => model[1] ? 1_000_000 : Number(model[2]), { maxModels: 8 });
  assert.equal(result.optimal, true);
  assert.equal(result.assignment?.[1], false);
  assert.equal(result.score, 1);
  assert.throws(() => selectBestCnfModel(1, [], decide(1), () => NaN), /finite/);
  assert.throws(() => selectBestCnfModel(1, [], decide(1), (model) => { (model as boolean[])[1] = false; return 0; }), TypeError);
  assert.equal(selectBestCnfModel(1, [[1], [-1]], decide(1), () => 0).optimal, false);
});

test("seeded ties stay deterministic while full model sets and optimum values remain invariant", () => {
  const clauses: Clause[] = [[1, 2, 3], [-1, -2], [-1, -3], [-2, -3]];
  const signatures = new Set<string>();
  for (let seed = 1; seed <= 12; seed++) {
    const first = selectBestCnfModel(3, clauses, decide(3, seed), () => 10);
    const repeat = selectBestCnfModel(3, clauses, decide(3, seed), () => 10);
    assert.deepEqual(first, repeat);
    assert.equal(first.optimal, true);
    assert.equal(first.models.length, 3);
    signatures.add(signature(first.assignment!));
  }
  assert.ok(signatures.size >= 2);
});

test("malformed literals are rejected even when hidden after a tautology or empty clause", () => {
  assert.throws(() => solveCnf(1, [[1, -1, 0]], decide(1)), /literal/);
  assert.throws(() => solveCnf(1, [[2, -2]], decide(1)), /literal/);
  assert.throws(() => solveCnf(1, [[], [2]], decide(1)), /literal/);
  assert.equal(modelSatisfies([[1, 0]], [false, true]), false);
  assert.throws(() => enumerateCnfModels(2, [], decide(2), { maxModels: -1 }), /non-negative/);
});
