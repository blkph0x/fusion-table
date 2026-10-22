import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogueSubtotalCents, cleanSearchQuery, lookupQuery, parseWoolworthsSearch, shopAsk } from "../lib/catalogue.ts";
import { cutsForMain, getCut } from "../lib/cuts.ts";
import { generateMeal } from "../lib/meals.ts";
import { audToCents, canonicalizeProductText, catalogueSearchPhrases, formatAudCents, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";

const base = { mainId: "chicken", methodId: "schnitzel", regionId: "japanese", sideId: "rice-greens", servings: 4 };

const thigh: CatalogueProduct = { name: "Woolworths RSPCA Approved Chicken Thigh Fillet", priceCents: 1550, packageSize: "per 150g", stockcode: "77038", inStock: true, available: true };
const breast: CatalogueProduct = { name: "Chicken Breast Fillets", priceCents: 1200, packageSize: "per kg", stockcode: "1", inStock: true, available: true };
const wagyu: CatalogueProduct = { name: "Wagyu Beef Scotch Fillet", priceCents: 4500, packageSize: "per kg", stockcode: "2", inStock: true, available: true };
const ordinary: CatalogueProduct = { name: "Beef Scotch Fillet", priceCents: 2800, packageSize: "per kg", stockcode: "3", inStock: true, available: true };
const angus: CatalogueProduct = { name: "Angus Beef Rump Steak", priceCents: 3200, packageSize: "per kg", stockcode: "4", inStock: true, available: true };

describe("cuts stay optional", () => {
  it("keeps the method cut when none is chosen", () => {
    const meal = generateMeal(base);
    assert.deepEqual(meal, generateMeal(base));
    assert.match(meal.ingredients[0].name, /breast/);
    assert.equal(meal.id.includes("chicken-breast"), false);
    assert.equal(meal.id.includes("chicken-thigh"), false);
    assert.equal(meal.dietaryNotes.some((note) => note.includes("marble")), false);
  });

  it("shops the chosen cut and leaves the dish title on the main", () => {
    const meal = generateMeal({ ...base, cutId: "chicken-thigh-fillet" });
    assert.equal(meal.ingredients[0].name, "Chicken thigh fillets");
    assert.match(meal.title, /chicken schnitzel/);
    assert.equal(/thigh/i.test(meal.title), false);
    assert.match(meal.id, /chicken-thigh-fillet$/);
    assert.match(meal.steps.map((step) => step.detail).join(" "), /chicken thigh fillets/);
    assert.ok(meal.dietaryNotes.some((note) => note.includes("marble")));
  });

  it("rejects an unknown cut and a cut for the wrong main", () => {
    assert.throws(() => generateMeal({ ...base, cutId: "wagyu-scotch" }), /recognised cut/);
    assert.throws(() => generateMeal({ ...base, cutId: "not-a-cut" }), /recognised cut/);
  });

  it("covers everyday cuts, Angus, wagyu and the less common ones", () => {
    const beef = cutsForMain("beef").map((cut) => cut.id);
    for (const id of ["beef-rump", "beef-scotch", "beef-eye-fillet", "beef-bolar", "beef-tbone", "beef-silverside", "angus-rump", "angus-scotch", "angus-eye", "angus-mince", "angus-brisket", "wagyu-rump", "wagyu-scotch", "wagyu-eye", "wagyu-mince", "wagyu-brisket", "wagyu-oyster", "beef-cheek", "beef-oxtail", "beef-skirt", "beef-hanger", "beef-tongue", "beef-brisket"]) {
      assert.ok(beef.includes(id), id);
    }
    const chicken = cutsForMain("chicken").map((cut) => cut.shoppingName);
    for (const name of ["Chicken breast fillets", "Chicken thigh fillets", "Chicken thigh cutlets", "Chicken drumsticks", "Chicken wings", "Chicken wingettes", "Chicken stir-fry strips", "Chicken marylands", "Whole chicken", "Chicken livers", "Chicken hearts", "Chicken frames", "Spatchcock chicken"]) {
      assert.ok(chicken.includes(name), name);
    }
    assert.ok(cutsForMain("lamb").some((cut) => cut.id === "lamb-shank"));
    assert.ok(cutsForMain("pork").some((cut) => cut.id === "pork-belly"));
    assert.equal(getCut("wagyu-scotch")?.breed, "wagyu");
    const grilled = generateMeal({ ...base, mainId: "beef", methodId: "grilled", cutId: "wagyu-scotch" });
    assert.equal(grilled.ingredients[0].name, "Wagyu beef scotch fillet");
    assert.match(grilled.dietaryNotes.join(" "), /Check the packet/);
  });
});

describe("smart catalogue matching", () => {
  it("picks thigh fillet and does not pick breast", () => {
    const matches = matchProducts("Chicken thigh fillets", [breast, thigh]);
    assert.equal(matches.find((match) => match.selected)?.name, thigh.name);
    assert.equal(matches.some((match) => /breast/i.test(match.name)), false);
  });

  it("keeps wagyu and Angus out of an ordinary pick, and does not swap in ordinary meat", () => {
    const ordinaryQuery = matchProducts("Beef scotch fillet", [wagyu, ordinary]);
    assert.equal(ordinaryQuery.find((match) => match.selected)?.name, ordinary.name);
    assert.equal(ordinaryQuery.find((match) => /wagyu/i.test(match.name))?.selected, false);
    const wagyuQuery = matchProducts("wagu scotch", [ordinary, wagyu]);
    assert.equal(wagyuQuery.find((match) => match.selected)?.name, wagyu.name);
    assert.equal(wagyuQuery.some((match) => match.name === ordinary.name), false);
    const angusQuery = matchProducts("Angus beef rump steaks", [ordinary, angus, wagyu]);
    assert.equal(angusQuery.find((match) => match.selected)?.name, angus.name);
    assert.equal(angusQuery.some((match) => /wagyu/i.test(match.name)), false);
  });

  it("does not select out of stock, unknown stock, or a missing price", () => {
    const out = matchProducts("Chicken thigh fillets", [{ ...thigh, inStock: false, available: false }]);
    assert.equal(out[0].selected, false);
    assert.match(out[0].reason, /Out of stock/);
    const unknown = matchProducts("Chicken thigh fillets", [{ ...thigh, inStock: null, available: null }]);
    assert.equal(unknown[0].selected, false);
    assert.match(unknown[0].reason, /did not say/);
    const missing = matchProducts("Chicken thigh fillets", [{ ...thigh, priceCents: null }]);
    assert.equal(missing[0].selected, false);
    assert.equal(missing[0].priceCents, null);
    assert.equal(formatAudCents(0), null);
    assert.equal(formatAudCents(null), null);
  });

  it("recognises a different name for the same food", () => {
    const stocked = (name: string): CatalogueProduct => ({ name, priceCents: 300, packageSize: "each", stockcode: name, inStock: true, available: true });
    assert.equal(matchProducts("fresh cilantro", [stocked("Fresh coriander")])[0].selected, true);
    assert.equal(matchProducts("aubergine", [stocked("Eggplant")])[0].selected, true);
    assert.equal(matchProducts("red pepper", [stocked("Red capsicum")])[0].selected, true);
    assert.equal(matchProducts("prawns", [stocked("Raw shrimp")])[0].selected, true);
    assert.equal(matchProducts("black pepper", [stocked("Red capsicum")]).length, 0);
    assert.match(canonicalizeProductText("ground beef"), /beef mince/);
    assert.equal(matchProducts("Beef eye fillet", [stocked("Beef tenderloin steak")])[0].selected, true);
    assert.equal(matchProducts("Beef sirloin", [stocked("Porterhouse steak")])[0].selected, true);
    assert.equal(matchProducts("Beef scotch fillet", [stocked("Cube roll")])[0].selected, true);
    assert.equal(matchProducts("Beef oyster blade", [stocked("Flat Iron Steak")])[0].selected, true);
    assert.equal(matchProducts("Beef oyster blade", [stocked("Beef bolar blade")]).some((match) => match.selected), false);
    assert.equal(matchProducts("Chicken wings", [stocked("Chicken wingettes")]).some((match) => match.selected), false);
    assert.equal(matchProducts("Chicken wingettes", [stocked("Chicken wing nibbles")])[0].selected, true);
    assert.equal(matchProducts("Pork fillet", [stocked("Pork tenderloin")])[0].selected, true);
    assert.equal(matchProducts("Beef sausages", [stocked("Beef sausage roll")]).length, 0);
    assert.equal(matchProducts("Chicken stir-fry strips", [stocked("Stir fry sauce")]).length, 0);
    assert.deepEqual(catalogueSearchPhrases("Beef oyster blade").slice(1), ["flat iron"]);
    assert.ok(catalogueSearchPhrases("fresh cilantro").some((phrase) => /coriander/i.test(phrase)));
  });

  it("rounds a positive catalogue price half up and never turns zero into money", () => {
    assert.equal(audToCents(15.5), 1550);
    assert.equal(audToCents("10.995"), 1100);
    assert.equal(audToCents("10.994"), 1099);
    assert.equal(audToCents(0), null);
    assert.equal(audToCents(-2), null);
    assert.equal(audToCents("free"), null);
  });
});

describe("woolworths catalogue payload", () => {
  const payload = {
    Products: [{ Products: [
      { Name: "Woolworths RSPCA Approved Chicken Thigh Fillet", DisplayName: "per 150g", Price: 15.5, InstorePrice: 15.5, IsInStock: true, IsAvailable: true, InstoreIsAvailable: true, PackageSize: "per 150g", Stockcode: 77038, FulfilmentStoreId: 1234 },
      { Name: "Chicken Breast Fillet", Price: 0, IsInStock: false, IsAvailable: false, Stockcode: 1 },
    ] }],
  };

  it("reads the public search shape and drops a zero price", () => {
    const parsed = parseWoolworthsSearch(payload);
    assert.equal(parsed.fulfilmentStoreId, "1234");
    assert.equal(parsed.products[0].priceCents, 1550);
    assert.equal(parsed.products[0].url, "https://www.woolworths.com.au/shop/productdetails/77038");
    assert.equal(parsed.products[1].priceCents, null);
    const matches = matchProducts("chicken thigh", parsed.products);
    assert.equal(matches.find((match) => match.selected)?.priceCents, 1550);
    assert.equal(matches.some((match) => /breast/i.test(match.name)), false);
  });

  it("does not hang a catalogue price on a butcher, and an empty selection is not $0", () => {
    const butcher = shopAsk({ id: "b", name: "Corner Butcher", kind: "butcher" });
    assert.equal(butcher.catalogueGuide, false);
    assert.match(butcher.note, /not this shop/);
    const fruit = shopAsk({ id: "f", name: "Local fruit shop", kind: "produce" });
    assert.match(fruit.note, /fruit-and-veg/);
    const wool = shopAsk({ id: "w", name: "Woolworths Kiama", kind: "supermarket" });
    assert.equal(wool.catalogueGuide, true);
    assert.match(wool.note, /not confirmed on the shelf/);
    assert.match(shopAsk({ id: "c", name: "Coles Wollongong", kind: "supermarket" }).note, /blocks/);
    assert.match(shopAsk({ id: "a", name: "ALDI Shellharbour", kind: "supermarket" }).note, /ALDI/);
    assert.equal(catalogueSubtotalCents([{ matches: [{ selected: false, priceCents: 1550 }] }]), null);
    assert.equal(catalogueSubtotalCents([{ matches: [{ selected: true, priceCents: 1550 }] }]), 1550);
  });

  it("reads a fixture response and refuses a redirect off Woolworths", async () => {
    const quote = await lookupQuery("chicken thigh", async () => Response.json(payload));
    assert.equal(quote.error, null);
    assert.equal(quote.matches.find((match) => match.selected)?.priceCents, 1550);
    assert.match(quote.label, /Not a confirmed price/);
    const leaked = await lookupQuery("lamb shank", async () => new Response("nope", { status: 302, headers: { location: "https://evil.example/steal" } }));
    assert.equal(leaked.matches.length, 0);
    assert.match(leaked.error ?? "", /somewhere else/);
    assert.throws(() => cleanSearchQuery(" "), /2 and 80/);
  });

  it("looks up the other shop name when the list wording is not what the catalogue uses", async () => {
    const quote = await lookupQuery("Beef oyster blade", async (input) => {
      const url = String(input);
      const name = /flat/i.test(url) ? "Flat Iron Steak" : "Unrelated apples";
      return Response.json({ Products: [{ Products: [{ Name: name, Price: 22.5, IsInStock: true, IsAvailable: true, Stockcode: name, PackageSize: "per kg" }] }] });
    });
    assert.equal(quote.error, null);
    assert.ok(quote.searched.some((phrase) => /flat iron/i.test(phrase)));
    assert.equal(quote.matches.find((match) => match.selected)?.name, "Flat Iron Steak");
    assert.equal(quote.matches.find((match) => match.selected)?.priceCents, 2250);
  });
});
