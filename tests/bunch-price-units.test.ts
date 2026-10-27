import assert from "node:assert/strict";
import { test } from "node:test";
import type { PriceQuote } from "../lib/catalogue.ts";
import { itemKey } from "../lib/price-memory.ts";
import { matchProducts } from "../lib/product-match.ts";
import { buildShoppingOffers, consumedOfferCost, costShoppingQuantity, isShoppingOfferSelectable, resolveIngredientPricing } from "../lib/shopping-costs.ts";
import { withAutomaticPrices } from "../app/api/shopping-prices/automatic-offers.ts";
const now=new Date("2026-10-27T11:47:25Z");
const spring={id:"spring",name:"Spring onions",amount:1.5,unit:"",category:"produce" as const};
// Exact selling fields observed in the live ALDI/Woolworths spring-onion check.
const quote=(source:PriceQuote["source"],priceCents:number,packageSize:string):PriceQuote=>({query:spring.name,source,label:"Published online guide; branch stock is unconfirmed.",fetchedAt:now.toISOString(),cached:false,fulfilmentStoreId:null,searched:[spring.name],error:null,matches:matchProducts(spring.name,[{name:"Spring Onion Bunch",priceCents,packageSize,stockcode:"spring-bunch",inStock:source==="woolworths-online-catalogue"?true:null,available:source==="woolworths-online-catalogue"?true:null}])});
test("live each-labelled spring-onion bunches cannot price individual stalk recipe quantities",()=>{
 for(const observed of [quote("aldi-online-catalogue",269,"1 each"),quote("woolworths-online-catalogue",300,"each")]){
  for(const unit of ["","each","pieces"]){
   const line={...spring,unit},row=buildShoppingOffers([line],[observed],[],{area:"2042",now})[0],offer=row.offers[0];
   assert.equal(offer.packageSize,"1 bunch");assert.equal(offer.eligible,false);assert.equal(offer.cost.lineCents,null);assert.equal(isShoppingOfferSelectable(offer),false);assert.equal(consumedOfferCost(line,offer),null);assert.equal(row.estimatedCents,null);
   const response=withAutomaticPrices({lines:[row]});const pricing=resolveIngredientPricing(line,response.lines[0]);assert.equal(pricing.source,"planning-guide");assert.equal(pricing.purchaseSource,"planning-guide");assert.ok(pricing.recipeCents!>0);assert.notEqual(pricing.recipeCents,404);assert.notEqual(pricing.purchaseCents,538);
  }
 }
});
test("an explicit bunch quantity uses the actual bunch price while original offer identities stay stable",()=>{
 for(const observed of [quote("aldi-online-catalogue",269,"1 each"),quote("woolworths-online-catalogue",300,"each")]){
  const stalk=buildShoppingOffers([spring],[observed],[],{area:"2042",now})[0];
  for(const unit of ["bunch","bunches"]){
   const line={...spring,amount:1,unit},row=buildShoppingOffers([line],[observed],[],{area:"2042",now})[0],offer=row.offers[0];
   assert.equal(offer.id,stalk.offers[0].id);assert.equal(offer.packageSize,"1 bunch");assert.equal(offer.cost.lineCents,observed.matches[0].priceCents);assert.equal(offer.cost.packs,1);assert.equal(offer.cost.purchasedUnit,"bunch");assert.equal(row.estimatedCents,observed.matches[0].priceCents);assert.equal(consumedOfferCost(line,offer),observed.matches[0].priceCents);assert.equal(isShoppingOfferSelectable(offer),true);
  }
 }
});
test("old cached each-priced bunch offers cannot retain the incorrect observed food-used or purchase cost",()=>{
 const row=buildShoppingOffers([spring],[quote("aldi-online-catalogue",269,"1 each")],[],{area:"2042",now})[0];
 const legacy={...row.offers[0],packageSize:"1 each",eligible:true,reviewable:true,cost:costShoppingQuantity(1.5,"",269,"1 each")};
 assert.equal(legacy.cost.lineCents,538);assert.equal(isShoppingOfferSelectable(legacy),false);assert.equal(consumedOfferCost(spring,legacy),null);
 const pricing=resolveIngredientPricing(spring,{...row,offers:[legacy],chosenOfferId:legacy.id,estimatedCents:538});assert.equal(pricing.source,"planning-guide");assert.equal(pricing.purchaseSource,"planning-guide");assert.notEqual(pricing.purchaseCents,538);
});
test("recorded bunch names retain their unit and explicit metric or individual selling quantities remain unchanged",()=>{
 const record={id:"saved-bunch",at:now.toISOString(),shopName:"Local produce",shopId:"",area:"2042",itemKey:itemKey(spring.name),itemName:"Spring Onion Bunch",cents:250,packageSize:"each",kind:"recorded" as const,until:"",url:"",label:"Recorded guide"};
 const recorded=[{itemKey:itemKey(spring.name),itemName:spring.name,averageCents:null,averageCount:1,averageLabel:null,records:[record],specials:[]}];
 const row=buildShoppingOffers([spring],[],recorded,{area:"2042",now})[0];assert.equal(row.offers[0].id,"recorded:saved-bunch");assert.equal(row.offers[0].packageSize,"1 bunch");assert.equal(row.estimatedCents,null);
 const metric=quote("woolworths-online-catalogue",300,"200g"),byWeight={...spring,amount:100,unit:"g"};const weightRow=buildShoppingOffers([byWeight],[metric],[],{area:"2042",now})[0];assert.equal(weightRow.offers[0].packageSize,"200g");assert.equal(weightRow.estimatedCents,300);assert.equal(consumedOfferCost(byWeight,weightRow.offers[0]),150);
 const onions={...spring,name:"Brown onions"},ordinary={...quote("woolworths-online-catalogue",63,"each"),query:onions.name,matches:matchProducts(onions.name,[{name:"Brown Onion",priceCents:63,packageSize:"each",stockcode:"brown",inStock:true,available:true}])};const individual=buildShoppingOffers([onions],[ordinary],[],{area:"2042",now})[0];assert.equal(individual.offers[0].packageSize,"each");assert.equal(individual.estimatedCents,126);
});
