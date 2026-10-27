import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  buildBoard,
  communityAdjustments,
  plateIdentity,
  scaleIngredients,
  submitVote,
  submitWhy,
  type CommunityLedger,
} from "../lib/community.ts";
import { emptyLedger, ledgerFile, readLedger, withLedger, writeLedger } from "../lib/ledger.ts";
import { generateMeal } from "../lib/meals.ts";
import { generateRecipe } from "../lib/recipes.ts";
import { areaKey, itemKey, matchPagePrices, quoteItems, rememberPrice } from "../lib/price-memory.ts";
import { assertPublicShopUrl, isBlockedAddress, readShopPage } from "../lib/price-page.ts";

const now = "2026-10-23T00:00:00.000Z";
const device = (n: number) => `cook${String(n).padStart(12, "0")}`;

function book(): CommunityLedger {
  return { votes: [], whys: [], news: [] };
}

function plate(title = "Miso pasta") {
  return {
    id: "pasta-japanese-vegetarian-medium-2",
    title,
    classicId: "pasta",
    regionId: "japanese",
    diet: "vegetarian",
    spiceHeat: "medium",
    ingredients: [{ id: "salt", name: "Salt" }, { id: "miso", name: "Miso" }],
  };
}

describe("community learning", () => {
  it("keeps an unseeded meal byte-for-byte and only scales a copy", () => {
    const first = generateMeal({ mainId: "chicken", methodId: "schnitzel", regionId: "thai", sideId: "rice-greens", servings: 2 });
    const second = generateMeal({ mainId: "chicken", methodId: "schnitzel", regionId: "thai", sideId: "rice-greens", servings: 2 });
    assert.deepEqual(first, second);
    const classic = generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegetarian", servings: 2, spiceHeat: "medium" });
    assert.deepEqual(classic, generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegetarian", servings: 2, spiceHeat: "medium" }));
    const target = first.ingredients[0];
    const scaled = scaleIngredients(first.ingredients, [{ ingredientId: target.id, ingredientName: target.name, factor: 0.75, people: 2, direction: "less", because: "A try." }]);
    assert.notEqual(scaled[0].amount, target.amount);
    assert.equal(first.ingredients[0].amount, target.amount);
    assert.equal(scaled[0].amount > 0, true);
    assert.equal(first.sourceLabel, "Template-generated · not kitchen-tested");
  });

  it("requires the reason before saving each current low report and keeps the plate", () => {
    let ledger = book();
    const current = generateRecipe({ classicId: "pasta", regionId: "japanese", diet: "vegetarian", servings: 2 });
    const rejected = submitVote(ledger, { device: device(1), plate: current, experience: "cooked", stars: 1 }, now, "rejected");
    assert.ok(rejected.error);
    assert.equal(rejected.ledger.votes.length, 0);
    for (let n = 1; n <= 3; n++) {
      const saved = submitVote(ledger, { device: device(n), plate: current, experience: "cooked", stars: n === 3 ? 0 : 1,
        feedback: { categories: ["too-salty"] } }, now, `v${n}`);
      assert.equal(saved.error, undefined);
      ledger = saved.ledger;
    }
    const standing = buildBoard(ledger).plates[0];
    assert.equal(standing.lowPeople, 3);
    assert.equal(standing.askWhy, false);
    assert.equal(standing.shelved, false);
    assert.equal(ledger.votes.length, 3);
    assert.equal(ledger.whys.length, 3);
    assert.equal(standing.feedbackSummary?.reasonCounts[0].cookedDevices, 3);
  });

  it("stops offering a plate only after a large majority, and later votes can bring it back", () => {
    let ledger = book();
    for (let n = 1; n <= 4; n += 1) ledger = submitVote(ledger, { device: device(n), plate: plate(), again: "wont", want: "no", feedback: { categories: ["bland"] } }, now, `wont${n}`).ledger;
    assert.equal(buildBoard(ledger).plates[0].shelved, false);
    ledger = submitVote(ledger, { device: device(5), plate: plate(), again: "wont", want: "no", feedback: { categories: ["bland"] } }, now, "wont5").ledger;
    const shelved = buildBoard(ledger);
    assert.equal(shelved.plates[0].shelved, true);
    assert.equal(shelved.offers.length, 0);
    assert.equal(shelved.shelved.length, 1);
    assert.equal(ledger.votes.length, 5);
    for (let n = 6; n <= 9; n += 1) ledger = submitVote(ledger, { device: device(n), plate: plate(), again: "will", want: "yes", stars: 5 }, now, `will${n}`).ledger;
    const back = buildBoard(ledger);
    assert.equal(back.plates[0].shelved, false);
    assert.equal(back.offers.length, 1);
    assert.equal(ledger.votes.length, 9);
    assert.match(ledger.news.map((item) => item.kind).join(" "), /shelved/);
    assert.match(ledger.news.map((item) => item.kind).join(" "), /restored/);
  });

  it("keeps a later yes when the same person adds stars, and agrees an amount without removing it", () => {
    let ledger = book();
    ledger = submitVote(ledger, { device: device(1), plate: plate(), want: "yes" }, now, "yes").ledger;
    const stared = submitVote(ledger, { device: device(1), plate: plate(), stars: 5 }, now, "stars");
    ledger = stared.ledger;
    assert.equal(buildBoard(ledger).plates[0].yesPeople, 1);
    assert.equal(buildBoard(ledger).plates[0].starAverage, 5);
    assert.equal(ledger.votes.length, 2);
    const meal = plate();
    meal.ingredients = [{ id: "soy-sauce", name: "Soy sauce" }];
    for (let n = 1; n <= 2; n += 1) {
      ledger = submitWhy(ledger, {
        device: device(n), plate: meal, wrong: "The sauce was too salty.", change: "I would use less soy sauce.",
        ingredientId: "soy-sauce", ingredientName: "Soy sauce", direction: "less",
      }, now, `amt${n}`).ledger;
    }
    const adjustments = communityAdjustments(plateIdentity(meal), [{ id: "soy-sauce", name: "Soy sauce", amount: 2 }], buildBoard(ledger).plates);
    assert.equal(adjustments.length, 1);
    assert.equal(adjustments[0].factor, 0.75);
    const scaled = scaleIngredients([{ id: "soy-sauce", name: "Soy sauce", amount: 2 }], adjustments);
    assert.equal(scaled[0].amount, 1.5);
    const same = communityAdjustments(plateIdentity({ ...meal, classicId: "roast", title: "Other" }), [{ id: "soy-sauce", name: "Soy sauce", amount: 2 }], buildBoard(ledger).plates);
    assert.equal(same.length, 0);
  });

  it("writes the book to disk and refuses to wipe a file it cannot read", async () => {
    const dir = mkdtempSync(join(tmpdir(), "fusion-cook-"));
    const file = ledgerFile(dir);
    try {
      await withLedger(file, (ledger) => {
        const next = submitVote(ledger, { device: device(1), plate: plate(), want: "yes" }, now, "disk");
        const priced = rememberPrice(next.ledger, { shopName: "Corner butcher", area: "Albion Park 2527", itemName: "Lamb mince", price: "14.50" }, now, "price");
        return { ledger: priced.ledger, result: priced.price?.cents };
      });
      const stored = readLedger(file);
      assert.equal(stored.votes.length, 1);
      assert.equal(stored.prices[0].cents, 1450);
      assert.match(stored.prices[0].label, /You recorded this/);
      assert.equal(stored.prices[0].label.includes("VERIFIED"), false);
      assert.match(stored.prices[0].label, /Not a live catalogue/);
      writeLedger(emptyLedger(), file);
      const raw = readFileSync(file, "utf8");
      writeLedger(JSON.parse(raw), file);
      const broken = join(dir, "community-ledger.json");
      const { writeFileSync } = await import("node:fs");
      writeFileSync(broken, "{");
      assert.throws(() => readLedger(broken), /Nothing was deleted/);
      assert.equal(readFileSync(broken, "utf8"), "{");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("shop prices", () => {
  it("keeps recorded prices by area, leaves specials out of the average, and never stores a blank as zero", () => {
    let ledger = { prices: [], shopPages: [] };
    assert.equal(rememberPrice(ledger, { shopName: "Corner butcher", area: "2527", itemName: "Lamb mince", price: "" }, now, "a").error?.includes("$0"), true);
    ledger = rememberPrice(ledger, { shopName: "Corner butcher", area: "2527", itemName: "Lamb mince", price: "14.50" }, now, "a").ledger;
    ledger = rememberPrice(ledger, { shopName: "Corner butcher", area: "2527", itemName: "Lamb mince", price: "15.50" }, now, "b").ledger;
    ledger = rememberPrice(ledger, { shopName: "Corner butcher", area: "2527", itemName: "Lamb mince", price: "9.00", kind: "special", until: "2026-10-30" }, now, "c").ledger;
    ledger = rememberPrice(ledger, { shopName: "Other", area: "2500", itemName: "Lamb mince", price: "30" }, now, "d").ledger;
    const quote = quoteItems(ledger, "Albion Park NSW 2527", ["Lamb mince"], "2026-10-23")[0];
    assert.equal(areaKey("Albion Park NSW 2527"), "2527");
    assert.equal(quote.averageCents, 1500);
    assert.equal(quote.averageCount, 2);
    assert.match(quote.averageLabel || "", /Not a shelf price/);
    assert.equal(quote.specials.length, 1);
    assert.equal(quoteItems(ledger, "2527", ["No such item"], "2026-10-23")[0].averageCents, null);
    assert.equal(itemKey("Lamb mince"), "lamb mince");
  });

  it("reads one public price and refuses a private or unsigned page", async () => {
    const html = "<html><body><p>Lamb mince $14.50/kg</p><p>Was $18.00 special chicken breast $9.00</p><p>Lamb mince $11.00</p><p>Lamb mince $12.00</p></body></html>";
    const picks = matchPagePrices(html, ["lamb mince", "chicken breast", "wagyu"]);
    assert.equal(picks.find((pick) => pick.item === "lamb mince"), undefined);
    assert.equal(picks.find((pick) => pick.item === "chicken breast")?.cents, 900);
    assert.equal(picks.find((pick) => pick.item === "chicken breast")?.special, true);
    assert.equal(matchPagePrices("<p>Lamb mince $0.00</p>", ["lamb mince"]).length, 0);
    assert.throws(() => assertPublicShopUrl("http://butcher.example/specials"));
    assert.throws(() => assertPublicShopUrl("https://user:secret@butcher.example/specials"));
    assert.throws(() => assertPublicShopUrl("https://127.0.0.1/prices"));
    assert.throws(() => assertPublicShopUrl("https://10.1.1.111/prices"));
    assert.equal(isBlockedAddress("10.1.1.111"), true);
    assert.equal(isBlockedAddress("192.168.1.9"), true);
    assert.equal(isBlockedAddress("1.2.3.4"), false);
    const lookup = (async () => [{ address: "1.2.3.4", family: 4 }]) as unknown as typeof import("node:dns/promises").lookup;
    let fetched = false;
    const read = await readShopPage("https://butcher.example/specials", ["chicken breast"], {
      lookup,
      fetch: async () => {
        fetched = true;
        return new Response("<p>Chicken breast $12.00/kg</p>", { status: 200, headers: { "content-type": "text/html" } });
      },
    });
    assert.equal(fetched, true);
    assert.equal(read.picks[0].cents, 1200);
    assert.match(read.note, /not a shelf check/i);
    await assert.rejects(
      () => readShopPage("https://butcher.example/specials", ["chicken breast"], {
        lookup: (async () => [{ address: "10.1.1.111", family: 4 }]) as unknown as typeof lookup,
        fetch: async () => { throw new Error("must not fetch a private address"); },
      }),
      /not a public shop page/,
    );
  });
});
