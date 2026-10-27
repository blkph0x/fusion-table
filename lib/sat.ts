/**
 * Small CDCL solver for recipe choices.
 *
 * The propagate / 1-UIP resolve / backjump loop follows the shape of `decide`,
 * `analyze` and `propagate` in horn_cdclt_lab/cdcl.py from the local
 * p-vs-np research tree. That lab always decides the first free variable
 * false, so it returns one fixed model. Here the caller picks the next
 * variable and its phase. Fusion Table seeds that choice.
 *
 * A returned assignment is checked against the clauses. This is not a proof
 * about P versus NP, taste, or food safety.
 */

export type Clause = readonly number[];

export interface Decision {
  /** 1-based variable index. */
  variable: number;
  value: boolean;
}

/** Assigned entries are `true` or `false`. Index 0 is unused. Unassigned is `null`. */
export type Decider = (assigned: ReadonlyArray<boolean | null>) => Decision | null;

export interface SolveResult {
  sat: boolean;
  status: "sat" | "unsat" | "unknown";
  reason?: SolveReason;
  /** Index 0 is unused. Present only when sat is true. */
  assignment: boolean[] | null;
  decisions: number;
  conflicts: number;
  learned: number;
  steps: number;
  work: number;
  proofWork: number;
  /** Checked reverse-unit-propagation refutation, including its final empty clause. */
  unsatProof?: Clause[];
}

export type SolveReason = "step-limit" | "learned-limit" | "work-limit" | "proof-limit" | "invalid-decider" | "analysis-failed" | "model-check-failed" | "proof-check-failed";
export interface SolveOptions {
  maxSteps?: number;
  maxLearned?: number;
  /** Search/proof literal visits and resolution inputs, not milliseconds. */
  maxWork?: number;
  maxProofWork?: number;
}

export interface EnumerationOptions extends SolveOptions {
  maxModels?: number;
  maxSolves?: number;
  maxTotalSteps?: number;
  maxTotalWork?: number;
}

export interface ModelEnumerationResult {
  models: boolean[][];
  complete: boolean;
  termination: "exhausted" | "model-limit" | "solve-limit" | "step-limit" | "work-limit" | "unknown";
  reason?: SolveReason;
  solves: number;
  decisions: number;
  conflicts: number;
  learned: number;
  steps: number;
  work: number;
  proofWork: number;
}

function limit(value: number | undefined, fallback: number, name: string): number {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 0) throw new Error(`${name} must be a non-negative safe integer.`);
  return result;
}

export function mix32(seed: number, text: string): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

export function modelSatisfies(clauses: readonly Clause[], assignment: readonly boolean[]): boolean {
  if (clauses.some((clause) => clause.some((lit) => !Number.isSafeInteger(lit) || lit === 0))) return false;
  return clauses.every((clause) => clause.some((lit) => {
    if (!Number.isSafeInteger(lit) || lit === 0) return false;
    const value = assignment[Math.abs(lit)];
    return typeof value === "boolean" && value === (lit > 0);
  }));
}

function normaliseClause(clause: readonly number[]): number[] | null {
  const seen = new Set<number>();
  let tautology = false;
  for (const lit of clause) {
    if (!Number.isInteger(lit) || lit === 0) throw new Error("A SAT literal must be a non-zero integer.");
    if (seen.has(-lit)) tautology = true;
    seen.add(lit);
  }
  return tautology ? null : [...seen];
}

function checkedClauses(nvars: number, rawClauses: readonly Clause[]): number[][] {
  if (!Number.isInteger(nvars) || nvars < 1 || nvars > 64) throw new Error("This solver accepts 1 to 64 variables.");
  const clauses: number[][] = [];
  for (const raw of rawClauses) {
    for (const lit of raw) if (!Number.isInteger(lit) || lit === 0 || Math.abs(lit) > nvars) throw new Error("A SAT literal must be a non-zero integer inside the variable range.");
    const clause = normaliseClause(raw);
    if (clause) clauses.push(clause);
  }
  return clauses;
}

