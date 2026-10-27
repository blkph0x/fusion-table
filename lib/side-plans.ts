/**
 * Authored side / accompaniment templates for Fusion Table.
 * Australian English. Allergen tags are explicit. GF/dairy-free variants where needed.
 * Templates are not kitchen-tested. Check the packet.
 * Grain technique references (checked 27 October 2026):
 * https://www.bobsredmill.com/recipes/how-to-make/basic-preparation-instructions-for-gluten-free-sorghum-grain
 * https://www.bobsredmill.com/recipes/how-to-make/basic-cooking-instructions-cracked-freekeh
 * https://www.bobsredmill.com/recipes/how-to-make/basic-preparation-instructions-for-organic-farro
 * https://www.bobsredmill.com/recipes/how-to-make/basic-cooking-instructions-for-whole-grain-millet
 * https://www.delallo.com/delallo-instant-polenta-9-2-oz/
 */
import type { IngredientCategory, RecipeIngredient, RecipeStep } from "./recipe-types.ts";
import type { MealOption } from "./meal-types.ts";

type Draft = Omit<RecipeIngredient, "inPantry"> & { aliases?: readonly string[] };

export interface SidePlanBuilt {
  side: string;
  vegetables: string;
  ingredients: Draft[];
  steps: RecipeStep[];
  equipment: string[];
  /** Additional advance preparation, excluded from the cooking window. */
  prepMinutes?: number;
  prepNote?: string;
  /** Late dressing, cold plating or warming actions; these are not SAT boundaries. */
  finishStepIndexes?: number[];
  safetyNote?: string;
  safetySource?: string;
  minutes: number;
}

function amount(value: number, servings: number): string {
  const scaled = Number((value * servings / 4).toFixed(4));
  return String(scaled);
}

function ingredient(
  id: string,
  name: string,
  amt: number,
  unit: string,
  category: IngredientCategory = "grocery",
  allergens: string[] = [],
  notes?: string,
  aliases?: readonly string[],
): Draft {
  return { id, name, amount: amt, unit, category, allergens, ...(notes ? { notes } : {}), ...(aliases ? { aliases: [...aliases] } : {}) };
}

function step(title: string, detail: string, minutes: number): RecipeStep {
  return { title, detail, minutes };
}

const oil = (qty: number) => ingredient("olive-oil", "Olive oil", qty, "tbsp", "grocery", [], undefined, ["olive oil"]);
const lemon = ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.");
const lime = ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.");

type Builder = (gf: boolean, df: boolean, servings: number) => SidePlanBuilt;

interface SideDef {
  option: MealOption;
  /** Region ids or families this side suits for plate diversification. */
  regionHints: readonly string[];
  build: Builder;
}

