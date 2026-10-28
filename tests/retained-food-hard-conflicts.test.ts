import assert from "node:assert/strict";
import test from "node:test";
import { ingredientHardConflict, isNonFoodCatalogueProduct, matchProducts, type CatalogueProduct } from "../lib/product-match.ts";
import { applyShoppingOfferSelections, type ShoppingCostLine, type ShoppingOffer } from "../lib/shopping-costs.ts";
import { applyShoppingStrategy, DEFAULT_SHOPPING_STRATEGY } from "../lib/shopping-strategy.ts";
import { MAIN_INGREDIENTS } from "../lib/meal-catalog.ts";

// Public capture names that were reviewable, not automatically chosen. A user
// review may resolve brand ambiguity, but cannot turn another food into raw meat.
const conflicts = [
  ["Boneless skinless salmon fillets", "Woolworths Frozen Salmon Fillets Skin On"],
  ["Chicken livers", "FARMWOOD Chicken Dippers 1kg"],
  ["Chicken livers", "HEALTH & VITALITY Chicken Carbonara 300g"],
  ["Whole chicken", "SuckleBusters Clucker Dust Chicken BBQ Rub 14.25oz - Chicken Seasoning for Wings, Thighs, Drumsticks & Whole Birds"],
  ["Beef brisket", "Chief Nutrition Beef Brisket Cheeseburger Bar 40g"],
  ["Beef brisket", "HYDALE Original Beef Jerky 25g"],
  ["Lamb shanks", "Fast Fuel Air Fry Braised Lamb Shanks"],
  ["Lamb shanks", "MasterFoods Garlic & Herb Lamb Shanks Slow Cook Recipe Base"],
  ["Lamb shanks", "McCormick Slow Cooker Garlic & Herb Lamb Shanks Recipe Base"],
  ["Lamb shanks", "JULIUS GOLD Dog Meaty Bites Lamb 1kg"],
  ["Pork shoulder", "Primo Roast Pork"],
  ["Pork shoulder", "URBAN EATS Pork Dumplings 750g"],
  ["Raw peeled, deveined prawns", "Woolworths Cocktail Prawns Peeled & Deveined"],
  ["Plain firm tofu", "Macro Honey Soy Tofu"],
  ["Tofu", "Macro Honey Soy Tofu"],
  ["Kangaroo steaks", "K-Roo Kangaroo Burger"],
  ["Kangaroo steaks", "CACHET Premium Kangaroo Chunks for Cats 5 Single Serves 450g"],
  ["Fresh sardines, gutted and scaled", "Deep Cove Sardines In Springwater"],
  ["Fresh sardines, gutted and scaled", "Safcol Sardines In Springwater"],
  ["Paneer", "MTR Minute Meals Palak Paneer"],
] as const;
const product = (name:string):CatalogueProduct => ({ name, priceCents: 500, packageSize: "500g", inStock: true, available: true, stockcode: name });
function retained(name:string, productName:string):ShoppingCostLine {
  const offer:ShoppingOffer = { id: "review", productName, retailerId: "woolworths", shopId: null, shopName: "Woolworths online", source: "woolworths-online-catalogue", scope: "chain-online", evidenceLabel: "Test retained review candidate", priceCents: 500, packageSize: "500g", stock: "IN_STOCK", fetchedAt: "2026-10-28T08:00:00Z", freshness: "current", match: "review", reviewable: true, reviewReason: null, eligible: false, cost: { lineCents: 500, packs: 1, purchasedAmount: 500, purchasedUnit: "g", reason: null }, url: null };
  return { id: "item", name, amount: 500, unit: "g", offers: [offer], chosenOfferId: null, estimatedCents: null, reason: null };
}

test("all captured hard food mismatches fail fresh, explicit retained and explicit store-strategy selection", () => {
  for (const [name, productName] of conflicts) {
    assert.equal(ingredientHardConflict(name,productName), true, `${name} -> ${productName}`);
    assert.deepEqual(matchProducts(name,[product(productName)]), [], productName);
    const row = retained(name,productName);
    const selected = applyShoppingOfferSelections([row],{ item: "review" })[0];
    assert.equal(selected.chosenOfferId,null,productName); assert.equal(selected.estimatedCents,null,productName);
    const strategy = applyShoppingStrategy([row],[row],DEFAULT_SHOPPING_STRATEGY,{ shops: [], location: null, radiusKm: 10, offerSelections: { item: "review" } }).rows[0];
    assert.equal(strategy.chosenOfferId,null,productName); assert.deepEqual(strategy.allowedOfferIds,[],productName);
  }
});

