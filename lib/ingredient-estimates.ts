import type { ShoppingLine } from "./shopping.ts";

/** An authored budgeting assumption, deliberately separate from observed shop prices. */
export interface IngredientPlanningEstimate {
  source: "planning-guide";
  currency: "AUD";
  version: string;
  profileId: string;
  confidence: "medium" | "low";
  observed: false;
  recipeCents: number;
  purchaseCents: number;
  pack: { amount: number; unit: string; priceCents: number; label: string };
  packs: number;
  neededAmount: number;
  neededUnit: string;
  assumptions: string[];
  label: string;
}

export const INGREDIENT_ESTIMATE_VERSION = "au-budget-assumptions-2026-10-27-v2";
export const INGREDIENT_ESTIMATE_LABEL = "Australian planning estimate; an authored budget allowance, not an observed retailer price or local quote.";
type Profile = { id: string; amount: number; unit: "g" | "ml" | "each" | "clove" | "stalk"; cents: number; tspGrams?: number; eachGrams?: number; low?: boolean; note?: string };
const p = (id: string, amount: number, unit: Profile["unit"], cents: number, rest: Partial<Profile> = {}): Profile => ({ id, amount, unit, cents, ...rest });
const fold = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/ı/g, "i").replace(/[^a-z0-9]+/g, " ").trim();
const rawUnit = (s: string) => fold(s).replace(/\.$/, "");
const isCount = (unit: string) => ["", "each", "ea", "piece", "pieces", "count", "unit", "units"].includes(unit);
const FRESH_PRODUCE_NAMES = new Set([
  "cucumber", "cucumbers", "snow peas", "snow pea", "snowpeas", "mange tout", "mangetout",
  "bean sprouts", "beansprouts", "mung bean sprouts", "cabbage", "red cabbage", "white cabbage", "napa cabbage", "wombok",
  "carrot", "carrots", "capsicum", "capsicums", "red capsicum", "green capsicum", "yellow capsicum", "red pepper", "green pepper",
  "onion", "onions", "brown onion", "brown onions", "red onion", "red onions", "spring onion", "spring onions", "shallots",
  "tomato", "tomatoes", "cherry tomatoes", "zucchini", "courgette", "aubergine", "eggplant", "broccoli", "cauliflower",
  "green beans", "potato", "potatoes", "sweet potato", "pumpkin", "butternut", "beetroot", "radish", "radishes", "okra",
  "lettuce", "cos lettuce", "iceberg lettuce", "salad leaves", "mixed salad leaves", "rocket", "spinach", "kale", "bok choy", "gai lan", "silverbeet", "chard",
  "mushrooms", "mushroom", "portobello mushrooms", "king oyster mushrooms", "garlic", "ginger", "galangal", "lemongrass",
  "coriander", "coriander leaves", "parsley", "flat leaf parsley", "basil", "thai basil", "mint", "dill", "tarragon", "fresh herbs",
]);
const PRESERVED_PRODUCE = /\b(?:powder|ground|dried|dehydrated|flour|sauce|paste|seasoning|pickles|pickled|chutney|relish|juice|fermented|cooked|canned|tinned|frozen|stock|smoothie|chips|crackers|roasted|fried)\b/;

function freshProduceName(name: string): boolean {
  const plain = name.replace(/\s+for the (?:side|rice|corn)$/, "").replace(/^(?:(?:fresh|peeled|large|baby|raw|whole|chopped|sliced|diced|shredded|grated|trimmed|washed)\s+)+/, "");
  return !PRESERVED_PRODUCE.test(name) && FRESH_PRODUCE_NAMES.has(plain);
}

