import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBoard, plateIdentity, submitVote, type CommunityLedger, type PlateStanding } from "../lib/community.ts";
import { feedbackRecipeKey } from "../lib/meal-feedback.ts";
import { planBriefKey, readPlanSession } from "../lib/kitchen-state.ts";
import { chooseDinner, planWeek, swapDinner } from "../lib/planner.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { assertRecipeFilters } from "../lib/recipe-filters.ts";
import type { Recipe } from "../lib/recipe-types.ts";

function reports(recipe: Recipe, count = 3, options: { preview?: boolean; sameDevice?: boolean; high?: boolean } = {}): PlateStanding[] {
  let ledger: CommunityLedger = { votes: [], whys: [], news: [] };
  for (let n = 0; n < count; n++) {
    const result = submitVote(ledger, {
      device: `plannerbrowser${String(options.sameDevice ? 0 : n).padStart(8, "0")}`, plate: recipe,
      experience: options.preview ? "would-try" : "cooked",
      ...(options.preview ? { want: "no" } : { stars: options.high ? 5 : 1 }),
      ...(!options.high ? { feedback: { categories: ["timing"] } } : {}),
    }, `2026-10-27T00:00:${String(n).padStart(2, "0")}.000Z`, `planner-report-${n}`);
    assert.equal(result.error, undefined);
    ledger = result.ledger;
  }
  return buildBoard(ledger).plates;
}

describe("exact cooked feedback in weekly suggestions", () => {
  const brief = { days: 1, servings: 2, seed: 42 };
  const baseline = planWeek(brief);
  const first = baseline.days[0].recipe!;

  it("keeps no-feedback behavior deterministic and ignores a single browser or first impressions", () => {
    assert.deepEqual(planWeek(brief), baseline);
    assert.deepEqual(planWeek({ ...brief, feedback: [] }), baseline);
    assert.deepEqual(planWeek({ ...brief, feedback: reports(first, 1) }), baseline);
    assert.deepEqual(planWeek({ ...brief, feedback: reports(first, 3, { sameDevice: true }) }), baseline);
    assert.deepEqual(planWeek({ ...brief, feedback: reports(first, 5, { preview: true }) }), baseline);
  });

  it("moves a comparable exact seeded recipe down after three distinct cooked low reports", () => {
    const feedback = reports(first);
    assert.equal(feedback[0].feedbackSummary?.cookedDevices, 3);
    assert.ok(feedback[0].feedbackSummary!.rankAdjustment < 0);
    const learned = planWeek({ ...brief, feedback });
    assert.notEqual(feedbackRecipeKey(learned.days[0].recipe!), feedbackRecipeKey(first));
    assert.deepEqual(planWeek({ ...brief, feedback }), learned);
    assert.equal(learned.days[0].recipe?.sourceLabel, "Template-generated · not kitchen-tested");
    assert.equal(first.ingredients[0].amount, baseline.days[0].recipe!.ingredients[0].amount);
  });

  it("does not transfer a report from changed ingredients, instructions or a broad legacy identity", () => {
    for (const change of ["amount", "step"] as const) {
      const different = structuredClone(first);
      if (change === "amount") different.ingredients[0].amount += 1;
      else different.steps[0].detail += " Different preparation.";
      assert.notEqual(feedbackRecipeKey(different), feedbackRecipeKey(first));
      assert.deepEqual(planWeek({ ...brief, feedback: reports(different) }), baseline);
    }
    const legacy = structuredClone(first) as Partial<Recipe>;
    delete legacy.steps;
    const oldIdentity = plateIdentity(legacy as Recipe);
    const oldRows = reports(first).map((row) => ({ ...row, plateKey: oldIdentity.key, recipeVersion: undefined, feedbackSummary: undefined }));
    assert.deepEqual(planWeek({ ...brief, feedback: oldRows }), baseline);
  });

  it("uses the same learned ordering for dinner alternatives and a random replacement", () => {
    const input = { days: 1, servings: 2 };
    const week = planWeek(input);
    const originalSwap = swapDinner(input, week, 1);
    const dislikedAlternative = originalSwap.days[0].recipe!;
    assert.equal(week.days[0].options[0].classicId, dislikedAlternative.classicId);
    const feedback = reports(dislikedAlternative);
    const learned = planWeek({ ...input, feedback });
    assert.equal(learned.days[0].recipe?.id, week.days[0].recipe?.id, "The untouched first choice stays put.");
    assert.notEqual(learned.days[0].options[0].classicId, dislikedAlternative.classicId);
    const swapped = swapDinner({ ...input, feedback }, week, 1);
    assert.notEqual(swapped.days[0].recipe?.id, dislikedAlternative.id);
    assert.notEqual(swapped.days[0].recipe?.id, week.days[0].recipe?.id);
  });

  it("checks hard exclusions before ranking and refuses an explicitly requested blocked choice", () => {
    const blocked = generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2 });
    const feedback = reports(blocked, 5, { high: true });
    const input = { days: 2, servings: 2, avoidAllergens: ["sesame", "soy"], dislikes: ["mushroom"], feedback };
    const week = planWeek(input);
    for (const day of week.days) if (day.recipe) assert.doesNotThrow(() => assertRecipeFilters(day.recipe!, input));
    const refused = chooseDinner(input, week, 1, "pasta", "japanese");
    assert.equal(refused.days[0].recipe?.id, week.days[0].recipe?.id);
    const locked = planWeek({ ...input, locks: [{ day: 1, classicId: "pasta", regionId: "japanese" }] });
    assert.equal(locked.days[0].recipe, null);
    assert.match(locked.days[0].reason!, /not replaced/);
  });

  it("limits feedback lookups to 16 built candidates per pick or alternatives pass", () => {
    let lookups = 0;
    const feedback = new Proxy(reports(first), {
      get(target, property, receiver) {
        if (property === "find") return (predicate: (row: PlateStanding, index: number, rows: PlateStanding[]) => unknown) => {
          lookups++;
          return target.find(predicate);
        };
        return Reflect.get(target, property, receiver);
      },
    });
    planWeek({ ...brief, feedback });
    assert.ok(lookups > 0);
    assert.ok(lookups <= 32, `${lookups} lookups exceeded one 16-choice pick and one 16-choice alternatives pass.`);
  });

  it("keeps variety bands ahead of a strongly liked already-used dinner", () => {
    const input = { days: 2, servings: 2 };
    const week = planWeek(input);
    const learned = planWeek({ ...input, feedback: reports(week.days[0].recipe!, 20, { high: true }) });
    assert.equal(learned.days[0].recipe?.id, week.days[0].recipe?.id);
    assert.notEqual(learned.days[1].recipe?.classicId, learned.days[0].recipe?.classicId);
    assert.notEqual(learned.days[1].recipe?.kind, learned.days[0].recipe?.kind);
  });

  it("does not make shared board updates part of the stored household brief or stale-plan signature", () => {
    const household = { days: 1, servings: 2, diet: "balanced" as const, spiceHeat: "medium" as const,
      pantry: "", avoidAllergens: [], dislikes: [] };
    const withLiveReports = { ...household, feedback: reports(first) };
    assert.equal(planBriefKey(withLiveReports), planBriefKey(household));
    const restored = readPlanSession({ plan: baseline, brief: withLiveReports, locks: [] });
    assert.ok(restored);
    assert.ok(!("feedback" in restored.brief));
    assert.equal(planBriefKey(restored.brief), planBriefKey(household));
  });
});
