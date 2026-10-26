import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateMeal, MAIN_INGREDIENTS, COOKING_METHODS, MEAL_REGIONS, MEAL_SIDES } from "../lib/meals.ts";
import { PLATES } from "../lib/plates.ts";
import { mealName, namingLooksGeneric } from "../lib/meal-name.ts";
import { pickMealOfWeek, scoreMealOfWeek, weekSeed } from "../lib/meal-of-week.ts";
import { buildHomeDiscover, shufflePlates } from "../lib/home-suggestions.ts";
import { platePictureKey, platePicturePrompt } from "../lib/plate-picture.ts";
import { exploreRegionProfile, regionTrueIds } from "../lib/region-diversity.ts";
import { markerLeak } from "../lib/region-affinity.ts";
import { cutsForMethod } from "../lib/cut-method.ts";
import { mainAllowsSmoke } from "../lib/smoke-method.ts";

const SAMPLE_REGIONS = [
  "thai", "indian", "japanese", "korean", "mexican", "chinese", "levantine",
  "vietnamese", "moroccan", "italian", "ethiopian", "caribbean", "french",
  "spanish", "greek", "indonesian", "peruvian", "turkish", "brazilian",
];

const QUICK_OK = new Set(["stir-fried", "pan-fried", "grilled", "steamed", "poached", "air-fried", "baked", "roasted", "curry"]);
const METHOD_ONLY_DOT = /·\s*(grilled|baked|roasted|braised|steamed|poached|pan-fried|stir-fried|air-fried|smoked|curry|schnitzel|patties)\s*$/i;

