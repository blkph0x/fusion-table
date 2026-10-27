import assert from "node:assert/strict";
import { test } from "node:test";
import { fetchRecipePrices, observeRecipePrices, rememberRecipePrices, cachedRecipePrices, priceContextKey, type RecipePriceContext } from "../components/recipe-price-client.ts";
import { catalogueCounts } from "../components/catalogue-count.ts";
import { buildCompleteCataloguePlan } from "../scripts/audit-complete-catalogue.mjs";
import { summarizeShoppingCosts } from "../lib/shopping-costs.ts";
const context=(count=13):RecipePriceContext=>({area:"test-prices-area",country:"Australia",localRecords:true,shops:[{id:"local",name:"Local shop"}],lines:Array.from({length:count},(_,i)=>({id:`item-${i}`,name:`Ingredient ${i}`,amount:100+i,unit:"g"}))});
const response=(batch:RecipePriceContext["lines"], priced=true)=>new Response(JSON.stringify({lines:batch.map(line=>({...line,offers:[],chosenOfferId:null,estimatedCents:priced?315:null,reason:null})),checkedAt:"2026-10-27T01:00:00.000Z",warnings:[]}),{headers:{"Content-Type":"application/json"}});
test("automatic pricing bounds batches and parallelism, retains order and excludes unknown costs",async()=>{
 const input=context(), progress:number[]=[];let active=0,peak=0,calls=0;
 const result=await fetchRecipePrices(input,value=>progress.push(value.checked),async(_url,init)=>{
  const body=JSON.parse(init!.body as string);assert.ok(body.lines.length<=6);assert.equal(body.area,input.area);assert.equal(body.localRecords,true);
  calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;
  return response(body.lines,body.lines[0].id!=="item-6");
 });
 assert.equal(calls,3);assert.equal(peak,2);assert.equal(result.checked,13);
 assert.deepEqual(result.rows.map(row=>row.id),input.lines.map(line=>line.id));
 const summary=summarizeShoppingCosts(result.rows,input.lines.length);
 assert.equal(summary.pricedLines,7);assert.equal(summary.unpricedLines,6);assert.equal(summary.knownSubtotalCents,2205);assert.equal(summary.complete,false);
 assert.deepEqual(progress.slice().sort((a,b)=>a-b),progress);
});
test("one failed batch preserves other prices and never silently turns the failure into zero",async()=>{
 const input=context(8);
 const result=await fetchRecipePrices(input,()=>{},async(_url,init)=>{
  const body=JSON.parse(init!.body as string);
  return body.lines[0].id==="item-0"?new Response(JSON.stringify({error:"Provider unavailable"}),{status:503}):response(body.lines);
 });
 assert.equal(result.checked,8);assert.equal(result.rows.length,8);assert.equal(result.error,"Provider unavailable");
 assert.equal(summarizeShoppingCosts(result.rows,8).knownSubtotalCents,630);
 assert.ok(result.rows.slice(0,6).every(row=>row.estimatedCents===null));
});
test("stale or foreign response quantities cannot enter a new recipe estimate",async()=>{
 const input=context(2);
 const result=await fetchRecipePrices(input,()=>{},async()=>response([{...input.lines[0],amount:999}, {...input.lines[1],id:"other"}]));
 assert.ok(result.rows.every(row=>row.estimatedCents===null));assert.equal(summarizeShoppingCosts(result.rows,2).knownSubtotalCents,null);
 assert.notEqual(priceContextKey(input),priceContextKey({...input,lines:input.lines.map(line=>({...line,amount:line.amount*2}))}));
 assert.notEqual(priceContextKey(input),priceContextKey({...input,area:"another-suburb"}));
 assert.notEqual(priceContextKey(input),priceContextKey({...input,localRecords:false}));
});
test("shared visit cache keeps reviewed shop selections bound to exact list, servings and area",()=>{
 const input=context(1);input.area="reviewed-selection-area";
 const selected={rows:[{...input.lines[0],offers:[],chosenOfferId:"reviewed-product",estimatedCents:875,reason:null}],checked:1,total:1,checkedAt:"2026-10-27T01:00:00.000Z",warnings:[],error:""};
 rememberRecipePrices(input,selected);assert.equal(cachedRecipePrices(input)?.rows[0].chosenOfferId,"reviewed-product");
 assert.equal(cachedRecipePrices({...input,area:"other-area"}),null);
 assert.equal(cachedRecipePrices({...input,lines:[{...input.lines[0],amount:200}]}),null);
});
test("identical mounted views share one request and detached views cannot get late updates",async(t)=>{
 const input=context(1);input.area="singleflight-area";
 let release!:()=>void;const wait=new Promise<void>(resolve=>release=resolve);let calls=0,first=0,second=0;
 const done=new Promise<void>(resolve=>{
  t.mock.method(globalThis,"fetch",async(_url: RequestInfo | URL,init?: RequestInit)=>{calls++;await wait;return response(JSON.parse(init!.body as string).lines)});
  const detach=observeRecipePrices(input,()=>first++);
  observeRecipePrices(input,()=>{second++;resolve()});detach();release();
 });
 await done;await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(calls,1);assert.equal(first,0);assert.equal(second,1);assert.equal(cachedRecipePrices(input)?.checked,1);
});

test("a late automatic response cannot overwrite a reviewed choice or explicit exclusion in the same timestamp", async (t) => {
 t.mock.method(Date, "now", () => 1234567890);
 for (const choice of ["user-reviewed-product", null]) {
  const input = context(1); input.area = `manual-selection-race-${choice}`;
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  t.mock.method(globalThis, "fetch", async () => { await wait; return response(input.lines); });
  let detach = () => {};
  const delivered = new Promise<void>(resolve => { detach = observeRecipePrices(input, () => resolve()); });
  const selected = { rows: [{ ...input.lines[0], offers: [], chosenOfferId: choice, estimatedCents: choice ? 875 : null, reason: null }], checked: 1, total: 1, checkedAt: "2026-10-27T01:00:00.000Z", warnings: [], error: "" };
  rememberRecipePrices(input, selected);
  release(); await delivered; await new Promise(resolve => setTimeout(resolve, 0)); detach();
  assert.equal(cachedRecipePrices(input)?.rows[0].chosenOfferId, choice);
  assert.equal(cachedRecipePrices(input)?.rows[0].estimatedCents, choice ? 875 : null);
 }
});

test("malformed stored country values have an isolated unknown key instead of throwing or assuming Australia", () => {
 const input = context(1), invalid = { ...input, country: {} as unknown as string };
 assert.doesNotThrow(() => priceContextKey(invalid));
 assert.notEqual(priceContextKey(invalid), priceContextKey(input));
 assert.equal(JSON.parse(priceContextKey(invalid))[1], "unknown");
});
test("homepage counts match the complete dynamic authored plan without claiming seeds as unique meals",()=>{
 const counts=catalogueCounts(),plan=buildCompleteCataloguePlan();
 assert.equal(counts.authoredCombinations,plan.total);assert.equal(counts.authoredCombinations,20414810);
 assert.equal(counts.regions,76);assert.equal(counts.sides,90);assert.equal(counts.classicDishes,34);assert.equal(counts.diets,5);
});
