"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Check, ChefHat, ChevronDown, Globe2, Leaf, Search, Sparkles, Utensils } from "lucide-react";
import { DIETS } from "@/lib/recipes";
import { COOK_PACE_LABELS } from "@/lib/cook-pace";
import { cutsForMethod } from "@/lib/cut-method";
import { MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, generateMeal, getMealCombinationCount, getMainsForDiet, getMethodsForMain } from "@/lib/meals";
import { preferredSidesForRegion } from "@/lib/side-plans";
import type { MealInput } from "@/lib/meal-types";
import type { CookPace, DietId, Recipe, SpiceHeat } from "@/lib/recipe-types";
import { CLEAN_KNOB_LABELS, cleanActive, orderSidesForClean, type CleanPrefs } from "@/lib/clean-prefs";

type Props = {
  onCreated: (recipe: Recipe, brief: MealInput) => void;
  initialRecipe?: Recipe | null;
  avoidAllergens?: string[];
  dislikes?: string[];
  clean?: CleanPrefs;
  onCleanChange?: (next: CleanPrefs) => void;
};

type RememberedChoices = {
  mainId?: string;
  methodId?: string;
  regionId?: string;
  sideId?: string;
  diet?: DietId;
  spiceHeat?: SpiceHeat;
  servings?: number;
  cookPace?: CookPace | "";
  pantry?: string;
};

const MEMORY_KEY = "fusion-meal-builder-last-v1";

function readMemory(): RememberedChoices | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = window.localStorage.getItem(MEMORY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RememberedChoices;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeMemory(choices: RememberedChoices) {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MEMORY_KEY, JSON.stringify(choices));
  } catch {
    /* private mode / quota — ignore */
  }
}

function freshSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 0x100000000);
}
const STEPS = ["Main ingredient", "Cooking method", "Regional flavour", "Make it a meal"];
const POPULAR = ["chicken", "beef", "duck", "kangaroo", "salmon", "prawns", "tuna", "tofu", "mushrooms", "cauliflower", "chickpeas", "jackfruit", "paneer"];
const CATEGORIES = [{ id: "all", name: "All ingredients" }, { id: "meat", name: "Meat & poultry" }, { id: "seafood", name: "Seafood" }, { id: "plant", name: "Plants & pulses" }, { id: "vegetarian", name: "Eggs & cheese" }] as const;

