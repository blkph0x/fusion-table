import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { localImageEndpoint, renderPlate } from "../lib/plate-picture.ts";
import { fillEmptyPublicFile, readPublishedFile } from "../lib/published-file.ts";
import { publicPath } from "../lib/public-path.ts";
import { recipePdf } from "../lib/recipe-pdf.ts";
import { generateMeal } from "../lib/meals.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { decodeShare, encodeShare, recipeFromShare, specFromRecipe } from "../lib/share-recipe.ts";

describe("shared recipes, pictures and PDF", () => {
  it("rebuilds the same template from a link and rejects anything that is not a recipe", () => {
    const original = generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegetarian", servings: 2, spiceHeat: "medium" });
    const token = encodeShare(specFromRecipe(original));
    const again = recipeFromShare(decodeShare(token));
    assert.equal(again.title, original.title);
    assert.equal(again.id, original.id);
    assert.throws(() => decodeShare("not a token"));
    assert.throws(() => decodeShare(encodeShare({ v: 1, kind: "classic", classicId: "pasta", regionId: "no-such-place", diet: "balanced", spiceHeat: "mild", servings: 2 })));
    assert.equal(localImageEndpoint("http://evil.example/sdapi"), null);
    assert.equal(localImageEndpoint("http://user:secret@127.0.0.1:7860"), null);
    assert.equal(localImageEndpoint("http://127.0.0.1:7860/sdapi/v1/txt2img"), "http://127.0.0.1:7860/sdapi/v1/txt2img");
    assert.equal(publicPath("/favicon.svg"), "/favicon.svg");
    const meal = recipeFromShare(decodeShare(encodeShare({
      v: 1, kind: "meal", mainId: "chicken", methodId: "schnitzel", regionId: "thai", sideId: "rice-greens",
      diet: "balanced", spiceHeat: "hot", servings: 2, seed: 3, dislikes: ["chillies"],
    })));
    assert.equal(meal.kind, "meal");
    assert.equal(/chilli|chili|sriracha/i.test(meal.ingredients.map((item) => item.name).join(" ")), false);
    assert.equal(meal.id.endsWith("-sat-3"), true);
    assert.deepEqual(generateMeal({ mainId: "chicken", methodId: "schnitzel", regionId: "thai", sideId: "rice-greens", servings: 2, diet: "balanced", spiceHeat: "hot", seed: 3, dislikes: ["chillies"] }).id, meal.id);
  });

  it("serves exact inspiration images and an honest labelled placeholder for recipes without an image", async () => {
    const pasta = generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegetarian", servings: 4, spiceHeat: "medium" });
    const photo = await renderPlate(pasta, { model: false });
    const file = readFileSync(new URL("../public/images/fusion-table-hero-960.webp", import.meta.url));
    assert.equal(Buffer.compare(Buffer.from(photo.bytes), file), 0);
    assert.equal(photo.contentType, "image/webp");
    const tacos = await renderPlate(generateRecipe({ classicId: "tacos", regionId: "korean", diet: "vegan", servings: 2, spiceHeat: "hot" }), { model: false });
    assert.equal(tacos.contentType, "image/webp");
    assert.ok(tacos.bytes.byteLength < 300_000);
    const seeded = await renderPlate(generateRecipe({ classicId: "pasta", regionId: "thai", diet: "balanced", servings: 2, spiceHeat: "hot", seed: 7 }), { model: false });
    assert.equal(seeded.contentType, "image/svg+xml");
    assert.equal(seeded.placeholder, true);
    assert.match(new TextDecoder().decode(seeded.bytes), /Recipe image unavailable/);
    assert.notEqual(Buffer.compare(Buffer.from(seeded.bytes), file), 0);
    const again = await renderPlate(generateRecipe({ classicId: "pasta", regionId: "thai", diet: "balanced", servings: 2, spiceHeat: "hot", seed: 7 }), { model: false });
    assert.equal(Buffer.compare(Buffer.from(seeded.bytes), Buffer.from(again.bytes)), 0);
    const thai = generateMeal({ mainId: "chicken", methodId: "curry", regionId: "thai", sideId: "rice-greens", servings: 2, diet: "balanced", spiceHeat: "medium" });
    const greek = generateMeal({ mainId: "lamb", methodId: "grilled", regionId: "greek", sideId: "flatbread-salad", servings: 2, diet: "balanced", spiceHeat: "medium" });
    const meal = await renderPlate(thai, { model: false });
    const other = await renderPlate(greek, { model: false });
    const mealAgain = await renderPlate(thai, { model: false });
    assert.equal(meal.bytes[0] === 0x89 || meal.bytes[0] === 0xff, true);
    assert.notEqual(Buffer.compare(Buffer.from(meal.bytes), Buffer.from(other.bytes)), 0);
    assert.equal(Buffer.compare(Buffer.from(meal.bytes), Buffer.from(mealAgain.bytes)), 0);
    const saved = readFileSync(new URL("../public/images/meals/thai-chicken-curry.jpg", import.meta.url));
    assert.equal(Buffer.compare(Buffer.from(meal.bytes), saved), 0);
    const changedSide = await renderPlate(generateMeal({ mainId: "chicken", methodId: "curry", regionId: "thai", sideId: "flatbread-salad", servings: 2 }), { model: false });
    assert.equal(changedSide.contentType, "image/svg+xml", "a different side must not be represented by the wrong saved food image");
    assert.notEqual(Buffer.compare(Buffer.from(changedSide.bytes), saved), 0);
    const seededMeal = await renderPlate(generateMeal({ mainId: "chicken", methodId: "curry", regionId: "thai", sideId: "rice-greens", servings: 2, diet: "balanced", spiceHeat: "hot", seed: 4 }), { model: false });
    assert.equal(seededMeal.contentType, "image/svg+xml");
    assert.notEqual(Buffer.compare(Buffer.from(seededMeal.bytes), saved), 0);
    for (const classicId of ["shotgun-shells", "ribs-on-the-rack", "foil-boat-ribs", "burnt-ends", "smoked-meatloaf", "rotisserie-roast"]) {
      const plate = await renderPlate(generateRecipe({ classicId, regionId: "home-style", diet: "balanced", servings: 4, spiceHeat: "medium" }), { model: false });
      assert.equal(plate.contentType, "image/svg+xml", classicId);
      assert.equal(plate.placeholder, true, classicId);
      assert.match(plate.note, /placeholder does not depict the finished meal/, classicId);
    }
    const homeMeal = await renderPlate(generateMeal({ mainId: "chickpeas", methodId: "braised", regionId: "home-kitchen", sideId: "lentil-salad", servings: 2, diet: "vegan", spiceHeat: "medium" }), { model: false });
    assert.equal(homeMeal.contentType, "image/svg+xml");
    assert.match(homeMeal.note, /Recipe image unavailable/);
    const paced = generateRecipe({ classicId: "bbq-ribs", regionId: "texas-bbq", servings: 4, diet: "balanced", spiceHeat: "medium", cookPace: "morning", seed: 9 });
    const rebuilt = recipeFromShare(decodeShare(encodeShare(specFromRecipe(paced))));
    assert.equal(rebuilt.id, paced.id);
    assert.equal(rebuilt.cookPace, "morning");
    assert.deepEqual(rebuilt.steps, paced.steps);
  });

  it("fills an empty public-file signal from disk and refuses a path outside the site", async () => {
    const hero = await readPublishedFile("/images/fusion-table-hero.png");
    const file = readFileSync(new URL("../public/images/fusion-table-hero.png", import.meta.url));
    assert.equal(hero?.contentType, "image/png");
    assert.equal(Buffer.compare(hero?.bytes ?? Buffer.alloc(0), file), 0);
    assert.equal(await readPublishedFile("/favicon.svg") !== null, true);
    assert.equal(await readPublishedFile("/../package.json"), null);
    assert.equal(await readPublishedFile("/images/../../package.json"), null);
    const empty = new Response(null, { status: 200, headers: { "x-vinext-static-file": encodeURIComponent("/images/korean-tacos.png") } });
    const filled = await fillEmptyPublicFile(empty);
    const bytes = new Uint8Array(await filled.arrayBuffer());
    assert.equal(bytes[0], 0x89);
    assert.equal(filled.headers.get("content-type"), "image/png");
    assert.equal(filled.headers.get("x-vinext-static-file"), null);
    assert.equal(Number(filled.headers.get("content-length")), bytes.length);
    const kept = new Response(Uint8Array.from([1, 2, 3]), { status: 200, headers: { "content-type": "image/png", "content-length": "3", "x-vinext-static-file": "%2Ffavicon.svg" } });
    assert.equal(await fillEmptyPublicFile(kept), kept);
  });

  it("writes a PDF that names the dish and says it is not kitchen-tested", () => {
    const recipe = generateRecipe({ classicId: "roast", regionId: "moroccan", diet: "vegan", servings: 4, spiceHeat: "medium" });
    const pdf = Buffer.from(recipePdf(recipe)).toString("latin1");
    assert.equal(pdf.startsWith("%PDF-1.4"), true);
    assert.equal(pdf.includes(recipe.title.slice(0, 24)), true);
    assert.equal(pdf.includes("not kitchen-tested"), true);
    assert.equal(pdf.includes("%%EOF"), true);
  });
});