test("premium/brand review is preserved while explicit cut, bone and skin contradictions are hard conflicts", () => {
  const premium = retained("Beef rump steaks","Wagyu Beef Rump Steak");
  assert.equal(ingredientHardConflict(premium.name,premium.offers[0].productName),false);
  assert.equal(applyShoppingOfferSelections([premium],{ item: "review" })[0].chosenOfferId,"review");
  for (const [name, other] of [["Chicken livers","Fresh Chicken Breast"],["Beef rump steak","Beef Shin"],["Boneless chicken thighs","Bone In Chicken Thighs"],["Skinless salmon fillets","Salmon Fillets Skin On"]]) assert.equal(ingredientHardConflict(name,other),true,other);
  for (const name of ["Luv-A-Duck Fresh Duck Breast Fillets","FARMWOOD Fresh Chicken Livers","Cherry Valley Fresh Duck Breast"]) assert.equal(ingredientHardConflict(name,name),false,name);
  assert.equal(isNonFoodCatalogueProduct({name:"Black Cat Peanut Butter"}),false);
});

test("requested prepared foods, raw cocktail prawns and plain soy tofu retain their explicit forms", () => {
  for (const [query, name] of [
    ["Raw peeled prawns","Raw Cocktail Prawns Peeled"], ["Cooked cocktail prawns","Cooked Cocktail Prawns"],
    ["Plain firm tofu","Plain Firm Soy Tofu"], ["Honey soy tofu","Macro Honey Soy Tofu"],
    ["Palak paneer","MTR Minute Meals Palak Paneer"], ["Beef jerky","HYDALE Original Beef Jerky"],
    ["Pork dumplings","URBAN EATS Pork Dumplings"], ["Kangaroo burger","K-Roo Kangaroo Burger"],
    ["Sardines in springwater","Deep Cove Sardines In Springwater"],
  ]) assert.equal(ingredientHardConflict(query,name),false,`${query} -> ${name}`);
});

test("plain tofu tempeh paneer and halloumi reject unrequested named flavours but retain explicit ones", () => {
  for (const base of ["Tofu", "Plain firm tofu", "Tempeh", "Plain soy tempeh", "Paneer", "Halloumi", "Haloumi"]) {
    for (const flavour of ["Smoked", "Tandoori", "Chilli", "Teriyaki", "Satay", "Honey Soy"]) {
      const productName = `${flavour} ${base}`;
      assert.equal(ingredientHardConflict(base,productName),true,productName);
      assert.deepEqual(matchProducts(base,[product(productName)]),[],productName);
      assert.equal(ingredientHardConflict(productName,productName),false,productName);
      assert.ok(matchProducts(productName,[product(productName)]).some(row => row.selected),productName);
    }
  }
  assert.equal(ingredientHardConflict("Teriyaki tofu","Satay Tofu"),true);
  for (const [name, other] of [["Tempeh","Plain Soy Tempeh"],["Paneer","Fresh Paneer"],["Halloumi","Greek Style Halloumi"]]) assert.equal(ingredientHardConflict(name,other),false,other);
});

test("every authored main keeps explicit strong preparations across fresh and retained manual matches", () => {
  assert.equal(MAIN_INGREDIENTS.length,30);
  for (const main of MAIN_INGREDIENTS) for (const preparation of ["Marinated","Smoked","Pickled","Peking","Confit","Char Siu","Tandoori","Teriyaki","Satay","Honey Soy","Peri Peri","Korean BBQ"]) {
    const name = `${preparation} ${main.name}`;
    assert.equal(ingredientHardConflict(main.name,name),true,`${main.id}: ${name}`);
    assert.deepEqual(matchProducts(main.name,[product(name)]),[],name);
    const row = retained(main.name,name);
    assert.equal(applyShoppingOfferSelections([row],{ item: "review" })[0].chosenOfferId,null,name);
    assert.equal(ingredientHardConflict(name,name),false,name);
    assert.ok(matchProducts(name,[product(name)]).some(row => row.selected),name);
  }
  for (const [name, plain] of [["Chickpeas","Canned Chickpeas"],["Lentils","Cooked Lentils"],["Black beans","Canned Black Beans"],["Kidney beans","Cooked Kidney Beans"]]) assert.equal(ingredientHardConflict(name,plain),false,plain);
});
