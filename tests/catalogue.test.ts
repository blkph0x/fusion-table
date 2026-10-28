import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogueSubtotalCents, cleanSearchQuery, lookupQuery, parseWoolworthsSearch, shopAsk } from "../lib/catalogue.ts";
import { cutsForMain, getCut } from "../lib/cuts.ts";
import { generateMeal } from "../lib/meals.ts";
import { audToCents, canonicalizeProductText, catalogueSearchPhrases, formatAudCents, isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";

const base = { mainId: "chicken", methodId: "schnitzel", regionId: "japanese", sideId: "rice-greens", servings: 4 };

const thigh: CatalogueProduct = { name: "Woolworths RSPCA Approved Chicken Thigh Fillet", priceCents: 1550, packageSize: "per 150g", stockcode: "77038", inStock: true, available: true };
const breast: CatalogueProduct = { name: "Chicken Breast Fillets", priceCents: 1200, packageSize: "per kg", stockcode: "1", inStock: true, available: true };
const wagyu: CatalogueProduct = { name: "Wagyu Beef Scotch Fillet", priceCents: 4500, packageSize: "per kg", stockcode: "2", inStock: true, available: true };
const ordinary: CatalogueProduct = { name: "Beef Scotch Fillet", priceCents: 2800, packageSize: "per kg", stockcode: "3", inStock: true, available: true };
const angus: CatalogueProduct = { name: "Angus Beef Rump Steak", priceCents: 3200, packageSize: "per kg", stockcode: "4", inStock: true, available: true };

it("the retained Woolworths deadline bounds even a non-cooperative HTTP request", async t => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let requestSignal: AbortSignal | undefined;
  const fetchImpl: typeof fetch = async (_url, init) => { requestSignal = init?.signal as AbortSignal; return new Promise<never>(() => {}); };
  const work = lookupQuery("deadline rice", fetchImpl);
  await new Promise(resolve => setImmediate(resolve)); assert.ok(requestSignal);
  t.mock.timers.tick(11_999); assert.equal(requestSignal.aborted, false);
  t.mock.timers.tick(1); const result = await work;
  assert.equal(requestSignal.aborted, true); assert.equal(result.matches.length, 0); assert.match(result.error || "", /took too long/);
});

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
  it("excludes actual lime-juice accessories and strong pet/tool listings from edible suggestions", () => {
    const stocked = (name: string): CatalogueProduct => ({ name, priceCents: 1250, packageSize: "each", stockcode: name, inStock: true, available: true });
    const junk = [
      "Aluminum Manual Lemon Lime Juicer",
      "Rogz X-Large Lime Juice Dog & Puppy Lead",
      "Lime Green Cordless Drill",
      "Chicken Wire Mesh 10m",
      "Salmon Kitten Wet Food",
      "Chicken Breast Dog Food",
      "Garlic Press Stainless Steel",
      "Lemon Scented Candle",
    ].map(stocked);
    assert.ok(junk.every(isNonFoodCatalogueProduct));
    const juice = stocked("Woolworths Lime Juice");
    const matches = matchProducts("Lime juice", [...junk, juice]);
    assert.deepEqual(matches.map((match) => match.name), [juice.name]);
    assert.equal(matches[0].selected, true);
    assert.deepEqual(matchProducts("Chicken breast", junk), []);
  });

  it("keeps food names that resemble pet or kitchen words and preserves ambiguous choices", () => {
    const stocked = (name: string): CatalogueProduct => ({ name, priceCents: 500, packageSize: "pack", stockcode: name, inStock: true, available: true });
    for (const name of ["Hot Dogs", "Butterfly Chicken", "Kettle Sea Salt Chips", "Baking Chocolate", "Whisk & Pin Coconut Cookies", "Kitchen King Basmati Rice", "Aluminium Free Baking Powder"]) {
      const product = stocked(name);
      assert.equal(isNonFoodCatalogueProduct(product), false, name);
      assert.ok(matchProducts(name, [product]).some((match) => match.name === name), name);
    }
    const ambiguous = matchProducts("Lime juice", [stocked("Brand One Lime Juice"), stocked("Brand Two Lime Juice")]);
    assert.equal(ambiguous.length, 2);
    assert.equal(ambiguous.some((match) => match.selected), false);
    assert.ok(ambiguous.every((match) => /Nothing was selected automatically/.test(match.reason)));
  });

  it("uses explicit retailer non-food categories without assuming food names certify a diet", () => {
    const product = { name: "Lime Juice", priceCents: 500, packageSize: "each", stockcode: "lime", inStock: true, available: true };
    assert.equal(matchProducts("Lime juice", [{ ...product, categories: ["Pet Supplies"] }]).length, 0);
    assert.equal(matchProducts("Lime juice", [{ ...product, categories: ["Food & Drinks", "Juices"] }]).length, 1);
  });

  it("does not automatically select an unlabelled product for an explicit dietary request", () => {
    const stocked = (name: string): CatalogueProduct => ({ name, priceCents: 500, packageSize: "pack", stockcode: name, inStock: true, available: true });
    for (const [query, name] of [
      ["Vegan Thai red curry paste", "Thai Red Curry Paste"],
      ["Gluten-free white sandwich sliced bread", "White Sandwich Sliced Bread"],
      ["Gluten-free bread", "Plain Bread"],
      ["Vegetarian chicken style meat free strips", "Chicken Style Meat Free Strips"],
    ]) {
      const matches = matchProducts(query, [stocked(name)]);
      assert.equal(matches.length, 1, query);
      assert.equal(matches[0].selected, false, query);
      assert.match(matches[0].reason, /Verify the packet; not selected automatically/, query);
    }
    // Explicit contradictions are different foods, not uncertain label claims.
    assert.deepEqual(matchProducts("Vegan Thai red curry paste", [stocked("Thai Red Curry Paste With Shrimp")]), []);
    assert.deepEqual(matchProducts("Dairy-free Greek style natural yoghurt", [stocked("Greek Style Natural Yoghurt")]), []);
    const labelled = matchProducts("Gluten-free bread", [stocked("Gluten Free Bread")]);
    assert.equal(labelled[0].selected, true);
    const notVegan = matchProducts("Vegan Thai red curry paste", [stocked("Not Vegan Thai Red Curry Paste")]);
    assert.equal(notVegan[0].selected, false);
  });

  it("accepts explicit product claim metadata but never infers it from a category", () => {
    const product: CatalogueProduct = { name: "Thai Red Curry Paste", priceCents: 500, packageSize: "jar", stockcode: "paste", inStock: true, available: true };
    assert.equal(matchProducts("Vegan Thai red curry paste", [{ ...product, dietaryClaims: ["Suitable for vegans"] }])[0].selected, true);
    assert.equal(matchProducts("Vegan Thai red curry paste", [{ ...product, categories: ["Vegan & Vegetarian"] }])[0].selected, false);
    assert.equal(matchProducts("Vegetarian Thai red curry paste", [{ ...product, dietaryClaims: ["Vegan"] }])[0].selected, true);
    const parsed = parseWoolworthsSearch({ Products: [{ Products: [{ Name: product.name, Price: 5, IsInStock: true, IsAvailable: true, DietaryClaims: ["Vegan"] }] }] });
    assert.equal(matchProducts("Vegan Thai red curry paste", parsed.products)[0].selected, true);
  });
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

  it("preserves explicit cooked-rice metadata even when the title omits its preparation", () => {
    const base = { Name: "Woolworths Family Size Jasmine Rice", PackageSize: "450g", Price: 2.75, IsInStock: true, IsAvailable: true };
    const rows = parseWoolworthsSearch({ Products: [{ Products: [
      { ...base, Stockcode: 528193, AdditionalAttributes: { sapsegmentname: "RICE - MICROWAVEABLE - PLAIN", ingredients: "Cooked Rice (98%) (Water, Jasmine Rice), Vegetable Oil, Stabiliser (471)", microwaveable: "False" } },
      { ...base, Stockcode: 2, AdditionalAttributes: { ingredients: "Cooked Jasmine Rice (98%), Vegetable Oil" } },
      { ...base, Stockcode: 3, AdditionalAttributes: { sapsegmentname: "RICE - MICROWAVABLE - PLAIN" } },
      { ...base, Name: "Dry Jasmine Rice", Stockcode: 4, AdditionalAttributes: { ingredients: "Jasmine Rice", sapsegmentname: "RICE - GRAINS", microwaveable: "True", usageinstructions: "Cook the dry rice in a microwave." } },
      { ...base, Stockcode: 5, AdditionalAttributes: null },
    ] }] }).products;
    assert.equal(rows[0].preparedForm, "cooked-rice");
    assert.equal(rows[1].preparedForm, "cooked-rice");
    assert.equal(rows[2].preparedForm, "cooked-rice");
    assert.equal(rows[3].preparedForm, undefined);
    assert.equal(rows[4].preparedForm, undefined);
    assert.equal(matchProducts("Jasmine rice", [rows[0]])[0].preparedForm, "cooked-rice");
  });

  it("filters non-food rows before the food result cap and reads bounded category labels", () => {
    const tools = Array.from({ length: 30 }, (_, index) => ({ Name: `Manual Lemon Lime Juicer ${index}`, Stockcode: `tool-${index}`, Price: 29.99 }));
    const parsed = parseWoolworthsSearch({ Products: [{ Products: [
      ...tools,
      { Name: "Rogz X-Large Lime Juice Dog & Puppy Lead", Stockcode: "pet", Price: 29.99 },
      { Name: "Lime Juice", Stockcode: "category-pet", Price: 12.5, Category: { Name: "Pet Accessories" } },
      { Name: "Woolworths Lime Juice", Stockcode: "food", Price: 2.5, IsInStock: true, IsAvailable: true, Categories: ["Food & Drinks", { Name: "Juices" }] },
      { Name: "Butterfly Chicken", Stockcode: "chicken", Price: 15, DepartmentName: "Meat & Poultry" },
    ] }] });
    assert.deepEqual(parsed.products.map((product) => product.stockcode), ["food", "chicken"]);
    assert.deepEqual(parsed.products[0].categories, ["Food & Drinks", "Juices"]);
    assert.equal(matchProducts("Lime juice", parsed.products)[0].priceCents, 250);
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

  it("does not follow a Woolworths redirect onto another port or with credentials", async () => {
    const oddPort = await lookupQuery("plain flour", async () => new Response("", {
      status: 302,
      headers: { location: "https://www.woolworths.com.au:8443/apis/ui/Search/products" },
    }));
    assert.match(oddPort.error ?? "", /somewhere else/);
    const creds = await lookupQuery("plain rice", async () => new Response("", {
      status: 302,
      headers: { location: "https://user:secret@www.woolworths.com.au/apis/ui/Search/products" },
    }));
    assert.match(creds.error ?? "", /somewhere else/);
  });

  it("matches chillies to chilli and does not treat eggplant as eggs", () => {
    const chilli = matchProducts("chilli", [{ name: "Fresh chillies", priceCents: 200, packageSize: "each", stockcode: "c", inStock: true, available: true }]);
    assert.equal(chilli.find((match) => match.selected)?.name, "Fresh chillies");
    const plant = matchProducts("eggplant", [{ name: "Free range eggs", priceCents: 500, packageSize: "12 pack", stockcode: "e", inStock: true, available: true }]);
    assert.equal(plant.some((match) => match.selected), false);
  });

  it("cancels a queued lookup before busy slots finish and removes it without consuming a slot", async () => {
    const finishes: (() => void)[] = [];
    let calls = 0;
    const fetchImpl: typeof fetch = async input => {
      calls += 1;
      const name = new URL(String(input)).searchParams.get("searchTerm")!;
      return new Promise<Response>(resolve => finishes.push(() => resolve(Response.json({ Products: [{ Products: [{ Name: name, Price: 3, PackageSize: "500g", Stockcode: name, IsInStock: true, IsAvailable: true }] }] }))));
    };
    const active = Array.from({ length: 8 }, (_, index) => lookupQuery(`Audit active lentils ${index}`, fetchImpl));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(calls, 8);
    const controller = new AbortController();
    // This also has an alternative coriander search, which must not start after cancellation.
    const queued = lookupQuery("Audit queued fresh cilantro", fetchImpl, controller.signal);
    await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const cancelled = await Promise.race([queued, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Cancelled Woolworths lookup remained queued")), 150); })]);
      assert.equal(cancelled.matches.length, 0);
      assert.match(cancelled.error ?? "", /too long/);
      assert.equal(calls, 8);
    } finally {
      if (timer) clearTimeout(timer);
      finishes.forEach(finish => finish());
      await Promise.all(active);
    }
    assert.equal(calls, 8);
    const recovered = await lookupQuery("Audit queue recovery lentils", async () => Response.json({ Products: [] }));
    assert.equal(recovered.error, null);
  });
});