function profile(line: ShoppingLine): Profile {
  const name = fold(line.name), count = isCount(rawUnit(line.unit));
  // Specific expensive foods precede broad spice/protein rules.
  if (/\bsaffron\b/.test(name)) return p("saffron", 0.5, "g", 650);
  if (/\bwhole turkey\b/.test(name) && count) return p("whole-turkey", 1, "each", 6500, { note: "Assumes one approximately 4 kg whole turkey." });
  if (/\b(?:whole|spatchcock) chicken\b/.test(name) && count) return p("whole-chicken", 1, "each", 1300, { note: "Assumes one approximately 1.8 kg whole bird; actual size and price vary." });
  if (/\b(?:chicken|turkey|beef|lamb|pork|duck|kangaroo|oxtail)\b/.test(name) && (line.category === "butcher" || /\b(?:fillet|steak|mince|sausage|brisket|shoulder|thigh|breast|belly|ribs|cheek|shank|trotter)\b/.test(name))) {
    let rate = 2200, id = "meat";
    if (/\bchicken\b/.test(name)) { id = "chicken"; rate = /\b(?:wing|wingettes|drumstick|drumsticks|whole|maryland|marylands|liver|livers|heart|hearts|gizzard|gizzards)\b/.test(name) ? 950 : /\b(?:thigh|thighs)\b/.test(name) ? 1700 : 1500; }
    else if (/\bturkey\b/.test(name)) { id = "turkey"; rate = 2200; }
    else if (/\b(?:beef|oxtail)\b/.test(name)) { id = "beef"; rate = /\b(?:eye fillet)\b/.test(name) ? 6500 : /\bscotch\b/.test(name) ? 5500 : /\b(?:sirloin|t bone)\b/.test(name) ? 4000 : /\b(?:rump|skirt|flank|hanger|tri tip)\b/.test(name) ? 3000 : /\b(?:mince|sausage|sausages|liver|tongue)\b/.test(name) ? 1500 : 2500; if (/\bwagyu\b/.test(name)) { rate = Math.round(rate * 1.7); id = "wagyu-beef"; } else if (/\bangus\b/.test(name)) rate = Math.round(rate * 1.15); }
    else if (/\blamb\b/.test(name)) { id = "lamb"; rate = /\b(?:cutlets|rack)\b/.test(name) ? 5000 : /\bbackstrap\b/.test(name) ? 4800 : /\bmince\b/.test(name) ? 1900 : 2800; }
    else if (/\bpork\b/.test(name)) { id = "pork"; rate = /\b(?:mince|sausage|sausages|trotters|hock)\b/.test(name) ? 1300 : 2100; }
    else if (/\bduck\b/.test(name)) { id = "duck"; rate = /\bbreast\b/.test(name) ? 4500 : 3200; }
    else if (/\bkangaroo\b/.test(name)) { id = "kangaroo"; rate = /\bmince\b/.test(name) ? 1600 : 2500; }
    return p(id, 500, "g", Math.round(rate / 2), { note: "Assumes a 500 g purchase increment; bone-in quantities include the bone already specified by the recipe." });
  }
  if (line.category === "fishmonger" || /\b(?:salmon|prawn|prawns|tuna|sardines|trout|octopus|white fish)\b/.test(name)) {
    const rate = /\bsmoked\b/.test(name) ? 6500 : /\boctopus\b/.test(name) ? 5000 : /\btuna\b/.test(name) ? 4800 : /\bsalmon\b/.test(name) ? 4000 : /\bprawns?\b/.test(name) ? 3500 : /\bsardines\b/.test(name) ? 1800 : 3000;
    return p("seafood", 250, "g", Math.round(rate / 4), { note: "Budget assumes 250 g purchase increments in the exact raw/cooked/peeled form requested; no raw-to-cooked conversion is made." });
  }
  if (/\b(?:jumbo pasta shells)\b/.test(name)) return p("jumbo-shells", 25, "each", /gluten free/.test(name) ? 650 : 350, { note: "Assumes a 250 g pack containing about 25 large dry shells; size varies by brand." });
  if (/^(?:(?:large|free range) )?eggs?$/.test(name) && count) return p("eggs", 12, "each", 700);
  if (/\b(?:lime|lemon|avocado|corn cobs?)\b/.test(name) && count) return p(/avocado/.test(name) ? "avocado" : /corn/.test(name) ? "corn" : "citrus", 1, "each", /avocado/.test(name) ? 180 : /corn/.test(name) ? 120 : 100);
  if (/\bspring onions?\b/.test(name) && count) return p("spring-onion-stalks", 6, "each", 250, { note: "Assumes six spring-onion stalks per bunch." });
  if (/\b(?:onion|onions|tomato|tomatoes|carrot|carrots|zucchini)\b/.test(name) && count) return p("whole-vegetable", 1, "each", 90, { note: "One medium whole vegetable allowance; actual size varies." });
  if (/\blemongrass\b/.test(name) && (count || rawUnit(line.unit) === "stalk")) return p("lemongrass-stalk", 2, rawUnit(line.unit) === "stalk" ? "stalk" : "each", 300);
  if (/\bgarlic\b/.test(name) && /^(?:clove|cloves)$/.test(rawUnit(line.unit))) return p("garlic-cloves", 10, "clove", 120, { note: "Assumes ten usable cloves per bulb; bulb size varies." });
  if (/\b(?:chillies|chilis|chiles|chilli)\b/.test(name) && count) return p(/\bdried\b/.test(name) ? "dried-chilli-count" : "fresh-chilli-count", /\bdried\b/.test(name) ? 12 : 5, "each", 250);
  if (/\b(?:bay leaf|bay leaves|cardamom pods|cinnamon stick|dried limes)\b/.test(name) && count) return p("whole-dried-seasoning", /cinnamon|limes/.test(name) ? 5 : 20, "each", 350);
  if (/\b(?:pandan|banana leaf)\b/.test(name) && count) return p("cooking-leaf", 5, "each", 350);
  if (/\b(?:tortilla|tortillas|bun|buns|flatbread|flatbreads|pita|chapati|roti|paratha|naan|arepas|idli|injera|pappadums|bread)\b/.test(name) && count) return p("bread-pieces", /\bidli|pappadums\b/.test(name) ? 8 : 4, "each", /gluten free/.test(name) ? 650 : 450, { note: "Assumes a four-piece bread/wrap pack (eight for idli/pappadums); specialty products vary." });
  if (/\b(?:lime|lemon|calamansi|orange) juice\b/.test(name)) return p("citrus-juice", 200, "ml", 450, { note: "Fresh citrus allowance assumes about 40 ml juice per fruit; yields vary. This is a budgeting yield, not an observed pack." });
  // Older saved/seeded plates can tag fresh finishes as specialty. Exact food
  // names establish a fresh form; unrelated powders/pickles cannot inherit it.
  if (!PRESERVED_PRODUCE.test(name) && (line.category === "produce" || freshProduceName(name))) {
    if (/\b(?:coriander|parsley|basil|dill|tarragon|mint|perilla|epazote|culantro|huacatay|laksa leaf|curry leaves|kaffir lime leaves)\b/.test(name)) return p("fresh-herbs", 30, "g", 300, { low: true, note: "Assumes a 30 g herb bunch/packet; uncommon regional herbs may cost more or need a specialist shop." });
    if (/\b(?:garlic|ginger|galangal|lemongrass)\b/.test(name)) return p("fresh-aromatics", 100, "g", /\bgarlic\b/.test(name) ? 200 : 180);
    if (/\b(?:salad|rocket|lettuce|spinach|kale)\b/.test(name)) return p("salad-leaves", 120, "g", 350);
    if (/\b(?:oyster|portobello) mushrooms?\b/.test(name)) return p("specialty-mushrooms", 200, "g", 600);
    if (/\bmushrooms?\b/.test(name)) return p("mushrooms", 200, "g", 450);
    if (/\b(?:pomegranate)\b/.test(name)) return p("pomegranate-arils", 100, "g", 450);
    if (/\b(?:snow ?peas?|mange tout|mangetout)\b/.test(name)) return p("snow-peas", 200, "g", 350);
    if (/\b(?:bean ?sprouts|mung bean sprouts)\b/.test(name)) return p("bean-sprouts", 200, "g", 250);
    if (/\bcucumbers?\b/.test(name)) return p("cucumber", 500, "g", 300, { note: "Assumes fresh whole cucumber bought by weight; local varieties and season change the price." });
    return p("vegetables", 500, "g", /\b(?:onion|onions|potato|potatoes|carrot|carrots|pumpkin|cabbage)\b/.test(name) ? 200 : 350, { low: true, note: "Category allowance for fresh produce; season, trimming and regional availability change the price." });
  }
  if (/\b(?:sauce|tamari|kecap manis|vinegar|oil|syrup|molasses|ketchup)\b/.test(name) && !/\b(?:tahini|miso)\b/.test(name)) {
    if (/\boil\b/.test(name)) return p(/\bsesame\b/.test(name) ? "sesame-oil" : "cooking-oil", /\bsesame\b/.test(name) ? 250 : 500, "ml", /\bsesame\b/.test(name) ? 650 : /\bolive\b/.test(name) ? 850 : 450);
    return p("liquid-seasoning", 250, "ml", /\b(?:syrup|molasses)\b/.test(name) ? 700 : 400);
  }
  if (/\b(?:stock)\b/.test(name)) return p("ready-stock", 1000, "ml", 250);
  if (/\b(?:coconut milk)\b/.test(name)) return p("coconut-milk", 400, "ml", 300);
  if (/\b(?:cream)\b/.test(name)) return p("cooking-cream", 300, "ml", 430);
  if (/\bmilk\b/.test(name)) return p("milk", 1000, "ml", /soy|oat|almond/.test(name) ? 250 : 200);
  if (/\b(?:passata|crushed tomatoes)\b/.test(name)) return p("tomato-passata", 500, rawUnit(line.unit) === "ml" ? "ml" : "g", 220);
  if (/\b(?:paste|gochujang|doubanjiang|miso|shatta|sambal|ajika|zhug|kroeung|base genep|biber salcasi|yuzu kosho)\b/.test(name)) return p("specialty-paste", 200, "g", /yuzu|kosho/.test(name) ? 800 : 450, { tspGrams: 6, low: true, note: "Assumes paste density of 1.2 g/ml and a 200 g jar; regional/special-diet products vary." });
  if (/\b(?:tahini|fermented black beans|pickled chopped)\b/.test(name)) return p("thick-condiment", 200, "g", 450, { tspGrams: 6, note: "Budget assumes 6 g per teaspoon (24 g per Australian tablespoon)." });
  if (/\b(?:yogurt|yoghurt|ganoush|hummus)\b/.test(name)) return p("yoghurt-dip", 500, "g", 550);
  if (/\b(?:cheddar|provolone|halloumi|paneer|cheese)\b/.test(name)) return p("cheese", 250, "g", 650);
  if (/\bbutter\b/.test(name) && !/beans/.test(name)) return p("butter", 250, "g", 450);
  if (/\b(?:tofu|tempeh|plant based sausages)\b/.test(name)) return p("plant-protein", /tempeh/.test(name) ? 300 : 450, "g", /smoked|tempeh|sausage/.test(name) ? 650 : 450);
  if (/\b(?:chickpeas|beans|lentils|jackfruit)\b/.test(name) && /\b(?:canned|cooked|drained|brine)\b/.test(name)) return p("cooked-legumes", 240, "g", 160, { note: "Assumes a 400 g can yielding 240 g drained cooked food; exact yield varies by food and packet. No dry-to-cooked conversion." });
  if (/\b(?:cooked rice|cooked long grain rice)\b/.test(name)) return p("ready-cooked-rice", 250, "g", 200);
  if (/\b(?:yuca|cassava)\b/.test(name)) return p("cooked-cassava", 500, "g", 500, { note: "Assumes commercially fully cooked peeled cassava, never raw roots." });
  if (/\b(?:kimchi)\b/.test(name)) return p("kimchi", 300, "g", 700);
  if (/\broasted red peppers\b/.test(name)) return p("roasted-peppers", 250, "g", 450);
  if (/\bfrozen peas\b/.test(name)) return p("frozen-peas", 500, "g", 250);
  if (/\bnutritional yeast\b/.test(name)) return p("nutritional-yeast", 100, "g", 650);
  if (/\b(?:peanuts|almonds|walnuts|sesame seeds)\b/.test(name)) return p("nuts-seeds", /sesame/.test(name) ? 100 : 200, "g", /sesame/.test(name) ? 300 : 450, { tspGrams: /sesame/.test(name) ? 3 : 4 });
  if (/\b(?:sugar)\b/.test(name)) return p("sugar", /palm/.test(name) ? 500 : 1000, "g", /palm/.test(name) ? 450 : 250, { tspGrams: 4 });
  if (/\b(?:salt)\b/.test(name)) return p("salt", 500, "g", 200, { tspGrams: 6 });
  if (/\b(?:cornflour|flour|corn starch)\b/.test(name)) return p("flour-starch", 500, "g", /gluten free|rice/.test(name) ? 300 : 200, { tspGrams: 3 });
  if (/\b(?:cocoa powder)\b/.test(name)) return p("cocoa", 250, "g", 500, { tspGrams: 2.5 });
  if (/\b(?:jam|mustard)\b/.test(name) && !/\bseeds\b/.test(name)) return p("jam-mustard", 200, "g", 350, { tspGrams: 6 });
  if (/\b(?:bread|breadcrumbs|focaccia|crackers)\b/.test(name) && rawUnit(line.unit) === "g") return p("bread-by-weight", 400, "g", /gluten free/.test(name) ? 650 : 400);
  if (/\b(?:rice|grain|polenta|pasta|noodles|freekeh|sorghum|quinoa|oats|burghul|bulgur|couscous|maize meal|vermicelli|lentils|barley|farro|millet)\b/.test(name) && ["g", "kg"].includes(rawUnit(line.unit))) return p("dry-staple", 500, "g", /gluten free|quinoa|freekeh|farro|soba/.test(name) ? 500 : /rice/.test(name) ? 250 : 300);
  if (/\b(?:chilli flakes|chili flakes|paprika|cumin|turmeric|garam masala|ground coriander|curry powder|dried oregano|black pepper|white pepper|sumac|cinnamon|nutmeg|allspice|cardamom|fennel seeds|fenugreek|cayenne|gochugaru|berbere|ras el hanout|za atar|shichimi|sansho|timur|tabil|hawaij|xawaash|advieh|khmeli suneli|merken|pepperberry|lemon myrtle)\b/.test(name)) return p(line.category === "specialty" ? "regional-spice" : "pantry-spice", 30, "g", line.category === "specialty" ? 450 : 300, { tspGrams: 2.5, low: true, note: "Budget assumes 2.5 g per level teaspoon; one Australian tablespoon is 20 ml (four teaspoons). Spice densities vary." });
  if (["tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons"].includes(rawUnit(line.unit))) return p(line.category === "specialty" ? "regional-spice" : "pantry-spice", 30, "g", line.category === "specialty" ? 450 : 300, { tspGrams: 2.5, low: true, note: "Budget assumes 2.5 g per level teaspoon; one Australian tablespoon is 20 ml (four teaspoons). Spice densities vary." });
  const unit = rawUnit(line.unit);
  return p("general-ingredient-allowance", unit === "ml" || unit === "l" ? 250 : count ? 1 : 250, unit === "ml" || unit === "l" ? "ml" : count ? "each" : "g", 500, { low: true, tspGrams: 5, note: "Broad ingredient allowance only. A shop quote or a reviewed product is needed for a stronger estimate." });
}

