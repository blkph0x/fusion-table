"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChefHat, ChevronDown, Globe2, Leaf, Search, Sparkles, Utensils } from "lucide-react";
import { DIETS } from "@/lib/recipes";
import { MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, generateMeal, getMealCombinationCount, getMainsForDiet, getMethodsForMain } from "@/lib/meals";
import type { MealInput } from "@/lib/meal-types";
import type { DietId, Recipe, SpiceHeat } from "@/lib/recipe-types";

type Props = { onCreated: (recipe: Recipe) => void; initialRecipe?: Recipe | null };
const STEPS = ["Main ingredient", "Cooking method", "Regional flavour", "Make it a meal"];
const POPULAR = ["chicken", "beef", "salmon", "prawns", "tofu", "mushrooms", "cauliflower", "chickpeas"];
const CATEGORIES = [{ id: "all", name: "All ingredients" }, { id: "meat", name: "Meat & poultry" }, { id: "seafood", name: "Seafood" }, { id: "plant", name: "Plants & pulses" }, { id: "vegetarian", name: "Eggs & cheese" }] as const;

export default function MealBuilder({ onCreated, initialRecipe }: Props) {
  const seed = initialRecipe?.kind === "meal" ? initialRecipe : null;
  const [step, setStep] = useState(seed ? 3 : 0);
  const [mainId, setMainId] = useState(seed?.mainId || "");
  const [methodId, setMethodId] = useState(seed?.methodId || "");
  const [regionId, setRegionId] = useState(seed?.regionId || "japanese");
  const [sideId, setSideId] = useState(seed?.sideId || "rice-greens");
  const [diet, setDiet] = useState<DietId>(seed?.diet || "balanced");
  const [spiceHeat, setSpiceHeat] = useState<SpiceHeat>(seed?.spiceHeat || "medium");
  const [servings, setServings] = useState(seed?.servings || 2);
  const [pantry, setPantry] = useState(seed?.ingredients.filter((i) => i.inPantry).map((i) => i.name).join(", ") || "");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLHeadingElement>(null);

  const allowedMains = getMainsForDiet(diet);
  const visibleMains = useMemo(() => {
    const query = search.trim().toLowerCase();
    return getMainsForDiet(diet).filter((main) =>
      (category === "all" || main.category === category) &&
      (!query || `${main.name} ${main.ingredientAliases.join(" ")}`.toLowerCase().includes(query)) &&
      (showAll || query || category !== "all" || POPULAR.includes(main.id)));
  }, [diet, category, search, showAll]);
  const main = MAIN_INGREDIENTS.find((item) => item.id === mainId);
  const methods = getMethodsForMain(mainId);
  const method = methods.find((item) => item.id === methodId);
  const region = MEAL_REGIONS.find((item) => item.id === regionId);
  const side = MEAL_SIDES.find((item) => item.id === sideId);
  const input: MealInput = { mainId, methodId, regionId, sideId, servings, diet, spiceHeat, pantry };
  const canOpen = (index: number) => index === 0 || (!!main && (index === 1 || !!method));

  function goTo(next: number) {
    setStep(next); setError("");
    requestAnimationFrame(() => { panelRef.current?.focus({ preventScroll: true }); panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
  }
  function chooseMain(id: string) {
    setMainId(id);
    if (!getMethodsForMain(id).some((item) => item.id === methodId)) setMethodId("");
    goTo(1);
  }
  function changeDiet(next: DietId) {
    setDiet(next); setError("");
    if (mainId && !getMainsForDiet(next).some((item) => item.id === mainId)) {
      setMainId(""); setMethodId(""); goTo(0); setCategory("all"); setSearch(""); setShowAll(true);
      setError(`${main?.name || "Your main"} doesn’t fit that preference. Choose a compatible main below.`);
    }
  }
  function create(event: FormEvent) {
    event.preventDefault(); setError("");
    try { onCreated(generateMeal(input)); }
    catch (err) { setError(err instanceof Error ? err.message : "Please check your meal choices."); }
  }

  return <div className="meal-builder">
    <div className="builder-topline"><p><span className="builder-new">MORE POSSIBILITIES</span><strong>{getMealCombinationCount().toLocaleString("en-AU")}</strong> meal combinations · {MAIN_INGREDIENTS.length} mains · {MEAL_REGIONS.length} regions</p><span className="builder-template-note">Authored templates · Your choices</span></div>
    <ol className="builder-steps" aria-label="Build your meal">{STEPS.map((label, index) => <li key={label}><button type="button" className={step === index ? "current" : step > index ? "complete" : ""} aria-current={step === index ? "step" : undefined} disabled={!canOpen(index)} onClick={() => goTo(index)}><span>{step > index ? <Check size={15} /> : index + 1}</span><strong>{label}</strong></button></li>)}</ol>
    <div className="builder-panel">
      <div className="builder-panel-heading"><div><span className="eyebrow">STEP {step + 1} OF 4</span><h3 ref={panelRef} tabIndex={-1}>{["What’s the star of your meal?", `How would you like your ${main?.name.toLowerCase() || "main"}?`, "Where shall we take the flavour?", "Bring your whole plate together."][step]}</h3><p>{["Start with what you love, or what’s already in the fridge.", "Choose a technique. We’ll match the cut, preparation and cooking instructions.", "Keep your main and method. Explore a different regional sauce and seasoning.", "Choose a side, set your preferences, and we’ll write the full cooking plan."][step]}</p></div>{main && step > 0 && <span className="selected-main"><span aria-hidden="true">{main.emoji}</span>{main.name}{method && step > 1 && <small>{method.name}</small>}</span>}</div>
      {error && <p className="error-message" role="alert">{error}</p>}
      {step === 0 && <>
        <div className="main-search-row"><label className="builder-search"><Search size={17} /><span className="sr-only">Search main ingredients</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search chicken, fish, eggplant…" maxLength={60} /></label><label className="builder-diet"><Leaf size={16} /><span className="sr-only">Meal dietary preference</span><select value={diet} onChange={(event) => changeDiet(event.target.value as DietId)}>{DIETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label></div>
        <div className="ingredient-filters" aria-label="Ingredient categories">{CATEGORIES.map((item) => <button type="button" key={item.id} className={category === item.id ? "selected" : ""} aria-pressed={category === item.id} onClick={() => setCategory(item.id)}>{item.name}</button>)}</div>
        <div className="ingredient-choices">{visibleMains.map((item) => <button type="button" key={item.id} className={`main-choice ${mainId === item.id ? "selected" : ""}`} onClick={() => chooseMain(item.id)} aria-label={`Choose ${item.name}`} aria-pressed={mainId === item.id}><span className="main-emoji" aria-hidden="true">{item.emoji}</span><span><strong>{item.name}</strong><small>{item.methodIds.length} ways to cook</small></span><ArrowRight size={16} /></button>)}</div>
        {!visibleMains.length && <p className="builder-no-results">No mains match these filters. Try another category or dietary preference.</p>}
        {!search && category === "all" && <button type="button" className="text-button show-ingredients" onClick={() => setShowAll(!showAll)} aria-expanded={showAll}>{showAll ? "Show popular ingredients" : `Explore all ${allowedMains.length} ingredients`}<ChevronDown size={15} className={showAll ? "rotated" : ""} /></button>}
      </>}
      {step === 1 && <div className="method-choices">{methods.map((item) => <button type="button" key={item.id} className={`method-choice ${methodId === item.id ? "selected" : ""}`} onClick={() => { setMethodId(item.id); goTo(2); }} aria-label={`Cook ${item.name}`} aria-pressed={methodId === item.id}><span className="choice-symbol" aria-hidden="true">{item.emoji || "🍽️"}</span><strong>{item.name}</strong><small>{item.description}</small><ArrowRight size={16} /></button>)}</div>}
      {step === 2 && <div className="region-choices">{MEAL_REGIONS.map((item) => <button type="button" key={item.id} className={`region-choice ${regionId === item.id ? "selected" : ""}`} onClick={() => { setRegionId(item.id); goTo(3); }} aria-label={`Add ${item.name} flavour`} aria-pressed={regionId === item.id}><span className="choice-symbol" aria-hidden="true">{item.emoji || "🌿"}</span><strong>{item.name.replace("-inspired", "")}</strong><small>{item.description}</small><ArrowRight size={15} /></button>)}</div>}
      {step === 3 && <form onSubmit={create}>
        <fieldset className="meal-settings"><legend className="sr-only">Finish your meal</legend>
          <div className="meal-selection-summary"><span><ChefHat size={16} /> {main?.name}</span><ArrowRight size={13} /><span>{method?.name}</span><ArrowRight size={13} /><span><Globe2 size={16} /> {region?.name}</span></div>
          <div className="side-choices" aria-label="Side dishes">{MEAL_SIDES.map((item) => <button type="button" key={item.id} className={`side-choice ${sideId === item.id ? "selected" : ""}`} aria-pressed={sideId === item.id} onClick={() => setSideId(item.id)}><span aria-hidden="true">{item.emoji}</span><span><strong>{item.name}</strong><small>{item.description}</small></span>{sideId === item.id && <Check size={16} />}</button>)}</div>
          <div className="meal-preferences"><label className="field"><span>Servings</span><select value={servings} onChange={(event) => setServings(Number(event.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? "person" : "people"}</option>)}</select></label><label className="field"><span>Dietary preference</span><select value={diet} onChange={(event) => changeDiet(event.target.value as DietId)}>{DIETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Spice level</span><select value={spiceHeat} onChange={(event) => setSpiceHeat(event.target.value as SpiceHeat)}><option value="mild">Mild & mellow</option><option value="medium">A little kick</option><option value="hot">Bring the heat</option></select></label></div>
          <label className="field meal-pantry"><span>Already in your pantry</span><input value={pantry} onChange={(event) => setPantry(event.target.value)} maxLength={500} placeholder="e.g. rice, garlic, olive oil" /><small>Separate items with commas to leave them off your shopping list.</small></label>
        </fieldset>
        <div className="builder-create-row"><p><Utensils size={17} /><span><strong>A complete meal</strong>Main, {side?.name.toLowerCase()}, and a regional sauce.</span></p><button type="submit" className="button primary" disabled={!main || !method}><Sparkles size={18} />Create my meal<ArrowRight size={18} /></button></div>

        <p className="builder-footnote">Template-generated · not kitchen-tested. The same selections produce the same meal, with ingredients and instructions matched to your choices.</p>
      </form>}
      {step > 0 && <button type="button" className="text-button builder-back" onClick={() => goTo(step - 1)}><ArrowLeft size={15} /> Back to {STEPS[step - 1].toLowerCase()}</button>}
    </div>
  </div>;
}
