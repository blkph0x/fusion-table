/**
 * Authored side / accompaniment templates for Fusion Table.
 * Australian English. Allergen tags are explicit. GF/dairy-free variants where needed.
 * Templates are not kitchen-tested. Check the packet.
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
      ingredients: [ingredient("side-pumpkin", "Pumpkin or butternut for the side", 800, "g", "produce", [], "Peeled and cut into 2 cm wedges for the side tray.", ["pumpkin", "butternut", "butternut squash"]), ingredient("spinach", "Baby spinach", 150, "g", "produce", [], "Washed."), oil(2), lemon],
      steps: [step("Roast the pumpkin", `Toss ${amount(800, servings)} g pumpkin or butternut for the side (2 cm wedges) with ${amount(2, servings)} tbsp olive oil. Spread on a tray and roast at 200°C for 25–30 minutes until browned at the edges and soft through the centre.`, 30), step("Wilt the spinach", `In the last 2 minutes, tip ${amount(150, servings)} g washed baby spinach onto the hot tray or a warm pan until just wilted. Finish with ${amount(15, servings)} ml lemon juice.`, 3)],
      equipment: ["Oven tray", "Mixing bowl"], minutes: 32,
    }),
  },
  {
    option: { id: "steamed-broccoli", name: "Steamed broccoli", description: "Broccoli florets with lemon and a small pot of jasmine rice.", emoji: "🥦" },
    regionHints: ["home-kitchen", "chinese", "cantonese", "australian", "japanese", "korean"],
    build: (_gf, _df, servings) => ({
      side: "jasmine rice", vegetables: "steamed broccoli with lemon",
      ingredients: [ingredient("jasmine-rice", "Jasmine rice", 280, "g", "grocery", [], "Dry weight.", ["jasmine rice", "rice"]), ingredient("side-broccoli", "Broccoli for the side", 500, "g", "produce", [], "Cut into even florets for the side.", ["broccoli"]), oil(1), lemon],
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
        ingredient("garlic-bread", gf ? "Gluten-free garlic bread" : "Garlic bread", 4, "", "grocery", gf ? [] : ["wheat"], gf ? "Choose a labelled gluten-free product; check for milk." : "Wheat bakery product; check the packet for milk and sesame.", gf ? ["gluten free garlic bread"] : ["garlic bread", "garlic toast"]),
        ingredient("tomato", "Tomatoes", 350, "g", "produce", [], "Chopped.", ["tomatoes", "tomato"]),
        oil(1),
        lemon,
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
    regionHints: ["korean", "japanese", "japanese-curry"],
    build: (_gf, _df, servings) => ({
      side: "steamed short-grain rice", vegetables: "kimchi & cucumber",
      ingredients: [ingredient("rice", "Short-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice", "sushi rice", "short grain rice"]), ingredient("kimchi", "Kimchi", 200, "g", "specialty", [], "Check the label for seafood, gluten and sesame.", ["kimchi"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], "Sliced.")],
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
            : [ingredient("side-mint", "Fresh mint for the side", 20, "g", "produce", [], "Leaves only.", ["mint"]), lime, oil(1)]),
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
        lemon,
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
            : `Whisk ${amount(250, servings)} g instant polenta into boiling water as the packet directs. Stir until thick, then beat in ${amount(2, servings)} tbsp olive oil. No butter is used.`, 12),
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
      ingredients: [ingredient("potatoes", "Potatoes", 900, "g", "produce", [], "Cut into chip-sized batons."), ingredient("lettuce", "Mixed salad leaves", 200, "g", "produce", [], "Washed.", ["lettuce", "salad leaves"]), oil(3), lemon],
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
      ingredients: [ingredient("potatoes", "Potatoes", 500, "g", "produce", [], "Cut into 2 cm chunks."), ingredient("carrot", "Carrots", 300, "g", "produce", [], "Cut into chunks."), ingredient("pepper", "Capsicum", 300, "g", "produce", [], "Deseeded and chunked.", ["capsicum", "pepper"]), oil(3), lemon],
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
      ingredients: [ingredient("rice", "Long-grain rice", 280, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("black-beans", "Canned black beans, drained", 400, "g", "grocery", [], "Already cooked; drained weight.", ["black beans"]), lime, oil(1)],
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
      ingredients: [ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight."), ingredient("avocado", "Avocado", 2, "", "produce", [], "Ripe; sliced just before serving.", ["avocado"]), oil(1), lemon],
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
        ingredient("injera", gf ? "Gluten-free flatbread" : "Ready teff injera", 4, "", "grocery", gf ? [] : [], gf ? "Labelled gluten-free." : "Prefer 100% teff injera; check the packet for wheat.", gf ? ["gluten free flatbread"] : ["injera", "teff injera"]),
        ingredient("tomato", "Tomatoes", 300, "g", "produce", [], "Chopped.", ["tomatoes"]),
        ingredient("cucumber", "Cucumber", 250, "g", "produce", [], "Chopped."),
        lemon,
        oil(1),
      ],
      steps: [
        step("Make the salad", `Combine ${amount(300, servings)} g chopped tomatoes and ${amount(250, servings)} g chopped cucumber. Dress with ${amount(25, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 5),
        step("Warm the bread", `Warm ${amount(4, servings)} ${gf ? "gluten-free flatbreads" : "injera pieces"} briefly as the packet directs. Check the packet for wheat before serving.`, 3),
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
      ingredients: [ingredient("cauliflower", "Cauliflower", 700, "g", "produce", [], "Grated or riced.", ["cauliflower"]), ingredient("green-beans", "Green beans", 350, "g", "produce", [], "Trimmed.", ["green beans"]), oil(2), lemon],
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
      ingredients: [ingredient("plantain", "Ripe plantain", 800, "g", "produce", [], "Peeled and sliced on the diagonal. Firm banana is a last resort if plantain is unavailable.", ["plantain", "cooking banana"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], "Washed."), oil(2), lime],
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
        lemon,
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
      ingredients: [ingredient("sticky-rice", "Sticky rice", 320, "g", "grocery", [], "Dry weight; soak as the packet directs.", ["sticky rice","glutinous rice"]), ingredient("bok-choy", "Bok choy", 400, "g", "produce", [], "Halved lengthwise.", ["bok choy","pak choy"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Steam the sticky rice", `Steam ${amount(320, servings)} g sticky rice until tender, about 20–25 minutes, or as the packet directs.`, 25), step("Steam the bok choy", `Steam ${amount(400, servings)} g bok choy for 3–5 minutes. Dress with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lime juice.`, 5)],
      equipment: ["Steamer","Saucepan"],
      minutes: 28,
    }),
  },
  {
    option: { id: "spring-onion-fried-rice", name: "Spring onion fried rice", description: "Egg-free fried rice with spring onion — weeknight Asian side.", emoji: "🍚" },
    regionHints: ["chinese","cantonese","sichuan","hunan","taiwanese","shanghainese","yunnan","xinjiang","japanese","japanese-curry","korean","filipino","malaysian","indonesian","peranakan","balinese","maluku","burmese","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "spring onion fried rice",
      vegetables: "spring onion",
      ingredients: [ingredient("rice", "Cooked long-grain rice", 600, "g", "grocery", [], "Cold leftover rice works best.", ["rice","cooked rice"]), ingredient("spring-onion", "Spring onion", 60, "g", "produce", [], "Sliced.", ["spring onion","green onion"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Fry the rice", `Heat ${amount(2, servings)} tbsp olive oil in a wide pan. Add ${amount(600, servings)} g cooked long-grain rice and stir-fry for 6–8 minutes until hot with light colour. Cook in batches if crowded.`, 8), step("Add spring onion", `Toss through ${amount(60, servings)} g spring onion and serve promptly.`, 2)],
      equipment: ["Wide frying pan"],
      minutes: 16,
    }),
  },
  {
    option: { id: "miso-aubergine-rice", name: "Miso aubergine & rice", description: "Steamed rice with miso-glazed aubergine.", emoji: "🍆" },
    regionHints: ["japanese","japanese-curry","korean","taiwanese"],
    build: (_gf, _df, servings) => ({
      side: "steamed rice",
      vegetables: "miso aubergine",
      ingredients: [ingredient("rice", "Short-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("side-aubergine", "Aubergine for the side", 500, "g", "produce", [], "Sliced into 1.5 cm rounds.", ["aubergine","eggplant"]), ingredient("white-miso", "White miso", 2, "tbsp", "grocery", [], "Check the packet for gluten.", ["miso","white miso"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g short-grain rice as the packet directs. Rest and fluff.`, 18), step("Roast the aubergine", `Toss ${amount(500, servings)} g aubergine for the side with ${amount(2, servings)} tbsp olive oil and ${amount(2, servings)} tbsp white miso. Roast at 200°C for 20–25 minutes until soft and browned.`, 25)],
      equipment: ["Saucepan with lid","Oven tray"],
      minutes: 30,
    }),
  },
  {
    option: { id: "soba-greens", name: "Soba & greens", description: "Buckwheat soba with wilted greens; rice noodles when gluten-free.", emoji: "🍜" },
    regionHints: ["japanese","japanese-curry","korean"],
    build: (gf, _df, servings) => ({
      side: gf ? "rice noodles" : "soba noodles",
      vegetables: "wilted greens",
      ingredients: [gf ? ingredient("rice-noodles", "Rice noodles", 280, "g", "grocery", [], "Labelled gluten-free rice noodles.", ["rice noodles"]) : ingredient("soba", "Soba noodles", 280, "g", "grocery", ["wheat"], "Many soba blends contain wheat — check the packet.", ["soba"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the noodles", `Cook ${amount(280, servings)} g ${gf ? "rice noodles" : "soba noodles"} as the packet directs. Drain well.`, 10), step("Wilt the greens", `Wilt ${amount(200, servings)} g baby spinach. Toss noodles with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lime juice.`, 4)],
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
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], "Dry weight.", ["rice"]), ingredient("cucumber", "Cucumber", 300, "g", "produce", [], "Thinly sliced."), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g long-grain rice as the packet directs. Rest and fluff.`, 18), step("Dress the cucumber", `Toss ${amount(300, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 3)],
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
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], "Dry weight; add a pandan leaf if you have one.", ["rice"]), ingredient("green-beans", "Green beans", 350, "g", "produce", [], "Trimmed.", ["green beans"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g long-grain rice as the packet directs. Rest and fluff.`, 18), step("Steam the beans", `Steam ${amount(350, servings)} g green beans for 5–7 minutes. Finish with ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lime juice.`, 7)],
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
      ingredients: [ingredient("rice", "Jasmine rice", 300, "g", "grocery", [], "Dry weight.", ["rice","jasmine rice"]), ingredient("coconut-milk", "Coconut milk", 200, "ml", "grocery", [], "Stir before measuring.", ["coconut milk"]), ingredient("green-beans", "Green beans", 300, "g", "produce", [], "Trimmed.", ["green beans"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the coconut rice", `Rinse ${amount(300, servings)} g jasmine rice. Cook with ${amount(200, servings)} ml coconut milk and ${amount(280, servings)} ml water, covered, until absorbed. Rest and fluff.`, 20), step("Steam the beans", `Steam ${amount(300, servings)} g green beans for 5–7 minutes. Finish with ${amount(15, servings)} ml lime juice.`, 7)],
      equipment: ["Saucepan with lid","Steamer"],
      minutes: 26,
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
      ingredients: [ingredient("rice", "Jasmine rice", 300, "g", "grocery", [], "Dry weight; bruise a lemongrass stalk into the pot if available.", ["rice","jasmine rice"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g jasmine rice as the packet directs. Rest and fluff.`, 18), step("Dress the cucumber", `Toss ${amount(250, servings)} g cucumber with ${amount(20, servings)} ml lime juice and ${amount(1, servings)} tbsp olive oil.`, 3)],
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
      ingredients: [ingredient("potatoes", "Potatoes", 800, "g", "produce", [], "Cut into bite-size chunks."), ingredient("side-coriander", "Coriander leaves for the side", 20, "g", "produce", [], undefined, ["coriander"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
        ingredients: [...(dairy ? [ingredient("yoghurt", "Plain yoghurt", 200, "g", "grocery", ["milk"], "Unsweetened.", ["yoghurt","yogurt"])] : [ingredient("side-mint", "Fresh mint for the side", 20, "g", "produce", [], undefined, ["mint"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"])]), ingredient("basmati", "Basmati rice", 300, "g", "grocery", [], "Dry weight.", ["basmati","basmati rice"]), ingredient("cumin-seeds", "Cumin seeds", 1, "tsp", "grocery", [], undefined, ["cumin"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
        steps: [step("Cook the basmati", `Rinse ${amount(300, servings)} g basmati rice. Cook with a pinch of cumin seeds as the packet directs. Rest and fluff.`, 18), step(dairy ? "Make the raita" : "Mint cucumber salad", dairy ? `Combine ${amount(200, servings)} g plain yoghurt with ${amount(250, servings)} g cucumber. Keep cold until serving. Finish with ${amount(15, servings)} ml lemon juice if you like.` : `Toss ${amount(250, servings)} g cucumber with ${amount(20, servings)} g fresh mint for the side, ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil. No yoghurt is used.`, dairy ? 5 : 5)],
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
      ingredients: [gf ? ingredient("gf-flatbread", "Gluten-free flatbread", 4, "", "grocery", [], "Labelled gluten-free.", ["gluten free flatbread"]) : ingredient("paratha", "Paratha", 4, "", "grocery", ["wheat"], "Ready paratha; warm as the packet directs.", ["paratha"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("idli", "Ready idli", 8, "", "grocery", [], "Steam as the packet directs; check for wheat.", ["idli"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("rice", "Long-grain rice", 200, "g", "grocery", [], undefined, ["rice"]), ingredient("red-lentils", "Red lentils", 100, "g", "grocery", [], "Rinsed; dry weight.", ["red lentils","masoor"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("pappadum", "Pappadums", 8, "", "grocery", [], "Microwave or grill as the packet directs; check for wheat.", ["pappadum","papad"]), ingredient("lettuce", "Mixed salad leaves", 150, "g", "produce", [], undefined, ["lettuce","salad leaves"]), ingredient("tomato", "Tomatoes", 150, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("basmati", "Basmati rice", 320, "g", "grocery", [], "Dry weight; add a pinch of turmeric if you like.", ["basmati"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the basmati", `Cook ${amount(320, servings)} g basmati rice as the packet directs. Rest and fluff.`, 20), step("Dress the cucumber", `Toss ${amount(250, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil.`, 3)],
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
      ingredients: [gf ? ingredient("gf-flatbread", "Gluten-free flatbread", 4, "", "grocery", [], "Labelled gluten-free.", ["gluten free flatbread"]) : ingredient("roti", "Roti", 4, "", "grocery", ["wheat"], undefined, ["roti"]), ingredient("tomato", "Tomatoes", 250, "g", "produce", [], undefined, ["tomatoes"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [gf ? ingredient("gf-flatbread", "Gluten-free flatbread", 4, "", "grocery", [], "Labelled gluten-free.", ["gluten free flatbread"]) : ingredient("naan", "Naan bread", 4, "", "grocery", ["wheat"], undefined, ["naan"]), ingredient("tomato", "Tomatoes", 300, "g", "produce", [], undefined, ["tomatoes"]), ingredient("cucumber", "Cucumber", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [gf ? ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight; naturally wheat-free.", ["quinoa"]) : ingredient("freekeh", "Freekeh", 280, "g", "grocery", ["wheat"], "Dry weight.", ["freekeh"]), ingredient("tomato", "Cherry tomatoes", 250, "g", "produce", [], undefined, ["tomatoes","cherry tomatoes"]), ingredient("side-parsley", "Parsley for the side", 30, "g", "produce", [], undefined, ["parsley"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the grain", `Cook ${amount(280, servings)} g ${gf ? "quinoa" : "freekeh"} as the packet directs until tender. Drain and cool slightly.`, 22), step("Dress the salad", `Toss with ${amount(250, servings)} g cherry tomatoes, ${amount(30, servings)} g parsley for the side, ${amount(2, servings)} tbsp olive oil and ${amount(30, servings)} ml lemon juice.`, 5)],
      equipment: ["Saucepan","Mixing bowl"],
      minutes: 30,
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
    option: { id: "jewelled-rice", name: "Jewelled rice & herbs", description: "Basmati with herbs — Persian-inspired template.", emoji: "💎" },
    regionHints: ["persian","afghan","georgian","turkish"],
    build: (_gf, _df, servings) => ({
      side: "jewelled rice",
      vegetables: "herb salad",
      ingredients: [ingredient("basmati", "Basmati rice", 300, "g", "grocery", [], undefined, ["basmati"]), ingredient("side-parsley", "Parsley for the side", 40, "g", "produce", [], undefined, ["parsley"]), ingredient("side-mint", "Fresh mint for the side", 20, "g", "produce", [], undefined, ["mint"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the basmati", `Cook ${amount(300, servings)} g basmati rice as the packet directs. Rest and fluff.`, 20), step("Herb salad", `Toss ${amount(40, servings)} g parsley for the side and ${amount(20, servings)} g fresh mint for the side with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lemon juice. Serve beside the rice.`, 4)],
      equipment: ["Saucepan with lid","Mixing bowl"],
      minutes: 28,
    }),
  },
  {
    option: { id: "harissa-carrots-couscous", name: "Harissa carrots & couscous", description: "Couscous with roast carrot; quinoa when gluten-free.", emoji: "🥕" },
    regionHints: ["moroccan","tunisian","west-african"],
    build: (gf, _df, servings) => ({
      side: gf ? "quinoa" : "couscous",
      vegetables: "roast carrots",
      ingredients: [gf ? ingredient("quinoa", "Quinoa", 280, "g", "grocery", [], "Dry weight.", ["quinoa"]) : ingredient("couscous", "Couscous", 280, "g", "grocery", ["wheat"], undefined, ["couscous"]), ingredient("carrot", "Carrots", 500, "g", "produce", [], "Cut into batons.", ["carrot","carrots"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the carrots", `Toss ${amount(500, servings)} g carrots with ${amount(2, servings)} tbsp olive oil. Roast at 200°C for 25–30 minutes until tender.`, 28), step("Cook the grain", `Prepare ${amount(280, servings)} g ${gf ? "quinoa" : "couscous"} as the packet directs. Finish with ${amount(20, servings)} ml lemon juice and the roast carrots.`, 15)],
      equipment: ["Mixing bowl","Oven tray"],
      minutes: 30,
    }),
  },
  {
    option: { id: "baba-salad", name: "Baba ganoush & salad", description: "Ready baba ganoush (sesame) with cucumber salad and flatbread.", emoji: "🍆" },
    regionHints: ["levantine","syrian","turkish","persian"],
    build: (gf, _df, servings) => ({
      side: gf ? "baba ganoush" : "baba ganoush",
      vegetables: "cucumber salad",
      ingredients: [gf ? ingredient("gf-crackers", "Gluten-free crackers", 120, "g", "grocery", [], "Labelled gluten-free.", ["gluten free crackers"]) : ingredient("flatbread", "Vegan flatbread", 4, "", "grocery", ["wheat"], undefined, ["flatbread"]), ingredient("baba", "Ready baba ganoush", 300, "g", "grocery", ["sesame"], "Check the label for sesame and gluten.", ["baba ganoush"]), ingredient("cucumber", "Cucumber", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Plate the baba ganoush", `Spoon ${amount(300, servings)} g ready baba ganoush onto a plate. Check the packet for sesame.`, 2), step("Salad and bread", `Toss ${amount(250, servings)} g cucumber with ${amount(20, servings)} ml lemon juice and ${amount(1, servings)} tbsp olive oil. Serve with ${gf ? "${amount(120, servings)} g gluten-free crackers" : "${amount(4, servings)} vegan flatbread"}.`, 5)],
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
      ingredients: [gf ? ingredient("gf-bread", "Gluten-free bread", 300, "g", "grocery", [], "Labelled gluten-free.", ["gluten free bread"]) : ingredient("flatbread", "Vegan flatbread", 4, "", "grocery", ["wheat"], undefined, ["flatbread"]), ingredient("walnuts", "Walnuts", 80, "g", "grocery", ["tree-nut"], "Roughly chopped.", ["walnuts"]), ingredient("side-parsley", "Parsley for the side", 40, "g", "produce", [], undefined, ["parsley"]), ingredient("side-coriander", "Coriander leaves for the side", 20, "g", "produce", [], undefined, ["coriander"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Make the herb salad", `Combine ${amount(80, servings)} g walnuts, ${amount(40, servings)} g parsley for the side and ${amount(20, servings)} g coriander leaves for the side. Dress with ${amount(2, servings)} tbsp olive oil and ${amount(25, servings)} ml lemon juice.`, 6), step("Warm the bread", `Warm ${gf ? "${amount(300, servings)} g gluten-free bread" : "${amount(4, servings)} vegan flatbread"} as the packet directs.`, 4)],
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
      ingredients: [gf ? ingredient("gf-pasta", "Gluten-free short pasta", 350, "g", "grocery", [], "Labelled gluten-free.", ["gluten free pasta"]) : ingredient("soft-noodles", "Egg-free soft noodles", 350, "g", "grocery", ["wheat"], "Choose egg-free noodles; check the packet.", ["egg free noodles","soft noodles"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the noodles", `Cook ${amount(350, servings)} g ${gf ? "gluten-free short pasta" : "egg-free soft noodles"} as the packet directs. Drain.`, 12), step("Wilt the greens", `Toss with ${amount(200, servings)} g baby spinach, ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lemon juice.`, 4)],
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
      ingredients: [ingredient("arborio", "Arborio rice", 280, "g", "grocery", [], "Dry weight; stir as the packet directs.", ["arborio","risotto rice"]), ingredient("peas", "Frozen peas", 150, "g", "produce", [], "Added in the last minutes.", ["peas"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(280, servings)} g arborio rice with ladlefuls of hot water or stock as the packet directs, about 18–22 minutes, stirring often. Beat in ${amount(2, servings)} tbsp olive oil.`, 22), step("Add peas and lemon", `Stir through ${amount(150, servings)} g frozen peas until hot. Finish with ${amount(20, servings)} ml lemon juice.`, 4)],
      equipment: ["Saucepan"],
      minutes: 30,
    }),
  },
  {
    option: { id: "patatas-bravas-side", name: "Patatas bravas style", description: "Crisp potato cubes with lemon — Spanish tapas-inspired side.", emoji: "🥔" },
    regionHints: ["spanish","portuguese","cuban","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "crisp potatoes",
      vegetables: "lemon finish",
      ingredients: [ingredient("potatoes", "Potatoes", 900, "g", "produce", [], "Cut into 2 cm cubes."), ingredient("olive-oil", "Olive oil", 3, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the potatoes", `Toss ${amount(900, servings)} g potatoes with ${amount(3, servings)} tbsp olive oil. Roast at 220°C for 35–40 minutes until crisp. Cook in batches if crowded.`, 38), step("Finish", `Dress with ${amount(20, servings)} ml lemon juice just before serving.`, 1)],
      equipment: ["Oven tray"],
      minutes: 40,
    }),
  },
  {
    option: { id: "beans-tomato-side", name: "Tomato beans & greens", description: "Warm canned white beans in tomato with spinach.", emoji: "🫘" },
    regionHints: ["italian","spanish","portuguese","greek","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "tomato beans",
      vegetables: "spinach",
      ingredients: [ingredient("white-beans", "Canned white beans, drained", 400, "g", "grocery", [], "Already cooked; drained weight.", ["white beans","cannellini"]), ingredient("tomato", "Passata or crushed tomatoes", 200, "g", "grocery", [], undefined, ["tomato","passata"]), ingredient("spinach", "Baby spinach", 150, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [gf ? ingredient("brown-rice", "Brown rice", 280, "g", "grocery", [], "Dry weight.", ["brown rice"]) : ingredient("farro", "Farro", 280, "g", "grocery", ["wheat"], undefined, ["farro"]), ingredient("kale", "Kale", 250, "g", "produce", [], "Stems removed, leaves torn.", ["kale"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the grain", `Cook ${amount(280, servings)} g ${gf ? "brown rice" : "farro"} as the packet directs until tender. Drain.`, 28), step("Wilt the kale", `Sauté ${amount(250, servings)} g kale in ${amount(2, servings)} tbsp olive oil until tender. Finish with ${amount(20, servings)} ml lemon juice.`, 7)],
      equipment: ["Saucepan","Frying pan"],
      minutes: 35,
    }),
  },
  {
    option: { id: "beetroot-salad", name: "Beetroot salad", description: "Roast beetroot with salad leaves and lemon.", emoji: "🟣" },
    regionHints: ["nordic","hungarian","french","australian","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "beetroot salad",
      vegetables: "leaves & lemon",
      ingredients: [ingredient("beetroot", "Beetroot", 600, "g", "produce", [], "Scrubbed; wrap and roast until tender.", ["beetroot","beets"]), ingredient("lettuce", "Mixed salad leaves", 120, "g", "produce", [], undefined, ["lettuce"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the beetroot", `Wrap ${amount(600, servings)} g beetroot and roast at 200°C until tender, about 40 minutes. Cool, peel and chunk.`, 42), step("Dress", `Toss with ${amount(120, servings)} g mixed salad leaves, ${amount(2, servings)} tbsp olive oil and ${amount(25, servings)} ml lemon juice.`, 4)],
      equipment: ["Oven","Mixing bowl"],
      minutes: 45,
    }),
  },
  {
    option: { id: "zucchini-ribbons", name: "Courgette ribbons & lemon", description: "Quick sautéed courgette ribbons — light weeknight side.", emoji: "🥒" },
    regionHints: ["italian","french","spanish","portuguese","greek","hungarian","nordic","home-kitchen","australian","levantine","turkish"],
    build: (_gf, _df, servings) => ({
      side: "courgette ribbons",
      vegetables: "lemon",
      ingredients: [ingredient("side-courgette", "Courgette for the side", 700, "g", "produce", [], "Peeled into ribbons or thin slices.", ["courgette","zucchini"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      steps: [step("Cook the mushrooms", `Sauté ${amount(300, servings)} g mushrooms for the side in ${amount(2, servings)} tbsp olive oil until the liquid evaporates, about 8 minutes.`, 8), step("Add the rice", `Add ${amount(300, servings)} g long-grain rice and water as the packet directs. Cover and cook until tender. Rest and fluff.`, 18)],
      equipment: ["Wide frying pan","Saucepan with lid"],
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
        ingredients: [...(dairy ? [ingredient("yoghurt", "Plain yoghurt", 200, "g", "grocery", ["milk"], undefined, ["yoghurt"])] : [ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"])]), ingredient("potatoes", "Potatoes", 800, "g", "produce", [], "Cut into chunks."), ingredient("cucumber", "Cucumber", 150, "g", "produce", [], undefined), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [gf ? ingredient("brown-rice", "Brown rice", 280, "g", "grocery", [], "Dry weight.", ["brown rice"]) : ingredient("barley", "Pearl barley", 280, "g", "grocery", ["wheat"], "Barley contains gluten; dry weight.", ["barley","pearl barley"]), ingredient("carrot", "Carrots", 300, "g", "produce", [], undefined, ["carrot"]), ingredient("pepper", "Capsicum", 250, "g", "produce", [], undefined, ["capsicum","pepper"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the grain", `Cook ${amount(280, servings)} g ${gf ? "brown rice" : "pearl barley"} as the packet directs until tender.`, 30), step("Roast the vegetables", `Toss ${amount(300, servings)} g carrots and ${amount(250, servings)} g capsicum with ${amount(2, servings)} tbsp olive oil. Roast at 200°C for 25–30 minutes. Finish with ${amount(20, servings)} ml lemon juice.`, 28)],
      equipment: ["Saucepan","Oven tray"],
      minutes: 40,
    }),
  },
  {
    option: { id: "tostones-side", name: "Tostones-style plantain", description: "Pan-fried plantain slices with lime.", emoji: "🍌" },
    regionHints: ["caribbean","jamaican","creole","cajun","puerto-rican","cuban","brazilian","west-african"],
    build: (_gf, _df, servings) => ({
      side: "tostones-style plantain",
      vegetables: "lime finish",
      ingredients: [ingredient("plantain", "Green plantain", 800, "g", "produce", [], "Peeled and sliced.", ["plantain"]), ingredient("olive-oil", "Olive oil", 3, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the plantain", `Heat ${amount(3, servings)} tbsp olive oil. Fry ${amount(800, servings)} g green plantain in batches for 3–4 minutes per side until golden. Drain on paper.`, 20), step("Finish with lime", `Dress with ${amount(20, servings)} ml lime juice and serve warm.`, 1)],
      equipment: ["Wide frying pan"],
      minutes: 30,
    }),
  },
  {
    option: { id: "congri-rice", name: "Congrí-style rice & beans", description: "Rice cooked with black beans — Cuban / Caribbean template.", emoji: "🫘" },
    regionHints: ["cuban","caribbean","puerto-rican","jamaican"],
    build: (_gf, _df, servings) => ({
      side: "rice and beans",
      vegetables: "lime finish",
      ingredients: [ingredient("rice", "Long-grain rice", 280, "g", "grocery", [], undefined, ["rice"]), ingredient("black-beans", "Canned black beans, drained", 300, "g", "grocery", [], "Already cooked.", ["black beans"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(280, servings)} g long-grain rice as the packet directs. Rest and fluff.`, 18), step("Warm the beans", `Warm ${amount(300, servings)} g canned black beans, drained with ${amount(1, servings)} tbsp olive oil and ${amount(20, servings)} ml lime juice until steaming hot.`, 5)],
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
      ingredients: [ingredient("arepa", "Ready arepas", 4, "", "grocery", [], "Warm as the packet directs; check for wheat.", ["arepa","arepas"]), ingredient("avocado", "Avocado", 2, "", "produce", [], undefined, ["avocado"]), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("potatoes", "Potatoes", 900, "g", "produce", [], "Cut into wedges."), ingredient("side-parsley", "Parsley for the side", 40, "g", "produce", [], undefined, ["parsley"]), ingredient("side-garlic", "Garlic for the side", 10, "g", "produce", [], "Finely chopped for the chimichurri.", ["garlic"]), ingredient("olive-oil", "Olive oil", 3, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Roast the potatoes", `Toss ${amount(900, servings)} g potatoes with ${amount(2, servings)} tbsp olive oil. Roast at 200°C for 35–40 minutes until golden.`, 38), step("Make the chimichurri", `Combine ${amount(40, servings)} g parsley for the side, ${amount(10, servings)} g garlic for the side, remaining olive oil and ${amount(25, servings)} ml lemon juice. Spoon over the potatoes.`, 5)],
      equipment: ["Oven tray","Mixing bowl"],
      minutes: 40,
    }),
  },
  {
    option: { id: "yuca-greens", name: "Boiled yuca & greens", description: "Cassava / yuca with wilted greens and lime.", emoji: "🌿" },
    regionHints: ["caribbean","jamaican","creole","cajun","brazilian","west-african","mozambican","peruvian"],
    build: (_gf, _df, servings) => ({
      side: "boiled yuca",
      vegetables: "wilted greens",
      ingredients: [ingredient("yuca", "Yuca (cassava)", 800, "g", "produce", [], "Peeled; remove the fibrous core. Boil until tender.", ["yuca","cassava"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Boil the yuca", `Boil ${amount(800, servings)} g yuca (cassava) until tender, about 20–25 minutes. Drain well.`, 25), step("Wilt the greens", `Wilt ${amount(200, servings)} g baby spinach in ${amount(2, servings)} tbsp olive oil. Finish with ${amount(15, servings)} ml lime juice.`, 4)],
      equipment: ["Saucepan","Frying pan"],
      minutes: 35,
    }),
  },
  {
    option: { id: "elote-style-corn", name: "Elote-style corn", description: "Charred corn with lime.", emoji: "🌽" },
    regionHints: ["mexican","oaxacan","yucatecan","home-kitchen"],
    build: (_gf, _df, servings) => ({
      side: "elote-style corn",
      vegetables: "lime finish",
      ingredients: [ingredient("corn", "Corn cobs", 4, "", "produce", [], undefined, ["corn","sweetcorn"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the corn", `Brush ${amount(4, servings)} corn cobs with ${amount(1, servings)} tbsp olive oil. Grill or pan-char for 8–12 minutes, turning, until speckled.`, 12), step("Finish with lime", `Dress with ${amount(25, servings)} ml lime juice and serve hot.`, 1)],
      equipment: ["Wide frying pan or grill"],
      minutes: 18,
    }),
  },
  {
    option: { id: "avocado-tomato-rice", name: "Avocado tomato rice", description: "Warm rice topped with avocado and tomato.", emoji: "🥑" },
    regionHints: ["mexican","oaxacan","yucatecan","peruvian","chilean","argentine","brazilian","cuban","puerto-rican","home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "rice",
      vegetables: "avocado & tomato",
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("avocado", "Avocado", 2, "", "produce", [], undefined), ingredient("tomato", "Tomatoes", 250, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      steps: [step("Cook the tomato rice", `Sauté ${amount(250, servings)} g passata or crushed tomatoes in ${amount(2, servings)} tbsp olive oil for 5 minutes. Add ${amount(300, servings)} g long-grain rice and water as the packet directs. Cover and cook until tender.`, 28), step("Wilt the greens", `Stir through ${amount(200, servings)} g baby spinach until wilted.`, 3)],
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
      ingredients: [ingredient("maize-meal", "Maize meal", 300, "g", "grocery", [], "Dry weight; stir as the packet directs for ugali or sadza.", ["maize meal","mielie meal","cornmeal"]), ingredient("spinach", "Baby spinach", 250, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("kale", "Kale", 400, "g", "produce", [], "Or use cabbage if kale is unavailable.", ["kale","cabbage"]), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("kale", "Kale", 500, "g", "produce", [], "Or collard greens if available.", ["kale","collard"]), ingredient("side-onion", "Onion for the side", 80, "g", "produce", [], undefined, ["onion"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Soften the onion", `Cook ${amount(80, servings)} g onion for the side in ${amount(2, servings)} tbsp olive oil for about 5 minutes until soft.`, 5), step("Cook the kale", `Add ${amount(500, servings)} g kale and cook 15–18 minutes until tender. Finish with ${amount(20, servings)} ml lemon juice.`, 18)],
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
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("coconut-milk", "Coconut milk", 250, "ml", "grocery", [], undefined, ["coconut milk"]), ingredient("lime-juice", "Lime juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("millet", "Millet", 280, "g", "grocery", [], "Dry weight; rinse well.", ["millet"]), ingredient("side-broccoli", "Broccoli for the side", 350, "g", "produce", [], "Florets.", ["broccoli"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the millet", `Rinse ${amount(280, servings)} g millet. Simmer covered until tender, about 20 minutes, or as the packet directs. Rest and fluff.`, 22), step("Steam the broccoli", `Steam ${amount(350, servings)} g broccoli for the side for 5–7 minutes. Finish with ${amount(1, servings)} tbsp olive oil and ${amount(15, servings)} ml lemon juice.`, 7)],
      equipment: ["Saucepan with lid","Steamer"],
      minutes: 28,
    }),
  },
  {
    option: { id: "sorghum-salad", name: "Sorghum salad", description: "Chewy sorghum with tomato and herbs. Wheat-free.", emoji: "🧡" },
    regionHints: ["ethiopian","somali","west-african","mozambican","indian","home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "sorghum salad",
      vegetables: "tomato & herbs",
      ingredients: [ingredient("sorghum", "Sorghum grain", 280, "g", "grocery", [], "Dry weight; simmer until chewy-tender.", ["sorghum"]), ingredient("tomato", "Cherry tomatoes", 250, "g", "produce", [], undefined, ["tomatoes"]), ingredient("side-parsley", "Parsley for the side", 25, "g", "produce", [], undefined, ["parsley"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the sorghum", `Simmer ${amount(280, servings)} g sorghum grain until chewy-tender, about 40 minutes, or as the packet directs. Drain.`, 40), step("Dress the salad", `Toss with ${amount(250, servings)} g cherry tomatoes, ${amount(25, servings)} g parsley for the side, ${amount(2, servings)} tbsp olive oil and ${amount(30, servings)} ml lemon juice.`, 5)],
      equipment: ["Saucepan","Mixing bowl"],
      minutes: 45,
    }),
  },
  {
    option: { id: "pumpkin-mash-salad", name: "Pumpkin mash & salad", description: "Simple pumpkin mash with garden leaves — Aussie weeknight.", emoji: "🎃" },
    regionHints: ["home-kitchen","australian"],
    build: (_gf, _df, servings) => ({
      side: "pumpkin mash",
      vegetables: "garden leaves",
      ingredients: [ingredient("side-pumpkin", "Pumpkin for the side", 800, "g", "produce", [], "Peeled and chunked.", ["pumpkin"]), ingredient("lettuce", "Mixed salad leaves", 120, "g", "produce", [], undefined, ["lettuce"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("peas", "Frozen peas", 500, "g", "produce", [], undefined, ["peas"]), ingredient("green-beans", "Green beans", 300, "g", "produce", [], undefined, ["green beans"]), ingredient("side-mint", "Fresh mint for the side", 15, "g", "produce", [], undefined, ["mint"]), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [gf ? ingredient("gf-bread", "Gluten-free bread", 400, "g", "grocery", [], "Labelled gluten-free.", ["gluten free bread"]) : ingredient("damper", "Damper-style bread", 400, "g", "grocery", ["wheat"], "Warm as the packet directs.", ["damper","bread"]), ingredient("lettuce", "Mixed salad leaves", 150, "g", "produce", [], undefined, ["lettuce"]), ingredient("tomato", "Tomatoes", 200, "g", "produce", [], undefined, ["tomatoes"]), ingredient("cucumber", "Cucumber", 150, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 1, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
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
      ingredients: [ingredient("rice", "Long-grain rice", 300, "g", "grocery", [], undefined, ["rice"]), ingredient("okra", "Okra", 300, "g", "produce", [], "Trimmed; sliced if large.", ["okra"]), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the rice", `Cook ${amount(300, servings)} g long-grain rice as the packet directs. Rest and fluff.`, 18), step("Cook the okra", `Sauté ${amount(300, servings)} g okra in ${amount(2, servings)} tbsp olive oil for 8–10 minutes until tender. Finish with ${amount(15, servings)} ml lemon juice.`, 10)],
      equipment: ["Saucepan with lid","Wide frying pan"],
      minutes: 28,
    }),
  },
  {
    option: { id: "oat-risotto-greens", name: "Savoury oat risotto & greens", description: "Creamy rolled oats as a risotto-style side; oats allergen tagged.", emoji: "🥣" },
    regionHints: ["home-kitchen","australian","nordic"],
    build: (_gf, _df, servings) => ({
      side: "savoury oat risotto",
      vegetables: "steamed greens",
      ingredients: [ingredient("rolled-oats", "Rolled oats", 200, "g", "grocery", ["oats"], "Use certified gluten-free oats if avoiding gluten cross-contact.", ["oats","rolled oats"]), ingredient("spinach", "Baby spinach", 200, "g", "produce", [], undefined), ingredient("olive-oil", "Olive oil", 2, "tbsp", "grocery", [], undefined, ["olive oil"]), ingredient("lemon-juice", "Lemon juice", 30, "ml", "produce", [], "Freshly squeezed; measure the juice.")],
      steps: [step("Cook the oats", `Simmer ${amount(200, servings)} g rolled oats in water or stock, stirring, until creamy, about 12–15 minutes. Beat in ${amount(2, servings)} tbsp olive oil.`, 15), step("Add greens", `Stir through ${amount(200, servings)} g baby spinach until wilted. Finish with ${amount(15, servings)} ml lemon juice.`, 3)],
      equipment: ["Saucepan"],
      minutes: 25,
    }),
  }
];

export const MEAL_SIDES: readonly MealOption[] = DEFS.map((d) => d.option);

const BY_ID = new Map(DEFS.map((d) => [d.option.id, d]));

export function buildSidePlan(sideId: string, glutenFree: boolean, dairyFree: boolean, servings: number): SidePlanBuilt {
  const def = BY_ID.get(sideId);
  if (!def) throw new Error("Choose a recognised side pairing.");
  return def.build(glutenFree, dairyFree, servings);
}

/** Preferred side ids for a meal region (for plate diversification). */
export function preferredSidesForRegion(regionId: string): readonly string[] {
  const hits = DEFS.filter((d) => d.regionHints.includes(regionId)).map((d) => d.option.id);
  if (hits.length > 0) return hits;
  return ["rice-greens", "garden-salad", "roast-veg-tray"];
}

export function sideRegionCoverage(): { sideId: string; regionCount: number }[] {
  return DEFS.map((d) => ({ sideId: d.option.id, regionCount: d.regionHints.length }));
}
