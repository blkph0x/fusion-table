import type { ShoppingCostLine, ShoppingOffer } from "../../../lib/shopping-costs.ts";
import { costShoppingQuantity, summarizeShoppingCosts } from "../../../lib/shopping-costs.ts";
import { estimateIngredientCost } from "../../../lib/ingredient-estimates.ts";
const clean = (value: string) => value.toLowerCase().replace(/[\u2019']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const prepared = /\b(?:powder|paste|sauce|gravy|bouillon|soup|juice|stock|seasoning|seasoned|cracker|chip|chips|snack|pickled|canned|tinned|frozen|cooked|fried|roasted|flavoured|flavored|marinated|marinade|brined|cured|truffle|kit|meal|dip|dressing|chutney|relish|marmalade|jam)\b/;
const nonFood = /\b(?:compost|soil|fertiliser|fertilizer|pesticide|fungicide|insecticide|inoculant|seedling|growing kit|grow kit|mushroom spawn|plant food)\b|\b(?:hair|body|face|facial|hand) (?:oil|cream|lotion|butter|treatment|shampoo|conditioner)\b/;
const plainNames = new Set(["brown onion", "brown onions", "fresh ginger", "cooking cream", "rice vinegar", "olive oil", "toasted sesame oil", "chilli flakes", "sesame seeds", "chicken breast", "chicken breast fillets", "carrot", "carrots", "plain flour", "soy sauce"]);
const hasPlainRule = (name: string) => /^(?:fresh )?mushrooms?$/.test(clean(name)) || plainNames.has(clean(name));
/** Narrow food-form rules resolve ordinary brand ties, never a dietary substitution. */
export function plainProductFits(name: string, product: string): boolean {
  const wanted = clean(name), seen = clean(product);
  if (nonFood.test(seen)) return false;
  if (/^(?:fresh )?mushrooms?$/.test(wanted)) return /\bmushrooms?\b/.test(seen) && !prepared.test(seen) && !/\b(?:portobello|shiitake|oyster|enoki|porcini|dried|mix|mixed)\b/.test(seen);
  if (wanted === "brown onion" || wanted === "brown onions") return /\bbrown\b/.test(seen) && /\bonions?\b/.test(seen) && !prepared.test(seen) && !/\b(?:red|white|shallot|peeled|dried|crisp)\b/.test(seen);
  if (wanted === "chicken breast" || wanted === "chicken breast fillets") return /\bchicken breast\b/.test(seen) && !prepared.test(seen) && !/\b(?:mince|diced|dice|strips|chunks|sliced|schnitzel|crumb|crumbed|breaded|battered|tempura|nuggets?|chipees?|munchies|munchie|kievs?|kyivs?|tender|tenders|kebab|kebabs|skin on|bone in|honey|teriyaki|garlic|herb|herbs|lemon|chilli|barbecue|bbq|stuffed|ready)\b/.test(seen);
  if (wanted === "carrot" || wanted === "carrots") return /\bcarrots?\b/.test(seen) && !prepared.test(seen) && !/\b(?:shred|shredded|sticks|baby|rainbow|mix|mixed|sliced|dried)\b/.test(seen);
  if (wanted === "plain flour") return /\bplain flour\b/.test(seen) && !/\b(?:self|raising|bread|pizza|wholemeal|gluten|free|rice|coconut|almond|chickpea|corn|oat|spelt|rye)\b/.test(seen);
  if (wanted === "soy sauce") return /\bsoy sauce\b/.test(seen) && !/\b(?:light|dark|reduced|less|salt|sodium|sweet|kecap|ketjap|tamari|gluten|free|garlic|ginger|chilli|teriyaki|dressing|marinade)\b/.test(seen);
  if (wanted === "fresh ginger") return /\bginger\b/.test(seen) && !prepared.test(seen) && !/\b(?:ground|dried|crystallised|crystalized|sugar|beer|ale)\b/.test(seen);
  if (wanted === "cooking cream") return /\bcooking cream\b/.test(seen) && !/\b(?:lite|light|low|reduced|free|coconut|soy|oat|almond|rice|plant|vegan|whipped|sweet|dessert|custard)\b/.test(seen);
  if (wanted === "rice vinegar") return /\brice(?: wine)? vinegar\b/.test(seen) && !/\b(?:seasoned|sushi|sugar|sweet|dressing|mirin)\b/.test(seen);
  if (wanted === "olive oil") return /\bolive oil\b/.test(seen) && !/\b(?:infused|garlic|chilli|lemon|spray|blend|flavoured|flavored)\b/.test(seen);
  if (wanted === "toasted sesame oil") return /\btoasted sesame oil\b/.test(seen) && !/\b(?:blend|chilli|spray|dressing)\b/.test(seen);
  if (wanted === "chilli flakes") return /\bchilli flakes\b/.test(seen) && !/\b(?:oil|sauce|paste|salt|seasoning|cracker|snack)\b/.test(seen);
  if (wanted === "sesame seeds") return /\bsesame seeds\b/.test(seen) && !/\b(?:black|mix|mixed|seasoning|snack|bar|oil|sauce|paste)\b/.test(seen);
  return false;
}
function uncertainRate(offer: ShoppingOffer): boolean {
  const selling = (offer.packageSize || "").toLowerCase().trim();
  // Loose catalogue rows can expose a weight increment in Size while Price is
  // per kg. Without retained price-basis metadata these are unverified rates.
  return offer.scope === "chain-online" && /^(?:per\s+|\/)\d/.test(selling) && !/^(?:per\s+|\/)(?:1\s*(?:kg|l)|1000\s*(?:g|ml))$/.test(selling);
}
function usableAvailability(offer: ShoppingOffer): boolean {
  return offer.stock === "IN_STOCK" || offer.stock === "UNKNOWN" && ["aldi-online-catalogue", "iga-online-catalogue", "local-shop-website"].includes(offer.source);
}
export function suggestAutomaticPrices(rows: readonly ShoppingCostLine[]): ShoppingCostLine[] {
  return rows.map(original => {
    const offers = original.offers.map(offer => {
      if (nonFood.test(clean(offer.productName))) return { ...offer, eligible: false, reviewable: false, cost: { lineCents: null, packs: null, purchasedAmount: null, purchasedUnit: null, reason: "This is a non-food product, so it is excluded from the recipe estimate." }, reviewReason: "A garden, growing or personal-care product cannot substitute for this cooking ingredient." };
      if (uncertainRate(offer)) return { ...offer, eligible: false, reviewable: false, cost: { lineCents: null, packs: null, purchasedAmount: null, purchasedUnit: null, reason: "Loose-product price basis needs verification; the weight increment is not assumed to be the selling unit." }, reviewReason: "Check the retailer's actual per-kg or per-item price before costing this loose product." };
      // Australian metric spoons are exact volume units, not ingredient densities.
      const volume = original.unit === "tbsp" ? original.amount * 20 : original.unit === "tsp" ? original.amount * 5 : null;
      const cost = volume !== null && /(?:ml|litre|liter|\d\s*l\b|\bl\b)/i.test(offer.packageSize || "") ? costShoppingQuantity(volume, "ml", offer.priceCents, offer.packageSize) : offer.cost;
      // The catalogue matcher can already mark a lone wording as eligible.
      // Apply the stricter form rule to those rows as well as brand ties.
      if (hasPlainRule(original.name) && !plainProductFits(original.name, offer.productName)) return { ...offer, cost, eligible: false, reviewReason: "This product differs from the requested plain ingredient or food form. Review it before choosing; it is excluded from the automatic estimate." };
      const suitable = plainProductFits(original.name, offer.productName) && offer.reviewable && offer.freshness === "current" && usableAvailability(offer) && cost.lineCents !== null && Number.isSafeInteger(cost.lineCents) && cost.lineCents > 0;
      return suitable ? { ...offer, cost, eligible: true, reviewReason: "Suggested plain product for this ingredient and food form. Review the brand, packet and dietary labels before buying." } : { ...offer, cost };
    });
    const previous = offers.find(offer => offer.id === original.chosenOfferId && offer.eligible && offer.freshness === "current" && usableAvailability(offer) && Number.isSafeInteger(offer.cost.lineCents) && offer.cost.lineCents! > 0);
    const suggested = previous || offers.filter(offer => offer.eligible && offer.freshness === "current" && usableAvailability(offer) && offer.cost.lineCents !== null).sort((a,b) => a.cost.lineCents! - b.cost.lineCents! || a.id.localeCompare(b.id))[0];
    return { ...original, offers, chosenOfferId: suggested?.id || null, estimatedCents: suggested?.cost.lineCents ?? null, reason: suggested?.match === "review" ? "Suggested product for costing; review the packet before buying." : suggested ? original.reason : "No verified quantity price yet. Review a product or record a local price." };
  });
}
export function withAutomaticPrices<T extends { lines: ShoppingCostLine[] }>(result: T) {
  const lines = suggestAutomaticPrices(result.lines).map(line => ({ ...line, planningEstimate: estimateIngredientCost(line) }));
  return { ...result, lines, summary: summarizeShoppingCosts(lines) };
}