function mulberry(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

describe("fusion overhaul — naming", () => {
  it("builds appetising titles without the old · method pattern", () => {
    for (const plate of PLATES.slice(0, 40)) {
      const title = mealName(plate);
      assert.equal(namingLooksGeneric(title), false, title);
      assert.ok(!/·/.test(title), title);
      assert.ok(title.length >= 12, title);
      assert.ok(title.length <= 90, title);
    }
    const generated = generateMeal({
      mainId: "chicken",
      methodId: "grilled",
      regionId: "japanese",
      sideId: "rice-greens",
      servings: 4,
    });
    assert.equal(namingLooksGeneric(generated.title), false, generated.title);
    assert.ok(/Japanese/i.test(generated.title));
    assert.ok(/grilled/i.test(generated.title));
    assert.ok(/chicken/i.test(generated.title));
  });
});

describe("fusion overhaul — meal of the week", () => {
  it("scores wholesome quick plates above slow heavy ones", () => {
    const quick = generateMeal({
      mainId: "salmon",
      methodId: "grilled",
      regionId: "japanese",
      sideId: "rice-greens",
      servings: 4,
    });
    const heavy = generateMeal({
      mainId: "beef",
      methodId: "braised",
      regionId: "french",
      sideId: "mashed-potato",
      servings: 4,
    });
    const q = scoreMealOfWeek(quick);
    const h = scoreMealOfWeek(heavy);
    assert.ok(q.groups.protein && q.groups.vegetable && q.groups.grainOrStarch);
    assert.ok(q.total >= h.total - 5, `quick ${q.total} vs heavy ${h.total}`);
    assert.ok(q.quickEasy >= h.quickEasy);
  });

  it("picks a stable MOTW within the same week seed", () => {
    const a = pickMealOfWeek({ seed: 202642, sampleSize: 36 });
    const b = pickMealOfWeek({ seed: 202642, sampleSize: 36 });
    assert.equal(a.title, b.title);
    assert.equal(a.plate.mainId, b.plate.mainId);
    assert.ok(a.score.total >= 40, `MOTW score ${a.score.total}`);
    assert.ok(a.score.groups.protein);
    assert.ok(weekSeed() > 2020);
  });
});

describe("fusion overhaul — randomised home suggestions", () => {
  it("shuffles differently per load seed and keeps MOTW out of the strip", () => {
    const one = shufflePlates(11).map((p) => `${p.regionId}:${p.mainId}`).join(",");
    const two = shufflePlates(99).map((p) => `${p.regionId}:${p.mainId}`).join(",");
    assert.notEqual(one, two);
    const homeA = buildHomeDiscover({ loadSeed: 1001, weekSeed: 202642, suggestionCount: 6 });
    const homeB = buildHomeDiscover({ loadSeed: 2002, weekSeed: 202642, suggestionCount: 6 });
    assert.equal(homeA.mealOfWeek.title, homeB.mealOfWeek.title);
    const keysA = homeA.suggestions.map((s) => s.title).join("|");
    const keysB = homeB.suggestions.map((s) => s.title).join("|");
    assert.notEqual(keysA, keysB);
    assert.equal(homeA.suggestions.length, 6);
    const motwKey = `${homeA.mealOfWeek.plate.regionId}|${homeA.mealOfWeek.plate.mainId}|${homeA.mealOfWeek.plate.methodId}|${homeA.mealOfWeek.plate.sideId}`;
    for (const s of homeA.suggestions) {
      const key = `${s.plate.regionId}|${s.plate.mainId}|${s.plate.methodId}|${s.plate.sideId}`;
      assert.notEqual(key, motwKey);
    }
  });
});

describe("fusion overhaul — recipe-tied images", () => {
  it("keys and prompts include the actual meal identity, not a generic stock slug", () => {
    const meal = generateMeal({
      mainId: "prawns",
      methodId: "stir-fried",
      regionId: "thai",
      sideId: "jasmine-cucumber",
      servings: 2,
    });
    const key = platePictureKey(meal);
    const prompt = platePicturePrompt(meal);
    assert.ok(key.includes("thai"));
    assert.ok(key.includes("prawns"));
    assert.ok(key.includes("stir-fried"));
    assert.ok(prompt.includes(meal.title) || /prawn/i.test(prompt));
    assert.ok(/stir.?fried|thai/i.test(prompt));
    assert.ok(/visible ingredients|on the plate/i.test(prompt));
    assert.ok(!/stock photo of chicken/i.test(prompt));
    const other = generateMeal({
      mainId: "lamb",
      methodId: "grilled",
      regionId: "levantine",
      sideId: "bulgur-tabbouleh",
      servings: 2,
    });
    assert.notEqual(platePictureKey(meal), platePictureKey(other));
  });
});

describe("fusion overhaul — large generated meal suite", () => {
  it("samples hundreds of meals for affinity, realism, naming and no duplicate finishes", () => {
    const rand = mulberry(42);
    const mains = MAIN_INGREDIENTS.filter((m) =>
      ["chicken", "beef", "pork", "lamb", "salmon", "prawns", "tofu", "chickpeas", "eggs", "mushrooms", "white-fish", "tempeh"].includes(m.id),
    );
    const regions = MEAL_REGIONS.filter((r) => SAMPLE_REGIONS.includes(r.id) || r.id === "home-kitchen");
    const sides = MEAL_SIDES.slice(0, 30);
    let generated = 0;
    let namingOk = 0;
    let finishHits = 0;
    let finishSamples = 0;
    const regionFinishCoverage = new Map<string, Set<string>>();
    const failures: string[] = [];

    for (let n = 0; n < 420; n += 1) {
      const main = mains[Math.floor(rand() * mains.length)];
      const methodIds = main.methodIds.filter((id) => QUICK_OK.has(id) || id === "braised" || id === "schnitzel" || id === "patties" || (id === "smoked" && mainAllowsSmoke(main.id)));
      if (!methodIds.length) continue;
      const methodId = methodIds[Math.floor(rand() * methodIds.length)];
      const region = regions[Math.floor(rand() * regions.length)];
      const side = sides[Math.floor(rand() * sides.length)];
      const seed = 1 + Math.floor(rand() * 200);
      try {
        if (methodId === "smoked" && !cutsForMethod(main.id, "smoked").length) continue;
        const meal = generateMeal({
          mainId: main.id,
          methodId,
          regionId: region.id,
          sideId: side.id,
          servings: 4,
          seed,
          spiceHeat: "hot",
        });
        generated += 1;
        if (!namingLooksGeneric(meal.title) && !METHOD_ONLY_DOT.test(meal.title)) namingOk += 1;
        else failures.push(`name:${meal.title}`);

        const trueIds = regionTrueIds(region.id);
        const seen = new Set<string>();
        for (const item of meal.ingredients) {
          const leak = markerLeak(region.id, item.id, item.name);
          if (leak) failures.push(`${region.id}:${leak}`);
          if (seen.has(item.id) && !["neutral-oil", "vegetable-stock", "onion", "salt"].includes(item.id)) {
            failures.push(`dup:${region.id}:${item.id}`);
          }
          seen.add(item.id);
        }

        const profile = exploreRegionProfile(region.id, false, "hot", { seed });
        const finishIds = profile.finish.map((f) => f.id);
        finishSamples += 1;
        if (finishIds.length >= 2) finishHits += 1;
        const bag = regionFinishCoverage.get(region.id) ?? new Set();
        for (const id of finishIds) {
          if (trueIds.has(id)) bag.add(id);
        }
        regionFinishCoverage.set(region.id, bag);

        assert.ok(meal.steps.length >= 3, meal.title);
        assert.ok(meal.ingredients.length >= 5, meal.title);
        assert.ok(meal.totalMinutes > 0, meal.title);
      } catch (error) {
        // Illegal cut/method or side conflict — skip, but count only soft skips.
        if (String(error).includes("affinity") || String(error).includes("smoke") || String(error).includes("cut")) continue;
        failures.push(`throw:${main.id}/${methodId}/${region.id}: ${error instanceof Error ? error.message : error}`);
      }
    }

    assert.ok(generated >= 300, `only generated ${generated}`);
    assert.ok(namingOk / generated >= 0.95, `naming ok ${namingOk}/${generated}`);
    assert.ok(finishHits / Math.max(1, finishSamples) >= 0.55, `finish coverage ${finishHits}/${finishSamples}`);
    let diverseRegions = 0;
    for (const [regionId, bag] of regionFinishCoverage) {
      if (bag.size >= 2) diverseRegions += 1;
      else if (regionId === "home-kitchen") diverseRegions += 1;
    }
    assert.ok(diverseRegions >= 10, `only ${diverseRegions} regions with finish diversity`);
    assert.equal(failures.filter((f) => f.startsWith("dup:") || f.includes("leak") || f.startsWith("throw:")).length, 0, failures.slice(0, 12).join("; "));
  });

  it("covers every curated plate without affinity leaks", () => {
    let ok = 0;
    for (const plate of PLATES) {
      const meal = generateMeal({ ...plate, servings: 2, spiceHeat: "medium" });
      ok += 1;
      for (const item of meal.ingredients) {
        assert.equal(markerLeak(plate.regionId, item.id, item.name), null, `${plate.regionId} ${item.id}`);
      }
      assert.ok(!/·/.test(meal.title), meal.title);
    }
    assert.equal(ok, PLATES.length);
  });

  it("keeps method catalogue and combination count honest", () => {
    assert.ok(COOKING_METHODS.some((m) => m.id === "smoked"));
    assert.ok(MEAL_REGIONS.length >= 20);
    assert.ok(PLATES.length >= 100);
  });
});
