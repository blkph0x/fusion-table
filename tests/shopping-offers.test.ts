import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeProviderStatuses, readProviderStatuses, shoppingOfferPreview, shoppingScopeLabel, shoppingVendorCards } from "../components/shopping-offers.ts";
import type { ShoppingCostLine, ShoppingOffer } from "../lib/shopping-costs.ts";

function offer(id: string, retailerId = "woolworths", changes: Partial<ShoppingOffer> = {}): ShoppingOffer {
  return {
    id, retailerId, shopId: null, shopName: `${retailerId} online`, productName: "Jasmine rice",
    scope: "chain-online", source: retailerId === "coles" ? "coles-online-catalogue" : "woolworths-online-catalogue",
    evidenceLabel: "Online catalogue; branch stock unconfirmed.", priceCents: 400, packageSize: "1 kg",
    stock: "IN_STOCK", fetchedAt: "2026-10-26T10:00:00Z", freshness: "current", match: "matched",
    eligible: true, reviewable: true, reviewReason: null, url: null,
    cost: { lineCents: 400, packs: 1, purchasedAmount: 1, purchasedUnit: "kg", reason: null }, ...changes,
  };
}
const priced = (cents: number) => ({ lineCents: cents, packs: 1, purchasedAmount: 1, purchasedUnit: "kg", reason: null });
const row = (offers: ShoppingOffer[], chosenOfferId: string | null = null): ShoppingCostLine => ({ id: "rice", name: "Jasmine rice", amount: 1, unit: "kg", offers, chosenOfferId, estimatedCents: null, reason: null });

test("six products from one retailer cannot hide the second retailer", () => {
  const products = [...Array.from({ length: 6 }, (_, index) => offer(`w${index}`, "woolworths", { cost: priced(600 - index * 10) })), ...Array.from({ length: 6 }, (_, index) => offer(`c${index}`, "coles", { cost: priced(500 - index * 10) }))];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["w5", "c5"]);
  assert.equal(products[0].id, "w0", "preview must not reorder the provider response");
});

test("only safe eligible choices are ranked by quantity cost", () => {
  const products = [offer("cheap-review", "coles", { eligible: false, match: "review", cost: priced(50) }), offer("safe", "coles", { cost: priced(500) }), offer("safe-cheaper", "coles", { cost: priced(450) }), offer("stale", "coles", { freshness: "stale", cost: priced(20) })];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["safe-cheaper"]);
});

test("unresolved brand choices show the first reviewable candidate without inferring cheapest food", () => {
  const products = [offer("microwave", "coles", { eligible: false, reviewable: false, match: "review", cost: priced(10) }), offer("first-review", "coles", { eligible: false, match: "review", cost: priced(500) }), offer("cheaper-review", "coles", { eligible: false, match: "review", cost: priced(200) })];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["first-review"]);
});

test("an explicit pack choice remains visible, including a seller outside the four-source preview", () => {
  const products = [offer("woolies"), offer("coles", "coles"), offer("aldi", "aldi"), offer("iga", "iga"), offer("local-1", "local"), offer("chosen-local-pack", "local", { cost: priced(700) })];
  assert.deepEqual(shoppingOfferPreview(products, "chosen-local-pack").map((product) => product.id), ["woolies", "coles", "aldi", "chosen-local-pack"]);
  assert.deepEqual(shoppingOfferPreview([offer("cheap"), offer("chosen", "woolworths", { cost: priced(800) })], "chosen").map((product) => product.id), ["chosen"]);
});

test("separate local shops and online catalogue scope remain distinct", () => {
  const products = [offer("online"), offer("branch-1", "woolworths", { scope: "shop-recorded", shopId: "osm/1", source: "recorded" }), offer("branch-2", "woolworths", { scope: "shop-recorded", shopId: "osm/2", source: "recorded" })];
  assert.deepEqual(shoppingOfferPreview(products, null).map((product) => product.id), ["online", "branch-1", "branch-2"]);
  assert.deepEqual(shoppingOfferPreview([], null), []);
});

