import assert from "node:assert/strict";
import { test } from "node:test";
import { matchProducts, type CatalogueProduct } from "../lib/product-match.ts";

function item(name: string, extra: Partial<CatalogueProduct> = {}): CatalogueProduct {
  return { name, priceCents: 800, packageSize: "500g", stockcode: name, inStock: true, available: true, ...extra };
}

test("a raw chicken ingredient cannot select cooked, deli, crumbed, smoked or marinated products", () => {
  const prepared = ["Cooked Chicken Breast", "Smoked Chicken Breast", "Chicken Breast Schnitzel", "Crumbed Chicken Breast", "Marinated Chicken Breast", "Deli Chicken Breast", "Primo Chicken Breast Thinly Sliced", "Rotisserie Chicken Breast", "Chicken Breast Honey Soy", "Chargrilled Chicken Breast", "Grilled Chicken Breast", "Poached Chicken Breast", "Chicken Breast Nuggets"];
  assert.deepEqual(matchProducts("chicken breast", prepared.map(name => item(name))), []);
  const result = matchProducts("chicken breast", [...prepared.map(name => item(name)), item("Fresh Chicken Breast Fillets")]);
  assert.equal(result.length, 1); assert.equal(result[0].selected, true); assert.equal(result[0].nameMatched, true);
});

test("prepared seafood and meat stay separate from their raw ingredients", () => {
  assert.deepEqual(matchProducts("salmon fillet", [item("Smoked Salmon Fillet"), item("Tempura Salmon Fillet"), item("Cooked Salmon Fillet")]), []);
  assert.deepEqual(matchProducts("beef rump steak", [item("Marinated Beef Rump Steak"), item("Cooked Beef Rump Steak")]), []);
  assert.deepEqual(matchProducts("pork loin", [item("Cured Pork Loin"), item("Pork Loin Bacon")]), []);
  assert.deepEqual(matchProducts("prawns", [item("Cooked Prawns"), item("Battered Prawns")]), []);
});

test("an explicit prepared ingredient requires the corresponding form", () => {
  for (const [query, correct, wrong] of [
    ["smoked salmon", "Smoked Salmon", "Fresh Salmon"],
    ["cooked chicken breast", "Cooked Chicken Breast", "Fresh Chicken Breast"],
    ["crumbed chicken schnitzel", "Breaded Chicken Schnitzel", "Fresh Chicken Breast"],
    ["marinated chicken breast", "Marinated Chicken Breast", "Fresh Chicken Breast"],
    ["deli chicken breast", "Deli Cooked Chicken Breast", "Fresh Chicken Breast"],
    ["bacon", "Pork Bacon", "Fresh Pork Loin"],
  ]) {
    const matches = matchProducts(query, [item(correct), item(wrong)]);
    assert.equal(matches.length, 1, query); assert.equal(matches[0].name, correct); assert.equal(matches[0].selected, true, query);
  }
});

test("matching a preparation does not silently add a different marinade or cooked state", () => {
  assert.deepEqual(matchProducts("marinated chicken breast", [item("Cooked Marinated Chicken Breast")]), []);
  assert.deepEqual(matchProducts("smoked salmon", [item("Teriyaki Smoked Salmon")]), []);
  assert.deepEqual(matchProducts("cooked chicken breast", [item("Smoked Chicken Breast")]), []);
  const same = matchProducts("smoked chicken breast", [item("Cooked Smoked Chicken Breast")]);
  assert.equal(same[0].selected, true);
});

test("cut preparation such as frenched, diced, roasting, skin-on and bone-in stays usable", () => {
  for (const name of ["Frenched Lamb Cutlets", "Diced Beef", "Beef Topside Roast", "Chicken Breast Skin On", "Bone In Chicken Thighs"]) {
    const matches = matchProducts(name, [item(name)]);
    assert.equal(matches[0].selected, true, name);
  }
  assert.equal(matchProducts("whole chicken", [item("Fresh Roasting Whole Chicken")])[0].selected, true);
  assert.equal(matchProducts("chicken breast", [item("Fresh Chicken Breast Diced")])[0].selected, true);
});

test("known deli departments are not raw meat evidence and broad meat departments remain valid", () => {
  assert.deepEqual(matchProducts("chicken breast", [item("Chicken Breast", { categories: ["Deli Meats"] })]), []);
  assert.equal(matchProducts("chicken breast", [item("Chicken Breast", { categories: ["Meat, Seafood and Deli"] })])[0].selected, true);
});

test("unknown stock retains matching-name proof only for the correct preparation", () => {
  const result = matchProducts("chicken breast", [item("Smoked Chicken Breast", { inStock: null, available: null }), item("Fresh Chicken Breast", { inStock: null, available: null })]);
  assert.equal(result.length, 1); assert.equal(result[0].selected, false); assert.equal(result[0].stock, "UNKNOWN"); assert.equal(result[0].nameMatched, true);
});