export function estimateIngredientCost(line: ShoppingLine): IngredientPlanningEstimate | null {
  if (!line || typeof line.name !== "string" || typeof line.unit !== "string" || !line.name.trim() || line.name.length > 500 || line.unit.length > 40 || !Number.isFinite(line.amount) || line.amount < 0 || line.amount > 1_000_000) return null;
  if (/\b(?:compost|pesticide|fertiliser|fertilizer|shampoo|lotion|inoculant)\b/.test(fold(line.name))) return null;
  const chosen = profile(line), unit = rawUnit(line.unit), assumptions = [INGREDIENT_ESTIMATE_LABEL];
  let amount = line.amount;
  const target = chosen.unit;
  if (target === "g" && unit === "kg") amount *= 1000;
  else if (target === "ml" && ["l", "litre", "litres", "liter", "liters"].includes(unit)) amount *= 1000;
  else if (["tsp", "teaspoon", "teaspoons", "tbsp", "tablespoon", "tablespoons"].includes(unit)) {
    const spoons = /^(?:tbsp|tablespoon)/.test(unit) ? 4 : 1;
    if (target === "ml") amount *= 5 * spoons;
    else if (target === "g" && chosen.tspGrams) { amount *= chosen.tspGrams * spoons; assumptions.push(`Density allowance: ${chosen.tspGrams} g per 5 ml teaspoon; this is an estimate, not a measured weight.`); }
    else return null;
  } else if (target === "clove" && ["clove", "cloves"].includes(unit)) { /* Counted bulb cloves. */ }
  else if (target === "each" && isCount(unit)) { /* Explicit counted products. */ }
  else if (target !== unit) return null;
  if (chosen.note) assumptions.push(chosen.note);
  assumptions.push("Pack sizes and costs are planning assumptions; check local price, food form and all required dietary labels before buying.");
  const ratio = amount / chosen.amount, packs = line.amount === 0 ? 0 : Math.ceil(ratio - 1e-10);
  const recipeCents = line.amount === 0 ? 0 : Math.max(1, Math.round(ratio * chosen.cents));
  const purchaseCents = packs * chosen.cents;
  if (![recipeCents, purchaseCents, packs].every(Number.isSafeInteger) || purchaseCents > 1_000_000_000) return null;
  return { source: "planning-guide", currency: "AUD", version: INGREDIENT_ESTIMATE_VERSION, profileId: chosen.id, confidence: chosen.low ? "low" : "medium", observed: false, recipeCents, purchaseCents, pack: { amount: chosen.amount, unit: chosen.unit, priceCents: chosen.cents, label: `${chosen.amount} ${chosen.unit}` }, packs, neededAmount: amount, neededUnit: chosen.unit, assumptions, label: INGREDIENT_ESTIMATE_LABEL };
}

export function estimateRecipeCost(lines: readonly ShoppingLine[], servings = 1) {
  const estimates = lines.map(line => ({ id: line.id, name: line.name, estimate: estimateIngredientCost(line) }));
  const recipeCents = estimates.reduce((sum, row) => sum + (row.estimate?.recipeCents ?? 0), 0);
  const purchaseCents = estimates.reduce((sum, row) => sum + (row.estimate?.purchaseCents ?? 0), 0);
  const validServings = Number.isFinite(servings) && servings > 0 ? servings : 1;
  return { currency: "AUD" as const, recipeCents, purchaseCents, perServingCents: Math.round(recipeCents / validServings), estimatedLines: estimates.filter(row => row.estimate).length, totalLines: lines.length, complete: estimates.every(row => row.estimate), lines: estimates, label: INGREDIENT_ESTIMATE_LABEL };
}
