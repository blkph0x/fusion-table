import assert from "node:assert/strict";
import { test } from "node:test";
import { MAIN_INGREDIENTS } from "../lib/meal-catalog.ts";
import { ingredientIdentityConflict, ingredientPreparationConflict, isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { applyShoppingOfferSelections, buildShoppingOffers, costShoppingQuantity, resolveIngredientPricing, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";
import { applyShoppingStrategy, DEFAULT_SHOPPING_STRATEGY } from "../lib/shopping-strategy.ts";
import { suggestAutomaticPrices, withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
import type { PriceQuote } from "../lib/catalogue.ts";

const now = new Date("2026-10-28T08:00:00Z");
const product = (name: string): CatalogueProduct => ({ name, priceCents: 1550, packageSize: "380 g", stockcode: name, inStock: true, available: true });
const line = (name: string) => ({ id: "protein", name, amount: 1800, unit: "g" });
function quote(name: string, offered: string): PriceQuote {
  return { query: name, source: "woolworths-online-catalogue", label: "Online guide", fetchedAt: now.toISOString(), cached: false, fulfilmentStoreId: null, searched: [name], error: null, matches: matchProducts(name,[product(offered)]) };
}
function retained(name: string, offered: string): ShoppingCostLine {
  const old: ShoppingOffer = { id: "old-species", productName: offered, retailerId: "woolworths", shopId: null, shopName: "Woolworths online", source: "woolworths-online-catalogue", scope: "chain-online", evidenceLabel: "Retained guide", priceCents: 1550, packageSize: "380 g", stock: "IN_STOCK", fetchedAt: now.toISOString(), freshness: "current", match: "matched", reviewable: true, reviewReason: null, eligible: true, cost: costShoppingQuantity(1800,"g",1550,"380 g"), url: null };
  return { ...line(name), offers: [old], chosenOfferId: old.id, estimatedCents: 7750, reason: null };
}

test("the observed duck-breast offer cannot price turkey through fresh, retained, manual or store-choice paths", () => {
  const wanted = "Turkey breast fillets", offered = "Luv-A-Duck Fresh Duck Breast Fillets";
  assert.equal(ingredientIdentityConflict(wanted,offered),true);
  assert.equal(ingredientPreparationConflict(wanted,offered),true);
  assert.deepEqual(matchProducts(wanted,[product(offered)]),[]);
  const fresh = withAutomaticPrices({ lines: buildShoppingOffers([line(wanted)],[quote(wanted,offered)],[],{area:"2527",now}) }).lines[0];
  assert.equal(fresh.chosenOfferId,null); assert.equal(fresh.estimatedCents,null);
  const old = retained(wanted,offered);
  const automatic = suggestAutomaticPrices([old])[0];
  assert.equal(automatic.chosenOfferId,null); assert.equal(automatic.offers[0].eligible,false); assert.equal(automatic.offers[0].reviewable,false);
  assert.equal(applyShoppingOfferSelections([old],{protein:"old-species"})[0].chosenOfferId,null);
  assert.equal(resolveIngredientPricing(line(wanted),old).purchaseSource,"planning-guide");
  for (const mode of ["cheapest","woolworths"] as const) {
    const result = applyShoppingStrategy([line(wanted)],[old],{...DEFAULT_SHOPPING_STRATEGY,mode},{shops:[],location:null,radiusKm:10,offerSelections:{protein:"old-species"}});
    assert.equal(result.rows[0].chosenOfferId,null); assert.equal(result.rows[0].estimatedCents,null);
  }
});

test("every pair of different authored main identities remains distinct", () => {
  const names = ["Chicken", "Turkey", "Beef", "Lamb", "Pork", "Salmon", "White fish", "Prawn", "Tofu", "Tempeh", "Halloumi", "Eggs", "Chickpeas", "Lentils", "Butter beans", "Mushrooms", "Eggplant", "Cauliflower", "Pumpkin", "Sweet potato", "Courgette", "Broccoli", "Duck", "Kangaroo", "Tuna", "Sardines", "Black beans", "Kidney beans", "Jackfruit", "Paneer"];
  assert.equal(names.length,MAIN_INGREDIENTS.length);
  for (const wanted of names) for (const offered of names) {
    assert.equal(ingredientIdentityConflict(wanted,offered),wanted !== offered,`${wanted} -> ${offered}`);
    if (wanted !== offered) assert.deepEqual(matchProducts(`${wanted} fillets`,[product(`${offered} fillets`)]),[],`${wanted} -> ${offered}`);
  }
});

test("named animal species cannot substitute for one another just because a cut word agrees", () => {
  const animals = ["Chicken", "Turkey", "Duck", "Beef", "Veal", "Lamb", "Pork", "Kangaroo", "Goat", "Venison", "Mutton", "Rabbit", "Quail", "Goose", "Salmon", "Tuna", "Sardines", "Trout", "Mackerel", "Prawns", "Crab", "Lobster", "Squid", "Octopus", "Scallops", "Mussels", "Oysters"];
  for (const wanted of animals) for (const offered of animals) if (wanted !== offered) {
    assert.equal(ingredientIdentityConflict(`${wanted} fillets`,`${offered} fillets`),true,`${wanted} -> ${offered}`);
    assert.deepEqual(matchProducts(`${wanted} fillets`,[product(`${offered} fillets`)]),[],`${wanted} -> ${offered}`);
  }
  assert.equal(ingredientIdentityConflict("Veal steaks","Beef steaks"),true,"age/species wording is not silently replaced");
});

test("generic white fish accepts its authored named species, while a named fish requires that species", () => {
  const aliases = MAIN_INGREDIENTS.find(main => main.id === "white-fish")!.ingredientAliases.filter(name => name !== "white fish");
  assert.ok(aliases.length >= 7);
  for (const fish of aliases) {
    assert.equal(ingredientIdentityConflict("White fish fillets",`${fish} fillets`),false,fish);
    assert.equal(matchProducts("White fish fillets",[product(`Fresh ${fish} Fillets`)])[0]?.selected,true,fish);
    assert.equal(matchProducts("Fish fillets",[product(`Fresh ${fish} Fillets`)])[0]?.selected,true,fish);
    assert.equal(ingredientIdentityConflict(`${fish} fillets`,"White fish fillets"),true,"generic title does not establish a requested named species");
    for (const other of aliases) if (other !== fish) assert.equal(ingredientIdentityConflict(`${fish} fillets`,`${other} fillets`),true,`${fish} -> ${other}`);
  }
  for (const wrong of ["Salmon","Tuna","Prawns","Squid","Tofu","Chicken"]) assert.equal(ingredientIdentityConflict("White fish fillets",`${wrong} fillets`),true,wrong);
  assert.equal(ingredientIdentityConflict("Fish fillets","Salmon fillets"),false);
  assert.equal(ingredientIdentityConflict("Fish fillets","Prawn fillets"),true);
});

test("actual aliases preserve identity without making veal beef or a different bean interchangeable", () => {
  for (const [wanted,offered] of [
    ["Prawns","Shrimp"], ["Tofu","Bean curd"], ["Halloumi","Haloumi"], ["Chickpeas","Garbanzo beans"],
    ["Butter beans","Lima beans"], ["Squid","Calamari"], ["Courgette","Zucchini"], ["Eggplant","Aubergine"],
  ]) {
    assert.equal(ingredientIdentityConflict(wanted,offered),false,`${wanted} -> ${offered}`);
    assert.equal(matchProducts(wanted,[product(offered)])[0]?.selected,true,`${wanted} -> ${offered}`);
  }
  assert.equal(ingredientIdentityConflict("Butter beans","Black beans"),true);
  assert.equal(ingredientIdentityConflict("Black beans","Red kidney beans"),true);
});

test("oyster blade, oyster mushrooms, dairy animals and real brand names do not manufacture seafood or meat species", () => {
  for (const [wanted,offered] of [
    ["Beef oyster blade","Flat Iron Steak"], ["Beef sirloin","Porterhouse Steak"], ["Beef scotch fillet","Cube Roll"],
    ["Oyster mushrooms","Fresh Oyster Mushrooms"], ["Halloumi","Goat Milk Halloumi"],
    ["Feta cheese","Sheep And Goat Milk Feta Cheese"], ["Goat milk","Goat Milk"],
    ["Chicken breast fillets","Luv-A-Duck Fresh Chicken Breast Fillets"], ["Duck breast fillets","Luv-A-Duck Fresh Duck Breast Fillets"],
  ]) {
    assert.equal(ingredientPreparationConflict(wanted,offered),false,`${wanted} -> ${offered}`);
    assert.equal(matchProducts(wanted,[product(offered)])[0]?.selected,true,`${wanted} -> ${offered}`);
  }
  for (const [wanted,offered] of [["Oysters","Beef Oyster Blade"],["Oysters","Oyster Mushrooms"],["Goat meat","Goat Milk"],["Goat milk","Goat Meat"],["Chicken breast","Breast Fillets"],["Duck breast","Luv-A-Duck Breast Fillets"]]) assert.equal(ingredientIdentityConflict(wanted,offered),true,`${wanted} -> ${offered}`);
});

test("protein-flavoured stock, sauce or oil cannot price raw protein, while explicit same-form requests work", () => {
  for (const [wanted,offered] of [["Fish fillets","Fish Oil"],["Salmon","Salmon Oil"],["Chicken breast","Chicken Stock"],["Prawns","Prawn Paste"],["Oysters","Oyster Sauce"],["Beef mince","Beef Stock"]]) {
    assert.equal(ingredientPreparationConflict(wanted,offered),true,`${wanted} -> ${offered}`);
    assert.deepEqual(matchProducts(wanted,[product(offered)]),[],`${wanted} -> ${offered}`);
  }
  for (const [wanted,offered] of [["Chicken stock","Roasted Chicken Broth"],["Beef stock","Beef Bouillon"],["Fish sauce","Fish Sauce"],["Fish sauce","Squid Fish Sauce"],["Fish sauce","Squid Brand Fish Sauce"],["Fish oil","Fish Oil"],["Oyster sauce","Oyster Sauce"]]) {
    assert.equal(ingredientPreparationConflict(wanted,offered),false,`${wanted} -> ${offered}`);
    assert.equal(matchProducts(wanted,[product(offered)])[0]?.selected,true,`${wanted} -> ${offered}`);
  }
});

test("the observed taco holder and other explicit serving tools cannot price edible tortillas through any retained path", () => {
  const tools = [
    "JOYBUY Stainless Steel Taco Holders for Soft or Hard Tacos, Burritos and Tortillas (1 Pack)",
    "Tortilla Holder Stand", "Stainless Steel Taco Rack", "Silicone Serving Tray For Tacos", "Taco Holder Tray 6 Pack",
  ];
  for (const offered of tools) {
    assert.equal(isNonFoodCatalogueProduct(product(offered)),true,offered);
    assert.equal(ingredientIdentityConflict("Soft tortillas",offered),true,offered);
    assert.deepEqual(matchProducts("Soft tortillas",[product(offered)]),[],offered);
    const old = retained("Soft tortillas",offered);
    assert.equal(suggestAutomaticPrices([old])[0].chosenOfferId,null,offered);
    assert.equal(applyShoppingOfferSelections([old],{protein:"old-species"})[0].chosenOfferId,null,offered);
  }
  for (const name of ["Old El Paso Soft Tortillas 10 Pack", "Fresh Roast Vegetable Tray", "Chicken Tray Pack", "Taco Dinner Kit", "Whisk & Pin Coconut Cookies", "Aluminium Free Baking Powder"]) assert.equal(isNonFoodCatalogueProduct(product(name)),false,name);
  assert.equal(matchProducts("Soft tortillas",[product("Old El Paso Soft Tortillas 10 Pack")])[0]?.selected,true);
});

test("single fresh produce quantities cannot use the observed mixed, frozen or prepared vegetable packs", () => {
  const mixed = [
    "MARKET FARE Carrot, Sweet Corn & Broccoli Quicksteam Vegetables 3 Pack 450g",
    "MARKET FARE Peas, Carrots & Super Sweet Corn 1kg",
    "MARKET FARE Quicksteam Vegetables Carrot, Broccoli & Cauliflower 3 Pack 450g",
    "Birds Eye Country Harvest Carrot Cauliflower Beans & Broccoli",
    "Birds Eye Country Harvest Frozen Carrot, Cauliflower & Broccoli",
    "Birds Eye Country Harvest Peas Corn & Carrot",
    "Birds Eye Deli Roast Veggies Potato Pumpkin Onion Carrot",
    "Birds Eye Snap Frozen Carrot, Cauliflower & Broccoli",
    "Birds Eye Steam Fresh Baby Potatoes With Broccoli Carrots Peas & Herbs",
  ];
  for (const offered of mixed) {
    assert.equal(ingredientPreparationConflict("Carrot",offered),true,offered);
    assert.deepEqual(matchProducts("Carrot",[product(offered)]),[],offered);
    const old = retained("Carrot",offered);
    assert.equal(suggestAutomaticPrices([old])[0].chosenOfferId,null,offered);
    assert.equal(applyShoppingOfferSelections([old],{protein:"old-species"})[0].chosenOfferId,null,offered);
  }
  for (const [wanted,offered] of [
    ["Carrot","Macro Organic Carrots"], ["Potatoes","Fresh Roasting Potatoes"],
    ["Frozen carrots","Frozen Carrots"], ["Mixed frozen vegetables","Mixed Frozen Vegetables Carrot Broccoli Cauliflower"],
    ["Carrot and broccoli","Fresh Carrot And Broccoli"], ["Roasted carrots","Roasted Carrots"],
  ]) {
    assert.equal(ingredientPreparationConflict(wanted,offered),false,`${wanted} -> ${offered}`);
    assert.equal(matchProducts(wanted,[product(offered)])[0]?.selected,true,`${wanted} -> ${offered}`);
  }
});

test("generic chicken eggs, named bird eggs and plant substitutes have explicit identities", () => {
  assert.equal(matchProducts("Eggs",[product("Free Range Chicken Eggs")])[0]?.selected,true);
  assert.equal(ingredientIdentityConflict("Eggs","Duck Eggs"),true);
  assert.equal(ingredientIdentityConflict("Duck eggs","Quail Eggs"),true);
  assert.equal(ingredientIdentityConflict("Duck breast","Duck Eggs"),true);
  assert.equal(ingredientIdentityConflict("Eggs","Vegan Egg Substitute"),true);
  assert.equal(matchProducts("Duck eggs",[product("Fresh Duck Eggs")])[0]?.selected,true);
});

test("direct catalogue matching retains tiny herb pack prices without claiming fresh leaves or permitting review selection", () => {
  const dry = { ...product("MasterFoods Coriander Leaves"), packageSize:"3 g" };
  const [candidate] = matchProducts("Coriander leaves for the side",[dry]);
  assert.equal(candidate.priceCents,1550);
  assert.equal(candidate.selected,false); assert.equal(candidate.nameMatched,false);
  assert.equal(candidate.reviewable,false); assert.equal(candidate.nameReviewable,false);
  assert.match(candidate.reason,/does not establish fresh leaves/);
  assert.equal(matchProducts("Fresh coriander",[{...dry,name:"Fresh Coriander Microherbs"}])[0]?.selected,true);
  assert.equal(matchProducts("Dried coriander leaves",[{...dry,name:"Dried Coriander Leaves"}])[0]?.selected,true);
});