export default function MealBuilder({ onCreated, initialRecipe, avoidAllergens = [], dislikes = [], clean = {}, onCleanChange }: Props) {
  const seed = initialRecipe?.kind === "meal" ? initialRecipe : null;
  const remembered = !seed ? readMemory() : null;
  const [step, setStep] = useState(seed ? 3 : remembered?.mainId && remembered?.methodId ? 3 : 0);
  const [mainId, setMainId] = useState(seed?.mainId || remembered?.mainId || "");
  const [methodId, setMethodId] = useState(seed?.methodId || remembered?.methodId || "");
  const [regionId, setRegionId] = useState(seed?.regionId || remembered?.regionId || "japanese");
  const [sideId, setSideId] = useState(seed?.sideId || remembered?.sideId || "rice-greens");
  const [diet, setDiet] = useState<DietId>(seed?.diet || remembered?.diet || "balanced");
  const [spiceHeat, setSpiceHeat] = useState<SpiceHeat>(seed?.spiceHeat || remembered?.spiceHeat || "medium");
  const [cookPace, setCookPace] = useState<CookPace | "">(seed?.cookPace || remembered?.cookPace || "");
  const [servings, setServings] = useState(seed?.servings || remembered?.servings || 2);
  const [cutId, setCutId] = useState("");
  const [pantry, setPantry] = useState(seed?.ingredients.filter((i) => i.inPantry).map((i) => i.name).join(", ") || remembered?.pantry || "");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [sideSearch, setSideSearch] = useState("");
  const [showAllSides, setShowAllSides] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [rememberedNote, setRememberedNote] = useState(!!remembered?.mainId && !seed);
  const panelRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (seed || !remembered?.mainId) return;
    if (!MAIN_INGREDIENTS.some((item) => item.id === remembered.mainId)) return;
    if (remembered.methodId && !getMethodsForMain(remembered.mainId!).some((item) => item.id === remembered.methodId)) {
      setMethodId("");
      setStep(1);
    }
    if (remembered.sideId && !MEAL_SIDES.some((item) => item.id === remembered.sideId)) setSideId("rice-greens");
    if (remembered.regionId && !MEAL_REGIONS.some((item) => item.id === remembered.regionId)) setRegionId("japanese");
  }, []);

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
  const cuts = useMemo(() => (methodId ? cutsForMethod(mainId, methodId) : cutsForMethod(mainId)), [mainId, methodId]);
  const suggestedSideIds = useMemo(() => {
    const base = preferredSidesForRegion(regionId);
    return cleanActive(clean) ? orderSidesForClean(base, clean) : [...base];
  }, [regionId, clean]);
  const visibleSides = useMemo(() => {
    const query = sideSearch.trim().toLowerCase();
    const filtered = MEAL_SIDES.filter((item) => !query || `${item.name} ${item.description}`.toLowerCase().includes(query));
    if (query || showAllSides) return filtered;
    const preferred = filtered.filter((item) => suggestedSideIds.includes(item.id));
    const rest = filtered.filter((item) => !suggestedSideIds.includes(item.id));
    return [...preferred, ...rest].slice(0, Math.max(8, preferred.length));
  }, [sideSearch, showAllSides, suggestedSideIds]);
  const input: MealInput = {
    mainId, methodId, regionId, sideId, servings, diet, spiceHeat, pantry,
    ...(cutId ? { cutId } : {}),
    ...(cookPace ? { cookPace } : {}),
    ...(cleanActive(clean) ? { clean } : {}),
  };
  function toggleClean(key: keyof CleanPrefs) {
    if (!onCleanChange) return;
    const next = { ...clean };
    if (next[key]) delete next[key];
    else next[key] = true;
    onCleanChange(next);
  }
  const canOpen = (index: number) => index === 0 || (!!main && (index === 1 || !!method));
  const canCreate = !!main && !!method && !!region && !!side;

  function goTo(next: number) {
    setStep(next); setError("");
    requestAnimationFrame(() => { panelRef.current?.focus({ preventScroll: true }); panelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); });
  }
  function chooseMain(id: string) {
    setMainId(id);
    setCutId("");
    if (!getMethodsForMain(id).some((item) => item.id === methodId)) setMethodId("");
    goTo(1);
  }
  function changeDiet(next: DietId) {
    setDiet(next); setError("");
    if (mainId && !getMainsForDiet(next).some((item) => item.id === mainId)) {
      setMainId(""); setMethodId(""); setCutId(""); goTo(0); setCategory("all"); setSearch(""); setShowAll(true);
      setError(`${main?.name || "Your main"} doesn’t fit that preference. Choose a compatible main below.`);
    }
  }
  function create(event: FormEvent) {
    event.preventDefault(); setError("");
    const made: MealInput = { ...input, seed: freshSeed(), avoidAllergens, dislikes };
    try {
      const recipe = generateMeal(made);
      writeMemory({
        mainId, methodId, regionId, sideId, diet, spiceHeat, servings, cookPace, pantry,
      });
      setRememberedNote(false);
      onCreated(recipe, made);
    }
    catch (err) { setError(err instanceof Error ? err.message : "Please check your meal choices."); }
  }

  return <div className="meal-builder">
      <div className="builder-topline"><p><span className="builder-new">MORE POSSIBILITIES</span><strong>{getMealCombinationCount().toLocaleString("en-AU")}</strong> meal combinations · {MAIN_INGREDIENTS.length} mains · {MEAL_REGIONS.length} regions · {MEAL_SIDES.length} sides</p><span className="builder-template-note">Authored templates · Your choices</span></div>
      {rememberedNote && <p className="subtle-small builder-memory-note" role="status">Remembered your last main, method, region and side from this browser. Change any step, or create again.</p>}
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
      {step === 1 && <div className="method-choices">{methods.map((item) => <button type="button" key={item.id} className={`method-choice ${methodId === item.id ? "selected" : ""}`} onClick={() => { setMethodId(item.id); setCutId((current) => { if (!current) return current; return cutsForMethod(mainId, item.id).some((cut) => cut.id === current) ? current : ""; }); goTo(2); }} aria-label={`Cook ${item.name}`} aria-pressed={methodId === item.id}><span className="choice-symbol" aria-hidden="true">{item.emoji || "🍽️"}</span><strong>{item.name}</strong><small>{item.description}</small><ArrowRight size={16} /></button>)}</div>}
      {step === 2 && <div className="region-choices"><p className="region-group-label">HOME KITCHEN</p>{MEAL_REGIONS.filter((item) => item.id === "home-kitchen").map((item) => <button type="button" key={item.id} className={`region-choice ${regionId === item.id ? "selected" : ""}`} onClick={() => { setRegionId(item.id); goTo(3); }} aria-label={`Add ${item.name} flavour`} aria-pressed={regionId === item.id}><span className="choice-symbol" aria-hidden="true">{item.emoji || "🌿"}</span><strong>{item.name.replace("-inspired", "")}</strong><small>{item.description}</small><ArrowRight size={15} /></button>)}<p className="region-group-label">REGIONAL FLAVOURS</p>{MEAL_REGIONS.filter((item) => item.id !== "home-kitchen").map((item) => <button type="button" key={item.id} className={`region-choice ${regionId === item.id ? "selected" : ""}`} onClick={() => { setRegionId(item.id); goTo(3); }} aria-label={`Add ${item.name} flavour`} aria-pressed={regionId === item.id}><span className="choice-symbol" aria-hidden="true">{item.emoji || "🌿"}</span><strong>{item.name.replace("-inspired", "")}</strong><small>{item.description}</small><ArrowRight size={15} /></button>)}</div>}
      {step === 3 && <form onSubmit={create}>
        <fieldset className="meal-settings"><legend className="sr-only">Finish your meal</legend>
          <div className="meal-selection-summary"><span><ChefHat size={16} /> {main?.name}</span><ArrowRight size={13} /><span>{method?.name}</span><ArrowRight size={13} /><span><Globe2 size={16} /> {region?.name}</span>{side && <><ArrowRight size={13} /><span>{side.name}</span></>}</div>
          <div className="side-picker-header"><h4>Choose a side</h4><p className="subtle-small">Suggested for {region?.name?.replace("-inspired", "") || "this region"} first. Search all {MEAL_SIDES.length} accompaniments. Templates are not kitchen-tested.</p></div>
          <label className="builder-search side-search"><Search size={17} /><span className="sr-only">Search sides</span><input value={sideSearch} onChange={(event) => setSideSearch(event.target.value)} placeholder="Search rice, salad, bread, mash…" maxLength={60} /></label>
          <div className="side-choices" role="listbox" aria-label="Side dishes">{visibleSides.map((item) => <button type="button" key={item.id} role="option" aria-selected={sideId === item.id} className={`side-choice ${sideId === item.id ? "selected" : ""} ${suggestedSideIds.includes(item.id) && !sideSearch ? "suggested" : ""}`} aria-pressed={sideId === item.id} onClick={() => setSideId(item.id)}><span aria-hidden="true">{item.emoji}</span><span><strong>{item.name}</strong><small>{item.description}</small>{suggestedSideIds.includes(item.id) && !sideSearch && <em className="side-suggested-tag">Suits this region</em>}</span>{sideId === item.id && <Check size={16} />}</button>)}</div>
          {!visibleSides.length && <p className="builder-no-results" role="status">No sides match that search. Clear the search or try “rice”, “salad” or “potato”.</p>}
          {!sideSearch && !showAllSides && MEAL_SIDES.length > visibleSides.length && <button type="button" className="text-button show-ingredients" onClick={() => setShowAllSides(true)} aria-expanded={false}>Show all {MEAL_SIDES.length} sides</button>}
          {showAllSides && !sideSearch && <button type="button" className="text-button show-ingredients" onClick={() => setShowAllSides(false)} aria-expanded={true}>Show suggested sides</button>}
          <div className="meal-preferences"><label className="field"><span>Servings</span><select value={servings} onChange={(event) => setServings(Number(event.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value} {value === 1 ? "person" : "people"}</option>)}</select></label><label className="field"><span>Dietary preference</span><select value={diet} onChange={(event) => changeDiet(event.target.value as DietId)}>{DIETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="field"><span>Spice level</span><select value={spiceHeat} onChange={(event) => setSpiceHeat(event.target.value as SpiceHeat)}><option value="gentle">Gentle</option><option value="mild">Mild & mellow</option><option value="medium">A little kick</option><option value="hot">Bring the heat</option><option value="fiery">Fiery</option></select></label><label className="field"><span>Cook session</span><select aria-label="Cook session" value={cookPace} onChange={(event) => setCookPace(event.target.value as CookPace | "")}><option value="">Template timing</option>{(Object.keys(COOK_PACE_LABELS) as CookPace[]).map((pace) => <option key={pace} value={pace}>{COOK_PACE_LABELS[pace]}</option>)}</select><small>Optional. The method stays the same. Long smoke day is a schedule note.</small></label>{cuts.length > 0 && <label className="field"><span>Cut</span><select aria-label="Meat cut" value={cuts.some((cut) => cut.id === cutId) ? cutId : ""} onChange={(event) => setCutId(event.target.value)}><option value="">Match the cooking method</option>{(["Everyday", "Breed", "Less common"] as const).map((group) => { const groupCuts = cuts.filter((cut) => cut.group === group); return groupCuts.length ? <optgroup key={group} label={group}>{groupCuts.map((cut) => <option key={cut.id} value={cut.id}>{cut.shoppingName}</option>)}</optgroup> : null; })}</select><small>Only cuts that suit {method?.name?.toLowerCase() || "this method"} are listed. Check the packet. Angus or wagyu is the cut to shop for, not a marble grade.</small></label>}</div>
          <label className="field meal-pantry"><span>Already in your pantry</span><input value={pantry} onChange={(event) => setPantry(event.target.value)} maxLength={500} placeholder="e.g. rice, garlic, olive oil" /><small>Separate items with commas to leave them off your shopping list.</small></label>
          <div className="field clean-field"><span>Cleaner plate</span>
            <div className="clean-knobs" role="group" aria-label="Cleaner meal preferences">
              {(Object.keys(CLEAN_KNOB_LABELS) as (keyof typeof CLEAN_KNOB_LABELS)[]).map((key) => (
                <label key={key} className={`clean-knob ${clean[key] ? "on" : ""}`}>
                  <input type="checkbox" checked={!!clean[key]} onChange={() => toggleClean(key)} disabled={!onCleanChange} />
                  <span>{CLEAN_KNOB_LABELS[key]}</span>
                </label>
              ))}
              <p className="subtle-small">Soft prefs only. Hard filters stay.</p>
            </div>
          </div>
        </fieldset>
        <div className="builder-create-row"><p><Utensils size={17} /><span><strong>A different plate each time</strong>Same main, region and side. A new seeded search on every click.</span></p><button type="submit" className="button primary" disabled={!canCreate} aria-disabled={!canCreate} title={canCreate ? undefined : "Choose a main, method, region and side first"}><Sparkles size={18} />{regionId === "home-kitchen" ? "Create this plate" : "Create my fusion"}<ArrowRight size={18} /></button></div>

        <p className="builder-footnote">Template-generated · not kitchen-tested. Home kitchen is the weekday flavour, without a second regional paste. The other profiles are fusion, from a simple side to a long braise. Each click uses a new seed, so the same main and region can come back as a different dish, such as a cold stir-fry or a chopped salad. The same seed would repeat. A cook session only adds a schedule note. Hard filters stay in place. The cut you pick is the one the shopping list asks for. Check the packet.</p>
      </form>}
      {step > 0 && <button type="button" className="text-button builder-back" onClick={() => goTo(step - 1)}><ArrowLeft size={15} /> Back to {STEPS[step - 1].toLowerCase()}</button>}
    </div>
  </div>;
}
