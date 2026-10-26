import { MEAL_SIDES, MEAL_REGIONS, getMealCombinationCount } from "../lib/meal-catalog.ts";
import { preferredSidesForRegion, sideRegionCoverage } from "../lib/side-plans.ts";
import { generateMeal } from "../lib/meals.ts";

console.log("sides", MEAL_SIDES.length, "combos", getMealCombinationCount());
const thin = MEAL_REGIONS.filter((r) => preferredSidesForRegion(r.id).length < 3).map(
  (r) => `${r.id}:${preferredSidesForRegion(r.id).length}`,
);
console.log("thin(<3)", thin.join(", ") || "none");
console.log(
  "avg regions/side",
  (sideRegionCoverage().reduce((s, x) => s + x.regionCount, 0) / MEAL_SIDES.length).toFixed(1),
);

const fails = [];
for (const side of MEAL_SIDES) {
  for (const diet of [undefined, "gluten-free", "dairy-free", "vegan"]) {
    try {
      const vegan = diet === "vegan";
      const meal = generateMeal({
        mainId: vegan ? "chickpeas" : "chicken",
        methodId: vegan ? "roasted" : "schnitzel",
        regionId: "home-kitchen",
        sideId: side.id,
        styleId: "balanced",
        sizeId: "medium",
        servings: 4,
        ...(diet ? { diet } : {}),
      });
      const text = meal.steps.map((s) => s.detail).join(" ").toLowerCase();
      for (const item of meal.ingredients) {
        const ok = text.includes(item.name.toLowerCase()) || text.includes(item.id.replaceAll("-", " "));
        if (!ok) fails.push(`${side.id}${diet ? "/" + diet : ""}: ${item.name}`);
      }
      if (diet === "vegan" && meal.allergens.includes("egg")) fails.push(`${side.id}/vegan egg`);
      if ((diet === "vegan" || diet === "dairy-free") && meal.allergens.includes("milk")) {
        fails.push(`${side.id}/${diet} milk`);
      }
      if (diet === "gluten-free" && meal.allergens.some((a) => ["wheat", "barley", "rye"].includes(a))) {
        fails.push(`${side.id}/gf wheat`);
      }
    } catch (e) {
      fails.push(`${side.id} ERR ${e.message}`);
    }
  }
}
console.log(fails.length ? fails.slice(0, 50).join("\n") : "all wording+allergen checks ok");
console.log("fail count", fails.length);
process.exit(fails.length ? 1 : 0);