const DEFS: readonly SideDef[] = [
  {
    option: { id: "rice-greens", name: "Rice & greens", description: "Fluffy long-grain rice with steamed green beans.", emoji: "🍚" },
    regionHints: ["home-kitchen", "chinese", "japanese", "korean", "thai", "vietnamese", "indonesian", "malaysian", "filipino", "lao", "burmese", "cantonese", "sichuan", "hunan", "taiwanese", "shanghainese", "yunnan", "australian"],
    build: (gf, df, servings) => ({
      side: "fluffy long-grain rice", vegetables: "steamed green beans",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice", "long grain rice"]), ingredient("green-beans", "Green beans", 400, "g", "produce", [], "Trimmed.", ["green beans"])],
      steps: [step("Start the rice", `Rinse ${amount(300, servings)} g long-grain rice. Add to a saucepan with ${amount(600, servings)} ml water, bring to a boil, then cover and cook on the lowest heat for about 12–15 minutes or as the packet directs. Rest covered for 5 minutes, then fluff.`, 20), step("Steam the green beans", `Trim ${amount(400, servings)} g green beans. Steam for 5–7 minutes until tender with a little bite; keep warm briefly while finishing the main.`, 7)],
      equipment: ["Saucepan with lid", "Steamer or colander over a saucepan"], minutes: 22,
    }),
  },
  {
    option: { id: "potato-slaw", name: "Potatoes & slaw", description: "Golden potato cubes with a lemon-dressed cabbage and carrot slaw.", emoji: "🥔" },
    regionHints: ["home-kitchen", "australian", "french", "spanish", "portuguese", "hungarian", "nordic", "cajun", "creole", "argentine", "chilean"],
    build: (_gf, _df, servings) => ({
      side: "golden pan-roasted potatoes", vegetables: "lemon-dressed cabbage & carrot slaw",
      ingredients: [ingredient("potatoes", "Potatoes", 800, "g", "produce", [], "Cut into 1.5 cm cubes."), ingredient("cabbage", "Cabbage", 250, "g", "produce", [], "Finely shredded."), ingredient("carrot", "Carrot", 200, "g", "produce", [], "Coarsely grated."), oil(3), lemon],
      steps: [step("Cook the potatoes", `Cut ${amount(800, servings)} g potatoes into 1.5 cm cubes. Simmer in water for 8–10 minutes until just tender, then drain and steam-dry. Heat ${amount(2, servings)} tbsp olive oil in a wide pan and turn the potatoes over medium-high heat for 10–12 minutes until golden. Cook in batches if crowded.`, 25), step("Dress the slaw", `Combine ${amount(250, servings)} g finely shredded cabbage and ${amount(200, servings)} g grated carrot. Toss with ${amount(30, servings)} ml lemon juice and the remaining ${amount(1, servings)} tbsp olive oil allocated to this side.`, 5)],
      equipment: ["Saucepan", "Wide frying pan", "Mixing bowl", "Grater"], minutes: 25,
    }),
  },
  {
    option: { id: "couscous-veg", name: "Couscous & roast veg", description: "Couscous with peppers and courgette; quinoa for gluten-free meals.", emoji: "🥗" },
    regionHints: ["moroccan", "tunisian", "levantine", "persian", "turkish", "syrian", "yemeni", "afghan"],
    build: (gf, _df, servings) => ({
      side: gf ? "fluffy quinoa" : "fluffy couscous", vegetables: "pan-roasted pepper & courgette",
      ingredients: [gf ? ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight; replaces couscous for gluten-free meals.") : ingredient("couscous", "Couscous", 280, "g", "grocery", ["wheat"], "Dry weight."), ingredient("pepper", "Red pepper", 300, "g", "produce", [], "Deseeded and cut into 2 cm pieces.", ["capsicum", "red capsicum"]), ingredient("courgette", "Courgette (zucchini)", 300, "g", "produce", [], "Cut into 2 cm pieces.", ["courgette", "zucchini"]), oil(1.5)],
      steps: [step(gf ? "Cook the quinoa" : "Fluff the couscous", gf ? `Rinse ${amount(280, servings)} g quinoa. Add ${amount(560, servings)} ml water, bring to a boil and simmer covered for about 15 minutes until the liquid is absorbed. Rest covered for 5 minutes, then fluff. Check the packet if it specifies a different ratio.` : `Put ${amount(280, servings)} g couscous in a heatproof bowl. Pour over ${amount(350, servings)} ml boiling water, cover for 5 minutes and fluff with a fork. Follow the packet if it requires a different water ratio.`, gf ? 22 : 7), step("Pan-roast the vegetables", `Heat ${amount(1.5, servings)} tbsp olive oil in a wide frying pan. Add ${amount(300, servings)} g chopped red pepper and ${amount(300, servings)} g chopped courgette. Cook over medium-high heat for 10–12 minutes, turning occasionally, until browned at the edges and tender. Use batches if needed.`, 12)],
      equipment: gf ? ["Saucepan with lid", "Wide frying pan"] : ["Heatproof bowl", "Wide frying pan"], minutes: gf ? 22 : 15,
    }),
  },
  {
    option: { id: "noodles-crunch", name: "Noodles & crunch", description: "Noodles with crunchy cucumber and carrot; rice noodles when gluten-free.", emoji: "🍜" },
    regionHints: ["chinese", "japanese", "korean", "thai", "vietnamese", "lao", "sichuan", "hunan", "cantonese", "taiwanese", "shanghainese"],
    build: (gf, _df, servings) => ({
      side: gf ? "rice noodles" : "wheat noodles", vegetables: "crunchy cucumber & carrot",
      ingredients: [gf ? ingredient("noodles", "Gluten-free rice noodles", 280, "g", "grocery", [], "Dry weight; choose a labelled gluten-free product.", ["gluten free rice noodles"]) : ingredient("noodles", "Egg-free wheat noodles", 280, "g", "grocery", ["wheat"], "Dry weight; check the label for egg and dairy.", ["egg free wheat noodles"]), ingredient("cucumber", "Cucumber", 300, "g", "produce", [], "Cut into thin batons."), ingredient("carrot", "Carrot", 200, "g", "produce", [], "Cut into thin matchsticks."), oil(1), lemon],
      steps: [step("Cook the noodles", `Cook ${amount(280, servings)} g ${gf ? "gluten-free rice noodles" : "egg-free wheat noodles"} according to the packet; thickness and soaking requirements vary. Drain well, rinse only if the packet advises it, and toss with ${amount(1, servings)} tbsp olive oil to prevent sticking.`, 10), step("Add the crunch", `Cut ${amount(300, servings)} g cucumber into thin batons and ${amount(200, servings)} g carrot into matchsticks. Toss with ${amount(30, servings)} ml lemon juice. Keep this crunchy mixture separate until serving.`, 5)],
      equipment: ["Saucepan", "Colander", "Mixing bowl"], minutes: 15,
    }),
  },
  {
    option: { id: "flatbread-salad", name: "Flatbread & salad", description: "Warm flatbread with tomato and cucumber salad.", emoji: "🫓" },
    regionHints: ["levantine", "greek", "turkish", "persian", "syrian", "yemeni", "afghan", "georgian", "indian", "pakistani", "nepali"],
    build: (gf, _df, servings) => ({
      side: gf ? "warm gluten-free flatbread" : "warm flatbread", vegetables: "tomato & cucumber salad",
      ingredients: [ingredient("flatbread", gf ? "Gluten-free vegan flatbread" : "Vegan wheat flatbread", 4, "", "grocery", gf ? [] : ["wheat"], "Choose a ready-cooked flatbread without milk or egg.", gf ? ["gluten free vegan flatbread"] : ["vegan wheat flatbread"]), ingredient("tomato", "Tomatoes", 350, "g", "produce", [], "Chopped.", ["tomatoes", "tomato"]), ingredient("cucumber", "Cucumber", 300, "g", "produce", [], "Chopped."), oil(1), lemon],
      steps: [step("Make the chopped salad", `Combine ${amount(350, servings)} g chopped tomatoes and ${amount(300, servings)} g chopped cucumber. Dress with ${amount(30, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil just before serving.`, 6), step("Warm the flatbread", `Warm ${amount(4, servings)} ${gf ? "gluten-free vegan" : "vegan wheat"} flatbreads in a dry frying pan for about 30–60 seconds per side, or as the packet directs. Keep wrapped in a clean tea towel.`, 5)],
      equipment: ["Mixing bowl", "Frying pan"], minutes: 10,
    }),
  },
  {
    option: { id: "lentil-salad", name: "Warm lentil salad", description: "Cooked lentils, baby spinach, tomato and cucumber.", emoji: "🌿" },
    regionHints: ["home-kitchen", "french", "levantine", "indian", "ethiopian", "persian", "turkish", "australian"],
    build: (_gf, _df, servings) => ({
      side: "warm lentils", vegetables: "spinach, tomato & cucumber salad",
      ingredients: [ingredient("lentils", "Canned green or brown lentils, drained", 600, "g", "grocery", [], "Already cooked; use drained weight.", ["lentils", "green lentils", "brown lentils"]), ingredient("spinach", "Baby spinach", 100, "g", "produce", [], "Washed."), ingredient("tomato", "Tomatoes", 250, "g", "produce", [], "Chopped.", ["tomatoes", "tomato"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], "Chopped."), oil(1), lemon],
      steps: [step("Warm the lentils", `Drain and rinse ${amount(600, servings)} g already-cooked canned lentils (drained weight). Warm in a saucepan with ${amount(60, servings)} ml water for 4–5 minutes until steaming hot, then drain any excess. Do not use uncooked dried lentils here.`, 6), step("Toss the lentil salad", `Fold ${amount(100, servings)} g washed baby spinach into the warm lentils to wilt lightly. Add ${amount(250, servings)} g chopped tomatoes and ${amount(250, servings)} g chopped cucumber, then dress with ${amount(30, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 5)],
      equipment: ["Saucepan", "Mixing bowl"], minutes: 12,
    }),
  },
  {
    option: { id: "garden-salad", name: "Garden salad", description: "Lettuce, tomato and cucumber with a lemon olive-oil dressing.", emoji: "🥬" },
    regionHints: ["home-kitchen", "australian", "greek", "italian", "spanish", "french", "nordic", "portuguese"],
    build: (_gf, _df, servings) => ({
      side: "garden salad", vegetables: "lemon-dressed lettuce, tomato & cucumber",
      ingredients: [ingredient("lettuce", "Cos or iceberg lettuce", 300, "g", "produce", [], "Washed and torn.", ["lettuce", "cos lettuce", "iceberg"]), ingredient("tomato", "Tomatoes", 300, "g", "produce", [], "Chopped.", ["tomatoes", "tomato"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], "Sliced."), oil(2), lemon],
      steps: [step("Build the garden salad", `Tear ${amount(300, servings)} g washed lettuce into a bowl. Add ${amount(300, servings)} g chopped tomatoes and ${amount(250, servings)} g sliced cucumber.`, 5), step("Dress just before serving", `Toss with ${amount(30, servings)} ml lemon juice and ${amount(2, servings)} tbsp olive oil. Season lightly if you like. Do not dress early or the leaves wilt.`, 2)],
      equipment: ["Mixing bowl"], minutes: 7,
    }),
  },
  {
    option: { id: "mashed-potato", name: "Mashed potato", description: "Creamy mash; olive-oil mash when dairy-free. Steamed peas on the side.", emoji: "🥔" },
    regionHints: ["home-kitchen", "australian", "british", "french", "nordic", "hungarian", "irish"],
    build: (_gf, df, servings) => {
      const dairy = !df;
      return {
        side: dairy ? "creamy mashed potato" : "olive-oil mashed potato",
        vegetables: "steamed peas",
        ingredients: [
          ingredient("potatoes", "Potatoes", 900, "g", "produce", [], "Peeled and cut into even chunks."),
          ingredient("peas", "Frozen peas", 300, "g", "produce", [], "Do not thaw before cooking.", ["peas", "green peas"]),
          ...(dairy
            ? [ingredient("milk", "Milk", 120, "ml", "grocery", ["milk"], "Warm before mashing.", ["milk"]), ingredient("butter", "Butter", 40, "g", "grocery", ["milk"], undefined, ["butter"])]
            : [oil(3)]),
        ],
        steps: [
          step("Boil and mash the potatoes", dairy
            ? `Boil ${amount(900, servings)} g potatoes (peeled and cut into even chunks) in unsalted water until tender, about 15–18 minutes. Drain well. Mash with ${amount(120, servings)} ml warm milk and ${amount(40, servings)} g butter until smooth. Check the packet if using a ready mash mix.`
            : `Boil ${amount(900, servings)} g potatoes (peeled and cut into even chunks) in unsalted water until tender, about 15–18 minutes. Drain well. Mash with ${amount(3, servings)} tbsp olive oil until smooth. No milk or butter is used for this dairy-free mash.`, 20),
          step("Steam the peas", `Cook ${amount(300, servings)} g frozen peas in a little boiling water for 3–4 minutes until hot through. Drain and keep warm.`, 5),
        ],
        equipment: ["Saucepan", "Colander", "Potato masher"],
        minutes: 25,
      };
    },
  },
  {
    option: { id: "roast-pumpkin", name: "Roast pumpkin", description: "Tray-roasted pumpkin with wilted spinach.", emoji: "🎃" },
    regionHints: ["home-kitchen", "australian", "moroccan", "caribbean", "brazilian", "west-african"],
    build: (_gf, _df, servings) => ({
      side: "roast pumpkin wedges", vegetables: "wilted spinach",
      ingredients: [ingredient("side-pumpkin", "Pumpkin or butternut for the side", 800, "g", "produce", [], "Peeled and cut into 2 cm wedges for the side tray.", ["pumpkin", "butternut", "butternut squash"]), ingredient("spinach", "Baby spinach", 150, "g", "produce", [], "Washed."), oil(2), { ...lemon, amount: 15 }],
      steps: [step("Roast the pumpkin", `Toss ${amount(800, servings)} g pumpkin or butternut for the side (2 cm wedges) with ${amount(2, servings)} tbsp olive oil. Spread on a tray and roast at 200°C for 25–30 minutes until browned at the edges and soft through the centre.`, 30), step("Wilt the spinach", `In the last 2 minutes, tip ${amount(150, servings)} g washed baby spinach onto the hot tray or a warm pan until just wilted. Finish with ${amount(15, servings)} ml lemon juice.`, 3)],
      equipment: ["Oven tray", "Mixing bowl"], minutes: 32,
    }),
  },
  {
    option: { id: "steamed-broccoli", name: "Steamed broccoli", description: "Broccoli florets with lemon and a small pot of jasmine rice.", emoji: "🥦" },
    regionHints: ["home-kitchen", "chinese", "cantonese", "australian", "japanese", "korean"],
    build: (_gf, _df, servings) => ({
      side: "jasmine rice", vegetables: "steamed broccoli with lemon",
      ingredients: [ingredient("jasmine-rice", "Jasmine rice", 280, "g", "grocery", [], "Dry weight.", ["jasmine rice", "rice"]), ingredient("side-broccoli", "Broccoli for the side", 500, "g", "produce", [], "Cut into even florets for the side.", ["broccoli"]), oil(1), { ...lemon, amount: 20 }],
      steps: [step("Cook the jasmine rice", `Rinse ${amount(280, servings)} g jasmine rice. Cook with ${amount(420, servings)} ml water, covered, on the lowest heat for about 12 minutes or as the packet directs. Rest covered for 5 minutes, then fluff.`, 18), step("Steam the broccoli", `Steam ${amount(500, servings)} g broccoli for the side (even florets) for 5–7 minutes until bright green with a little bite. Toss with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lemon juice.`, 7)],
      equipment: ["Saucepan with lid", "Steamer or colander over a saucepan"], minutes: 20,
    }),
  },
  {
    option: { id: "garlic-bread", name: "Garlic bread & salad", description: "Garlic bread (wheat) with tomato salad; labelled gluten-free bread when filtered.", emoji: "🥖" },
    regionHints: ["italian", "australian", "home-kitchen", "french", "spanish", "portuguese"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free garlic bread" : "garlic bread",
      vegetables: "tomato salad",
      ingredients: [
        ingredient("garlic-bread", gf ? "Gluten-free vegan garlic bread" : "Vegan garlic bread", 4, "", "grocery", gf ? [] : ["wheat"], "Choose a vegan product without milk or egg; when gluten-free, it must also be labelled gluten-free. Check the packet for sesame.", gf ? ["gluten free vegan garlic bread"] : ["vegan garlic bread", "vegan garlic toast"]),
        ingredient("tomato", "Tomatoes", 350, "g", "produce", [], "Chopped.", ["tomatoes", "tomato"]),
        oil(1),
        { ...lemon, amount: 20 },
      ],
      steps: [
        step("Warm the garlic bread", `Warm ${amount(4, servings)} pieces of ${gf ? "labelled gluten-free" : "wheat"} garlic bread in a moderate oven or toaster oven as the packet directs, usually 8–10 minutes. Keep warm in a clean tea towel.`, 10),
        step("Make the tomato salad", `Combine ${amount(350, servings)} g chopped tomatoes with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil. Serve beside the bread, not on top of it, so the crust stays crisp.`, 4),
      ],
      equipment: ["Oven or toaster oven", "Mixing bowl"],
      minutes: 12,
    }),
  },
  // —— Expanded regional / everyday sides ——
  {
    option: { id: "jasmine-cucumber", name: "Jasmine rice & cucumber", description: "Fragrant jasmine rice with cool cucumber salad and lime.", emoji: "🥒" },
    regionHints: ["thai", "thai-green", "thai-massaman", "thai-panang", "thai-yellow", "isaan", "vietnamese", "lao", "cambodian", "malaysian", "indonesian", "peranakan", "filipino"],
    build: (_gf, _df, servings) => ({
      side: "jasmine rice", vegetables: "lime cucumber salad",
      ingredients: [ingredient("jasmine-rice", "Jasmine rice", 300, "g", "grocery", [], "Dry weight.", ["jasmine rice", "rice"]), ingredient("cucumber", "Cucumber", 350, "g", "produce", [], "Thinly sliced."), oil(1), lime],
      steps: [step("Cook the jasmine rice", `Rinse ${amount(300, servings)} g jasmine rice. Cook with ${amount(450, servings)} ml water, covered, on the lowest heat for about 12 minutes or as the packet directs. Rest covered for 5 minutes, then fluff.`, 18), step("Dress the cucumber", `Toss ${amount(350, servings)} g thinly sliced cucumber with ${amount(30, servings)} ml lime juice and ${amount(1, servings)} tbsp olive oil. Keep chilled until serving.`, 4)],
      equipment: ["Saucepan with lid", "Mixing bowl"], minutes: 20,
    }),
  },
  {
    option: { id: "coconut-rice", name: "Coconut rice & greens", description: "Coconut rice with steamed bok choy or silverbeet.", emoji: "🥥" },
    regionHints: ["thai", "thai-green", "malaysian", "indonesian", "caribbean", "jamaican", "brazilian", "goan", "sri-lankan", "balinese", "maluku", "west-african", "mozambican"],
    build: (_gf, _df, servings) => ({
      side: "coconut rice", vegetables: "steamed bok choy",
      ingredients: [ingredient("jasmine-rice", "Jasmine rice", 280, "g", "grocery", [], "Dry weight.", ["jasmine rice", "rice"]), ingredient("coconut-milk", "Coconut milk", 200, "ml", "grocery", [], "Unsweetened canned coconut milk.", ["coconut milk"]), ingredient("bok-choy", "Bok choy", 400, "g", "produce", [], "Halved lengthways.", ["bok choy", "pak choy", "silverbeet"])],
      steps: [step("Cook the coconut rice", `Rinse ${amount(280, servings)} g jasmine rice. Cook with ${amount(200, servings)} ml coconut milk and ${amount(280, servings)} ml water, covered, on the lowest heat until the liquid is absorbed, about 14 minutes. Rest covered for 5 minutes, then fluff. Check the packet if ratios differ.`, 20), step("Steam the bok choy", `Steam ${amount(400, servings)} g bok choy for 3–5 minutes until the stems are tender-crisp. Drain well.`, 5)],
      equipment: ["Saucepan with lid", "Steamer"], minutes: 22,
    }),
  },
  {
    option: { id: "kimchi-rice", name: "Kimchi rice bowl", description: "Steamed rice with a small serve of kimchi and cucumber. Sesame optional finish is omitted here.", emoji: "🇰🇷" },
    regionHints: ["korean"],
    build: (gf, _df, servings) => ({
      side: "steamed short-grain rice", vegetables: "kimchi & cucumber",
      ingredients: [ingredient("rice", "Short-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice", "sushi rice", "short grain rice"]), ingredient("kimchi", gf ? "Gluten-free vegan kimchi" : "Vegan kimchi", 200, "g", "specialty", [], "Choose a vegan product without fish, shrimp or sesame; for gluten-free meals it must also be labelled gluten-free. Check the packet.", gf ? ["gluten free vegan kimchi"] : ["vegan kimchi"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], "Sliced.")],
      steps: [step("Cook the rice", `Rinse ${amount(300, servings)} g short-grain rice. Cook with ${amount(390, servings)} ml water as the packet directs. Rest covered for 10 minutes, then fluff.`, 20), step("Plate the kimchi", `Arrange ${amount(200, servings)} g kimchi and ${amount(200, servings)} g sliced cucumber beside the rice. Check the kimchi packet for allergens before serving.`, 3)],
      equipment: ["Saucepan with lid"], minutes: 22,
    }),
  },
  {
    option: { id: "basmati-raita", name: "Basmati & raita", description: "Basmati rice with cucumber yoghurt raita; dairy-free mint salad when filtered.", emoji: "🍛" },
    regionHints: ["indian", "indian-madras", "indian-vindaloo", "indian-korma", "south-indian", "goan", "bengali", "chettinad", "hyderabadi", "kashmiri", "sri-lankan", "pakistani", "gujarati", "nepali", "afghan"],
    build: (_gf, df, servings) => {
      const dairy = !df;
      return {
        side: "basmati rice",
        vegetables: dairy ? "cucumber yoghurt raita" : "mint cucumber salad",
        ingredients: [
          ingredient("basmati-rice", "Basmati rice", 300, "g", "grocery", [], "Dry weight.", ["basmati", "basmati rice"]),
          ingredient("cucumber", "Cucumber", 250, "g", "produce", [], "Grated or finely chopped."),
          ...(dairy
            ? [ingredient("yoghurt", "Plain yoghurt", 200, "g", "grocery", ["milk"], "Unsweetened.", ["yoghurt", "yogurt", "natural yoghurt"])]
            : [ingredient("side-mint", "Fresh mint for the side", 20, "g", "produce", [], "Leaves only.", ["mint"]), { ...lime, amount: 20 }, oil(1)]),
        ],
        steps: [
          step("Cook the basmati", `Rinse ${amount(300, servings)} g basmati rice. Cook with ${amount(450, servings)} ml water, covered, until tender, about 12–15 minutes or as the packet directs. Rest covered for 5 minutes, then fluff.`, 18),
          step(dairy ? "Stir the raita" : "Toss the mint salad", dairy
            ? `Combine ${amount(200, servings)} g plain yoghurt with ${amount(250, servings)} g grated cucumber. Keep cold until serving.`
            : `Toss ${amount(250, servings)} g chopped cucumber with ${amount(20, servings)} g fresh mint for the side, ${amount(20, servings)} ml lime juice and ${amount(1, servings)} tbsp olive oil. No yoghurt is used for this dairy-free side.`, 5),
        ],
        equipment: ["Saucepan with lid", "Mixing bowl"],
        minutes: 20,
      };
    },
  },
  {
    option: { id: "chapati-salad", name: "Chapati & kachumber", description: "Warm chapati (wheat) with tomato–onion–cucumber salad; GF flatbread when filtered.", emoji: "🫓" },
    regionHints: ["indian", "pakistani", "gujarati", "punjabi", "afghan", "nepali"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free flatbread" : "chapati",
      vegetables: "kachumber salad",
      ingredients: [
        ingredient("chapati", gf ? "Gluten-free flatbread" : "Chapati or roti", 4, "", "grocery", gf ? [] : ["wheat"], gf ? "Labelled gluten-free product." : "Wheat flatbread; check for dairy.", gf ? ["gluten free flatbread"] : ["chapati", "roti"]),
        ingredient("tomato", "Tomatoes", 300, "g", "produce", [], "Chopped.", ["tomatoes"]),
        ingredient("side-onion", "Red onion for the side", 100, "g", "produce", [], "Finely sliced for the side.", ["onion", "red onion"]),
        ingredient("cucumber", "Cucumber", 200, "g", "produce", [], "Chopped."),
        lemon,
      ],
      steps: [
        step("Make the kachumber", `Combine ${amount(300, servings)} g chopped tomatoes, ${amount(100, servings)} g finely sliced red onion for the side and ${amount(200, servings)} g chopped cucumber. Dress with ${amount(30, servings)} ml lemon juice.`, 6),
        step("Warm the bread", `Warm ${amount(4, servings)} ${gf ? "gluten-free flatbreads" : "chapatis"} in a dry pan for 20–40 seconds per side, or as the packet directs.`, 4),
      ],
      equipment: ["Mixing bowl", "Frying pan"],
      minutes: 10,
    }),
  },
  {
    option: { id: "bulgur-tabbouleh", name: "Bulgur tabbouleh", description: "Parsley-forward bulgur salad; quinoa when gluten-free.", emoji: "🌿" },
    regionHints: ["levantine", "syrian", "turkish", "persian", "georgian", "yemeni"],
    build: (gf, _df, servings) => ({
      side: gf ? "quinoa tabbouleh-style salad" : "bulgur tabbouleh",
      vegetables: "tomato & parsley",
      ingredients: [
        gf ? ingredient("quinoa", "Quinoa", 220, "g", "grocery", [], "Dry weight; replaces bulgur for gluten-free meals.") : ingredient("bulgur", "Fine bulgur wheat", 220, "g", "grocery", ["wheat"], "Dry weight.", ["bulgur", "burghul"]),
        ingredient("side-parsley", "Flat-leaf parsley for the side", 80, "g", "produce", [], "Finely chopped for the side.", ["parsley"]),
        ingredient("tomato", "Tomatoes", 300, "g", "produce", [], "Finely diced.", ["tomatoes"]),
        ingredient("cucumber", "Cucumber", 150, "g", "produce", [], "Finely diced."),
        oil(2),
        lemon,
      ],
      steps: [
        step(gf ? "Cook the quinoa" : "Soak the bulgur", gf
          ? `Rinse ${amount(220, servings)} g quinoa. Simmer covered with ${amount(440, servings)} ml water for about 15 minutes. Rest, then fluff and cool slightly.`
          : `Cover ${amount(220, servings)} g fine bulgur with ${amount(280, servings)} ml boiling water. Cover for 10–12 minutes until tender, then fluff and cool slightly.`, gf ? 20 : 12),
        step("Fold the herbs", `Fold in ${amount(80, servings)} g chopped flat-leaf parsley for the side, ${amount(300, servings)} g diced tomatoes and ${amount(150, servings)} g diced cucumber. Dress with ${amount(30, servings)} ml lemon juice and ${amount(2, servings)} tbsp olive oil.`, 6),
      ],
      equipment: gf ? ["Saucepan with lid", "Mixing bowl"] : ["Heatproof bowl", "Mixing bowl"],
      minutes: gf ? 24 : 16,
    }),
  },
  {
    option: { id: "hummus-salad", name: "Hummus & salad", description: "Ready hummus with tomato–cucumber salad and warm pita; GF crackers when filtered.", emoji: "🥙" },
    regionHints: ["levantine", "greek", "turkish", "syrian", "israeli", "yemeni"],
    build: (gf, _df, servings) => ({
      side: gf ? "hummus with gluten-free crackers" : "hummus with pita",
      vegetables: "tomato & cucumber",
      ingredients: [
        ingredient("hummus", "Ready hummus", 300, "g", "grocery", ["sesame"], "Check the label for sesame and gluten.", ["hummus", "houmous"]),
        gf
          ? ingredient("gf-crackers", "Gluten-free crackers", 120, "g", "grocery", [], "Labelled gluten-free.", ["gluten free crackers"])
          : ingredient("pita", "Pita bread", 4, "", "grocery", ["wheat"], "Warm before serving.", ["pita", "pitta"]),
        ingredient("tomato", "Tomatoes", 250, "g", "produce", [], "Chopped.", ["tomatoes"]),
        ingredient("cucumber", "Cucumber", 200, "g", "produce", [], "Chopped."),
        oil(1),
        { ...lemon, amount: 20 },
      ],
      steps: [
        step("Plate the hummus", `Spoon ${amount(300, servings)} g ready hummus onto a plate. Check the packet for sesame and other allergens.`, 2),
        step("Salad and bread", `Toss ${amount(250, servings)} g chopped tomatoes and ${amount(200, servings)} g chopped cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil. Warm or serve ${gf ? `${amount(120, servings)} g gluten-free crackers` : `${amount(4, servings)} pita breads`} beside the hummus.`, 6),
      ],
      equipment: ["Mixing bowl"],
      minutes: 8,
    }),
  },
  {
    option: { id: "polenta-greens", name: "Soft polenta & greens", description: "Soft corn polenta with wilted greens. Naturally wheat-free; check the packet.", emoji: "🌽" },
    regionHints: ["italian", "brazilian", "argentine", "portuguese", "cajun", "creole"],
    build: (_gf, df, servings) => {
      const dairy = !df;
      return {
        side: dairy ? "soft polenta with butter" : "soft olive-oil polenta",
        vegetables: "wilted silverbeet",
        ingredients: [
          ingredient("polenta", "Instant polenta", 250, "g", "grocery", [], "Dry weight; check the packet for wheat cross-contact.", ["polenta", "cornmeal"]),
          ingredient("silverbeet", "Silverbeet or chard", 400, "g", "produce", [], "Stems sliced, leaves torn.", ["silverbeet", "chard", "swiss chard"]),
          ...(dairy ? [ingredient("butter", "Butter", 30, "g", "grocery", ["milk"], undefined, ["butter"])] : [oil(2)]),
        ],
        steps: [
          step("Cook the polenta", dairy
            ? `Whisk ${amount(250, servings)} g instant polenta into boiling water as the packet directs (usually about ${amount(1000, servings)} ml). Stir until thick, then beat in ${amount(30, servings)} g butter.`
            : `Whisk ${amount(250, servings)} g instant polenta into ${amount(1000, servings)} ml boiling water, or the packet's quantity for soft polenta. Stir for the packet's cooking time until creamy, adding a little boiling water if it becomes too stiff, then beat in ${amount(2, servings)} tbsp olive oil. No butter is used.`, 12),
          step("Wilt the greens", `Sauté ${amount(400, servings)} g silverbeet in a splash of water until the stems are tender and the leaves wilt, about 5–7 minutes.`, 7),
        ],
        equipment: ["Saucepan", "Frying pan"],
        minutes: 18,
      };
    },
  },
  {
    option: { id: "chips-salad", name: "Oven chips & salad", description: "Oven potato chips with a simple green salad.", emoji: "🍟" },
    regionHints: ["home-kitchen", "australian", "cajun", "creole", "caribbean", "jamaican", "british"],
    build: (_gf, _df, servings) => ({
      side: "oven potato chips", vegetables: "green salad",
      ingredients: [ingredient("potatoes", "Potatoes", 900, "g", "produce", [], "Cut into chip-sized batons."), ingredient("lettuce", "Mixed salad leaves", 200, "g", "produce", [], "Washed.", ["lettuce", "salad leaves"]), oil(3), { ...lemon, amount: 20 }],
      steps: [step("Bake the chips", `Toss ${amount(900, servings)} g potatoes (cut into chip-sized batons) with ${amount(2, servings)} tbsp olive oil. Spread on a tray and bake at 220°C for 30–35 minutes, turning once, until golden. Cook in batches if crowded.`, 35), step("Dress the leaves", `Toss ${amount(200, servings)} g mixed salad leaves with ${amount(20, servings)} ml lemon juice and the remaining ${amount(1, servings)} tbsp olive oil just before serving.`, 3)],
      equipment: ["Oven tray", "Mixing bowl"], minutes: 36,
    }),
  },
  {
    option: { id: "coleslaw-corn", name: "Coleslaw & corn", description: "Cabbage–carrot coleslaw with boiled or steamed corn cob pieces.", emoji: "🌽" },
    regionHints: ["home-kitchen", "australian", "mexican", "oaxacan", "yucatecan", "cuban", "cajun", "creole", "caribbean", "brazilian"],
    build: (_gf, _df, servings) => ({
      side: "corn on the cob", vegetables: "cabbage & carrot coleslaw",
      ingredients: [ingredient("corn", "Corn cobs", 4, "", "produce", [], "Husks removed; cut into pieces if large.", ["corn", "sweetcorn"]), ingredient("cabbage", "Cabbage", 300, "g", "produce", [], "Finely shredded."), ingredient("carrot", "Carrot", 200, "g", "produce", [], "Grated."), oil(2), lemon],
      steps: [step("Cook the corn", `Boil or steam ${amount(4, servings)} corn cobs for 8–10 minutes until tender. Drain and keep warm.`, 10), step("Make the coleslaw", `Toss ${amount(300, servings)} g shredded cabbage and ${amount(200, servings)} g grated carrot with ${amount(30, servings)} ml lemon juice and ${amount(2, servings)} tbsp olive oil.`, 5)],
      equipment: ["Saucepan", "Mixing bowl"], minutes: 12,
    }),
  },
  {
    option: { id: "roast-veg-tray", name: "Roast vegetable tray", description: "Mixed roast veg: potato, carrot and capsicum.", emoji: "🥕" },
    regionHints: ["home-kitchen", "australian", "moroccan", "greek", "italian", "spanish", "french", "nordic"],
    build: (_gf, _df, servings) => ({
      side: "roast vegetables", vegetables: "potato, carrot & capsicum",
      ingredients: [ingredient("potatoes", "Potatoes", 500, "g", "produce", [], "Cut into 2 cm chunks."), ingredient("carrot", "Carrots", 300, "g", "produce", [], "Cut into chunks."), ingredient("pepper", "Capsicum", 300, "g", "produce", [], "Deseeded and chunked.", ["capsicum", "pepper"]), oil(3), { ...lemon, amount: 20 }],
      steps: [step("Roast the tray", `Toss ${amount(500, servings)} g potatoes (cut into 2 cm chunks), ${amount(300, servings)} g carrot and ${amount(300, servings)} g capsicum with ${amount(3, servings)} tbsp olive oil. Roast at 200°C for 35–40 minutes until browned and tender.`, 40), step("Finish with lemon", `Squeeze ${amount(20, servings)} ml lemon juice over the hot vegetables just before serving.`, 1)],
      equipment: ["Oven tray"], minutes: 42,
    }),
  },
  {
    option: { id: "sweet-potato-mash", name: "Sweet potato mash", description: "Mashed sweet potato; dairy-free olive-oil mash when filtered. Steamed beans.", emoji: "🍠" },
    regionHints: ["home-kitchen", "australian", "caribbean", "jamaican", "west-african", "brazilian", "creole", "southern"],
    build: (_gf, df, servings) => {
      const dairy = !df;
      return {
        side: dairy ? "buttery sweet potato mash" : "olive-oil sweet potato mash",
        vegetables: "steamed green beans",
        ingredients: [
          ingredient("side-sweet-potato", "Sweet potato for the side", 900, "g", "produce", [], "Peeled and chunked.", ["sweet potato", "kumara"]),
          ingredient("green-beans", "Green beans", 350, "g", "produce", [], "Trimmed.", ["green beans"]),
          ...(dairy ? [ingredient("butter", "Butter", 40, "g", "grocery", ["milk"], undefined, ["butter"])] : [oil(3)]),
        ],
        steps: [
          step("Mash the sweet potato", dairy
            ? `Boil ${amount(900, servings)} g sweet potato for the side (peeled and chunked) until soft, about 15–18 minutes. Drain and mash with ${amount(40, servings)} g butter.`
            : `Boil ${amount(900, servings)} g sweet potato for the side (peeled and chunked) until soft, about 15–18 minutes. Drain and mash with ${amount(3, servings)} tbsp olive oil. No butter is used.`, 20),
          step("Steam the beans", `Steam ${amount(350, servings)} g green beans for 5–7 minutes until tender with a little bite.`, 7),
        ],
        equipment: ["Saucepan", "Steamer", "Potato masher"],
        minutes: 22,
      };
    },
  },
  {
    option: { id: "black-bean-rice", name: "Black beans & rice", description: "Steamed rice with warmed canned black beans and lime.", emoji: "🫘" },
    regionHints: ["mexican", "oaxacan", "yucatecan", "cuban", "brazilian", "caribbean", "puerto-rican", "creole", "cajun"],
    build: (_gf, _df, servings) => ({
      side: "rice and black beans", vegetables: "lime finish",
      ingredients: [ingredient("rice", "Long-grain rice", 280, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("black-beans", "Canned black beans, drained", 400, "g", "grocery", [], "Already cooked; drained weight.", ["black beans"]), { ...lime, amount: 20 }, oil(1)],
      steps: [step("Cook the rice", `Rinse ${amount(280, servings)} g long-grain rice. Cook with ${amount(560, servings)} ml water as the packet directs. Rest and fluff.`, 18), step("Warm the beans", `Warm ${amount(400, servings)} g drained canned black beans with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lime juice for 3–4 minutes until steaming hot. Do not use dried beans in a short cook.`, 5)],
      equipment: ["Saucepan with lid"], minutes: 20,
    }),
  },
  {
    option: { id: "tortilla-salsa", name: "Tortillas & salsa", description: "Warm tortillas with fresh tomato salsa; corn tortillas preferred when gluten-free.", emoji: "🌮" },
    regionHints: ["mexican", "oaxacan", "yucatecan", "cuban", "puerto-rican", "tex-mex"],
    build: (gf, _df, servings) => ({
      side: gf ? "corn tortillas" : "flour or corn tortillas",
      vegetables: "fresh tomato salsa",
      ingredients: [
        ingredient("tortillas", gf ? "Corn tortillas" : "Soft tortillas", 8, "", "grocery", gf ? [] : ["wheat"], gf ? "Choose labelled corn tortillas without wheat." : "Flour tortillas usually contain wheat; corn tortillas are often wheat-free — check the packet.", gf ? ["corn tortillas"] : ["tortillas", "flour tortillas"]),
        ingredient("tomato", "Tomatoes", 350, "g", "produce", [], "Finely diced.", ["tomatoes"]),
        ingredient("side-onion", "Onion for the side", 80, "g", "produce", [], "Finely diced for the salsa.", ["onion"]),
        ingredient("side-coriander", "Coriander leaves for the side", 20, "g", "produce", [], "Chopped for the salsa.", ["coriander", "cilantro"]),
        lime,
      ],
      steps: [
        step("Make the salsa", `Combine ${amount(350, servings)} g diced tomatoes, ${amount(80, servings)} g onion for the side and ${amount(20, servings)} g coriander leaves for the side. Dress with ${amount(30, servings)} ml lime juice.`, 6),
        step("Warm the tortillas", `Warm ${amount(8, servings)} ${gf ? "corn" : "soft"} tortillas in a dry pan or as the packet directs. Keep wrapped.`, 4),
      ],
      equipment: ["Mixing bowl", "Frying pan"],
      minutes: 10,
    }),
  },
  {
    option: { id: "quinoa-avocado", name: "Quinoa & avocado", description: "Fluffy quinoa with avocado and lemon. Naturally wheat-free.", emoji: "🥑" },
    regionHints: ["home-kitchen", "peruvian", "chilean", "mexican", "brazilian", "australian", "california"],
    build: (_gf, _df, servings) => ({
      side: "quinoa", vegetables: "avocado & lemon",
      ingredients: [ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight."), ingredient("avocado", "Avocado", 2, "", "produce", [], "Ripe; sliced just before serving.", ["avocado"]), oil(1), { ...lemon, amount: 20 }],
      steps: [step("Cook the quinoa", `Rinse ${amount(280, servings)} g quinoa. Simmer covered with ${amount(560, servings)} ml water for about 15 minutes. Rest and fluff.`, 20), step("Add avocado", `Slice ${amount(2, servings)} avocados. Dress the quinoa with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil, then top with avocado.`, 4)],
      equipment: ["Saucepan with lid"], minutes: 22,
    }),
  },
  {
    option: { id: "vermicelli-herb", name: "Rice vermicelli & herbs", description: "Rice vermicelli with mint, cucumber and lime.", emoji: "🇻🇳" },
    regionHints: ["vietnamese", "lao", "cambodian", "thai", "isaan", "burmese"],
    build: (_gf, _df, servings) => ({
      side: "rice vermicelli", vegetables: "mint, cucumber & lime",
      ingredients: [ingredient("rice-vermicelli", "Rice vermicelli", 280, "g", "grocery", [], "Dry weight; usually wheat-free — check the packet.", ["rice vermicelli", "rice noodles"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], "Julienned."),         ingredient("side-mint", "Fresh mint for the side", 25, "g", "produce", [], "Leaves for the side.", ["mint"]), lime, oil(1)],
      steps: [step("Soak the vermicelli", `Prepare ${amount(280, servings)} g rice vermicelli as the packet directs (often a hot soak). Drain well and toss with ${amount(1, servings)} tbsp olive oil.`, 10), step("Herb salad", `Toss with ${amount(250, servings)} g julienned cucumber, ${amount(25, servings)} g fresh mint for the side and ${amount(30, servings)} ml lime juice.`, 4)],
      equipment: ["Bowl", "Colander"], minutes: 12,
    }),
  },
  {
    option: { id: "sesame-spinach", name: "Sesame spinach & rice", description: "Steamed rice with spinach dressed in toasted sesame oil (sesame allergen).", emoji: "🥬" },
    regionHints: ["japanese", "korean", "chinese", "taiwanese", "cantonese"],
    build: (_gf, _df, servings) => ({
      side: "steamed rice", vegetables: "sesame spinach",
      ingredients: [
        ingredient("rice", "Short-grain or long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]),
        ingredient("spinach", "Baby spinach", 300, "g", "produce", [], "Washed."),
        ingredient("sesame-oil", "Toasted sesame oil", 1, "tbsp", "grocery", ["sesame"], "Finish only.", ["sesame oil", "toasted sesame oil"]),
        ingredient("sesame-seeds", "Toasted sesame seeds", 1, "tbsp", "grocery", ["sesame"], undefined, ["sesame seeds"]),
      ],
      steps: [
        step("Cook the rice", `Cook ${amount(300, servings)} g rice as the packet directs. Rest and fluff.`, 18),
        step("Dress the spinach", `Wilt ${amount(300, servings)} g spinach in a hot pan with a splash of water. Drain well, then toss with ${amount(1, servings)} tbsp toasted sesame oil and ${amount(1, servings)} tbsp toasted sesame seeds. Sesame is a recorded allergen on this side.`, 5),
      ],
      equipment: ["Saucepan with lid", "Frying pan"],
      minutes: 20,
    }),
  },
  {
    option: { id: "injera-salad", name: "Injera & salad", description: "Ready teff injera (check packet) with tomato–cucumber salad; GF flatbread fallback.", emoji: "🇪🇹" },
    regionHints: ["ethiopian", "somali", "yemeni", "eritrea"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free flatbread" : "teff injera",
      vegetables: "tomato & cucumber salad",
      ingredients: [
        ingredient("injera", gf ? "Gluten-free flatbread" : "100% teff injera", 4, "", "grocery", [], gf ? "Labelled gluten-free." : "Many injera mixes include wheat or barley. Choose a packet labelled 100% teff injera.", gf ? ["gluten free flatbread"] : ["100% teff injera"]),
        ingredient("tomato", "Tomatoes", 300, "g", "produce", [], "Chopped.", ["tomatoes"]),
        ingredient("cucumber", "Cucumber", 250, "g", "produce", [], "Chopped."),
        { ...lemon, amount: 25 },
        oil(1),
      ],
      steps: [
        step("Make the salad", `Combine ${amount(300, servings)} g chopped tomatoes and ${amount(250, servings)} g chopped cucumber. Dress with ${amount(25, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 5),
        step("Warm the bread", `Warm ${amount(4, servings)} ${gf ? "gluten-free flatbreads" : "pieces of 100% teff injera"} briefly as the packet directs. Many injera mixes include wheat or barley; check the packet before serving.`, 3),
      ],
      equipment: ["Mixing bowl"],
      minutes: 8,
    }),
  },
  {
    option: { id: "cauli-rice-greens", name: "Cauliflower rice & greens", description: "Pan-fried cauliflower rice with steamed beans. Wheat-free.", emoji: "🥦" },
    regionHints: ["home-kitchen", "australian", "keto-friendly", "mexican", "indian"],
    build: (_gf, _df, servings) => ({
      side: "cauliflower rice", vegetables: "steamed green beans",
      ingredients: [ingredient("cauliflower", "Cauliflower", 700, "g", "produce", [], "Grated or riced.", ["cauliflower"]), ingredient("green-beans", "Green beans", 350, "g", "produce", [], "Trimmed.", ["green beans"]), oil(2), { ...lemon, amount: 15 }],
      steps: [step("Pan-fry cauliflower rice", `Grate or pulse ${amount(700, servings)} g cauliflower to rice-sized pieces. Stir-fry in ${amount(2, servings)} tbsp olive oil over medium-high heat for 6–8 minutes until tender with light colour. Finish with ${amount(15, servings)} ml lemon juice.`, 10), step("Steam the beans", `Steam ${amount(350, servings)} g green beans for 5–7 minutes until tender with a little bite.`, 7)],
      equipment: ["Wide frying pan", "Steamer"], minutes: 14,
    }),
  },
  {
    option: { id: "orzo-salad", name: "Orzo salad", description: "Lemon orzo (wheat) with tomato and herbs; GF short pasta when filtered.", emoji: "🍝" },
    regionHints: ["greek", "italian", "turkish", "levantine", "portuguese"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free short pasta salad" : "orzo salad",
      vegetables: "tomato & herbs",
      ingredients: [
        gf
          ? ingredient("gf-pasta", "Gluten-free short pasta", 280, "g", "grocery", [], "Dry weight; labelled gluten-free.", ["gluten free pasta"])
          : ingredient("orzo", "Orzo pasta", 280, "g", "grocery", ["wheat"], "Dry weight.", ["orzo", "risoni"]),
        ingredient("tomato", "Cherry tomatoes", 300, "g", "produce", [], "Halved.", ["tomatoes", "cherry tomatoes"]),
        ingredient("side-parsley", "Parsley for the side", 30, "g", "produce", [], "Chopped for the side salad.", ["parsley"]),
        oil(2),
        lemon,
      ],
      steps: [
        step("Cook the pasta", `Cook ${amount(280, servings)} g ${gf ? "gluten-free short pasta" : "orzo"} in boiling water as the packet directs. Drain and cool slightly.`, 12),
        step("Dress the salad", `Toss with ${amount(300, servings)} g halved cherry tomatoes, ${amount(30, servings)} g chopped parsley for the side, ${amount(30, servings)} ml lemon juice and ${amount(2, servings)} tbsp olive oil.`, 4),
      ],
      equipment: ["Saucepan", "Colander", "Mixing bowl"],
      minutes: 16,
    }),
  },
  {
    option: { id: "plantain-greens", name: "Roast plantain & greens", description: "Ripe plantain or firm banana roasted with wilted greens — Caribbean / West African style.", emoji: "🍌" },
    regionHints: ["caribbean", "jamaican", "west-african", "brazilian", "cuban", "puerto-rican", "mozambican", "somali"],
    build: (_gf, _df, servings) => ({
      side: "roast plantain", vegetables: "wilted greens",
      ingredients: [ingredient("plantain", "Ripe plantain", 800, "g", "produce", [], "Peeled and sliced on the diagonal. Firm banana is a last resort if plantain is unavailable.", ["plantain", "cooking banana"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], "Washed."), oil(2), { ...lime, amount: 15 }],
      steps: [step("Roast the plantain", `Toss ${amount(800, servings)} g sliced plantain with ${amount(2, servings)} tbsp olive oil. Roast at 200°C for 20–25 minutes until caramelised at the edges.`, 25), step("Wilt the greens", `Wilt ${amount(200, servings)} g spinach in a hot pan. Finish with ${amount(15, servings)} ml lime juice.`, 3)],
      equipment: ["Oven tray", "Frying pan"], minutes: 26,
    }),
  },
  {
    option: { id: "focaccia-salad", name: "Focaccia & salad", description: "Warm focaccia (wheat) with rocket and tomato; GF bread when filtered.", emoji: "🥖" },
    regionHints: ["italian", "french", "spanish", "portuguese", "australian"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free bread" : "focaccia",
      vegetables: "rocket & tomato",
      ingredients: [
        ingredient("focaccia", gf ? "Gluten-free bread" : "Focaccia", 400, "g", "grocery", gf ? [] : ["wheat"], gf ? "Labelled gluten-free." : "Wheat bakery product; check for sesame and dairy.", gf ? ["gluten free bread"] : ["focaccia"]),
        ingredient("rocket", "Rocket", 120, "g", "produce", [], "Washed.", ["rocket", "arugula"]),
        ingredient("tomato", "Tomatoes", 300, "g", "produce", [], "Sliced.", ["tomatoes"]),
        oil(1),
        { ...lemon, amount: 20 },
      ],
      steps: [
        step("Warm the bread", `Warm ${amount(400, servings)} g ${gf ? "gluten-free bread" : "focaccia"} in a moderate oven for 5–8 minutes as the packet directs.`, 8),
        step("Dress the salad", `Toss ${amount(120, servings)} g rocket and ${amount(300, servings)} g sliced tomatoes with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 3),
      ],
      equipment: ["Oven", "Mixing bowl"],
      minutes: 10,
    }),
  },
  {
    option: { id: "sticky-rice-greens", name: "Sticky rice & greens", description: "Sticky rice with steamed bok choy.", emoji: "🍚" },
    regionHints: ["chinese","cantonese","sichuan","hunan","taiwanese","shanghainese","yunnan","xinjiang","japanese","japanese-curry","korean","filipino","malaysian","indonesian","peranakan","balinese","maluku","burmese","thai","thai-green","thai-massaman","thai-panang","thai-yellow","isaan","vietnamese","lao","cambodian"],
    build: (_gf, _df, servings) => ({
      side: "sticky rice",
      vegetables: "steamed bok choy",
      ingredients: [ingredient("sticky-rice", "Sticky rice", 320, "g", "grocery", [], "Dry weight; soak as the packet directs.", ["sticky rice","glutinous rice"]), ingredient("bok-choy", "Bok choy", 400, "g", "produce", [], "Halved lengthwise.", ["bok choy","pak choy"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Steam the soaked sticky rice", `Before this cooking window, rinse ${amount(320, servings)} g dry glutinous sticky rice and soak in plenty of cold water for the packet's stated time; allow about 6 hours for a long-soak product. Drain the soaked rice well. Spread in a cloth-lined steamer above simmering water, keeping the rice out of the water. Steam covered for 20–30 minutes or as the packet directs, turning once if needed, until the grains are translucent and tender without a hard centre.`, 30), step("Steam the bok choy", `During the rice's final 5 minutes, steam ${amount(400, servings)} g bok choy for 3–5 minutes. Dress with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lime juice.`, 5)],
      equipment: ["Steamer with food-safe cloth","Saucepan","Soaking bowl","Colander"],
      prepMinutes: 360,
      prepNote: "Allow the sticky-rice packet's soaking time before the cooking window; 6 hours is an advance-preparation estimate, not a second cooking time. Do not steam unsoaked dry rice using the short timing.",
      minutes: 28,
    }),
  },
  {
    option: { id: "spring-onion-fried-rice", name: "Spring onion fried rice", description: "Egg-free fried rice with spring onion — weeknight Asian side.", emoji: "🍚" },
    regionHints: ["chinese","cantonese","sichuan","hunan","taiwanese","shanghainese","yunnan","xinjiang","japanese","japanese-curry","korean","filipino","malaysian","indonesian","peranakan","balinese","maluku","burmese","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "spring onion fried rice",
      vegetables: "spring onion",
      ingredients: [ingredient("side-cooked-rice", "Cooked long-grain rice", 600, "g", "grocery", [], "Cooked weight, not dry rice. Use a ready-cooked packet as directed, freshly cooked rice straightaway, or leftovers cooled and refrigerated promptly; never rice left on the bench.", ["cooked long grain rice","cooked rice"]), ingredient("spring-onion", "Spring onion", 60, "g", "produce", [], "Sliced.", ["spring onion","green onion"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Fry the cooked rice", `Use ${amount(600, servings)} g already-cooked long-grain rice (cooked weight); dry rice cannot be substituted into this short step. Heat ${amount(2, servings)} tbsp olive oil in a wide pan. Stir-fry the rice for 6–8 minutes until steaming hot throughout, breaking up clumps. Use batches if crowded. Follow a ready-cooked packet's reheating directions; do not use rice that has stood at room temperature.`, 8), step("Add spring onion", `Toss through ${amount(60, servings)} g washed, finely sliced spring onion and serve promptly.`, 2)],
      safetyNote: "Use cooked rice that was kept safely hot or cooled and refrigerated promptly. Reheat until steaming hot throughout and serve promptly; do not leave cooked rice on the bench.",
      safetySource: "https://www.foodauthority.nsw.gov.au/consumer/food-extra-care/leftovers",
      equipment: ["Wide frying pan"],
      minutes: 16,
    }),
  },
  {
    option: { id: "miso-aubergine-rice", name: "Miso aubergine & rice", description: "Steamed rice with miso-glazed aubergine.", emoji: "🍆" },
    regionHints: ["japanese", "japanese-curry"],
    build: (gf, _df, servings) => ({
      side: "steamed rice",
      vegetables: "miso aubergine",
      ingredients: [ingredient("rice", "Short-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("side-aubergine", "Aubergine for the side", 500, "g", "produce", [], "Sliced into 1.5 cm rounds.", ["aubergine","eggplant"]), ingredient("white-miso", gf ? "Gluten-free white rice miso" : "White miso", 2, "tbsp", "grocery", ["soy"], "Choose vegan miso; gluten-free meals require an explicitly labelled gluten-free rice miso. It still contains soy.", gf ? ["gluten-free white rice miso"] : ["miso","white miso"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g short-grain rice using its packet's water ratio and resting time. Start it while the aubergine roasts so both finish together.`, 20), step("Roast, then glaze the aubergine", `Toss ${amount(500, servings)} g aubergine for the side with ${amount(2, servings)} tbsp olive oil. Roast at 200°C for 20–25 minutes, turning once, until soft through the centre. Mix ${amount(2, servings)} tbsp ${gf ? "gluten-free white rice miso" : "white miso"} with ${amount(30, servings)} ml water. Brush this measured glaze onto the cooked aubergine and return to the oven for only 3–5 minutes, watching closely; the glaze should set without blackening. Do not roast the miso coating for the full cooking time.`, 30)],
      equipment: ["Saucepan with lid","Oven tray"],
      minutes: 30,
    }),
  },
  {
    option: { id: "soba-greens", name: "Soba & greens", description: "Buckwheat soba with wilted greens; rice noodles when gluten-free.", emoji: "🍜" },
    regionHints: ["japanese", "japanese-curry"],
    build: (gf, _df, servings) => ({
      side: gf ? "rice noodles" : "soba noodles",
      vegetables: "wilted greens",
      ingredients: [gf ? ingredient("rice-noodles", "Rice noodles", 280, "g", "grocery", [], "Labelled gluten-free rice noodles.", ["rice noodles"]) : ingredient("soba", "Soba noodles", 280, "g", "grocery", ["wheat"], "Many soba blends contain wheat — check the packet.", ["soba"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the noodles", `Cook ${amount(280, servings)} g ${gf ? "rice noodles" : "soba noodles"} as the packet directs. Drain well.`, 10), step("Wilt the greens", `During the noodles' final minutes, put ${amount(200, servings)} g washed baby spinach in a frying pan with a spoonful of water. Cook over medium heat for 2–3 minutes until wilted, then drain excess liquid. Take off the heat and toss with the drained noodles, ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lime juice.`, 4)],
      equipment: ["Saucepan","Colander"],
      minutes: 16,
    }),
  },
  {
    option: { id: "pickle-cucumber-rice", name: "Quick pickle cucumber & rice", description: "Steamed rice with lemon-dressed cucumber.", emoji: "🥒" },
    regionHints: ["chinese","cantonese","sichuan","hunan","taiwanese","shanghainese","yunnan","xinjiang","japanese","japanese-curry","korean","filipino","malaysian","indonesian","peranakan","balinese","maluku","burmese","thai","thai-green","thai-massaman","thai-panang","thai-yellow","isaan","vietnamese","lao","cambodian","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "steamed rice",
      vegetables: "quick pickle cucumber",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("cucumber", "Cucumber", 300, "g", "produce", [], "Thinly sliced."), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g dry long-grain rice using its packet's measured water and resting time. While it cooks, prepare the cucumber.`, 22), step("Quick-pickle the cucumber while rice cooks", `Toss ${amount(300, servings)} g thinly sliced cucumber with ${amount(20, servings)} ml lemon juice and leave chilled for 10–15 minutes while the rice cooks. This marinating window starts early, rather than after the main is ready. This is a fresh lemon-marinated side for immediate service, not a preserved pickle.`, 15), step("Finish the cucumber", `Toss the already-marinated cucumber with ${amount(1, servings)} tbsp olive oil just before serving. Keep it cool and serve beside the hot rice.`, 2)],
      equipment: ["Saucepan with lid","Mixing bowl"],
      minutes: 22,
    }),
  },
  {
    option: { id: "pandan-rice-beans", name: "Pandan rice & beans", description: "Pandan-scented rice with steamed green beans.", emoji: "🍃" },
    regionHints: ["malaysian","indonesian","peranakan","balinese","maluku","filipino"],
    build: (_gf, _df, servings) => ({
      side: "pandan rice",
      vegetables: "steamed green beans",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("side-pandan", "Pandan leaf for the rice", 1, "", "specialty", [], "Fresh or frozen food-grade leaf; wash, knot and remove after cooking. Not pandan extract.", ["pandan leaf"]), ingredient("green-beans", "Green beans", 350, "g", "produce", [], "Trimmed.", ["green beans"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the pandan rice", `Rinse ${amount(300, servings)} g dry long-grain rice. Wash and loosely knot the ${amount(1, servings)} pandan leaf portion for the rice. Add it to the rice pot with the packet's measured water quantity. Cook and rest covered as the packet directs, then lift out and discard the whole pandan leaf before fluffing. Do not eat the leaf.`, 22), step("Steam the beans", `During the rice's final 7 minutes, steam ${amount(350, servings)} g green beans for 5–7 minutes. Finish with ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lime juice.`, 7)],
      equipment: ["Saucepan with lid","Steamer"],
      minutes: 24,
    }),
  },
  {
    option: { id: "banana-leaf-rice", name: "Banana-leaf style rice", description: "Coconut rice finished with lime; beans on the side.", emoji: "🍌" },
    regionHints: ["malaysian","indonesian","peranakan","balinese","thai","goan","sri-lankan"],
    build: (_gf, _df, servings) => ({
      side: "coconut rice",
      vegetables: "lime & green beans",
      ingredients: [ingredient("rice", "Jasmine rice", 300, "g", "grocery", [], "Dry weight.", ["rice","jasmine rice"]), ingredient("coconut-milk", "Coconut milk", 200, "ml", "grocery", [], "Stir before measuring.", ["coconut milk"]), ingredient("side-banana-leaf", "Food-grade banana leaf for the rice", 1, "", "specialty", [], "A large fresh or frozen leaf sold for food wrapping. Thaw as directed, rinse and wipe clean; it is a wrapper, not an edible vegetable.", ["food-grade banana leaf"]), ingredient("green-beans", "Green beans", 300, "g", "produce", [], "Trimmed.", ["green beans"]), ingredient("lime-juice", "Lime juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the coconut rice", `Rinse ${amount(300, servings)} g dry jasmine rice. Cook with ${amount(200, servings)} ml coconut milk and ${amount(280, servings)} ml water over low heat, covered, until tender and absorbed, or follow the packet's coconut-rice ratio. Rest covered and fluff; do not add a full second water allowance on top of the coconut milk.`, 22), step("Warm in the banana leaf", `Prepare the ${amount(1, servings)} food-grade banana leaf portion as its packet directs, thawing if frozen. Rinse and wipe clean. Line a heatproof bowl with the leaf, spoon in the already-cooked hot coconut rice, fold the leaf over loosely and steam for 5 minutes to warm and scent the rice. Remove all leaf pieces before eating; do not use an ornamental garden leaf or serve the leaf as food.`, 6), step("Steam the beans", `Steam ${amount(300, servings)} g green beans for 5–7 minutes while the rice finishes. Take off the heat and finish with ${amount(15, servings)} ml lime juice.`, 7)],
      equipment: ["Saucepan with lid","Steamer","Heatproof bowl"],
      minutes: 32,
    }),
  },
  {
    option: { id: "papaya-salad-side", name: "Green papaya salad side", description: "Shredded green papaya with lime and tomato.", emoji: "🥗" },
    regionHints: ["isaan","lao","thai","thai-green","cambodian","vietnamese"],
    build: (_gf, _df, servings) => ({
      side: "green papaya salad",
      vegetables: "tomato & lime",
      ingredients: [ingredient("green-papaya", "Green papaya", 400, "g", "produce", [], "Peeled and shredded. Green mango is a last resort.", ["green papaya","papaya"]), ingredient("tomato", "Tomatoes", 150, "g", "produce", [], "Wedge-cut.", ["tomatoes"]), ingredient("side-coriander", "Coriander leaves for the side", 15, "g", "produce", [], "Leaves for the salad.", ["coriander"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Build the salad", `Combine ${amount(400, servings)} g green papaya, ${amount(150, servings)} g tomatoes and ${amount(15, servings)} g coriander leaves for the side.`, 6), step("Dress", `Toss with ${amount(30, servings)} ml lime juice and ${amount(1, servings)} tbsp olive oil.`, 2)],
      equipment: ["Mixing bowl"],
      minutes: 12,
    }),
  },
  {
    option: { id: "lemongrass-rice", name: "Lemongrass rice & cucumber", description: "Rice simmered with lemongrass; cucumber salad.", emoji: "🌿" },
    regionHints: ["thai","thai-green","thai-massaman","thai-panang","thai-yellow","isaan","vietnamese","lao","cambodian","malaysian","indonesian","cambodian","lao"],
    build: (_gf, _df, servings) => ({
      side: "lemongrass rice",
      vegetables: "cucumber salad",
      ingredients: [ingredient("rice", "Jasmine rice", 300, "g", "grocery", [], "Dry weight.", ["rice","jasmine rice"]), ingredient("side-lemongrass", "Lemongrass stalk for the rice", 1, "", "produce", [], "Trim, bruise and keep in large retrievable pieces. Remove before serving.", ["lemongrass stalk"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the lemongrass rice", `Rinse ${amount(300, servings)} g dry jasmine rice. Trim and bruise the ${amount(1, servings)} lemongrass stalk portion; leave large pieces that are easy to retrieve. Add to the rice with the packet's measured water quantity, then cook and rest covered as directed. Lift out and discard all woody lemongrass pieces before fluffing.`, 22), step("Dress the cucumber", `Toss ${amount(250, servings)} g thinly sliced cucumber with ${amount(20, servings)} ml lime juice and ${amount(1, servings)} tbsp olive oil just before serving.`, 3)],
      equipment: ["Saucepan with lid","Mixing bowl"],
      minutes: 24,
    }),
  },
  {
    option: { id: "gai-lan-rice", name: "Gai lan & rice", description: "Steamed rice with sautéed gai lan (Chinese broccoli).", emoji: "🥦" },
    regionHints: ["cantonese","chinese","malaysian","australian","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "steamed rice",
      vegetables: "gai lan",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("gai-lan", "Gai lan", 400, "g", "produce", [], "Stems sliced, leaves kept whole.", ["gai lan","chinese broccoli"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g long-grain rice as the packet directs. Rest and fluff.`, 18), step("Sauté the gai lan", `Stir-fry ${amount(400, servings)} g gai lan in ${amount(2, servings)} tbsp olive oil for 4–6 minutes until stems are tender-crisp.`, 6)],
      equipment: ["Saucepan with lid","Wide frying pan"],
      minutes: 22,
    }),
  },
  {
    option: { id: "asian-slaw-noodles", name: "Asian slaw & noodles", description: "Rice noodles with cabbage–carrot slaw.", emoji: "🍜" },
    regionHints: ["thai","thai-green","thai-massaman","thai-panang","thai-yellow","isaan","vietnamese","lao","cambodian","chinese","cantonese","sichuan","hunan","taiwanese","shanghainese","yunnan","xinjiang","japanese","japanese-curry","korean","filipino","malaysian","indonesian","peranakan","balinese","maluku","burmese","australian","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "rice noodles",
      vegetables: "cabbage & carrot slaw",
      ingredients: [ingredient("rice-noodles", "Rice noodles", 280, "g", "grocery", [], "Dry weight; usually wheat-free — check the packet.", ["rice noodles"]), ingredient("cabbage", "Cabbage", 250, "g", "produce", [], undefined), ingredient("carrot", "Carrot", 150, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the noodles", `Prepare ${amount(280, servings)} g rice noodles as the packet directs. Drain well.`, 8), step("Make the slaw", `Toss with ${amount(250, servings)} g cabbage, ${amount(150, servings)} g carrot, ${amount(2, servings)} tbsp olive oil and ${amount(30, servings)} ml lime juice.`, 5)],
      equipment: ["Saucepan","Mixing bowl"],
      minutes: 15,
    }),
  },
  {
    option: { id: "shanghainese-greens-rice", name: "Shanghainese greens & rice", description: "Steamed rice with soy-glazed greens; tamari when gluten-free.", emoji: "🥬" },
    regionHints: ["shanghainese","chinese","taiwanese","yunnan"],
    build: (gf, _df, servings) => ({
      side: gf ? "steamed rice" : "steamed rice",
      vegetables: "glazed greens",
      ingredients: [gf ? ingredient("tamari", "Gluten-free tamari", 1, "tbsp", "grocery", ["soy"], "Labelled gluten-free tamari.", ["tamari","gluten free tamari"]) : ingredient("soy-sauce", "Soy sauce", 1, "tbsp", "grocery", ["soy","wheat"], "Contains wheat unless labelled otherwise.", ["soy sauce"]), ingredient("rice", "Short-grain or long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("bok-choy", "Bok choy", 400, "g", "produce", [], undefined, ["bok choy"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g short-grain or long-grain rice as the packet directs. Rest and fluff.`, 18), step("Glaze the greens", `Stir-fry ${amount(400, servings)} g bok choy in ${amount(2, servings)} tbsp olive oil. Finish with ${amount(1, servings)} tbsp ${gf ? "gluten-free tamari" : "soy sauce"}.`, 5)],
      equipment: ["Saucepan with lid","Wide frying pan"],
      minutes: 22,
    }),
  },
  {
    option: { id: "yunnan-potato-salad", name: "Yunnan potato salad", description: "Boiled potato with coriander and lemon — Yunnan-inspired.", emoji: "🥔" },
    regionHints: ["yunnan","sichuan","hunan","chinese"],
    build: (_gf, _df, servings) => ({
      side: "potato salad",
      vegetables: "lemon coriander finish",
      ingredients: [ingredient("potatoes", "Potatoes", 800, "g", "produce", [], "Cut into bite-size chunks."), ingredient("side-coriander", "Coriander leaves for the side", 20, "g", "produce", [], undefined, ["coriander"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 25, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Boil the potatoes", `Boil ${amount(800, servings)} g potatoes until tender, about 15–18 minutes. Drain well.`, 18), step("Dress", `Toss with ${amount(20, servings)} g coriander leaves for the side, ${amount(2, servings)} tbsp olive oil and ${amount(25, servings)} ml lemon juice.`, 4)],
      equipment: ["Saucepan","Mixing bowl"],
      minutes: 25,
    }),
  },
  {
    option: { id: "jeera-rice-raita", name: "Jeera rice & raita", description: "Cumin-tempered basmati with yoghurt raita; mint cucumber when dairy-free.", emoji: "🍚" },
    regionHints: ["indian","indian-madras","indian-vindaloo","indian-korma","south-indian","goan","bengali","chettinad","hyderabadi","kashmiri","sri-lankan","nepali","pakistani","gujarati"],
    build: (_gf, df, servings) => {
      const dairy = !df;
      return {
        side: dairy ? "jeera rice" : "jeera rice",
        vegetables: dairy ? "yoghurt raita" : "mint cucumber salad",
        ingredients: [...(dairy ? [ingredient("yoghurt", "Plain yoghurt", 200, "g", "grocery", ["milk"], "Unsweetened.", ["yoghurt","yogurt"])] : [ingredient("side-mint", "Fresh mint for the side", 20, "g", "produce", [], undefined, ["mint"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"])]), ingredient("basmati", "Basmati rice", 300, "g", "grocery", [], "Dry weight.", ["basmati","basmati rice"]), ingredient("cumin-seeds", "Cumin seeds", 1, "tsp", "grocery", [], undefined, ["cumin"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("lemon-juice", "Lemon juice", dairy ? 15 : 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
        steps: [step("Cook the basmati", `Rinse ${amount(300, servings)} g basmati rice. Cook with ${amount(1, servings)} tsp cumin seeds as the packet directs. Rest and fluff.`, 18), step(dairy ? "Make the raita" : "Mint cucumber salad", dairy ? `Combine ${amount(200, servings)} g plain yoghurt with ${amount(250, servings)} g cucumber. Keep cold until serving. Finish with ${amount(15, servings)} ml lemon juice if you like.` : `Toss ${amount(250, servings)} g cucumber with ${amount(20, servings)} g fresh mint for the side, ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil. No yoghurt is used.`, dairy ? 5 : 5)],
        equipment: ["Saucepan with lid","Mixing bowl"],
        minutes: 25,
      };
    },
  },
  {
    option: { id: "paratha-salad", name: "Paratha & salad", description: "Warm paratha (wheat) with cucumber–tomato salad; GF flatbread when filtered.", emoji: "🫓" },
    regionHints: ["indian","pakistani","kashmiri","hyderabadi","nepali"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free flatbread" : "paratha",
      vegetables: "cucumber & tomato salad",
      ingredients: [gf ? ingredient("gf-flatbread", "Gluten-free flatbread", 4, "", "grocery", [], "Labelled gluten-free.", ["gluten free flatbread"]) : ingredient("paratha", "Paratha", 4, "", "grocery", ["wheat"], "Ready paratha; warm as the packet directs.", ["paratha"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Warm the bread", `Warm ${amount(4, servings)} ${gf ? "gluten-free flatbread" : "paratha"} as the packet directs.`, 5), step("Make the salad", `Toss ${amount(200, servings)} g cucumber and ${amount(200, servings)} g tomatoes with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 4)],
      equipment: ["Mixing bowl"],
      minutes: 12,
    }),
  },
  {
    option: { id: "idli-veg", name: "Idli & salad", description: "Ready idli (check packet) with cucumber and tomato.", emoji: "🍛" },
    regionHints: ["south-indian","chettinad","goan","sri-lankan"],
    build: (_gf, _df, servings) => ({
      side: "idli",
      vegetables: "cucumber & tomato",
      ingredients: [ingredient("idli", "Ready idli", 8, "", "grocery", [], "Steam as the packet directs; check for wheat.", ["idli"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Warm the idli", `Steam or warm ${amount(8, servings)} ready idli as the packet directs. Check the packet for wheat.`, 5), step("Make the salad", `Toss ${amount(200, servings)} g cucumber and ${amount(200, servings)} g tomatoes with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 4)],
      equipment: ["Mixing bowl","Steamer"],
      minutes: 10,
    }),
  },
  {
    option: { id: "khichdi-greens", name: "Khichdi-style rice & greens", description: "Soft rice–lentil khichdi with wilted spinach.", emoji: "🥣" },
    regionHints: ["indian","gujarati","bengali","nepali","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "rice and lentil khichdi",
      vegetables: "wilted spinach",
      ingredients: [ingredient("rice", "Long-grain rice", 200, "g", "grocery", [], undefined, ["rice"]), ingredient("red-lentils", "Red lentils", 100, "g", "grocery", [], "Rinsed; dry weight.", ["red lentils","masoor"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the khichdi", `Rinse ${amount(200, servings)} g long-grain rice and ${amount(100, servings)} g red lentils. Simmer together in plenty of water until soft, about 20–25 minutes. Drain any excess liquid.`, 25), step("Wilt the spinach", `Wilt ${amount(200, servings)} g baby spinach with ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lemon juice.`, 4)],
      equipment: ["Saucepan","Frying pan"],
      minutes: 30,
    }),
  },
  {
    option: { id: "pappadum-salad", name: "Pappadums & salad", description: "Ready pappadums with lemon salad; check packet for wheat.", emoji: "🍘" },
    regionHints: ["indian","indian-madras","indian-vindaloo","indian-korma","south-indian","goan","bengali","chettinad","hyderabadi","kashmiri","sri-lankan","nepali","pakistani","gujarati"],
    build: (_gf, _df, servings) => ({
      side: "pappadums",
      vegetables: "lemon salad",
      ingredients: [ingredient("pappadum", "Pappadums", 8, "", "grocery", [], "Microwave or grill as the packet directs; check for wheat.", ["pappadum","papad"]), ingredient("lettuce", "Mixed salad leaves", 150, "g", "produce", [], undefined, ["lettuce","salad leaves"]), ingredient("tomato", "Tomatoes", 150, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the pappadums", `Prepare ${amount(8, servings)} pappadums as the packet directs. Check the packet for wheat.`, 4), step("Dress the salad", `Toss ${amount(150, servings)} g mixed salad leaves and ${amount(150, servings)} g tomatoes with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 3)],
      equipment: ["Mixing bowl"],
      minutes: 8,
    }),
  },
  {
    option: { id: "biryani-style-rice", name: "Biryani-style rice & salad", description: "Spiced basmati with cucumber salad — template, not a full biryani.", emoji: "🍚" },
    regionHints: ["hyderabadi","indian","pakistani","sri-lankan","bengali"],
    build: (_gf, _df, servings) => ({
      side: "spiced basmati",
      vegetables: "cucumber salad",
      ingredients: [ingredient("basmati", "Basmati rice", 320, "g", "grocery", [], "Dry weight.", ["basmati"]), ingredient("side-cumin-seeds", "Cumin seeds for the rice", 0.5, "tsp", "grocery", [], "Whole seeds; not chilli.", ["cumin seeds"]), ingredient("side-cardamom", "Green cardamom pods for the rice", 2, "", "grocery", [], "Lightly crack; remove whole pods before serving.", ["green cardamom pods", "cardamom pod", "cardamom pods"]), ingredient("side-cinnamon", "Cinnamon stick for the rice", 1, "", "grocery", [], "One small stick for four servings; remove before serving.", ["cinnamon stick"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the gently spiced basmati", `Rinse ${amount(320, servings)} g dry basmati rice. Warm ${amount(0.5, servings)} tbsp of the olive oil over medium-low heat. Add ${amount(0.5, servings)} tsp cumin seeds, the ${amount(2, servings)} lightly cracked cardamom pod portions and ${amount(1, servings)} small cinnamon stick portion. Stir for 30 seconds until fragrant, then add rice and the packet's measured water quantity. Cook and rest covered as directed. Lift out and discard all cardamom pod shells and the cinnamon stick before fluffing; the cumin seeds stay in the rice. This is a spiced rice side, not a complete biryani.`, 24), step("Dress the cucumber", `Toss ${amount(250, servings)} g thinly sliced cucumber with ${amount(20, servings)} ml lemon juice and the remaining ${amount(0.5, servings)} tbsp olive oil.`, 3)],
      equipment: ["Saucepan with lid","Mixing bowl"],
      minutes: 28,
    }),
  },
  {
    option: { id: "roti-salad", name: "Roti & salad", description: "Warm roti (wheat) with tomato–cucumber salad; GF flatbread when filtered.", emoji: "🫓" },
    regionHints: ["somali","yemeni","south-indian","caribbean","jamaican","pakistani","indian"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free flatbread" : "roti",
      vegetables: "tomato & cucumber",
      ingredients: [gf ? ingredient("gf-flatbread", "Gluten-free flatbread", 4, "", "grocery", [], "Labelled gluten-free.", ["gluten free flatbread"]) : ingredient("roti", "Roti", 4, "", "grocery", ["wheat"], undefined, ["roti"]), ingredient("tomato", "Tomatoes", 250, "g", "produce", [], undefined, ["tomatoes"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Warm the bread", `Warm ${amount(4, servings)} ${gf ? "gluten-free flatbread" : "roti"} as the packet directs.`, 4), step("Make the salad", `Toss ${amount(250, servings)} g tomatoes and ${amount(200, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 4)],
      equipment: ["Mixing bowl"],
      minutes: 10,
    }),
  },
  {
    option: { id: "xinjiang-bread-salad", name: "Naan-style bread & salad", description: "Warm naan (wheat) with tomato salad; GF flatbread when filtered.", emoji: "🥖" },
    regionHints: ["xinjiang","persian","afghan","turkish","pakistani"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free flatbread" : "naan-style bread",
      vegetables: "tomato salad",
      ingredients: [gf ? ingredient("gf-flatbread", "Gluten-free flatbread", 4, "", "grocery", [], "Labelled gluten-free.", ["gluten free flatbread"]) : ingredient("naan", "Naan bread", 4, "", "grocery", ["wheat"], undefined, ["naan"]), ingredient("tomato", "Tomatoes", 300, "g", "produce", [], undefined, ["tomatoes"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Warm the bread", `Warm ${amount(4, servings)} ${gf ? "gluten-free flatbread" : "naan bread"} as the packet directs.`, 5), step("Make the salad", `Toss ${amount(300, servings)} g tomatoes and ${amount(200, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 4)],
      equipment: ["Mixing bowl"],
      minutes: 10,
    }),
  },
  {
    option: { id: "freekeh-salad", name: "Freekeh salad", description: "Lemon freekeh (wheat) with tomato; quinoa when gluten-free.", emoji: "🌾" },
    regionHints: ["levantine","syrian","turkish","persian","yemeni","afghan","georgian","moroccan","tunisian"],
    build: (gf, _df, servings) => ({
      side: gf ? "quinoa salad" : "freekeh salad",
      vegetables: "tomato & herbs",
      ingredients: [gf ? ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight; naturally wheat-free.", ["quinoa"]) : ingredient("freekeh", "Cracked freekeh", 280, "g", "grocery", ["wheat"], "Dry weight. Use cracked freekeh; whole freekeh needs its packet's longer cooking time.", ["freekeh", "cracked freekeh"]), ingredient("tomato", "Cherry tomatoes", 250, "g", "produce", [], undefined, ["tomatoes","cherry tomatoes"]), ingredient("side-parsley", "Parsley for the side", 30, "g", "produce", [], undefined, ["parsley"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the grain", `Rinse ${amount(280, servings)} g ${gf ? "quinoa" : "cracked freekeh"}. Bring ${amount(2000, servings)} ml water to a boil in a roomy saucepan, add the grain and simmer gently for ${gf ? "12–15" : "20–25"} minutes, or its packet's time, until tender without a hard centre. Keep submerged, topping up boiling water if needed, then drain thoroughly. Spread in a shallow dish to lose excess steam briefly before adding the fresh salad ingredients.`, gf ? 22 : 30), step("Dress the salad", `Toss with ${amount(250, servings)} g cherry tomatoes, ${amount(30, servings)} g parsley for the side, ${amount(2, servings)} tbsp olive oil and ${amount(30, servings)} ml lemon juice.`, 5)],
      equipment: ["Saucepan","Mixing bowl"],
      minutes: gf ? 30 : 35,
    }),
  },
  {
    option: { id: "pita-fattoush", name: "Pita fattoush", description: "Toasted pita with cucumber–tomato fattoush; GF pita when filtered.", emoji: "🥙" },
    regionHints: ["levantine","syrian","turkish"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free pita fattoush" : "pita fattoush",
      vegetables: "cucumber & tomato",
      ingredients: [gf ? ingredient("gf-pita", "Gluten-free pita", 3, "", "grocery", [], "Labelled gluten-free.", ["gluten free pita"]) : ingredient("pita", "Pita bread", 3, "", "grocery", ["wheat"], undefined, ["pita","pitta"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("tomato", "Tomatoes", 250, "g", "produce", [], undefined, ["tomatoes"]), ingredient("lettuce", "Cos lettuce", 150, "g", "produce", [], undefined, ["lettuce"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Toast the bread", `Toast or warm ${amount(3, servings)} ${gf ? "gluten-free pita" : "pita bread"} and tear into pieces.`, 5), step("Build the fattoush", `Toss with ${amount(200, servings)} g cucumber, ${amount(250, servings)} g tomatoes, ${amount(150, servings)} g cos lettuce, ${amount(2, servings)} tbsp olive oil and ${amount(30, servings)} ml lemon juice.`, 5)],
      equipment: ["Mixing bowl","Oven"],
      minutes: 12,
    }),
  },
  {
    option: { id: "jewelled-rice", name: "Jewelled rice & herbs", description: "Basmati with pomegranate jewels and fresh herbs — Persian-inspired template.", emoji: "💎" },
    regionHints: ["persian","afghan","georgian","turkish"],
    build: (_gf, _df, servings) => ({
      side: "jewelled rice",
      vegetables: "herb salad",
      ingredients: [ingredient("basmati", "Basmati rice", 300, "g", "grocery", [], "Dry weight.", ["basmati"]), ingredient("side-pomegranate", "Pomegranate arils for the rice", 100, "g", "produce", [], "Ready-extracted arils, without peel or pith.", ["pomegranate arils"]), ingredient("side-parsley", "Parsley for the side", 40, "g", "produce", [], undefined, ["parsley"]), ingredient("side-mint", "Fresh mint for the side", 20, "g", "produce", [], undefined, ["mint"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the basmati", `Rinse ${amount(300, servings)} g dry basmati rice and cook using the packet's water ratio. Rest covered and fluff.`, 22), step("Add the jewels and herbs", `Just before serving, gently fold ${amount(100, servings)} g pomegranate arils through the rice. Toss ${amount(40, servings)} g chopped parsley and ${amount(20, servings)} g chopped fresh mint with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lemon juice; spoon the fresh herbs alongside or over the rice without cooking them.`, 4)],
      equipment: ["Saucepan with lid","Mixing bowl"],
      minutes: 28,
    }),
  },
  {
    option: { id: "harissa-carrots-couscous", name: "Harissa carrots & couscous", description: "Couscous with roast carrot; quinoa when gluten-free.", emoji: "🥕" },
    regionHints: ["moroccan","tunisian","west-african"],
    build: (gf, _df, servings) => ({
      side: gf ? "quinoa" : "couscous",
      vegetables: "harissa roast carrots",
      ingredients: [gf ? ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight.", ["quinoa"]) : ingredient("couscous", "Couscous", 280, "g", "grocery", ["wheat"], "Dry weight.", ["couscous"]), ingredient("carrot", "Carrots", 500, "g", "produce", [], "Cut into 1 cm-thick batons.", ["carrot","carrots"]), ingredient("side-harissa", gf ? "Gluten-free vegan mild harissa paste for the side" : "Vegan mild harissa paste for the side", 1, "tsp", "specialty", [], "Choose a vegan mild paste; chilli strength varies. Gluten-free meals require a labelled gluten-free product.", gf ? ["gluten-free vegan mild harissa paste"] : ["vegan mild harissa paste"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the carrots", `Toss ${amount(500, servings)} g prepared carrots with ${amount(1.5, servings)} tbsp of the olive oil. Roast in a single layer at 200°C for 25–30 minutes, turning once, until tender and browned. Keep the harissa off the tray during this long roast.`, 30), step(gf ? "Cook the quinoa alongside" : "Hydrate the couscous near serving", gf ? `While the carrots roast, rinse ${amount(280, servings)} g dry quinoa. Add water using its packet's ratio, simmer covered until tender, then rest and fluff. Allow about 20 minutes including the rest.` : `During the carrots' final 10 minutes, put ${amount(280, servings)} g dry couscous in a heatproof bowl. Add boiling water using the packet's ratio, cover for its stated time, then fluff with a fork.`, gf ? 22 : 8), step("Cook the harissa coating and finish", `During the final 5 minutes of roasting, warm the remaining ${amount(0.5, servings)} tbsp olive oil in a small pan. Stir in ${amount(1, servings)} tsp ${gf ? "gluten-free vegan mild harissa paste" : "vegan mild harissa paste"} for 1–2 minutes over low heat, then add ${amount(30, servings)} ml water and simmer briefly. Toss the cooked carrots through this measured coating, take off the heat and finish with ${amount(20, servings)} ml lemon juice. Serve over the fluffed grain.`, 5)],
      equipment: [gf ? "Saucepan with lid" : "Heatproof bowl","Oven tray","Small frying pan"],
      minutes: 35,
    }),
  },
  {
    option: { id: "baba-salad", name: "Baba ganoush & salad", description: "Ready baba ganoush (sesame) with cucumber salad and flatbread.", emoji: "🍆" },
    regionHints: ["levantine","syrian","turkish","persian"],
    build: (gf, _df, servings) => ({
      side: gf ? "baba ganoush" : "baba ganoush",
      vegetables: "cucumber salad",
      ingredients: [gf ? ingredient("gf-crackers", "Gluten-free crackers", 120, "g", "grocery", [], "Labelled gluten-free.", ["gluten free crackers"]) : ingredient("flatbread", "Vegan flatbread", 4, "", "grocery", ["wheat"], undefined, ["flatbread"]), ingredient("baba", "Ready baba ganoush", 300, "g", "grocery", ["sesame"], "Check the label for sesame and gluten.", ["baba ganoush"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Plate the baba ganoush", `Spoon ${amount(300, servings)} g ready baba ganoush onto a plate. Check the packet for sesame.`, 2), step("Salad and bread", `Toss ${amount(250, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil. Serve with ${gf ? `${amount(120, servings)} g gluten-free crackers` : `${amount(4, servings)} vegan flatbread`}.`, 5)],
      equipment: ["Mixing bowl"],
      minutes: 10,
    }),
  },
  {
    option: { id: "georgian-walnut-salad", name: "Walnut herb salad & bread", description: "Herb salad with walnuts (tree nut) and flatbread; GF bread when filtered.", emoji: "🥗" },
    regionHints: ["georgian","persian","turkish","levantine"],
    build: (gf, _df, servings) => ({
      side: gf ? "walnut herb salad" : "walnut herb salad",
      vegetables: "herbs & walnuts",
      ingredients: [gf ? ingredient("gf-bread", "Gluten-free bread", 300, "g", "grocery", [], "Labelled gluten-free.", ["gluten free bread"]) : ingredient("flatbread", "Vegan flatbread", 4, "", "grocery", ["wheat"], undefined, ["flatbread"]), ingredient("walnuts", "Walnuts", 80, "g", "grocery", ["tree-nut"], "Roughly chopped.", ["walnuts"]), ingredient("side-parsley", "Parsley for the side", 40, "g", "produce", [], undefined, ["parsley"]), ingredient("side-coriander", "Coriander leaves for the side", 20, "g", "produce", [], undefined, ["coriander"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 25, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Make the herb salad", `Combine ${amount(80, servings)} g walnuts, ${amount(40, servings)} g parsley for the side and ${amount(20, servings)} g coriander leaves for the side. Dress with ${amount(2, servings)} tbsp olive oil and ${amount(25, servings)} ml lemon juice.`, 6), step("Warm the bread", `Warm ${gf ? `${amount(300, servings)} g gluten-free bread` : `${amount(4, servings)} vegan flatbread`} as the packet directs.`, 4)],
      equipment: ["Mixing bowl"],
      minutes: 12,
    }),
  },
  {
    option: { id: "ratatouille-side", name: "Ratatouille side", description: "Courgette, aubergine and tomato stew as a side.", emoji: "🍲" },
    regionHints: ["french","spanish","italian","portuguese"],
    build: (_gf, _df, servings) => ({
      side: "ratatouille",
      vegetables: "courgette, aubergine & tomato",
      ingredients: [ingredient("side-courgette", "Courgette for the side", 300, "g", "produce", [], undefined, ["courgette","zucchini"]), ingredient("side-aubergine", "Aubergine for the side", 300, "g", "produce", [], undefined, ["aubergine","eggplant"]), ingredient("tomato", "Tomatoes", 400, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 3, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Cook the vegetables", `Heat ${amount(3, servings)} tbsp olive oil in a wide pan. Add ${amount(300, servings)} g courgette for the side and ${amount(300, servings)} g aubergine for the side. Cook 12–15 minutes until soft.`, 15), step("Add tomatoes", `Add ${amount(400, servings)} g tomatoes and simmer 15–20 minutes until jammy. Cook in batches if crowded.`, 18)],
      equipment: ["Wide frying pan"],
      minutes: 35,
    }),
  },
  {
    option: { id: "egg-free-spaetzle-greens", name: "Soft noodles & greens", description: "Egg-free soft noodles (wheat) with wilted greens; GF short pasta when filtered.", emoji: "🍝" },
    regionHints: ["hungarian","nordic","french","home-kitchen"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free short pasta" : "soft noodles",
      vegetables: "wilted greens",
      ingredients: [gf ? ingredient("gf-pasta", "Gluten-free short pasta", 350, "g", "grocery", [], "Labelled gluten-free.", ["gluten free pasta"]) : ingredient("soft-noodles", "Egg-free soft noodles", 350, "g", "grocery", ["wheat"], "Choose egg-free noodles; check the packet.", ["egg free noodles","soft noodles"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the noodles", `Cook ${amount(350, servings)} g dry ${gf ? "gluten-free short pasta" : "egg-free soft noodles"} to its packet timing. Before draining, reserve a little cooking water.`, 12), step("Wilt the greens", `During the noodles' final minutes, put ${amount(200, servings)} g washed baby spinach into a frying pan with a spoonful of the hot cooking water. Cook over medium heat for 2–3 minutes until wilted. Drain excess liquid, take off the heat and fold in the drained noodles, ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lemon juice.`, 4)],
      equipment: ["Saucepan","Colander"],
      minutes: 20,
    }),
  },
  {
    option: { id: "risotto-style-side", name: "Risotto-style rice side", description: "Creamy arborio-style rice with lemon and peas.", emoji: "🍚" },
    regionHints: ["italian","french","australian","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "soft risotto-style rice",
      vegetables: "peas & lemon",
      ingredients: [ingredient("arborio", "Arborio rice", 280, "g", "grocery", [], "Dry weight; stir as the packet directs.", ["arborio","risotto rice"]), ingredient("peas", "Frozen peas", 150, "g", "produce", [], "Added in the last minutes.", ["peas"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Use ${amount(280, servings)} g dry arborio rice. Keep ${amount(1200, servings)} ml water hot in a small saucepan; stock is not required or listed for this side. Add hot water to the rice a ladle at a time, stirring often and adding more as it is absorbed, for about 18–22 minutes or to the packet's guidance, until tender with a little bite. Reserve some of the hot water to loosen the rice at the final pea step, adding more boiling water only if needed. Beat in ${amount(2, servings)} tbsp olive oil and keep the texture loose, not dry.`, 24), step("Add peas and lemon", `During the rice's final 3–5 minutes, stir through ${amount(150, servings)} g frozen peas and cook until the peas are steaming hot throughout. If the rice has rested, loosen it with the reserved hot water and heat gently before adding the peas; do not let it dry into a solid mass. Take off the heat and finish with ${amount(20, servings)} ml lemon juice.`, 5)],
      equipment: ["Saucepan","Small saucepan","Ladle"],
      minutes: 30,
    }),
  },
  {
    option: { id: "patatas-bravas-side", name: "Patatas bravas style", description: "Crisp potato cubes with a separate smoky tomato sauce — a mild Spanish tapas-inspired side.", emoji: "🥔" },
    regionHints: ["spanish","portuguese","cuban","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "crisp potatoes",
      vegetables: "smoky tomato sauce",
      ingredients: [ingredient("potatoes", "Potatoes", 900, "g", "produce", [], "Scrub, dry and cut into 2 cm cubes."), ingredient("side-passata", "Tomato passata for the side sauce", 150, "ml", "grocery", [], "Plain passata, not a prepared chilli sauce.", ["tomato passata"]), ingredient("side-smoked-paprika", "Sweet smoked paprika for the side", 0.5, "tsp", "grocery", [], "Sweet rather than hot paprika.", ["sweet smoked paprika"]), ingredient("side-garlic", "Garlic for the side", 1, "cloves", "produce", [], "Finely minced.", ["garlic"]), ingredient("olive-oil", "Olive oil", 3, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the potatoes", `Toss ${amount(900, servings)} g dry 2 cm potato cubes with ${amount(2.5, servings)} tbsp of the olive oil. Spread out on a tray and roast at 220°C for 35–40 minutes, turning once, until tender inside and crisp outside. Use extra trays for a large batch.`, 40), step("Cook the smoky tomato sauce alongside", `During the potatoes' final 10 minutes, warm the remaining ${amount(0.5, servings)} tbsp olive oil in a small saucepan. Soften ${amount(1, servings)} minced garlic clove portion for 30 seconds. Stir in ${amount(0.5, servings)} tsp sweet smoked paprika for 15 seconds, then immediately add ${amount(150, servings)} ml tomato passata. Simmer gently for 5–8 minutes until thick; add a spoonful of water only if needed to stop sticking.`, 10), step("Keep the potatoes crisp", `Take the sauce off the heat and add ${amount(20, servings)} ml lemon juice gradually. Serve this measured sauce alongside the hot potatoes or spoon on at the table; do not soak the crisp cubes while they wait.`, 1)],
      equipment: ["Oven tray","Small saucepan"],
      minutes: 45,
    }),
  },
  {
    option: { id: "beans-tomato-side", name: "Tomato beans & greens", description: "Warm canned white beans in tomato with spinach.", emoji: "🫘" },
    regionHints: ["italian","spanish","portuguese","greek","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "tomato beans",
      vegetables: "spinach",
      ingredients: [ingredient("white-beans", "Canned white beans, drained", 400, "g", "grocery", [], "Already cooked; drained weight.", ["white beans","cannellini"]), ingredient("tomato", "Passata or crushed tomatoes", 200, "g", "grocery", [], undefined, ["tomato","passata"]), ingredient("spinach", "Baby spinach", 150, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Simmer the beans", `Warm ${amount(400, servings)} g canned white beans, drained with ${amount(200, servings)} g passata or crushed tomatoes and ${amount(2, servings)} tbsp olive oil for 8–10 minutes.`, 10), step("Wilt the spinach", `Stir through ${amount(150, servings)} g baby spinach until wilted. Finish with ${amount(15, servings)} ml lemon juice.`, 3)],
      equipment: ["Saucepan"],
      minutes: 15,
    }),
  },
  {
    option: { id: "kale-farro", name: "Farro & kale", description: "Farro (wheat) with kale; brown rice when gluten-free.", emoji: "🥬" },
    regionHints: ["italian","french","nordic","australian"],
    build: (gf, _df, servings) => ({
      side: gf ? "brown rice" : "farro",
      vegetables: "kale",
      ingredients: [gf ? ingredient("brown-rice", "Brown rice", 280, "g", "grocery", [], "Dry weight.", ["brown rice"]) : ingredient("farro", "Pearled farro", 280, "g", "grocery", ["wheat"], "Dry weight. Use pearled farro; unpearled whole farro needs its packet's longer cooking or soaking method.", ["farro", "pearled farro"]), ingredient("kale", "Kale", 250, "g", "produce", [], "Stems removed, leaves torn.", ["kale"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the grain", `Rinse ${amount(280, servings)} g ${gf ? "brown rice" : "pearled farro"}. Add to ${amount(2000, servings)} ml boiling water and simmer for ${gf ? "25–40" : "25–30"} minutes, or the packet's time, until tender with no hard centre. Top up boiling water to keep submerged, then drain well. Start the kale during the grain's final 10 minutes.`, gf ? 45 : 35), step("Wilt the kale", `Heat ${amount(2, servings)} tbsp olive oil over medium heat, add ${amount(250, servings)} g thinly sliced kale leaves and ${amount(30, servings)} ml water. Cover briefly, then stir for 6–8 minutes until tender; add a spoonful of water if needed. Take off the heat and finish with ${amount(20, servings)} ml lemon juice.`, 8)],
      equipment: ["Saucepan","Frying pan"],
      minutes: gf ? 50 : 40,
    }),
  },
  {
    option: { id: "beetroot-salad", name: "Beetroot salad", description: "Roast beetroot with salad leaves and lemon.", emoji: "🟣" },
    regionHints: ["nordic","hungarian","french","australian","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "beetroot salad",
      vegetables: "leaves & lemon",
      ingredients: [ingredient("beetroot", "Beetroot", 600, "g", "produce", [], "Scrubbed; wrap and roast until tender.", ["beetroot","beets"]), ingredient("lettuce", "Mixed salad leaves", 120, "g", "produce", [], undefined, ["lettuce"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 25, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the beetroot", `Scrub and trim ${amount(600, servings)} g beetroot, peel if preferred, and cut into even 2 cm pieces. Place in a covered heatproof dish and roast at 200°C for about 35–45 minutes until a knife enters easily. Let cool until just warm before dressing, so it does not wilt the leaves.`, 45), step("Dress", `Toss the just-warm beetroot with ${amount(120, servings)} g washed, dried mixed salad leaves, ${amount(2, servings)} tbsp olive oil and ${amount(25, servings)} ml lemon juice immediately before serving.`, 4)],
      equipment: ["Oven","Covered heatproof dish","Mixing bowl"],
      minutes: 55,
    }),
  },
  {
    option: { id: "zucchini-ribbons", name: "Courgette ribbons & lemon", description: "Quick sautéed courgette ribbons — light weeknight side.", emoji: "🥒" },
    regionHints: ["italian","french","spanish","portuguese","greek","hungarian","nordic","home-kitchen","australian","levantine","turkish"],
    build: (_gf, _df, servings) => ({
      side: "courgette ribbons",
      vegetables: "lemon",
      ingredients: [ingredient("side-courgette", "Courgette for the side", 700, "g", "produce", [], "Peeled into ribbons or thin slices.", ["courgette","zucchini"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Sauté the ribbons", `Heat ${amount(2, servings)} tbsp olive oil. Add ${amount(700, servings)} g courgette for the side and cook 5–7 minutes until just tender. Cook in batches if crowded.`, 7), step("Finish with lemon", `Dress with ${amount(20, servings)} ml lemon juice and serve promptly.`, 1)],
      equipment: ["Wide frying pan"],
      minutes: 12,
    }),
  },
  {
    option: { id: "mushroom-rice-side", name: "Mushroom rice", description: "Rice cooked with chopped mushrooms.", emoji: "🍄" },
    regionHints: ["italian","french","spanish","portuguese","greek","hungarian","nordic","chinese","cantonese","sichuan","hunan","taiwanese","shanghainese","yunnan","xinjiang","japanese","japanese-curry","korean","filipino","malaysian","indonesian","peranakan","balinese","maluku","burmese","home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "mushroom rice",
      vegetables: "mushroom",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("side-mushrooms", "Mushrooms for the side", 300, "g", "produce", [], "Sliced.", ["mushrooms"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Cook the mushrooms", `Use a wide saucepan with a fitted lid for this one-pot side. Sauté ${amount(300, servings)} g sliced mushrooms for the side in ${amount(2, servings)} tbsp olive oil over medium-high heat until their liquid evaporates and they brown, about 8 minutes.`, 8), step("Add the rice", `Stir ${amount(300, servings)} g rinsed dry long-grain rice into the same saucepan. Add the packet's measured water quantity, bring to a gentle boil, cover and cook on the lowest heat until tender. Rest covered for 5 minutes, then fluff.`, 22)],
      equipment: ["Wide saucepan with fitted lid"],
      minutes: 28,
    }),
  },
  {
    option: { id: "tzatziki-potatoes", name: "Tzatziki potatoes", description: "Warm potatoes with cucumber yoghurt; dairy-free cucumber salad when filtered.", emoji: "🥔" },
    regionHints: ["greek","turkish","levantine","australian"],
    build: (_gf, df, servings) => {
      const dairy = !df;
      return {
        side: dairy ? "potatoes with tzatziki" : "potatoes with cucumber salad",
        vegetables: dairy ? "cucumber yoghurt" : "cucumber lemon salad",
        ingredients: [...(dairy ? [ingredient("yoghurt", "Plain yoghurt", 200, "g", "grocery", ["milk"], undefined, ["yoghurt"])] : [ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])]), ingredient("potatoes", "Potatoes", 800, "g", "produce", [], "Cut into chunks."), ingredient("cucumber", "Cucumber", 150, "g", "produce", [], undefined), ingredient("lemon-juice", "Lemon juice", dairy ? 15 : 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
        steps: [step("Boil the potatoes", `Boil ${amount(800, servings)} g potatoes until tender, about 15–18 minutes. Drain.`, 18), step(dairy ? "Make the tzatziki" : "Cucumber lemon salad", dairy ? `Combine ${amount(200, servings)} g plain yoghurt with ${amount(150, servings)} g cucumber and ${amount(15, servings)} ml lemon juice. Serve with the potatoes.` : `Toss ${amount(150, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(2, servings)} tbsp olive oil. No yoghurt is used. Serve with the potatoes.`, dairy ? 5 : 4)],
        equipment: ["Saucepan","Mixing bowl"],
        minutes: 30,
      };
    },
  },
  {
    option: { id: "barley-veg", name: "Pearl barley & roast veg", description: "Pearl barley (gluten) with roast veg; brown rice when gluten-free.", emoji: "🌾" },
    regionHints: ["italian","french","spanish","portuguese","greek","hungarian","nordic","home-kitchen","australian","persian"],
    build: (gf, _df, servings) => ({
      side: gf ? "brown rice" : "pearl barley",
      vegetables: "roast carrot & capsicum",
      ingredients: [gf ? ingredient("brown-rice", "Brown rice", 280, "g", "grocery", [], "Dry weight.", ["brown rice"]) : ingredient("barley", "Pearl barley", 280, "g", "grocery", ["barley"], "Barley contains gluten; dry weight.", ["barley","pearl barley"]), ingredient("carrot", "Carrots", 300, "g", "produce", [], undefined, ["carrot"]), ingredient("pepper", "Capsicum", 250, "g", "produce", [], undefined, ["capsicum","pepper"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the grain", `Cook ${amount(280, servings)} g dry ${gf ? "brown rice" : "pearl barley"} in water using the packet's ratio and cooking time until tender; allow about 30–40 minutes, or the packet's longer time. Drain any unabsorbed water. Start the vegetable tray while this grain cooks.`, 40), step("Roast the vegetables alongside", `Toss ${amount(300, servings)} g prepared carrot pieces and ${amount(250, servings)} g capsicum with ${amount(2, servings)} tbsp olive oil. Roast in a single layer at 200°C for 25–30 minutes, turning once, until tender; this overlaps the grain cooking. Take off the heat and finish with ${amount(20, servings)} ml lemon juice.`, 30)],
      equipment: ["Saucepan","Oven tray"],
      minutes: 40,
    }),
  },
  {
    option: { id: "tostones-side", name: "Tostones-style plantain", description: "Pan-fried green plantain, flattened and fried again for crisp edges, with lime alongside.", emoji: "🍌" },
    regionHints: ["caribbean","jamaican","creole","cajun","puerto-rican","cuban","brazilian","west-african"],
    build: (_gf, _df, servings) => ({
      side: "tostones-style plantain",
      vegetables: "lime finish",
      ingredients: [ingredient("plantain", "Green plantain", 800, "g", "produce", [], "Peeled and sliced.", ["plantain"]), ingredient("olive-oil", "Olive oil", 3, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("First fry the green plantain", `Peel ${amount(800, servings)} g green plantain and cut into 2 cm-thick rounds. Pat completely dry. Heat ${amount(1.5, servings)} tbsp of the olive oil in a non-stick wide pan over medium-low heat. Fry in uncrowded batches for 4–5 minutes per side until the centres soften enough to flatten; they should not be crisp yet. Transfer to a board, keeping the same measured oil for the first-fry batches.`, 20), step("Flatten and refry", `Using the flat base of a small pan, gently press each warm round between sheets of baking paper to about 5–8 mm thick. Heat the remaining ${amount(1.5, servings)} tbsp olive oil over medium-high heat. Refry the flattened pieces in batches for 1–2 minutes per side until crisp and golden, using this same second-fry portion across batches. Drain briefly on paper and keep uncovered. This is a lightly oiled pan-fried adaptation, rather than deep frying.`, 12), step("Finish with lime", `Serve the ${amount(20, servings)} ml lime juice alongside and add at the table; soaking the crisp plantain in juice softens it. Serve promptly.`, 1)],
      equipment: ["Non-stick wide frying pan","Small pan or plantain press","Baking paper","Board","Tongs"],
      minutes: 40,
    }),
  },
  {
    option: { id: "congri-rice", name: "Congrí-style rice & beans", description: "Rice cooked with black beans — Cuban / Caribbean template.", emoji: "🫘" },
    regionHints: ["cuban","caribbean","puerto-rican","jamaican"],
    build: (_gf, _df, servings) => ({
      side: "rice and beans",
      vegetables: "lime finish",
      ingredients: [ingredient("rice", "Long-grain rice", 280, "g", "grocery", [], undefined, ["rice"]), ingredient("black-beans", "Canned black beans, drained", 300, "g", "grocery", [], "Already cooked.", ["black beans"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice with the cooked beans", `Rinse ${amount(280, servings)} g dry long-grain rice. Cook with the packet's measured water quantity. During its final 5 minutes, gently fold in ${amount(300, servings)} g drained and rinsed canned black beans; these are already cooked, not dry beans. Cover and heat until the rice is tender and the beans are steaming hot, adding a small splash of water only if needed. Rest covered for the packet's resting time.`, 25), step("Finish the rice and beans", `Gently fluff the cooked rice and beans with ${amount(1, servings)} tbsp olive oil. Take off the heat and add ${amount(20, servings)} ml lime juice just before serving.`, 2)],
      equipment: ["Saucepan with lid"],
      minutes: 30,
    }),
  },
  {
    option: { id: "arepa-salad", name: "Arepa & salad", description: "Ready arepas with avocado salad; check packet for wheat.", emoji: "🫓" },
    regionHints: ["peruvian","chilean","brazilian","argentine"],
    build: (_gf, _df, servings) => ({
      side: "arepa",
      vegetables: "avocado salad",
      ingredients: [ingredient("arepa", "Ready arepas", 4, "", "grocery", [], "Warm as the packet directs; check for wheat.", ["arepa","arepas"]), ingredient("avocado", "Avocado", 2, "", "produce", [], undefined, ["avocado"]), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Warm the arepas", `Warm ${amount(4, servings)} ready arepas as the packet directs. Check the packet for wheat.`, 6), step("Make the salad", `Combine ${amount(2, servings)} avocado and ${amount(200, servings)} g tomatoes. Dress with ${amount(20, servings)} ml lime juice and ${amount(1, servings)} tbsp olive oil.`, 4)],
      equipment: ["Mixing bowl"],
      minutes: 15,
    }),
  },
  {
    option: { id: "chimichurri-potatoes", name: "Chimichurri potatoes", description: "Roast potatoes with parsley–garlic chimichurri.", emoji: "🥔" },
    regionHints: ["argentine","chilean","brazilian"],
    build: (_gf, _df, servings) => ({
      side: "chimichurri potatoes",
      vegetables: "parsley chimichurri",
      ingredients: [ingredient("potatoes", "Potatoes", 900, "g", "produce", [], "Cut into wedges."), ingredient("side-parsley", "Parsley for the side", 40, "g", "produce", [], undefined, ["parsley"]), ingredient("side-garlic", "Garlic for the side", 10, "g", "produce", [], "Finely chopped for the chimichurri.", ["garlic"]), ingredient("olive-oil", "Olive oil", 3, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 25, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the potatoes", `Toss ${amount(900, servings)} g potatoes with ${amount(2, servings)} tbsp olive oil. Roast at 200°C for 35–40 minutes until golden.`, 38), step("Make the chimichurri", `Combine ${amount(40, servings)} g parsley for the side, ${amount(10, servings)} g garlic for the side, the remaining ${amount(1, servings)} tbsp olive oil and ${amount(25, servings)} ml lemon juice. Spoon over the potatoes.`, 5)],
      equipment: ["Oven tray","Mixing bowl"],
      minutes: 40,
    }),
  },
  {
    option: { id: "yuca-greens", name: "Yuca & greens", description: "Commercially prepared fully cooked cassava / yuca, reheated to its packet directions, with wilted greens.", emoji: "🌿" },
    regionHints: ["caribbean","jamaican","creole","cajun","brazilian","west-african","mozambican","peruvian"],
    build: (_gf, _df, servings) => ({
      side: "reheated fully cooked yuca",
      vegetables: "wilted greens",
      ingredients: [ingredient("yuca", "Fully cooked peeled yuca (cassava)", 800, "g", "grocery", [], "Use commercially processed, peeled and fully cooked cassava sold ready to reheat, with clear packet instructions. Not raw root, raw frozen cassava, bitter cassava or leaves. Home peeling and a short boil are not a validated detoxification process.", ["fully cooked peeled yuca","fully cooked peeled cassava"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Check and reheat the cooked yuca", `Use ${amount(800, servings)} g commercially processed, peeled and fully cooked yuca (cassava) sold ready to reheat. Follow that product's reheating instructions until steaming hot throughout; if they require boiling, use fresh water, then drain and discard all the cooking water. Do not reuse it for sauce or soup. Remove any remaining fibrous core. Do not substitute raw or unlabelled roots, raw frozen cassava, bitter cassava or cassava leaves: a 20–25 minute home boil alone does not establish safe processing. If a suitable cooked product is unavailable, choose another side.`, 20), step("Wilt the greens", `While the yuca reheats, wilt ${amount(200, servings)} g washed baby spinach in ${amount(2, servings)} tbsp olive oil over medium heat until hot. Take off the heat and finish with ${amount(15, servings)} ml lime juice.`, 4)],
      safetyNote: "This side requires commercially processed, peeled, fully cooked cassava sold ready to reheat. FSANZ says ordinary cooking alone is not reliable detoxification for raw cassava. Follow the processed product's label; discard reheating water and never use cassava leaves or raw/unlabelled roots here.",
      safetySource: "https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/cassava",
      equipment: ["Saucepan","Frying pan"],
      minutes: 35,
    }),
  },
  {
    option: { id: "elote-style-corn", name: "Elote-style corn", description: "Charred corn with a cool lime-yoghurt dressing and sweet paprika; plant yoghurt when dairy-free.", emoji: "🌽" },
    regionHints: ["mexican","oaxacan","yucatecan","home-kitchen"],
    build: (_gf, df, servings) => ({
      side: "elote-style corn",
      vegetables: "cool lime dressing",
      ingredients: [ingredient("corn", "Corn cobs", 4, "", "produce", [], "Remove husks and silk.", ["corn","sweetcorn"]), df ? ingredient("side-soy-yoghurt", "Plain unsweetened soy yoghurt for the side", 120, "g", "grocery", ["soy"], "Choose a vegan dairy-free product.", ["plain unsweetened soy yoghurt"]) : ingredient("side-yoghurt", "Plain yoghurt for the side", 120, "g", "grocery", ["milk"], "Keep refrigerated.", ["plain yoghurt"]), ingredient("side-sweet-paprika", "Sweet paprika for the corn", 0.5, "tsp", "grocery", [], "Use sweet, not hot, paprika.", ["sweet paprika"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 25, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the corn", `Brush ${amount(4, servings)} husked corn cob portions with ${amount(1, servings)} tbsp olive oil. Grill or pan-char over medium-high heat for 8–12 minutes, turning frequently, until the kernels are tender and speckled rather than black.`, 12), step("Make the cool lime dressing", `Mix ${amount(120, servings)} g ${df ? "plain unsweetened soy yoghurt" : "plain yoghurt"} with ${amount(25, servings)} ml lime juice and ${amount(0.5, servings)} tsp sweet paprika. Keep chilled, then spoon this measured dressing over the cooked corn at the table. This is a yoghurt-based adaptation, not a mayonnaise-and-cheese coating.`, 3)],
      equipment: ["Wide frying pan or grill","Mixing bowl"],
      minutes: 18,
    }),
  },
  {
    option: { id: "avocado-tomato-rice", name: "Avocado tomato rice", description: "Warm rice topped with avocado and tomato.", emoji: "🥑" },
    regionHints: ["mexican","oaxacan","yucatecan","peruvian","chilean","argentine","brazilian","cuban","puerto-rican","home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "rice",
      vegetables: "avocado & tomato",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("avocado", "Avocado", 2, "", "produce", [], undefined), ingredient("tomato", "Tomatoes", 250, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g long-grain rice as the packet directs. Rest and fluff.`, 18), step("Top with avocado and tomato", `Top with ${amount(2, servings)} avocado and ${amount(250, servings)} g tomatoes. Dress with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lime juice.`, 4)],
      equipment: ["Saucepan with lid"],
      minutes: 22,
    }),
  },
  {
    option: { id: "jollof-style-rice", name: "Jollof-style rice & greens", description: "Tomato rice with wilted greens — West African-inspired template.", emoji: "🍅" },
    regionHints: ["west-african","mozambican","caribbean","jamaican"],
    build: (_gf, _df, servings) => ({
      side: "jollof-style rice",
      vegetables: "wilted greens",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("tomato", "Passata or crushed tomatoes", 250, "g", "grocery", [], undefined, ["tomato","passata"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Cook the tomato rice", `Warm ${amount(2, servings)} tbsp olive oil in a saucepan. Cook ${amount(250, servings)} g passata or crushed tomatoes over medium-low heat for 5–8 minutes, stirring, until thicker. Rinse ${amount(300, servings)} g dry long-grain rice and stir it in, then add ${amount(450, servings)} ml water. The tomato contributes liquid, so do not add a full second packet-water allowance on top. Cover and simmer on the lowest heat for about 15–20 minutes, checking the rice packet; if it is still firm and drying out, add hot water a spoonful at a time. Rest covered for 5 minutes.`, 32), step("Wilt the greens", `During the rice's final 3 minutes, fold through ${amount(200, servings)} g washed baby spinach until wilted and hot throughout. Rest and fluff gently before serving.`, 3)],
      equipment: ["Saucepan with lid"],
      minutes: 35,
    }),
  },
  {
    option: { id: "ugali-greens", name: "Ugali & greens", description: "Firm maize meal ugali with wilted greens.", emoji: "🌽" },
    regionHints: ["west-african","mozambican","ethiopian","somali"],
    build: (_gf, _df, servings) => ({
      side: "ugali",
      vegetables: "wilted greens",
      ingredients: [ingredient("maize-meal", "Maize meal", 300, "g", "grocery", [], "Dry weight; stir as the packet directs for ugali or sadza.", ["maize meal","mielie meal","cornmeal"]), ingredient("spinach", "Baby spinach", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the ugali", `Whisk ${amount(300, servings)} g maize meal into boiling water as the packet directs. Stir until thick and firm, about 10–15 minutes.`, 15), step("Wilt the greens", `Wilt ${amount(250, servings)} g baby spinach with ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lemon juice.`, 5)],
      equipment: ["Saucepan","Frying pan"],
      minutes: 25,
    }),
  },
  {
    option: { id: "sukuma-wiki-side", name: "Sukuma wiki-style greens", description: "Sautéed kale with tomato — East African greens side.", emoji: "🥬" },
    regionHints: ["somali","ethiopian","west-african","mozambican"],
    build: (_gf, _df, servings) => ({
      side: "sukuma wiki-style greens",
      vegetables: "tomato",
      ingredients: [ingredient("kale", "Kale", 400, "g", "produce", [], "Or use cabbage if kale is unavailable.", ["kale","cabbage"]), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the greens", `Sauté ${amount(400, servings)} g kale in ${amount(2, servings)} tbsp olive oil for 8–10 minutes until tender.`, 10), step("Add tomatoes", `Add ${amount(200, servings)} g tomatoes and cook 5 minutes more. Finish with ${amount(15, servings)} ml lemon juice.`, 5)],
      equipment: ["Wide frying pan"],
      minutes: 18,
    }),
  },
  {
    option: { id: "gomen-style-greens", name: "Gomen-style greens", description: "Slow-sautéed kale with onion and lemon — Ethiopian-inspired.", emoji: "🇪🇹" },
    regionHints: ["ethiopian","somali"],
    build: (_gf, _df, servings) => ({
      side: "gomen-style greens",
      vegetables: "lemon",
      ingredients: [ingredient("kale", "Kale", 500, "g", "produce", [], "Or collard greens if available.", ["kale","collard"]), ingredient("side-onion", "Onion for the side", 80, "g", "produce", [], undefined, ["onion"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Soften the onion", `Cook ${amount(80, servings)} g prepared onion for the side in ${amount(2, servings)} tbsp olive oil over medium-low heat for about 5 minutes until soft.`, 5), step("Cook the kale", `Add ${amount(500, servings)} g thinly sliced kale and ${amount(60, servings)} ml water. Cover loosely and cook over low heat for 15–18 minutes until tender, stirring and adding water a spoonful at a time if needed to prevent scorching. Uncover to evaporate excess water, then take off the heat and finish with ${amount(20, servings)} ml lemon juice.`, 18)],
      equipment: ["Wide frying pan"],
      minutes: 25,
    }),
  },
  {
    option: { id: "mozambican-rice-coconut", name: "Coconut rice & lime", description: "Coconut rice with lime — Mozambican / Indian Ocean template.", emoji: "🥥" },
    regionHints: ["mozambican","goan","sri-lankan","malaysian","caribbean"],
    build: (_gf, _df, servings) => ({
      side: "coconut rice",
      vegetables: "lime",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("coconut-milk", "Coconut milk", 250, "ml", "grocery", [], undefined, ["coconut milk"]), ingredient("lime-juice", "Lime juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the coconut rice", `Rinse ${amount(300, servings)} g long-grain rice. Cook with ${amount(250, servings)} ml coconut milk and ${amount(250, servings)} ml water, covered, until absorbed. Rest and fluff.`, 20), step("Finish with lime", `Fluff through ${amount(20, servings)} ml lime juice just before serving.`, 1)],
      equipment: ["Saucepan with lid"],
      minutes: 24,
    }),
  },
  {
    option: { id: "millet-greens", name: "Millet & greens", description: "Fluffy millet with steamed broccoli. Naturally wheat-free.", emoji: "🌱" },
    regionHints: ["ethiopian","somali","west-african","mozambican","indian","home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "millet",
      vegetables: "steamed greens",
      ingredients: [ingredient("millet", "Millet", 280, "g", "grocery", [], "Dry weight; rinse well.", ["millet"]), ingredient("side-broccoli", "Broccoli for the side", 350, "g", "produce", [], "Florets.", ["broccoli"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the millet", `Rinse ${amount(280, servings)} g millet. Put in a saucepan with ${amount(750, servings)} ml water, or the packet's absorption quantity. Bring to a boil, cover and simmer gently for about 20 minutes until tender, adding a little boiling water if it dries before the grains soften. Rest covered off the heat for 5 minutes, drain any excess and fluff.`, 28), step("Steam the broccoli", `Steam ${amount(350, servings)} g broccoli for the side for 5–7 minutes. Finish with ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lemon juice.`, 7)],
      equipment: ["Saucepan with lid","Steamer"],
      minutes: 33,
    }),
  },
  {
    option: { id: "sorghum-salad", name: "Sorghum salad", description: "Chewy sorghum with tomato and herbs. Wheat-free.", emoji: "🧡" },
    regionHints: ["ethiopian","somali","west-african","mozambican","indian","home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "sorghum salad",
      vegetables: "tomato & herbs",
      ingredients: [ingredient("sorghum", "Sorghum grain", 280, "g", "grocery", [], "Dry weight; simmer until chewy-tender.", ["sorghum"]), ingredient("tomato", "Cherry tomatoes", 250, "g", "produce", [], undefined, ["tomatoes"]), ingredient("side-parsley", "Parsley for the side", 25, "g", "produce", [], undefined, ["parsley"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the sorghum", `Rinse ${amount(280, servings)} g whole sorghum grain. Bring ${amount(2000, servings)} ml water to a boil in a roomy saucepan, add the grain and simmer uncovered for about 50–60 minutes, or the packet's longer time, until chewy-tender with no hard centre. Keep submerged with boiling water as needed, then drain thoroughly. Spread in a shallow dish to lose excess steam briefly before dressing.`, 65), step("Dress the salad", `Toss with ${amount(250, servings)} g cherry tomatoes, ${amount(25, servings)} g parsley for the side, ${amount(2, servings)} tbsp olive oil and ${amount(30, servings)} ml lemon juice.`, 5)],
      equipment: ["Saucepan","Mixing bowl"],
      minutes: 70,
    }),
  },
  {
    option: { id: "pumpkin-mash-salad", name: "Pumpkin mash & salad", description: "Simple pumpkin mash with garden leaves — Aussie weeknight.", emoji: "🎃" },
    regionHints: ["home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "pumpkin mash",
      vegetables: "garden leaves",
      ingredients: [ingredient("side-pumpkin", "Pumpkin for the side", 800, "g", "produce", [], "Peeled and chunked.", ["pumpkin"]), ingredient("lettuce", "Mixed salad leaves", 120, "g", "produce", [], undefined, ["lettuce"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Mash the pumpkin", `Boil ${amount(800, servings)} g pumpkin for the side until soft, about 15–18 minutes. Drain and mash with ${amount(2, servings)} tbsp olive oil.`, 20), step("Dress the leaves", `Toss ${amount(120, servings)} g mixed salad leaves with ${amount(20, servings)} ml lemon juice.`, 2)],
      equipment: ["Saucepan","Mixing bowl"],
      minutes: 25,
    }),
  },
  {
    option: { id: "pea-mash-beans", name: "Pea mash & beans", description: "Mashed peas with steamed green beans — classic pub-style side.", emoji: "🟢" },
    regionHints: ["home-kitchen","australian","nordic"],
    build: (_gf, _df, servings) => ({
      side: "pea mash",
      vegetables: "steamed green beans",
      ingredients: [ingredient("peas", "Frozen peas", 500, "g", "produce", [], undefined, ["peas"]), ingredient("green-beans", "Green beans", 300, "g", "produce", [], undefined, ["green beans"]), ingredient("side-mint", "Fresh mint for the side", 15, "g", "produce", [], undefined, ["mint"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Mash the peas", `Boil ${amount(500, servings)} g frozen peas for 3–4 minutes. Drain and mash with ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} g fresh mint for the side.`, 8), step("Steam the beans", `Steam ${amount(300, servings)} g green beans for 5–7 minutes. Finish with ${amount(15, servings)} ml lemon juice.`, 7)],
      equipment: ["Saucepan","Steamer"],
      minutes: 18,
    }),
  },
  {
    option: { id: "damper-salad", name: "Damper-style bread & salad", description: "Warm damper-style bread (wheat) with salad; GF bread when filtered.", emoji: "🥖" },
    regionHints: ["home-kitchen","australian"],
    build: (gf, _df, servings) => ({
      side: gf ? "gluten-free bread" : "damper-style bread",
      vegetables: "garden salad",
      ingredients: [gf ? ingredient("gf-bread", "Gluten-free bread", 400, "g", "grocery", [], "Labelled gluten-free.", ["gluten free bread"]) : ingredient("damper", "Damper-style bread", 400, "g", "grocery", ["wheat"], "Warm as the packet directs.", ["damper","bread"]), ingredient("lettuce", "Mixed salad leaves", 150, "g", "produce", [], undefined, ["lettuce"]), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("cucumber", "Cucumber", 150, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 20, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Warm the bread", `Warm ${amount(400, servings)} g ${gf ? "gluten-free bread" : "damper-style bread"} as the packet directs.`, 8), step("Dress the salad", `Toss ${amount(150, servings)} g mixed salad leaves, ${amount(200, servings)} g tomatoes and ${amount(150, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 4)],
      equipment: ["Oven","Mixing bowl"],
      minutes: 15,
    }),
  },
  {
    option: { id: "creole-rice-okra", name: "Creole rice & okra", description: "Seasoned rice with okra — Creole / Cajun template.", emoji: "🍲" },
    regionHints: ["creole","cajun","caribbean","jamaican","brazilian"],
    build: (_gf, _df, servings) => ({
      side: "creole rice",
      vegetables: "okra",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("okra", "Okra", 300, "g", "produce", [], "Trimmed; sliced if large.", ["okra"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g long-grain rice as the packet directs. Rest and fluff.`, 18), step("Cook the okra", `Sauté ${amount(300, servings)} g okra in ${amount(2, servings)} tbsp olive oil for 8–10 minutes until tender. Finish with ${amount(15, servings)} ml lemon juice.`, 10)],
      equipment: ["Saucepan with lid","Wide frying pan"],
      minutes: 28,
    }),
  },
  {
    option: { id: "oat-risotto-greens", name: "Savoury oat risotto & greens", description: "Creamy rolled oats as a risotto-style side; rice flakes when gluten-free.", emoji: "🥣" },
    regionHints: ["home-kitchen","australian","nordic"],
    build: (gf, _df, servings) => ({
      side: gf ? "savoury rice-flake porridge" : "savoury oat risotto",
      vegetables: "steamed greens",
      ingredients: [gf ? ingredient("rice-flakes", "Gluten-free rice flakes", 200, "g", "grocery", [], "Labelled gluten-free. Use the packet's liquid ratio and cooking time.", ["gluten free rice flakes"]) : ingredient("rolled-oats", "Rolled oats", 200, "g", "grocery", ["oats"], "The gluten-free version uses labelled gluten-free rice flakes instead of oats.", ["oats","rolled oats"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 15, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step(gf ? "Cook the rice flakes" : "Cook the oats", `Simmer ${amount(200, servings)} g ${gf ? "gluten-free rice flakes" : "rolled oats"} in ${amount(800, servings)} ml water, or the packet's liquid quantity, stirring until creamy. ${gf ? "Rice flakes vary; follow their packet's cooking time, check early and add a little water if needed." : "Allow about 12–15 minutes, adding boiling water if it thickens before the oats soften."} Beat in ${amount(2, servings)} tbsp olive oil.`, 18), step("Add greens", `Stir through ${amount(200, servings)} g baby spinach until wilted. Take off the heat and finish with ${amount(15, servings)} ml lemon juice.`, 3)],
      equipment: ["Saucepan"],
      minutes: 25,
    }),
  }
];

export const MEAL_SIDES: readonly MealOption[] = DEFS.map((d) => d.option);

const BY_ID = new Map(DEFS.map((d) => [d.option.id, d]));

/** Indexes refer to the authored steps before the shared produce-preparation step. */
const LATE_STEPS: Readonly<Record<string, readonly number[]>> = {
  "rice-greens": [1], "potato-slaw": [1], "couscous-veg": [], "noodles-crunch": [1], "flatbread-salad": [0, 1],
  "lentil-salad": [1], "garden-salad": [1], "mashed-potato": [], "roast-pumpkin": [1], "steamed-broccoli": [1],
  "garlic-bread": [0, 1], "jasmine-cucumber": [1], "coconut-rice": [1], "kimchi-rice": [1], "basmati-raita": [1],
  "chapati-salad": [0, 1], "bulgur-tabbouleh": [1], "hummus-salad": [0, 1], "polenta-greens": [1], "chips-salad": [1],
  "coleslaw-corn": [1], "roast-veg-tray": [1], "sweet-potato-mash": [1], "black-bean-rice": [1], "tortilla-salsa": [0, 1],
  "quinoa-avocado": [1], "vermicelli-herb": [1], "sesame-spinach": [1], "injera-salad": [0, 1], "cauli-rice-greens": [1],
  "orzo-salad": [1], "plantain-greens": [1], "focaccia-salad": [0, 1], "sticky-rice-greens": [1], "spring-onion-fried-rice": [1],
  "miso-aubergine-rice": [], "soba-greens": [1], "pickle-cucumber-rice": [2], "pandan-rice-beans": [1], "banana-leaf-rice": [1, 2],
  "papaya-salad-side": [1], "lemongrass-rice": [1], "gai-lan-rice": [1], "asian-slaw-noodles": [1], "shanghainese-greens-rice": [1],
  "yunnan-potato-salad": [1], "jeera-rice-raita": [1], "paratha-salad": [0, 1], "idli-veg": [0, 1], "khichdi-greens": [1],
  "pappadum-salad": [0, 1], "biryani-style-rice": [1], "roti-salad": [0, 1], "xinjiang-bread-salad": [0, 1], "freekeh-salad": [1],
  "pita-fattoush": [0, 1], "jewelled-rice": [1], "harissa-carrots-couscous": [2], "baba-salad": [0, 1], "georgian-walnut-salad": [0, 1],
  "ratatouille-side": [], "egg-free-spaetzle-greens": [1], "risotto-style-side": [1], "patatas-bravas-side": [2], "beans-tomato-side": [1],
  "kale-farro": [1], "beetroot-salad": [1], "zucchini-ribbons": [1], "mushroom-rice-side": [], "tzatziki-potatoes": [1],
  "barley-veg": [], "tostones-side": [2], "congri-rice": [1], "arepa-salad": [0, 1], "chimichurri-potatoes": [1],
  "yuca-greens": [1], "elote-style-corn": [1], "avocado-tomato-rice": [1], "jollof-style-rice": [1], "ugali-greens": [1],
  "sukuma-wiki-side": [], "gomen-style-greens": [], "mozambican-rice-coconut": [1], "millet-greens": [1], "sorghum-salad": [1],
  "pumpkin-mash-salad": [1], "pea-mash-beans": [1], "damper-salad": [0, 1], "creole-rice-okra": [1], "oat-risotto-greens": [1],
};
const GRAIN_IDS = new Set(["rice", "jasmine-rice", "basmati", "basmati-rice", "sticky-rice", "brown-rice", "quinoa", "bulgur", "couscous", "orzo", "gf-pasta", "soba", "rice-noodles", "noodles", "soft-noodles", "freekeh", "barley", "farro", "millet", "sorghum", "maize-meal", "polenta", "rolled-oats", "rice-flakes", "red-lentils"]);
const PREPARED_FOODS = /bread|bun|chapati|roti|naan|pita|paratha|focaccia|damper|cracker|tortilla|idli|arepa|pappadum|hummus|baba ganoush|noodle|soba|kimchi|miso/i;
const SEQUENTIAL_COOKS = new Set(["ratatouille-side", "mushroom-rice-side", "gomen-style-greens", "sukuma-wiki-side", "tostones-side", "banana-leaf-rice"]);
const GRAIN_SAFETY_SOURCE = "https://www.foodstandards.gov.au/consumer/prevention-of-foodborne-illness/bacteria-foodborne-illness/bacillus-cereus";
const GRAIN_HOLDING = "Serve cooked grains and noodles promptly, or keep them at 60°C or hotter while waiting; keep cold garnishes chilled until assembly. For advance preparation, divide into shallow containers and refrigerate as soon as they stop steaming, at 5°C or colder. Do not leave a pot of rice cooling on the bench. Reheat only once until steaming hot throughout.";

function producePreparation(item: Draft): string {
  if (item.notes && /cut|slice|shred|chop|grate|peel|trim|halv|floret|ribbon|deseed|chunk|wedg|baton|seed|silk|husk|bruis/i.test(item.notes)) return item.notes;
  const label = `${item.id} ${item.name}`.toLowerCase();
  if (/avocado/.test(label)) return "Halve, remove the stone and skin, and slice just before serving.";
  if (/plantain/.test(label)) return "Peel, then slice as the cooking step directs; the listed weight is the peeled portion.";
  if (/pumpkin|sweet.potato/.test(label)) return "Peel, remove seeds where present and cut into even 2 cm pieces.";
  if (/potato|beetroot/.test(label)) return "Scrub and cut into even 2 cm pieces, peeling if preferred.";
  if (/broccoli/.test(label)) return "Cut into even florets; peel and slice any thick stalk.";
  if (/garlic/.test(label)) return "Peel and finely mince.";
  if (/spring.onion/.test(label)) return "Trim and finely slice.";
  if (/onion/.test(label)) return "Peel and finely dice or slice as the cooking step directs.";
  if (/mint|parsley|coriander/.test(label)) return "Remove tough stalks and finely chop the leaves.";
  if (/kale|silverbeet|chard|gai.lan|bok.choy/.test(label)) return "Remove tough stems; thinly slice tender stems and keep leaves separate so stems can cook first.";
  if (/lettuce|salad leaves|rocket|spinach/.test(label)) return "Wash well, drain and dry; tear any large leaves.";
  if (/cabbage|carrot/.test(label)) return "Finely shred or grate for a raw salad; cut into even thin pieces if cooking.";
  if (/capsicum|pepper/.test(label)) return "Remove the stalk and seeds and cut into even bite-sized pieces.";
  if (/cucumber|tomato|courgette|zucchini|aubergine/.test(label)) return "Trim and cut into even bite-sized pieces, or slice as the cooking step directs.";
  if (/green.beans/.test(label)) return "Trim the ends.";
  if (/okra/.test(label)) return "Trim the hard stalk tip without cutting into the seed chamber; halve only large pods.";
  if (/corn/.test(label)) return "Remove husks and silk; cut cobs into manageable portions if needed.";
  return item.notes || "Prepare the listed edible portion before starting the cooking steps.";
}

export function buildSidePlan(sideId: string, glutenFree: boolean, dairyFree: boolean, servings: number): SidePlanBuilt {
  const def = BY_ID.get(sideId);
  if (!def) throw new Error("Choose a recognised side pairing.");
  if (!Number.isInteger(servings) || servings < 1 || servings > 12) throw new Error("Choose between 1 and 12 whole servings for the side.");
  const built = def.build(glutenFree, dairyFree, servings);
  const ingredients = built.ingredients.map((entry) => {
    const item = { ...entry, allergens: [...entry.allergens], ...(entry.aliases ? { aliases: [...entry.aliases] } : {}) };
    if (GRAIN_IDS.has(item.id) && !/cooked|ready|dry weight/i.test(`${item.name} ${item.notes || ""}`)) item.notes = `${item.notes || ""} Dry weight; use the packet's liquid ratio, cooking time and resting instructions.`.trim();
    if (PREPARED_FOODS.test(item.name)) {
      const conditions = [glutenFree ? "Select an explicitly labelled gluten-free product." : "", dairyFree ? "Select a vegan, dairy-free and egg-free product." : ""].filter(Boolean).join(" ");
      if (conditions) item.notes = `${item.notes || ""} ${conditions}`.trim();
      if (dairyFree && /bread|bun|chapati|roti|naan|pita|paratha|focaccia|damper|cracker|tortilla|idli|arepa|pappadum|noodle|soba/i.test(item.name) && !/vegan|dairy.free/i.test(item.name)) {
        item.name = `Vegan dairy-free ${item.name.charAt(0).toLowerCase()}${item.name.slice(1)}`;
        item.aliases = [item.name.toLowerCase()];
      }
    }
    return item;
  });
  const produce = ingredients.filter((item) => item.category === "produce" && item.unit !== "ml" && !/frozen peas/i.test(item.name));
  const prep = produce.length ? step("Prepare the side ingredients", `Wash and dry the produce and use a clean board. Prepare these listed portions once; later steps use the same portions, not additional ingredients. ${produce.map((item) => `${amount(item.amount, servings)}${item.unit ? ` ${item.unit}` : ""} ${item.name.toLowerCase()}: ${producePreparation(item)}`).join(" ")} Read all side steps first: start long-cooking grains or roasting first, and overlap independent pan/steamer work so the components finish together. Keep cold products and undressed salad chilled until the final assembly.`, 5) : null;
  const offset = prep ? 1 : 0;
  const late = LATE_STEPS[sideId];
  if (!late) throw new Error(`The authored side ${sideId} is missing its finish schedule.`);
  const finishStepIndexes = late.map((index) => index + offset);
  const equipment = new Set(built.equipment);
  if (prep) equipment.add("Chopping board and knife");
  if (ingredients.some((item) => /grated|grate|ribbons/i.test(item.notes || ""))) equipment.add("Grater or vegetable peeler");
  if (built.steps.some((item) => /mash/i.test(item.title))) equipment.add("Potato masher or fork");
  if (built.steps.some((item) => /\bdrain\b/i.test(item.detail))) equipment.add("Colander or sieve");
  if (built.steps.some((item) => /dry pan|warm.*packet/i.test(item.detail)) && !built.equipment.some((item) => /pan|oven|steamer/i.test(item))) equipment.add("Dry frying pan or oven as the packet directs");
  if (built.steps.some((item) => /into a frying pan|in a frying pan/i.test(item.detail)) && !built.equipment.some((item) => /frying pan/i.test(item))) equipment.add("Frying pan");
  if (sideId === "black-bean-rice") equipment.add("Small saucepan for the cooked beans");
  if (servings > 6 && built.steps.some((item) => /roomy saucepan|2000|[4-6]000 ml.*water/.test(item.detail))) equipment.add("Large saucepan or stockpot for the full grain-and-water batch");
  const grainSafety = ingredients.some((item) => GRAIN_IDS.has(item.id)) ? GRAIN_HOLDING : undefined;
  if (grainSafety) equipment.add("Food thermometer");
  const safetyNote = [built.safetyNote, grainSafety].filter(Boolean).join(" ");
  const steps = built.steps.map((item, index) => ({ ...item, detail: `${item.detail}${grainSafety && index === built.steps.length - 1 ? ` ${grainSafety}` : ""}` }));
  const cookingMinutes = SEQUENTIAL_COOKS.has(sideId) ? built.steps.reduce((sum, item) => sum + (item.minutes || 0), 0) : Math.max(...built.steps.map((item) => item.minutes || 0));
  return { ...built, ingredients, steps: [...(prep ? [prep] : []), ...steps], equipment: [...equipment], finishStepIndexes, ...(safetyNote ? { safetyNote, safetySource: built.safetySource || GRAIN_SAFETY_SOURCE } : {}), minutes: Math.max(built.minutes, (prep ? 5 : 0) + cookingMinutes) };
}

/** Preferred side ids for a meal region (for plate diversification). */
export function preferredSidesForRegion(regionId: string): readonly string[] {
  const hits = DEFS.filter((d) => d.regionHints.includes(regionId)).map((d) => d.option.id);
  if (hits.length > 0) return hits;
  return ["rice-greens", "garden-salad", "roast-veg-tray"];
}

/** Authored side ↔ region affinities for strong markers (kimchi, miso soba, …). */
export function sideRegionHints(sideId: string): readonly string[] {
  return BY_ID.get(sideId)?.regionHints ?? [];
}

export function sideRegionCoverage(): { sideId: string; regionCount: number }[] {
  return DEFS.map((d) => ({ sideId: d.option.id, regionCount: d.regionHints.length }));
}