/** A separate integer-array propagator checks each proof lemma from original clauses. */
function replayUnsatProof(nvars: number, rawClauses: readonly Clause[], proof: readonly Clause[], maxWork: number): { valid: boolean; limited: boolean; work: number } {
  let work = 0;
  try {
    const database = checkedClauses(nvars, rawClauses);
    checkedClauses(nvars, proof);
    if (!proof.length || proof[proof.length - 1].length !== 0) return { valid: false, limited: false, work };
    for (const lemma of proof) {
      const values = new Int8Array(nvars + 1);
      let conflict = false;
      for (const literal of lemma) {
        const variable = Math.abs(literal), value = literal > 0 ? -1 : 1;
        if (values[variable] && values[variable] !== value) conflict = true;
        values[variable] = value;
      }
      let changed = true;
      while (!conflict && changed) {
        changed = false;
        for (const clause of database) {
          let satisfied = false, open = 0, unit = 0;
          for (const literal of clause) {
            if (work >= maxWork) return { valid: false, limited: true, work };
            work++;
            const value = values[Math.abs(literal)];
            if (value === 0) { open++; unit = literal; }
            else if (value === (literal > 0 ? 1 : -1)) { satisfied = true; break; }
          }
          if (satisfied) continue;
          if (!open) { conflict = true; break; }
          if (open === 1) { values[Math.abs(unit)] = unit > 0 ? 1 : -1; changed = true; }
        }
      }
      if (!conflict) return { valid: false, limited: false, work };
      const normalized = normaliseClause(lemma);
      if (normalized) database.push(normalized);
    }
    return { valid: true, limited: false, work };
  } catch {
    return { valid: false, limited: false, work };
  }
}

/** Accept only a completely replayed RUP refutation; a cap never verifies a proof. */
export function verifyUnsatProof(nvars: number, rawClauses: readonly Clause[], proof: readonly Clause[], maxWork = 2_000_000): boolean {
  return replayUnsatProof(nvars, rawClauses, proof, limit(maxWork, 2_000_000, "maxProofWork")).valid;
}

/**
 * Seeded decision order. The highest-scoring unassigned variable is tried true
 * first. A different seed changes the order, and therefore which model is found
 * first, unless the clauses force a single model.
 */
export function seededDecider(names: readonly string[], seed: number, salt: string): Decider {
  const order = names.map((name, index) => ({
    variable: index + 1,
    score: mix32(seed, `${salt}\0${name}`),
  })).sort((a, b) => (a.score < b.score ? 1 : a.score > b.score ? -1 : a.variable - b.variable));
  return (assigned) => {
    for (const item of order) {
      if (assigned[item.variable] == null) return { variable: item.variable, value: true };
    }
    return null;
  };
}