test("a failed retailer remains visible with unknown cost beside available prices", () => {
  const cards = shoppingVendorCards([row([offer("available")])], ["Coles: Jasmine rice — public lookup unavailable"]);
  assert.deepEqual(cards.map((card) => [card.name, card.cents, card.pricedLines, card.status]), [["Woolworths online", 400, 1, ""], ["Coles online", null, 0, "Lookup unavailable"], ["IGA", null, 0, "No matched prices"], ["ALDI", null, 0, "No matched prices"]]);
  assert.equal(cards[1].url, "https://www.coles.com.au/");
  assert.equal(cards[0].linkLabel, "Check Woolworths");
});

test("review-only and unmatched retailer results stay unknown, never zero", () => {
  const cards = shoppingVendorCards([row([offer("needs-review", "coles", { eligible: false, match: "review" })])], []);
  assert.deepEqual(cards.map((card) => [card.cents, card.pricedLines, card.status]), [[null, 0, "No matched prices"], [null, 0, "Review products below"], [null, 0, "No matched prices"], [null, 0, "No matched prices"]]);
  assert.deepEqual(shoppingVendorCards([], []), []);
});

test("local recorded evidence stays separate from a failed chain guide", () => {
  const local = offer("local", "woolworths", { scope: "shop-recorded", shopId: "osm/1", shopName: "Woolworths Town Hall", source: "recorded", cost: priced(350) });
  const cards = shoppingVendorCards([row([local])], ["Woolworths prices could not be checked for this batch."]);
  assert.deepEqual(cards.map((card) => [card.name, card.cents, card.pricedLines, card.status]), [["Woolworths online", null, 0, "Lookup unavailable"], ["Coles online", null, 0, "No matched prices"], ["IGA", null, 0, "No matched prices"], ["ALDI", null, 0, "No matched prices"], ["Woolworths Town Hall", 350, 1, ""]]);
});

test("all four chains remain visible while checking and browser or store selection is actionable without a fake zero basket", () => {
  const statuses = readProviderStatuses([
    { id: "coles", name: "Coles", status: "needs-browser", message: "A browser check needs your visit.", url: "https://www.coles.com.au/search?q=rice" },
    { id: "iga", name: "IGA", status: "needs-store", message: "Choose the IGA you shop at.", url: "https://www.igashop.com.au/" },
  ]);
  const cards = shoppingVendorCards([], [], statuses, { includeEmpty: true, checking: true });
  assert.equal(cards.length, 4); assert.ok(cards.every(card => card.cents === null && card.pricedLines === 0));
  assert.equal(cards[0].status, "Checking prices");
  assert.equal(cards[1].status, "Open retailer to complete its check"); assert.equal(cards[1].url, statuses[0].url); assert.equal(cards[1].needsAction, true);
  assert.equal(cards[2].status, "Choose a store on the retailer"); assert.equal(cards[2].needsAction, true);
});

test("status parsing rejects script and credential links, bounds metadata, and merges a partially blocked source conservatively", () => {
  const statuses = readProviderStatuses([
    { id: "coles", name: "Coles", status: "ready", message: "One result." },
    { id: "bad<script>", name: "Bad", status: "ready", message: "bad" },
    { id: "iga", name: "IGA", status: "needs-store", message: "x".repeat(1000), url: "javascript:alert(1)" },
    { id: "aldi", name: "ALDI", status: "unavailable", message: "No prices", url: "https://user:secret@example.com/" },
    { id: "bad-state", name: "Bad", status: "complete", message: "Ignored" },
  ]);
  assert.equal(statuses.length, 3); assert.equal(statuses[1].message.length, 500); assert.equal(statuses[1].url, undefined); assert.equal(statuses[2].url, undefined);
  const blocked = readProviderStatuses([{ id: "coles", name: "Coles", status: "needs-browser", message: "Other items need a browser." }]);
  assert.equal(mergeProviderStatuses(blocked, statuses)[0].status, "needs-browser");
  const card = shoppingVendorCards([row([offer("coles-rice", "coles")])], [], mergeProviderStatuses(statuses, blocked))[1];
  assert.equal(card.cents, 400); assert.equal(card.needsAction, true); assert.equal(card.status, "Open retailer to complete its check");
});

