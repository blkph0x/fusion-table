import type { Shop } from "./locations";
import type { RecipeIngredient } from "./recipe-types";

/**
 * These rules identify plausible places to ask, never confirmed stock or dietary
 * suitability. The original OSM subtype is more useful than a broad UI category:
 * a bakery and a spice merchant must not both match every specialty ingredient.
 */

const BREAD_IDS = new Set([
  "bread", "burger-buns", "buns", "bread-rolls", "flatbreads", "pita", "pitta",
  "naan", "sourdough", "baguette", "focaccia", "ciabatta", "brioche",
]);

const DRY_SPICE_IDS = new Set([
  "cumin", "ground-cumin", "smoked-paprika", "paprika", "garam-masala",
  "turmeric", "ground-turmeric", "sumac", "ras-el-hanout", "oregano",
  "chilli-flakes", "chili-flakes", "black-pepper", "white-pepper", "cinnamon",
  "ground-coriander", "coriander-seeds", "cumin-seeds", "fennel-seeds",
  "cardamom", "cloves", "nutmeg", "ground-ginger", "curry-powder", "zaatar",
  "sweet-paprika", "garlic-powder", "onion-powder", "five-spice", "gf-five-spice", "dried-mint",
  "za-atar", "allspice", "star-anise", "dried-thyme", "dried-rosemary",
]);

const DELI_IDS = new Set([
  "olive-oil", "olives", "green-olives", "black-olives", "kalamata-olives",
  "capers", "sun-dried-tomatoes", "sundried-tomatoes", "pickles", "gherkins",
  "salami", "prosciutto", "pancetta", "chorizo", "ham",
]);

const CONVENIENCE_IDS = new Set([
  "milk", "eggs", "salt", "sugar", "olive-oil", "vegetable-oil", "cooking-oil",
  "jasmine-rice", "rice", "pasta", "black-pepper", "bread", "burger-buns",
]);

function identifier(ingredient: RecipeIngredient): string {
  return ingredient.id.trim().toLowerCase();
}

function ingredientName(ingredient: RecipeIngredient): string {
  return ingredient.name.toLowerCase().replace(/[’']/g, "");
}

function isBread(ingredient: RecipeIngredient): boolean {
  if (ingredient.category !== "grocery" && ingredient.category !== "specialty") return false;
  const name = ingredientName(ingredient);
  // Flour, bread crumbs and bread flavourings are not bakery bread products.
  if (/\b(flour|crumbs?|breadcrumbs?|stuffing|seasoning|sauce|paste)\b/.test(name)) return false;
  return BREAD_IDS.has(identifier(ingredient)) || /\b(bread|buns?|bread rolls?|flatbreads?|pita|pitta|naan|sourdough|baguette|focaccia|ciabatta|brioche)\b/.test(name);
}

function isDairyCheese(ingredient: RecipeIngredient): boolean {
  const name = ingredientName(ingredient);
  if (/\b(vegan|plant.?based|dairy.?free|non.?dairy|soy|coconut|almond|cashew)\b/.test(name)) return false;
  if (!ingredient.allergens.some(allergen => allergen.toLowerCase() === "milk")) return false;
  return /\b(cheese|cheddar|feta|parmesan|pecorino|ricotta|mozzarella|halloumi|provolone|paneer|gouda|brie|camembert|mascarpone)\b/.test(name);
}

function isDrySpice(ingredient: RecipeIngredient): boolean {
  if (ingredient.category === "produce" || ingredient.category === "butcher" || ingredient.category === "fishmonger") return false;
  const name = ingredientName(ingredient);
  if (/\b(fresh|paste|sauce|oil|vinegar|milk|yogurt|yoghurt|juice)\b/.test(name)) return false;
  if (DRY_SPICE_IDS.has(identifier(ingredient))) return true;
  return /\b(ground (cumin|turmeric|coriander|ginger|cinnamon)|smoked paprika|garam masala|ras el hanout|sumac|chill?i flakes|curry powder|dried (oregano|thyme|rosemary)|black pepper|white pepper|cumin seeds|coriander seeds|fennel seeds|cardamom|cloves|nutmeg|allspice|star anise)\b/.test(name);
}

function isDeliProduct(ingredient: RecipeIngredient): boolean {
  if (isDairyCheese(ingredient)) return true;
  const name = ingredientName(ingredient);
  // A delicatessen is not evidence of a fresh-meat, produce or Asian-pantry range.
  if (ingredient.category === "produce" || ingredient.category === "fishmonger") return false;
  if (/\b(vegan|plant.?based|dairy.?free|non.?dairy)\b/.test(name)) return false;
  return DELI_IDS.has(identifier(ingredient)) || /\b(olives|capers|sun.?dried tomatoes|gherkins|salami|prosciutto|pancetta|chorizo)\b/.test(name);
}

function subtype(shop: Shop): string | undefined {
  return shop.shopType?.trim().toLowerCase() || undefined;
}

export function ingredientMatchesShop(ingredient: RecipeIngredient, shop: Shop): boolean {
  const type = subtype(shop);
  if (type) {
    switch (type) {
      case "supermarket": return true;
      case "greengrocer": case "farm": return ingredient.category === "produce";
      case "butcher": return ingredient.category === "butcher";
      case "seafood": return ingredient.category === "fishmonger";
      case "bakery": return isBread(ingredient);
      case "cheese": return isDairyCheese(ingredient);
      case "spices": return isDrySpice(ingredient);
      case "deli": return isDeliProduct(ingredient);
      case "grocery": return ingredient.category === "grocery";
      case "convenience": return ingredient.category === "grocery" && (CONVENIENCE_IDS.has(identifier(ingredient)) || isBread(ingredient));
      default: return false;
    }
  }

  // Older saved listings may lack a subtype. Only specific known categories
  // remain matchable. Neither generic markets nor "specialty" imply a range.
  switch (shop.kind) {
    case "supermarket": return true;
    case "produce": return ingredient.category === "produce";
    case "butcher": return ingredient.category === "butcher";
    case "fishmonger": return ingredient.category === "fishmonger";
    case "grocery": return ingredient.category === "grocery";
    case "market": case "specialty": return false;
  }
}

function sourceRank(shop: Shop): number {
  const type = subtype(shop);
  if (type === "supermarket" || (!type && shop.kind === "supermarket")) return 20;
  if (type === "grocery" || (!type && shop.kind === "grocery")) return 30;
  if (type === "convenience") return 40;
  if (type === "deli") return 5;
  return 0;
}

export function suggestedShops(ingredient: RecipeIngredient, shops: Shop[]): Shop[] {
  const seen = new Set<string>();
  return shops.filter(shop => {
    if (seen.has(shop.id) || !ingredientMatchesShop(ingredient, shop)) return false;
    seen.add(shop.id);
    return true;
  }).sort((a, b) => {
    const rank = sourceRank(a) - sourceRank(b);
    if (rank) return rank;
    const distanceA = Number.isFinite(a.distanceKm) ? a.distanceKm : Number.POSITIVE_INFINITY;
    const distanceB = Number.isFinite(b.distanceKm) ? b.distanceKm : Number.POSITIVE_INFINITY;
    return distanceA - distanceB || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}
