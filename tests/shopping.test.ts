import test from "node:test";
import assert from "node:assert/strict";
import type { RecipeIngredient } from "../lib/recipe-types";
import type { Shop, ShopKind } from "../lib/locations";

const source = new URL("../lib/shopping.ts", import.meta.url).href;
const { ingredientMatchesShop, suggestedShops } = await import(source);

function ingredient(id: string, name: string, category: RecipeIngredient["category"], allergens: string[] = []): RecipeIngredient {
  return { id, name, category, allergens, amount: 1, unit: "g", inPantry: false };
}

function shop(id: string, kind: ShopKind, shopType?: string, distanceKm = 1): Shop {
  return { id, kind, shopType, name: id, lat: 0, lon: 0, distanceKm, address: null, website: null, phone: null, openingHours: null, osmUrl: `https://www.openstreetmap.org/node/${id}`, inventoryStatus: "unverified" };
}

test("miso is never matched to a bakery, cheese shop, spice shop, deli or generic specialty shop", () => {
  const miso = ingredient("miso", "White miso", "specialty", ["soy"]);
  for (const type of ["bakery", "cheese", "spices", "deli", undefined]) {
    assert.equal(ingredientMatchesShop(miso, shop("1", "specialty", type)), false, String(type));
  }
  assert.equal(ingredientMatchesShop(miso, shop("2", "supermarket", "supermarket")), true);
  assert.equal(ingredientMatchesShop(miso, shop("3", "grocery", "convenience")), false);
});

test("fresh produce, meat and seafood stay in their actual specialized shop families", () => {
  const carrots = ingredient("carrots", "Carrots", "produce");
  const chicken = ingredient("chicken-thigh", "Boneless chicken thighs", "butcher");
  const salmon = ingredient("salmon", "Salmon fillets", "fishmonger");
  assert.equal(ingredientMatchesShop(carrots, shop("1", "butcher", "butcher")), false);
  assert.equal(ingredientMatchesShop(carrots, shop("2", "produce", "greengrocer")), true);
  assert.equal(ingredientMatchesShop(chicken, shop("3", "fishmonger", "seafood")), false);
  assert.equal(ingredientMatchesShop(chicken, shop("4", "butcher", "butcher")), true);
  assert.equal(ingredientMatchesShop(salmon, shop("5", "fishmonger", "seafood")), true);
  assert.equal(ingredientMatchesShop(salmon, shop("6", "produce", "greengrocer")), false);
});

test("bakery recommendations are for actual bread products, never flour or condiments", () => {
  const bakery = shop("1", "specialty", "bakery");
  assert.equal(ingredientMatchesShop(ingredient("burger-buns", "Gluten-free burger buns", "grocery"), bakery), true);
  assert.equal(ingredientMatchesShop(ingredient("flatbreads", "Vegan flatbreads", "grocery"), bakery), true);
  assert.equal(ingredientMatchesShop(ingredient("bread-flour", "Bread flour", "grocery"), bakery), false);
  assert.equal(ingredientMatchesShop(ingredient("breadcrumbs", "Bread crumbs", "grocery"), bakery), false);
  assert.equal(ingredientMatchesShop(ingredient("rice-vinegar", "Rice vinegar", "grocery"), bakery), false);
  assert.equal(bakery.inventoryStatus, "unverified"); // Gluten-free suitability is not verified.
});

test("cheese shops require dairy cheese, not any dairy or a plant-based substitute", () => {
  const cheeseShop = shop("1", "specialty", "cheese");
  assert.equal(ingredientMatchesShop(ingredient("feta", "Feta cheese", "grocery", ["milk"]), cheeseShop), true);
  assert.equal(ingredientMatchesShop(ingredient("milk", "Milk", "grocery", ["milk"]), cheeseShop), false);
  assert.equal(ingredientMatchesShop(ingredient("vegan-cheese", "Vegan cheese", "grocery"), cheeseShop), false);
  assert.equal(ingredientMatchesShop(ingredient("cream", "Cooking cream", "grocery", ["milk"]), cheeseShop), false);
});

test("spice shops match dried spices and exclude fresh herbs, pastes and oils", () => {
  const spices = shop("1", "specialty", "spices");
  for (const item of [ingredient("cumin", "Ground cumin", "grocery"), ingredient("sumac", "Sumac", "specialty"), ingredient("ras-el-hanout", "Ras el hanout", "specialty")]) {
    assert.equal(ingredientMatchesShop(item, spices), true);
  }
  for (const item of [ingredient("ginger", "Fresh ginger", "produce"), ingredient("harissa", "Harissa paste", "specialty"), ingredient("sesame-oil", "Toasted sesame oil", "grocery"), ingredient("gochujang", "Gochujang", "specialty")]) {
    assert.equal(ingredientMatchesShop(item, spices), false);
  }
});

test("delicatessens only match narrow deli families; generic markets imply no stock", () => {
  const deli = shop("1", "specialty", "deli");
  assert.equal(ingredientMatchesShop(ingredient("olives", "Kalamata olives", "grocery"), deli), true);
  assert.equal(ingredientMatchesShop(ingredient("olive-oil", "Olive oil", "grocery"), deli), true);
  assert.equal(ingredientMatchesShop(ingredient("chicken-thigh", "Chicken thighs", "butcher"), deli), false);
  assert.equal(ingredientMatchesShop(ingredient("miso", "White miso", "specialty"), deli), false);
  const carrots = ingredient("carrots", "Carrots", "produce");
  assert.equal(ingredientMatchesShop(carrots, shop("2", "market")), false);
  assert.equal(ingredientMatchesShop(carrots, shop("3", "market", "greengrocer")), true);
});

test("specialized sources rank before supermarkets, then distance orders equivalent sources", () => {
  const carrots = ingredient("carrots", "Carrots", "produce");
  const shops = [shop("supermarket", "supermarket", "supermarket", 0.1), shop("far-produce", "produce", "greengrocer", 2), shop("near-produce", "produce", "greengrocer", 0.7), shop("butcher", "butcher", "butcher", 0.01)];
  const original = shops.map(item => item.id);
  assert.deepEqual(suggestedShops(carrots, shops).map((item: Shop) => item.id), ["near-produce", "far-produce", "supermarket"]);
  assert.deepEqual(shops.map(item => item.id), original);
});

test("original subtype overrides an inconsistent broad label and duplicate ids are removed", () => {
  const miso = ingredient("miso", "White miso", "specialty");
  assert.equal(ingredientMatchesShop(miso, shop("1", "supermarket", "bakery")), false);
  const market = shop("2", "supermarket", "supermarket");
  assert.equal(suggestedShops(miso, [market, market]).length, 1);
});