test("a nearby published fresh-food seller is represented beside chain prices and remains distinct from recorded evidence", () => {
  const local = offer("butcher", "local", { source: "local-shop-website" as ShoppingOffer["source"], scope: "shop-online" as ShoppingOffer["scope"], shopId: "node/4", shopName: "Nearby butcher", url: "https://butcher.example/product" });
  const products = [offer("woolies"), offer("coles", "coles"), offer("iga", "iga"), offer("aldi", "aldi"), local];
  assert.ok(shoppingOfferPreview(products, null).some(product => product.id === "butcher"));
  assert.equal(shoppingScopeLabel(local.scope, local.source), "Published shop price");
  const cards = shoppingVendorCards([row([local])], [], readProviderStatuses([{ id: "local-node/4", name: "Nearby butcher", shopId: "node/4", status: "ready", message: "Published on this shop's site." }]));
  assert.equal(cards.filter(card => card.name === "Nearby butcher").length, 1);
  assert.equal(cards.find(card => card.name === "Nearby butcher")?.cents, 400);
});

test("cached unsafe species, serving tools, tiny herbs and mixed vegetable packs never enter vendor subtotals", () => {
  // These product identities were observed in the public fifty-recipe audit.
  const cases: { name: string; amount: number; unit: string; productName: string; packageSize: string; cents: number }[] = [
    { name: "Turkey breast fillets", amount: 1800, unit: "g", productName: "Luv-A-Duck Fresh Duck Breast Fillets", packageSize: "380 g", cents: 7750 },
    { name: "Soft tortillas", amount: 14, unit: "", productName: "JOYBUY Stainless Steel Taco Holders for Soft or Hard Tacos, Burritos and Tortillas (1 Pack)", packageSize: "each", cents: 43302 },
    { name: "Coriander leaves for the side", amount: 20, unit: "g", productName: "MasterFoods Coriander Leaves", packageSize: "3 g", cents: 1400 },
    { name: "Carrot", amount: 400, unit: "g", productName: "MARKET FARE Carrot, Sweet Corn & Broccoli Quicksteam Vegetables 3 Pack 450g", packageSize: "450 g", cents: 300 },
    { name: "Jasmine rice", amount: 500, unit: "g", productName: "Jasmine Rice Pouch", packageSize: "500 g", cents: 350 },
  ];
  for (const item of cases) for (const selected of [false,true]) {
    const cached = offer("unsafe", "woolworths", { productName: item.productName, packageSize: item.packageSize, cost: priced(item.cents) });
    const input = { ...row([cached],selected ? cached.id : null), name: item.name, amount: item.amount, unit: item.unit, estimatedCents: item.cents };
    const vendor = shoppingVendorCards([input],[]).find(card => card.id === "chain-online|woolworths")!;
    assert.equal(vendor.cents,null,`${item.name}, previously chosen=${selected}`);
    assert.equal(vendor.pricedLines,0,item.name);
    assert.equal(vendor.status,"No matched prices",item.name);
  }
});

test("vendor aggregation preserves valid reviewed products and exact branch separation beside a bad cached choice", () => {
  const bad = offer("wrong-species", "woolworths", { productName:"Luv-A-Duck Fresh Duck Breast Fillets", shopId:"branch-a", shopName:"Branch A", scope:"shop-recorded", source:"recorded", cost:priced(7750) });
  const good = offer("actual-turkey", "woolworths", { productName:"Fresh Turkey Breast Fillets", shopId:"branch-b", shopName:"Branch B", scope:"shop-recorded", source:"recorded", eligible:false, match:"review", cost:priced(800) });
  const input = { ...row([bad,good],good.id), name:"Turkey breast fillets", amount:1800, unit:"g" };
  const cards = shoppingVendorCards([input],[]);
  assert.equal(cards.find(card => card.id === "chain-online|woolworths")?.cents,null);
  assert.equal(cards.some(card => card.name === "Branch A"),false);
  const branch = cards.find(card => card.name === "Branch B")!;
  assert.equal(branch.scope,"shop-recorded"); assert.equal(branch.cents,800); assert.equal(branch.pricedLines,1);
});
