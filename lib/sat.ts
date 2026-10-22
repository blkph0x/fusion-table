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
  /** Index 0 is unused. Present only when sat is true. */
  assignment: boolean[] | null;
  decisions: number;
  conflicts: number;
  learned: number;
}

export function mix32(seed: number, text: string): number {
  let hash = seed >>> 0;
  for (let i = 0; i < text.length; i += 1) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return hash;
}

export function modelSatisfies(clauses: readonly Clause[], assignment: readonly boolean[]): boolean {
  return clauses.every((clause) => clause.some((lit) => {
    const value = assignment[Math.abs(lit)];
    return value === (lit > 0);
  }));
}

function normaliseClause(clause: readonly number[]): number[] | null {
  const seen = new Set<number>();
  for (const lit of clause) {
    if (!Number.isInteger(lit) || lit === 0) throw new Error("A SAT literal must be a non-zero integer.");
    if (seen.has(-lit)) return null;
    seen.add(lit);
  }
  return [...seen];
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

export function solveCnf(nvars: number, rawClauses: readonly Clause[], decide: Decider): SolveResult {
  if (!Number.isInteger(nvars) || nvars < 1 || nvars > 64) throw new Error("This solver accepts 1 to 64 variables.");
  const clauses: number[][] = [];
  for (const raw of rawClauses) {
    const clause = normaliseClause(raw);
    if (!clause) continue;
    if (clause.length === 0) {
      return { sat: false, assignment: null, decisions: 0, conflicts: 1, learned: 0 };
    }
    for (const lit of clause) {
      if (Math.abs(lit) > nvars) throw new Error("A SAT literal is outside the variable range.");
    }
    clauses.push(clause);
  }

  const assign: Array<boolean | null> = Array.from({ length: nvars + 1 }, () => null);
  const level = Array.from({ length: nvars + 1 }, () => -1);
  const reason: Array<number | null> = Array.from({ length: nvars + 1 }, () => null);
  const trail: number[] = [];
  const lim: number[] = [];
  let decisionLevel = 0;
  let decisions = 0;
  let conflicts = 0;
  let learned = 0;

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

  const giveUp = (): SolveResult => ({ sat: false, assignment: null, decisions, conflicts, learned });

  let conflict = propagate();
  if (conflict !== null) return giveUp();
  let steps = 0;
  while (trail.length < nvars) {
    if (++steps > 8000 || learned > 4000) return giveUp();
    const decision = decide(assign);
    if (!decision || decision.variable < 1 || decision.variable > nvars || assign[decision.variable] != null) return giveUp();
    decisionLevel += 1;
    lim.push(trail.length);
    decisions += 1;
    assignLit(decision.value ? decision.variable : -decision.variable, null);
    conflict = propagate();
    while (conflict !== null) {
      conflicts += 1;
      if (decisionLevel === 0) return giveUp();
      const analysed = analyze(conflict);
      if (!analysed) return giveUp();
      if (analysed.learnedClause.length === 0) return giveUp();
      clauses.push(analysed.learnedClause);
      learned += 1;
      backtrack(analysed.back);
      conflict = propagate();
      if (++steps > 8000) return giveUp();
    }
  }

  const assignment = assign.map((value) => value === true);
  if (!modelSatisfies(clauses, assignment)) return giveUp();
  return { sat: true, assignment, decisions, conflicts, learned };
}