export function solveCnf(nvars: number, rawClauses: readonly Clause[], decide: Decider, options: SolveOptions = {}): SolveResult {
  const clauses = checkedClauses(nvars, rawClauses);
  const originalCount = clauses.length;
  const maxSteps = limit(options.maxSteps, 8000, "maxSteps"), maxLearned = limit(options.maxLearned, 4000, "maxLearned");
  const maxWork = limit(options.maxWork, 10_000_000, "maxWork"), maxProofWork = limit(options.maxProofWork, 2_000_000, "maxProofWork");

  const assign: Array<boolean | null> = Array.from({ length: nvars + 1 }, () => null);
  const level = Array.from({ length: nvars + 1 }, () => -1);
  const reason: Array<number | null> = Array.from({ length: nvars + 1 }, () => null);
  const trail: number[] = [];
  const lim: number[] = [];
  let decisionLevel = 0;
  let decisions = 0;
  let conflicts = 0;
  let learned = 0;
  let steps = 0, work = 0, workLimited = false;

  function assignLit(lit: number, reasonIndex: number | null): boolean {
    const variable = Math.abs(lit);
    const value = lit > 0;
    const current = assign[variable];
    if (current !== null) return current === value;
    assign[variable] = value;
    level[variable] = decisionLevel;
    reason[variable] = reasonIndex;
    trail.push(variable);
    return true;
  }

  function propagate(): number | null {
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < clauses.length; index += 1) {
        const clause = clauses[index];
        let satisfied = false;
        const open: number[] = [];
        for (const lit of clause) {
          if (work >= maxWork) { workLimited = true; return null; }
          work++;
          const current = assign[Math.abs(lit)];
          if (current === null) open.push(lit);
          else if (current === (lit > 0)) { satisfied = true; break; }
        }
        if (satisfied) continue;
        if (open.length === 0) return index;
        if (open.length === 1) {
          if (!assignLit(open[0], index)) return index;
          changed = true;
        }
      }
    }
    return null;
  }

  function resolve(left: readonly number[], right: readonly number[], pivot: number): number[] | null {
    const leftSet = new Set(left);
    const rightSet = new Set(right);
    let out: number[];
    if (leftSet.has(pivot) && rightSet.has(-pivot)) {
      out = [...left.filter((lit) => lit !== pivot), ...right.filter((lit) => lit !== -pivot)];
    } else if (leftSet.has(-pivot) && rightSet.has(pivot)) {
      out = [...left.filter((lit) => lit !== -pivot), ...right.filter((lit) => lit !== pivot)];
    } else return null;
    const unique = new Set(out);
    if ([...unique].some((lit) => unique.has(-lit))) return null;
    return [...unique];
  }

  function analyze(conflictIndex: number): { learnedClause: number[]; back: number } | null {
    let learnedClause = clauses[conflictIndex].slice();
    const current = decisionLevel;
    const atCurrent = (clause: readonly number[]) => clause.filter((lit) => level[Math.abs(lit)] === current).length;
    let guard = 0;
    while (atCurrent(learnedClause) > 1) {
      if (++guard > trail.length + 2) return null;
      let pivot: number | null = null;
      for (let index = trail.length - 1; index >= 0; index -= 1) {
        const variable = trail[index];
        if (level[variable] !== current || reason[variable] === null) continue;
        if (learnedClause.includes(variable) || learnedClause.includes(-variable)) {
          pivot = variable;
          break;
        }
      }
      if (pivot === null) return null;
      const resolutionWork = learnedClause.length + clauses[reason[pivot] as number].length;
      if (resolutionWork > maxWork - work) { workLimited = true; return null; }
      work += resolutionWork;
      const next = resolve(learnedClause, clauses[reason[pivot] as number], pivot);
      if (!next) return null;
      learnedClause = next;
    }
    let back = 0;
    for (const lit of learnedClause) {
      const litLevel = level[Math.abs(lit)];
      if (litLevel !== current && litLevel > back) back = litLevel;
    }
    return { learnedClause, back };
  }

  function backtrack(to: number) {
    while (decisionLevel > to) {
      const marker = lim.pop() ?? 0;
      while (trail.length > marker) {
        const variable = trail.pop() as number;
        assign[variable] = null;
        level[variable] = -1;
        reason[variable] = null;
      }
      decisionLevel -= 1;
    }
  }

  const unknown = (reason: SolveReason): SolveResult => ({ sat: false, status: "unknown", reason, assignment: null, decisions, conflicts, learned, steps, work, proofWork: 0 });
  const unsat = (): SolveResult => {
    const unsatProof: Clause[] = [...clauses.slice(originalCount).map((clause) => clause.slice()), []];
    const replay = replayUnsatProof(nvars, rawClauses, unsatProof, Math.min(maxProofWork, maxWork - work));
    if (!replay.valid) return { ...unknown(replay.limited ? "proof-limit" : "proof-check-failed"), proofWork: replay.work };
    return { sat: false, status: "unsat", assignment: null, decisions, conflicts, learned, steps, work, proofWork: replay.work, unsatProof };
  };

  let conflict = propagate();
  if (workLimited) return unknown("work-limit");
  if (conflict !== null) return unsat();
  while (trail.length < nvars) {
    if (steps >= maxSteps) return unknown("step-limit");
    steps++;
    const decision = decide(assign);
    if (!decision || !Number.isInteger(decision.variable) || typeof decision.value !== "boolean" || decision.variable < 1 || decision.variable > nvars || assign[decision.variable] != null) return unknown("invalid-decider");
    decisionLevel += 1;
    lim.push(trail.length);
    decisions += 1;
    assignLit(decision.value ? decision.variable : -decision.variable, null);
    conflict = propagate();
    if (workLimited) return unknown("work-limit");
    while (conflict !== null) {
      conflicts += 1;
      if (decisionLevel === 0) return unsat();
      const analysed = analyze(conflict);
      if (!analysed) return unknown(workLimited ? "work-limit" : "analysis-failed");
      if (analysed.learnedClause.length === 0) return unsat();
      if (learned >= maxLearned) return unknown("learned-limit");
      clauses.push(analysed.learnedClause);
      learned += 1;
      backtrack(analysed.back);
      conflict = propagate();
      if (workLimited) return unknown("work-limit");
      if (conflict !== null) {
        if (steps >= maxSteps) return unknown("step-limit");
        steps++;
      }
    }
  }

  const assignment = assign.map((value) => value === true);
  if (!modelSatisfies(rawClauses, assignment)) return unknown("model-check-failed");
  return { sat: true, status: "sat", assignment, decisions, conflicts, learned, steps, work, proofWork: 0 };
}

