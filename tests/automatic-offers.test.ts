import assert from "node:assert/strict";
import { test } from "node:test";
import { plainProductFits, suggestAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
import { buildShoppingOffers, costShoppingQuantity, isShoppingOfferSelectable, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";
import { matchProducts } from "../lib/product-match.ts";
import type { PriceQuote } from "../lib/catalogue.ts";
const offer=(id:string,name:string,size:string,price=450):ShoppingOffer=>({id,productName:name,retailerId:"woolworths",shopId:null,shopName:"Woolworths online",source:"woolworths-online-catalogue",scope:"chain-online",evidenceLabel:"Online guide",priceCents:price,packageSize:size,stock:"IN_STOCK",fetchedAt:"2026-10-27T00:00:00Z",freshness:"current",match:"review",reviewable:true,reviewReason:"Brand tie",eligible:false,cost:costShoppingQuantity(200,"g",price,size),url:"https://www.woolworths.com.au/shop/productdetails/152608"});
const row=(name:string,offers:ShoppingOffer[],amount=200,unit="g"):ShoppingCostLine=>({id:"ingredient",name,amount,unit,offers,chosenOfferId:null,estimatedCents:null,reason:"Review"});
test("plain brand ties become transparent suggestions while changed food forms stay excluded",()=>{
 assert.equal(plainProductFits("Mushrooms","Woolworths Mushrooms Button Punnet"),true);
 for(const name of ["Dried mushrooms","Mushroom soup","Portobello mushroom","Mixed shiitake mushrooms","Mushrooms in garlic sauce"])assert.equal(plainProductFits("Mushrooms",name),false,name);
 assert.equal(plainProductFits("Cooking cream","Bulla Cooking Cream"),true);
 for(const name of ["Nestle Carnation Lite Cooking Cream","Coconut Cooking Cream","Lactose Free Cooking Cream"])assert.equal(plainProductFits("Cooking cream",name),false,name);
 assert.equal(plainProductFits("Rice vinegar","Rice wine vinegar"),true);
 assert.equal(plainProductFits("Rice vinegar","Seasoned sushi rice vinegar"),false);
 assert.equal(plainProductFits("Olive oil","Garlic infused olive oil"),false);
 assert.equal(plainProductFits("Chicken breast","Chicken breast nuggets"),false);
});
test("a weight increment cannot masquerade as the selling price basis for loose produce",()=>{
 const loose=offer("loose","Mushrooms Cups Loose","per 200g",1250),packet=offer("packet","Woolworths Mushrooms Button Punnet","200g",450);
 const result=suggestAutomaticPrices([row("Mushrooms",[loose,packet])])[0];
 assert.equal(result.chosenOfferId,"packet");assert.equal(result.estimatedCents,450);
 assert.equal(result.offers[0].reviewable,false);assert.equal(result.offers[0].cost.lineCents,null);
 assert.equal(suggestAutomaticPrices([row("Mushrooms",[loose])])[0].estimatedCents,null);
 const genuine=offer("rate","Mushrooms Cups Loose","per kg",1250);
 assert.equal(suggestAutomaticPrices([row("Mushrooms",[genuine])])[0].estimatedCents,250);
});
test("volume spoons convert only to volume, never to a guessed food density",()=>{
 const liquid=offer("vinegar","Rice Vinegar","150ml",400);liquid.cost=costShoppingQuantity(1,"tbsp",400,"150ml");
 const result=suggestAutomaticPrices([row("Rice vinegar",[liquid],1,"tbsp")])[0];
 assert.equal(result.estimatedCents,400);assert.equal(result.offers[0].cost.packs,1);
 const dry=offer("flakes","Chilli Flakes","20g",300);dry.cost=costShoppingQuantity(1,"tsp",300,"20g");
 assert.equal(suggestAutomaticPrices([row("Chilli flakes",[dry],1,"tsp")])[0].estimatedCents,null);
});
test("stale, unavailable, dietary-substitute and non-reviewable candidates cannot be auto-priced",()=>{
 for(const patch of [{freshness:"stale" as const},{stock:"OUT_OF_STOCK" as const},{reviewable:false}]){
  const candidate={...offer("packet","Woolworths Mushrooms Button Punnet","200g"),...patch};
  assert.equal(suggestAutomaticPrices([row("Mushrooms",[candidate])])[0].estimatedCents,null);
 }
 assert.equal(suggestAutomaticPrices([row("Gluten-free cooking cream",[offer("cream","Bulla Cooking Cream","300ml")],90,"ml")])[0].estimatedCents,null);
});

test("a previously chosen offer cannot retain automatic selection when stale or unavailable", () => {
 for (const patch of [{ freshness: "stale" as const }, { stock: "OUT_OF_STOCK" as const }, { stock: "UNKNOWN" as const }]) {
  const candidate = { ...offer("old", "Woolworths Mushrooms Button Punnet", "200g"), eligible: true, ...patch };
  const original = { ...row("Mushrooms", [candidate]), chosenOfferId: candidate.id, estimatedCents: 450 };
  assert.equal(suggestAutomaticPrices([original])[0].chosenOfferId, null);
 }
});

test("full catalogue pipeline cannot retain automatic eligibility for a rejected plain food form", () => {
 const now = new Date("2026-10-27T00:00:00Z");
 for (const [name, product] of [["Cooking cream", "Nestle Carnation Lite Cooking Cream"], ["Olive oil", "Woolworths Olive Oil Spray"], ["Toasted sesame oil", "Brand Toasted Sesame Oil Blend"]]) {
  const line = { id: "fixture", name, amount: 40, unit: "ml", category: "grocery" as const };
  const matches = matchProducts(name, [{ name: product, priceCents: 450, packageSize: "250ml", stockcode: "fixture", inStock: true, available: true }]);
  const quote: PriceQuote = { query: name, source: "woolworths-online-catalogue", label: "Online", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [name], error: null, matches };
  const before = buildShoppingOffers([line], [quote], [], { area: "2000", now });
  assert.equal(before[0].offers[0].eligible, true, `${product}: fixture must exercise pre-existing eligibility`);
  const after = suggestAutomaticPrices(before)[0];
  assert.equal(after.chosenOfferId, null, product); assert.equal(after.estimatedCents, null, product);
  assert.equal(isShoppingOfferSelectable(after.offers[0]), true, "a person can still explicitly review a food alternative");
 }
});

test("obvious non-food matches cannot be priced or manually substituted as ingredients", () => {
 const line = { id: "mushrooms", name: "Mushrooms", amount: 200, unit: "g", category: "produce" as const }, now = new Date("2026-10-27T00:00:00Z");
 const matches = matchProducts(line.name, [{ name: "Organic Mushroom Compost", categories: ["Garden"], priceCents: 1200, packageSize: "25kg", stockcode: "fixture", inStock: true, available: true }]);
 const quote: PriceQuote = { query: line.name, source: "woolworths-online-catalogue", label: "Online", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [line.name], error: null, matches };
 const after = suggestAutomaticPrices(buildShoppingOffers([line], [quote], [], { area: "2000", now }))[0];
 assert.equal(after.estimatedCents, null); assert.equal(after.offers[0].reviewable, false); assert.equal(isShoppingOfferSelectable(after.offers[0]), false);
 assert.equal(plainProductFits("Olive oil", "Olive Oil Body Oil"), false);
});

test("scoped plain rules retain other ingredient matches and exact Australian spoon volumes", () => {
 const chicken = { ...offer("chicken", "Chicken breast fillets", "500g"), eligible: true, match: "matched" as const };
 assert.equal(suggestAutomaticPrices([row("Chicken breast", [chicken])])[0].chosenOfferId, "chicken");
 const vinegar = offer("vinegar", "Rice Vinegar", "15ml", 400);
 vinegar.cost = costShoppingQuantity(1, "tbsp", 400, "15ml");
 assert.equal(suggestAutomaticPrices([row("Rice vinegar", [vinegar], 1, "tbsp")])[0].estimatedCents, 800, "one Australian tablespoon is20ml and needs two15ml packs");
 assert.equal(suggestAutomaticPrices([row("Rice vinegar", [vinegar], 1, "tsp")])[0].estimatedCents, 400, "one teaspoon is5ml");
});

test("brown-onion gravy cannot become fresh onion and reversed produce words stay equivalent", () => {
 for (const product of ["Woolworths Brown Onion Instant Gravy", "Brown Onion Chutney", "Brown Onion Marmalade", "Brown Onion Relish", "Brown Onion Dip"]) assert.equal(plainProductFits("Brown onion", product), false, product);
 assert.equal(plainProductFits("Brown onion", "Woolworths Onion Brown Bag"), true);
 const gravy = { ...offer("gravy", "Woolworths Brown Onion Instant Gravy", "120g", 210), eligible: true, match: "matched" as const };
 const result = suggestAutomaticPrices([row("Brown onion", [gravy], 180)])[0];
 assert.equal(result.estimatedCents, null); assert.equal(result.offers[0].eligible, false);
});

test("explicit plain-food rules resolve brand ties while prepared or alternative foods stay excluded", () => {
 for (const [wanted, good, bad] of [
  ["Chicken breast fillets", "Macro Free Range Chicken Breast Fillets", "Crumbed Chicken Breast Fillets"],
  ["Carrots", "Macro Organic Carrots", "Just Veg Carrot Shred"],
  ["Plain flour", "Macro Organic Plain Flour", "Lighthouse Bread & Pizza Plain Flour"],
  ["Soy sauce", "Fountain Soy Sauce", "Fountain Sweet Soy Sauce"],
 ]) { assert.equal(plainProductFits(wanted, good), true, good); assert.equal(plainProductFits(wanted, bad), false, bad); }
 for(const product of ["Chicken breast nuggets", "Marinated chicken breast fillets", "Chicken breast kebabs", "Chicken breast mince"]) assert.equal(plainProductFits("Chicken breast fillets", product), false, product);
 const sauce = offer("sauce-litre", "Fountain Soy Sauce", "1L", 600);
 sauce.cost = costShoppingQuantity(2, "tbsp", 600, "1L");
 const result = suggestAutomaticPrices([row("Soy sauce", [sauce], 2, "tbsp")])[0];
 assert.equal(result.estimatedCents, 600); assert.equal(result.offers[0].cost.packs, 1);
});
