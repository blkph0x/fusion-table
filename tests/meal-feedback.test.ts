import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBoard, communityAdjustments, plateIdentity, submitVote, summarizeRecipeFeedback, type CommunityLedger } from "../lib/community.ts";
import { FEEDBACK_CATEGORIES, feedbackRecipeKey, isFeedbackRecipe, readMealFeedback } from "../lib/meal-feedback.ts";
import { generateRecipe } from "../lib/recipes.ts";
import type { Recipe } from "../lib/recipe-types.ts";

const now = "2026-10-27T10:00:00.000Z";
const device = (id: number) => `browser${String(id).padStart(16, "0")}`;
const recipe = () => generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegetarian", servings: 4 });
const empty = (): CommunityLedger => ({ votes: [], whys: [], news: [] });
const cooked = (plate: Recipe, id = 1) => ({ plate, device: device(id), experience: "cooked" as const });

describe("current-version meal feedback", () => {
  it("groups identical food from different seeds but separates quantity, timing, serving and method changes", () => {
    const original = recipe();
    assert.equal(feedbackRecipeKey({ ...original, id: `${original.id}-sat-12` }), feedbackRecipeKey({ ...original, id: `${original.id}-sat-987` }));
    assert.equal(feedbackRecipeKey(original), feedbackRecipeKey({ ...original, title: "My title", ingredients: original.ingredients.map((line) => ({ ...line, inPantry: !line.inPantry })) }));
    for (const changed of [
      { ...original, servings: 2 }, { ...original, cookMinutes: original.cookMinutes + 1 },
      { ...original, regionId: "greek" }, { ...original, diet: "vegan" as const },
      { ...original, ingredients: original.ingredients.map((line, index) => index ? line : { ...line, amount: line.amount + 1 }) },
      { ...original, steps: original.steps.map((step, index) => index ? step : { ...step, detail: `${step.detail} Different method.` }) },
    ]) assert.notEqual(feedbackRecipeKey(original), feedbackRecipeKey(changed));
  });

  it("rejects malformed snapshots before fingerprinting and does not retain mutable reason arrays", () => {
    const original = recipe();
    for (const malformed of [null, [], { ...original, ingredients: {} }, { ...original, steps: [{ title: "x", detail: 4 }] },
      { ...original, diet: "not-a-diet" }, { ...original, ingredients: [...original.ingredients, original.ingredients[0]] }]) assert.equal(isFeedbackRecipe(malformed), false);
    const categories = ["cost"];
    const result = submitVote(empty(), { ...cooked(original), want: "no", feedback: { categories } }, now, "reason");
    categories[0] = "bland";
    assert.equal(result.ledger.votes[0].feedback?.categories[0], "cost");
    assert.equal(result.board.plates[0].whys[0].wrong, "Cost");
  });

  it("requires a reason before every low rating, downvote or wont report, without saving half a report", () => {
    const original = recipe();
    for (const negative of [{ stars: 0 }, { stars: 1 }, { stars: 2 }, { want: "no" }, { again: "wont" }]) {
      const ledger = empty();
      const rejected = submitVote(ledger, { ...cooked(original), ...negative }, now, "bad");
      assert.match(rejected.error!, /reason/);
      assert.equal(rejected.ledger, ledger);
      assert.equal(ledger.votes.length + ledger.whys.length, 0);
      const accepted = submitVote(ledger, { ...cooked(original), ...negative, feedback: { categories: ["texture"] } }, now, "ok");
      assert.equal(accepted.error, undefined);
      assert.equal(accepted.ledger.votes.length, 1);
      assert.equal(accepted.ledger.whys.length, 1);
      assert.equal(accepted.board.plates[0].whys[0].feedback?.categories[0], "texture");
      assert.equal(accepted.askWhy, false);
    }
  });

  it("accepts category-only reasons but requires useful Other detail and rejects malformed choices", () => {
    const original = recipe(), key = feedbackRecipeKey(original);
    assert.equal(readMealFeedback({ categories: ["cost"] }, key).feedback?.severity, "major");
    for (const feedback of [
      { categories: [] }, { categories: ["unsupported"] }, { categories: ["timing", "timing"] },
      { categories: ["other"], note: "   tiny " }, { categories: ["other"], note: "a b c" },
      { categories: ["timing"], severity: "whatever" }, { categories: ["timing"], note: { text: "x" } },
    ]) assert.ok(submitVote(empty(), { ...cooked(original), stars: 1, feedback }, now, "bad").error);
    assert.equal(submitVote(empty(), { ...cooked(original), stars: 1, feedback: { categories: ["other"], note: "The written method missed the sauce." } }, now, "ok").error, undefined);
  });

  it("binds ingredient and zero-based step references to the complete current snapshot", () => {
    const original = recipe();
    for (const feedback of [
      { categories: ["quantities"], ingredientId: "not-on-this-recipe" },
      { categories: ["timing"], stepIndex: -1 }, { categories: ["timing"], stepIndex: 0.5 },
      { categories: ["timing"], stepIndex: original.steps.length },
      { categories: ["timing"], recipeKey: "recipe:v1:another" },
    ]) {
      const result = submitVote(empty(), { ...cooked(original), stars: 2, feedback }, now, "bad");
      assert.ok(result.error);
      assert.equal(result.ledger.votes.length, 0);
    }
    const id = original.ingredients[0].id;
    const result = submitVote(empty(), { ...cooked(original), stars: 2, feedback: { categories: ["quantities"], ingredientId: id, stepIndex: 0 } }, now, "ok");
    assert.equal(result.error, undefined);
    assert.equal(result.board.plates[0].whys[0].ingredientName, original.ingredients[0].name);
    assert.equal(result.board.plates[0].whys[0].feedback?.stepIndex, 0);
  });

  it("keeps first impressions out of cooked averages, shelving and confidence", () => {
    const original = recipe();
    let ledger = empty();
    for (let id = 1; id <= 6; id++) ledger = submitVote(ledger, { plate: original, device: device(id), experience: "would-try", want: "no", feedback: { categories: ["bad-combination"] } }, now, `v${id}`).ledger;
    const board = buildBoard(ledger), summary = summarizeRecipeFeedback(original, board.plates);
    assert.equal(summary.previewDevices, 6);
    assert.equal(summary.cookedDevices, 0);
    assert.equal(summary.starAverage, null);
    assert.equal(summary.confidence, "none");
    assert.equal(summary.rankAdjustment, 0);
    assert.equal(board.plates[0].shelved, false);
    assert.equal(summary.reasonCounts[0].previewDevices, 6);
    assert.ok(submitVote(ledger, { plate: original, device: device(7), experience: "would-try", stars: 1, feedback: { categories: ["bland"] } }, now, "bad").error);
    assert.ok(submitVote(ledger, { plate: original, device: device(7), stars: 5 }, now, "bad").error);
  });

  it("counts one latest report per browser and outcome, with small samples clearly bounded", () => {
    const original = recipe();
    let ledger = empty();
    for (let index = 0; index < 5; index++) ledger = submitVote(ledger, { ...cooked(original), stars: 5 }, now, `v${index}`).ledger;
    ledger = submitVote(ledger, { plate: original, device: device(1), experience: "would-try", want: "yes" }, now, "preview").ledger;
    let board = buildBoard(ledger), summary = summarizeRecipeFeedback(original, board.plates);
    assert.equal(summary.cookedDevices, 1);
    assert.equal(summary.previewDevices, 1);
    assert.equal(board.plates[0].people, 1);
    assert.equal(summary.confidence, "small-sample");
    assert.equal(summary.rankAdjustment, 0);
    for (let id = 2; id <= 5; id++) ledger = submitVote(ledger, { ...cooked(original, id), stars: 5 }, now, `new${id}`).ledger;
    board = buildBoard(ledger); summary = summarizeRecipeFeedback(original, board.plates);
    assert.equal(summary.confidence, "growing");
    assert.ok(summary.rankAdjustment > 0 && summary.rankAdjustment <= 3);
  });

  it("preserves readable legacy votes without treating them as current-version evidence", () => {
    const original = recipe();
    const old = plateIdentity({ id: "old", title: "Old pasta", classicId: "pasta", regionId: "japanese", diet: "vegetarian", spiceHeat: "medium" });
    const ledger = empty();
    ledger.votes.push({ ...old, plateKey: old.key, id: "legacy", at: now, device: device(1), stars: 0, want: "no", again: "wont" });
    const board = buildBoard(ledger);
    assert.equal(board.plates[0].starAverage, 0);
    assert.equal(board.plates[0].title, "Old pasta");
    assert.equal(summarizeRecipeFeedback(original, board.plates).cookedDevices, 0);
    const changed = { ...original, ingredients: original.ingredients.map((line) => ({ ...line, amount: line.amount + 1 })) };
    const current = submitVote(empty(), { ...cooked(original), stars: 5 }, now, "new");
    assert.equal(summarizeRecipeFeedback(changed, current.board.plates).cookedDevices, 0);
  });

  it("treats safety reports as review requests and never as automatic amount or filter changes", () => {
    const original = recipe(), snapshot = JSON.stringify(original);
    for (const category of ["undercooked", "allergen-info"] as const) {
      const result = submitVote(empty(), { ...cooked(original), stars: 3, feedback: { categories: [category], ingredientId: original.ingredients[0].id } }, now, "review");
      const summary = summarizeRecipeFeedback(original, result.board.plates);
      assert.equal(summary.requiresReview, true);
      assert.equal(summary.rankAdjustment, 0);
      assert.deepEqual(communityAdjustments(plateIdentity(original), original.ingredients, result.board.plates), []);
    }
    assert.equal(JSON.stringify(original), snapshot);
    assert.ok(FEEDBACK_CATEGORIES.some((category) => category.id === "allergen-info"));
  });

  it("keeps a historical safety concern visible even if a browser later changes its stars", () => {
    const original = recipe();
    const first = submitVote(empty(), { ...cooked(original), stars: 2, feedback: { categories: ["undercooked"] } }, now, "review");
    const updated = submitVote(first.ledger, { ...cooked(original), stars: 5, want: "", again: "" }, now, "rating-update");
    assert.equal(summarizeRecipeFeedback(original, updated.board.plates).requiresReview, true);
    assert.equal(summarizeRecipeFeedback(original, updated.board.plates).starAverage, 5);
  });
});