/** Enumerate distinct full Boolean outcomes; seeds affect order, not completeness. */
export function enumerateCnfModels(nvars: number, rawClauses: readonly Clause[], decide: Decider, options: EnumerationOptions = {}): ModelEnumerationResult {
  checkedClauses(nvars, rawClauses);
  const maxModels = limit(options.maxModels, 256, "maxModels");
  const maxSolves = limit(options.maxSolves, maxModels + 1, "maxSolves");
  const maxTotalSteps = limit(options.maxTotalSteps, 100_000, "maxTotalSteps");
  const maxTotalWork = limit(options.maxTotalWork, 20_000_000, "maxTotalWork");
  const clauses = rawClauses.map((clause) => [...clause]);
  const result: ModelEnumerationResult = { models: [], complete: false, termination: "solve-limit", solves: 0, decisions: 0, conflicts: 0, learned: 0, steps: 0, work: 0, proofWork: 0 };
  while (result.solves < maxSolves) {
    if (result.steps >= maxTotalSteps) { result.termination = "step-limit"; break; }
    if (result.work + result.proofWork >= maxTotalWork) { result.termination = "work-limit"; break; }
    const remainingWork = maxTotalWork - result.work - result.proofWork;
    const solved = solveCnf(nvars, clauses, decide, { ...options, maxSteps: Math.min(options.maxSteps ?? 8000, maxTotalSteps - result.steps), maxWork: Math.min(options.maxWork ?? 10_000_000, remainingWork), maxProofWork: Math.min(options.maxProofWork ?? 2_000_000, remainingWork) });
    result.solves++; result.decisions += solved.decisions; result.conflicts += solved.conflicts; result.learned += solved.learned; result.steps += solved.steps; result.work += solved.work; result.proofWork += solved.proofWork;
    if (solved.status === "unsat") { result.complete = true; result.termination = "exhausted"; break; }
    if (solved.status !== "sat" || !solved.assignment) { result.termination = "unknown"; result.reason = solved.reason; break; }
    if (result.models.length >= maxModels) { result.termination = "model-limit"; break; }
    if (!modelSatisfies(rawClauses, solved.assignment)) { result.termination = "unknown"; result.reason = "model-check-failed"; break; }
    result.models.push(solved.assignment.slice());
    clauses.push(solved.assignment.slice(1).map((value, index) => value ? -(index + 1) : index + 1));
  }
  return result;
}

/** Optimize only among verified hard-clause models; capped results are best-known. */
export function selectBestCnfModel(nvars: number, rawClauses: readonly Clause[], decide: Decider, score: (assignment: readonly boolean[]) => number, options: EnumerationOptions = {}): ModelEnumerationResult & { assignment: boolean[] | null; score: number | null; optimal: boolean } {
  const result = enumerateCnfModels(nvars, rawClauses, decide, options);
  let best: boolean[] | null = null, bestScore: number | null = null;
  for (const model of result.models) {
    const value = score(Object.freeze(model.slice()));
    if (!Number.isFinite(value)) throw new Error("A model score must be finite.");
    if (bestScore === null || value > bestScore) { best = model.slice(); bestScore = value; }
  }
  return { ...result, assignment: best, score: bestScore, optimal: result.complete && best !== null };
}
