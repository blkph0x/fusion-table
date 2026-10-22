"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, Check, CheckCheck, ChefHat, ChevronDown, ChevronRight, Clock3, Compass, Download, ExternalLink, Globe2, Heart, Leaf, LoaderCircle, LocateFixed, MapPin, Menu, Minus, Navigation, Plus, Search, ShoppingBasket, SlidersHorizontal, Sparkles, Sprout, Star, Store, Utensils, Users, Wheat, X } from "lucide-react";
import { CLASSICS, REGIONS, DIETS, generateRecipe } from "@/lib/recipes";
import type { Recipe, DietId, SpiceHeat } from "@/lib/recipe-types";
import { SHOP_LABELS, type LocationResult, type Shop, type ShopKind, type ShopResponse } from "@/lib/locations";
import { fetchLocationResults, fetchNearbyShops } from "@/lib/location-client";
import { ingredientMatchesShop, suggestedShops } from "@/lib/shopping";
import MealBuilder from "@/components/meal-builder";
import { MAIN_INGREDIENTS, MEAL_REGIONS, COOKING_METHODS, getMealCombinationCount } from "@/lib/meals";

type View = "discover" | "studio" | "shops" | "cookbook";
type SavedRecipe = { recipe: Recipe; savedAt: string; notes: string; tested: boolean; rating: number };
const STORAGE_KEY = "fusion-table-v1";
const SHOP_FILTERS: (ShopKind | "all")[] = ["all", "supermarket", "produce", "butcher", "market", "specialty", "grocery", "fishmonger"];
const INSPIRATIONS = [
  { classicId: "pasta", regionId: "japanese", title: "Miso mushroom pasta", pairing: "Italy meets Japan", description: "Silky pasta. Deep umami. A very good idea.", image: "/images/fusion-table-hero.png", diet: "vegetarian" },
  { classicId: "tacos", regionId: "korean", title: "Seoul-inspired tacos", pairing: "Mexico meets Korea", description: "A little heat, a little crunch, a lot to love.", image: "/images/korean-tacos.png", diet: "vegan" },
  { classicId: "roast", regionId: "moroccan", title: "A Moroccan-style roast", pairing: "Sunday roast meets Morocco", description: "Your familiar traybake takes a fragrant detour.", image: "/images/moroccan-traybake.png", diet: "vegan" },
] as const;
const duration = (minutes: number) => minutes < 120 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
const amount = (value: number, unit: string) => `${Number(value.toFixed(2))} ${unit}`.trim();
const recipeKey = (recipe: Recipe) => recipe.id;
const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name || MEAL_REGIONS.find((r) => r.id === id)?.name.replace("-inspired", "") || id;
const classicName = (id: string) => CLASSICS.find((r) => r.id === id)?.name || id;
const recipeBaseName = (recipe: Recipe) => recipe.kind === "meal" ? `${MAIN_INGREDIENTS.find((m) => m.id === recipe.mainId)?.name || "Meal"} · ${COOKING_METHODS.find((m) => m.id === recipe.methodId)?.name || "Fusion"}` : classicName(recipe.classicId);
function validSaved(value: unknown): value is SavedRecipe {
  const v = value as SavedRecipe;
  return !!v && typeof v.notes === "string" && typeof v.savedAt === "string" && typeof v.tested === "boolean" && Number.isInteger(v.rating) && v.rating >= 0 && v.rating <= 5 && typeof v.recipe?.id === "string" && typeof v.recipe?.title === "string" && typeof v.recipe.classicId === "string" && typeof v.recipe.regionId === "string" && Array.isArray(v.recipe?.ingredients) && Array.isArray(v.recipe?.steps) && v.recipe.steps.length > 0 && v.recipe.steps.every((s) => typeof s?.title === "string" && typeof s?.detail === "string") && Array.isArray(v.recipe.allergens) && Array.isArray(v.recipe.dietaryNotes) && v.recipe.ingredients.every((i) => typeof i?.id === "string" && typeof i.name === "string" && Number.isFinite(i.amount) && typeof i.unit === "string");
}
const matchesShop = ingredientMatchesShop;
function productSearch(shop: Shop, ingredient: string, place: string) {
  const name = shop.name.toLowerCase();
  if (name.includes("woolworths")) return `https://www.woolworths.com.au/shop/search/products?searchTerm=${encodeURIComponent(ingredient)}`;
  if (name.includes("coles")) return `https://www.coles.com.au/search?q=${encodeURIComponent(ingredient)}`;
  return `https://www.google.com/search?q=${encodeURIComponent(`${shop.name} ${place} ${ingredient}`)}`;
}
function downloadFile(filename: string, text: string, type: string) {
  const href = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a"); link.href = href; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const original = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; ref.current?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape") close();
      if (event.key === "Tab") {
        const elements = ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, textarea, a[href], [tabindex="0"]');
        if (!elements?.length) return;
        const first = elements[0], last = elements[elements.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = overflow; document.removeEventListener("keydown", key); original?.focus(); };
  }, [close]);
  return <div className="modal-backdrop" onClick={(e) => { if (e.target === e.currentTarget) close(); }}><div ref={ref} tabIndex={-1} className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={21} /></button></div>{children}</div></div>;
}

export default function Home() {
  const [view, setView] = useState<View>("discover");
  const [builderMode, setBuilderMode] = useState<"meal" | "classic">("classic");
  const [builderRevision, setBuilderRevision] = useState(0);
  const [classicId, setClassicId] = useState("pasta");
  const [regionId, setRegionId] = useState("japanese");
  const [diet, setDiet] = useState<DietId>("balanced");
  const [spiceHeat, setSpiceHeat] = useState<SpiceHeat>("medium");
  const [servings, setServings] = useState(2);
  const [pantry, setPantry] = useState("");
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [formError, setFormError] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [location, setLocation] = useState<LocationResult | null>(null);
  const [radius, setRadius] = useState(5);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationQuery, setLocationQuery] = useState("");
  const [locationResults, setLocationResults] = useState<LocationResult[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [locationSearched, setLocationSearched] = useState(false);
  const [shopData, setShopData] = useState<ShopResponse | null>(null);
  const [shopsLoading, setShopsLoading] = useState(false);
  const [shopError, setShopError] = useState("");
  const [radiusChanged, setRadiusChanged] = useState(false);
  const [shopFilter, setShopFilter] = useState<ShopKind | "all">("all");
  const [selectedShop, setSelectedShop] = useState<Shop | null>(null);
  const [checked, setChecked] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cookingStep, setCookingStep] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [tested, setTested] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const shopRequest = useRef(0), locationRequest = useRef(0);
  const latestRadius = useRef(radius);
  const shopAbort = useRef<AbortController | null>(null), locationAbort = useRef<AbortController | null>(null);
  const recipeRef = useRef<HTMLElement>(null), composerRef = useRef<HTMLElement>(null);

  /* Browser storage is unavailable during SSR. Hydrate it once, then report storage failures in the UI. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (Array.isArray(data.saved)) setSaved(data.saved.filter(validSaved));
      if (data.location && typeof data.location.name === "string" && Number.isFinite(data.location.lat) && Math.abs(data.location.lat) <= 90 && Number.isFinite(data.location.lon) && Math.abs(data.location.lon) <= 180) setLocation(data.location);
      if (Number.isFinite(data.radius) && data.radius >= 1 && data.radius <= 25) { latestRadius.current = data.radius; setRadius(data.radius); }
    } catch { /* Cleared or invalid browser data starts a fresh collection. */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ saved, location, radius })); }
    catch { setToast("Your browser could not save this change. You can still download your recipe."); }
  }, [saved, location, radius, loaded]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => () => { shopAbort.current?.abort(); locationAbort.current?.abort(); }, []);
  const navigate = useCallback((next: View) => { setView(next); setMenuOpen(false); setCookingStep(null); window.scrollTo({ top: 0, behavior: "smooth" }); }, []);
  const closeLocation = useCallback(() => {
    locationRequest.current++; locationAbort.current?.abort();
    setLocationLoading(false); setLocationOpen(false);
  }, []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const closeCooking = useCallback(() => setCookingStep(null), []);
  const isSaved = !!recipe && saved.some((s) => recipeKey(s.recipe) === recipeKey(recipe));
  const needed = useMemo(() => recipe?.ingredients.filter((i) => !i.inPantry && !checked.includes(i.id)) || [], [recipe, checked]);
  const shops = useMemo(() => (shopData?.shops || []).filter((s) => shopFilter === "all" || s.kind === shopFilter), [shopData, shopFilter]);
  const matches = useMemo(() => needed.map((ingredient) => ({ ingredient, candidates: suggestedShops(ingredient, shopData?.shops || []).slice(0, 3) })), [needed, shopData]);
  const findShops = useCallback(async (place: LocationResult, distance: number) => {
    const sequence = ++shopRequest.current;
    shopAbort.current?.abort();
    const controller = new AbortController(); shopAbort.current = controller;
    setShopsLoading(true); setShopError(""); setShopData(null); setSelectedShop(null); setRadiusChanged(false);
    try {
      const data = await fetchNearbyShops(place, distance, controller.signal);
      if (sequence === shopRequest.current) setShopData(data);
    } catch (error) { if (sequence === shopRequest.current && !controller.signal.aborted) setShopError(error instanceof Error ? error.message : "Shop search is unavailable."); }
    finally { if (sequence === shopRequest.current) { setShopsLoading(false); shopAbort.current = null; } }
  }, []);
  async function searchLocation(event: FormEvent) {
    event.preventDefault(); const sequence = ++locationRequest.current;
    locationAbort.current?.abort();
    const controller = new AbortController(); locationAbort.current = controller;
    setLocationLoading(true); setLocationError(""); setLocationResults([]); setLocationSearched(false);
    try {
      const data = await fetchLocationResults(locationQuery.trim(), controller.signal);
      if (sequence === locationRequest.current) { setLocationResults(data.locations); setLocationSearched(true); }
    } catch (error) { if (sequence === locationRequest.current && !controller.signal.aborted) setLocationError(error instanceof Error ? error.message : "Could not find that location."); }
    finally { if (sequence === locationRequest.current) { setLocationLoading(false); locationAbort.current = null; } }
  }
  function chooseLocation(place: LocationResult) {
    locationRequest.current++; locationAbort.current?.abort(); setLocationLoading(false);
    setLocation(place); setLocationOpen(false); setShopFilter("all"); setShowMap(false);
    void findShops(place, latestRadius.current); setToast(`Your kitchen is set to ${place.name}.`);
  }
  function currentLocation() {
    if (!navigator.geolocation) { setLocationError("Location isn't supported by this browser. Search for your suburb instead."); return; }
    const sequence = ++locationRequest.current; locationAbort.current?.abort();
    setLocationLoading(true); setLocationError(""); setLocationResults([]); setLocationSearched(false);
    navigator.geolocation.getCurrentPosition((position) => {
      if (sequence !== locationRequest.current) return;
      chooseLocation({ id: "current-location", label: "Your current location", name: "Current location", lat: position.coords.latitude, lon: position.coords.longitude });
    }, (error) => {
      if (sequence !== locationRequest.current) return;
      setLocationLoading(false); setLocationError(error.code === 1 ? "Location permission wasn't granted. Search by suburb or postcode instead." : "We couldn't get your location. Please search by suburb or postcode.");
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  }
  function changeRadius(value: number) {
    latestRadius.current = value; setRadius(value); shopRequest.current++; shopAbort.current?.abort();
    setShopsLoading(false); setShopData(null); setShopError(""); setSelectedShop(null); setRadiusChanged(true);
  }
  function clearLocation() {
    shopRequest.current++; shopAbort.current?.abort(); closeLocation();
    setLocation(null); setShopData(null); setShopsLoading(false); setShopError("");
    setSelectedShop(null); setShowMap(false); setRadiusChanged(false); setToast("Location cleared.");
  }
  function showRecipe(next: Recipe) {
    const entry = saved.find((item) => recipeKey(item.recipe) === recipeKey(next));
    setRecipe(next); setNotes(entry?.notes || ""); setRating(entry?.rating || 0); setTested(entry?.tested || false);
  }
  function createRecipe(event?: FormEvent, preset?: typeof INSPIRATIONS[number]) {
    event?.preventDefault(); setFormError("");
    try {
      const next = generateRecipe({ classicId: preset?.classicId || classicId, regionId: preset?.regionId || regionId, diet: preset?.diet || diet, servings, spiceHeat, pantry });
      if (preset) { setClassicId(preset.classicId); setRegionId(preset.regionId); setDiet(preset.diet); }
      showRecipe(next); setChecked([]); setBuilderMode("classic"); setView("studio");
      if (location && !shopData && !shopsLoading) void findShops(location, radius);
      setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Please check your recipe choices."); }
  }
  function receiveMeal(next: Recipe) {
    showRecipe(next); setChecked([]); setView("studio");
    if (location && !shopData && !shopsLoading) void findShops(location, radius);
    setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  }
  function saveRecipe() {
    if (!recipe) return; const key = recipeKey(recipe);
    if (isSaved) { setSaved((all) => all.filter((s) => recipeKey(s.recipe) !== key)); setToast("Recipe removed from your cookbook."); }
    else {
      if (saved.length >= 100) { setToast("Your cookbook has reached 100 recipes. Export a backup, then remove a recipe to make room."); return; }
      setSaved((all) => [{ recipe, savedAt: new Date().toISOString(), notes: "", tested: false, rating: 0 }, ...all]); setToast("Saved to your cookbook on this device.");
    }
  }
  function openSaved(entry: SavedRecipe) {
    showRecipe(entry.recipe); setBuilderMode(entry.recipe.kind === "meal" ? "meal" : "classic"); setBuilderRevision((value) => value + 1);
    if (entry.recipe.kind !== "meal") { setClassicId(entry.recipe.classicId); setRegionId(entry.recipe.regionId); }
    setDiet(entry.recipe.diet); setSpiceHeat(entry.recipe.spiceHeat); setServings(entry.recipe.servings); setChecked([]); setView("studio");
    setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth" }); }, 50);
  }
  function shoppingView() { navigate("shops"); if (location) { if (!shopData && !shopsLoading) void findShops(location, radius); } else if (!recipe) setLocationOpen(true); }
  function exportShopping() {
    const escape = (value: string) => {
      const safe = /^[\s]*[=+\-@]|^[\t\r\n]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = ["Ingredient,Quantity,Nearby shop suggestions,Availability", ...matches.map(({ ingredient, candidates }) => [ingredient.name, amount(ingredient.amount, ingredient.unit), candidates.map((s) => s.name).join("; "), "Stock unconfirmed"].map(escape).join(","))];
    downloadFile("fusion-table-shopping-list.csv", rows.join("\n"), "text/csv;charset=utf-8");
  }
  const mapPoint = selectedShop || location;
  const mapRadius = Math.max(.8, Math.min(radius, 12));
  const lonPadding = mapPoint ? mapRadius / (111 * Math.max(.1, Math.cos(mapPoint.lat * Math.PI / 180))) : .04;
  const mapUrl = mapPoint ? `https://www.openstreetmap.org/export/embed.html?bbox=${Math.max(-180, mapPoint.lon - lonPadding)},${Math.max(-85, mapPoint.lat - mapRadius / 111)},${Math.min(180, mapPoint.lon + lonPadding)},${Math.min(85, mapPoint.lat + mapRadius / 111)}&layer=mapnik&marker=${mapPoint.lat},${mapPoint.lon}` : "";

  function studio(compact = false) {
    return <section className="studio-shell" ref={composerRef} id="recipe-studio" aria-label="Create a meal or remix a classic"><div className="studio-mode-tabs" aria-label="Recipe starting point"><button className={builderMode === "meal" ? "active" : ""} onClick={() => setBuilderMode("meal")} aria-pressed={builderMode === "meal"}><ChefHat size={16} /> Build a meal</button><button className={builderMode === "classic" ? "active" : ""} onClick={() => setBuilderMode("classic")} aria-pressed={builderMode === "classic"}><Utensils size={16} /> Classics & BBQ</button></div>{builderMode === "meal" ? <MealBuilder key={builderRevision} onCreated={receiveMeal} initialRecipe={recipe} /> : composer(compact)}</section>;
  }
  function composer(compact = false) {
    return <section className={`composer ${compact ? "compact" : ""}`} aria-label="Remix a classic recipe">
      <div className="section-heading"><div><span className="eyebrow"><Sparkles size={14} /> YOUR NEXT GREAT COMBINATION</span><h2>Make something yours.</h2></div><span className="tiny-note">From familiar favourites to smoke, char and slow BBQ.</span></div>
      <form onSubmit={(e) => createRecipe(e)}><div className="compose-main">
        <label className="field"><span>Start with a classic</span><div className="select-wrap"><Utensils size={19} /><select value={classicId} onChange={(e) => setClassicId(e.target.value)} aria-label="Classic dish"><optgroup label="Everyday classics">{CLASSICS.slice(0, 8).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup><optgroup label="Smoke, grill & BBQ">{CLASSICS.slice(8).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup></select><ChevronDown size={16} /></div></label>
        <span className="fusion-plus" aria-hidden="true"><Plus size={21} /></span>
        <label className="field"><span>Add a regional twist</span><div className="select-wrap"><Globe2 size={19} /><select value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="Regional flavour"><optgroup label="Original regional flavours">{REGIONS.slice(0, 8).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup><optgroup label="Smoke & grill traditions">{REGIONS.slice(8).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup></select><ChevronDown size={16} /></div></label>
        <div className="field serving-field"><span>At your table</span><div className="stepper"><button type="button" onClick={() => setServings((n) => Math.max(1, n - 1))} disabled={servings <= 1} aria-label="Fewer servings"><Minus size={15} /></button><span>{servings} <Users size={15} /></span><button type="button" onClick={() => setServings((n) => Math.min(12, n + 1))} disabled={servings >= 12} aria-label="More servings"><Plus size={15} /></button></div></div>
        <button className="button primary compose-submit" type="submit"><Sparkles size={17} /> Create my fusion <ArrowRight size={18} /></button>
      </div><div className="compose-options"><button type="button" className="text-button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}><SlidersHorizontal size={15} /> Diet, spice & pantry <ChevronDown className={advanced ? "rotated" : ""} size={14} /></button><span><Leaf size={14} /> Made for your taste, and your table.</span></div>
      {advanced && <div className="advanced-options"><label className="field"><span>Dietary preference</span><select aria-label="Dietary preference" value={diet} onChange={(e) => setDiet(e.target.value as DietId)}>{DIETS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="field"><span>A little heat?</span><select aria-label="Spice level" value={spiceHeat} onChange={(e) => setSpiceHeat(e.target.value as SpiceHeat)}><option value="mild">Mild & mellow</option><option value="medium">A little kick</option><option value="hot">Bring the heat</option></select></label><label className="field pantry-field"><span>Already in your pantry</span><input value={pantry} onChange={(e) => setPantry(e.target.value)} maxLength={500} placeholder="e.g. garlic, olive oil, rice" /><small>Separate ingredients with commas. Matching items come off your shopping list.</small></label></div>}{formError && <p className="error-message" role="alert">{formError}</p>}<p className="classic-count-note">{CLASSICS.length} classic structures × {REGIONS.length} regional profiles · {DIETS.length} dietary preferences. Authored templates with matching ingredients, methods and cooking checks.</p></form>
    </section>;
  }
  function recipeDetail() {
    if (!recipe) return <div className="empty-state"><div className="empty-icon"><ChefHat size={35} /></div><h3>Meet your next favourite meal.</h3><p>Start with an ingredient, choose how to cook it, and explore a regional flavour. We’ll bring together the main, sides, sauce and complete cooking instructions.</p></div>;
    return <article className="recipe-detail" ref={recipeRef} tabIndex={-1} aria-label={recipe.title}>
      <div className="recipe-heading"><div><span className="eyebrow">{recipeBaseName(recipe)} <span className="pair-x">×</span> {regionName(recipe.regionId)}</span><h2>{recipe.title}</h2><p>{recipe.description}</p><div className="recipe-meta"><span><Clock3 size={16} /> About {duration(recipe.totalMinutes)}</span><span><Users size={16} /> {recipe.servings} servings</span><span><Leaf size={16} /> {DIETS.find((d) => d.id === recipe.diet)?.name}</span><span className="meal-source-badge"><BookOpen size={12} /> {recipe.sourceLabel}</span></div></div><button className={`button secondary save-recipe ${isSaved ? "is-saved" : ""}`} onClick={saveRecipe}><Heart size={17} fill={isSaved ? "currentColor" : "none"} /> {isSaved ? "Saved to cookbook" : "Save recipe"}</button></div>
      {recipe.components && <div className="meal-components">{Object.entries(recipe.components).map(([label, value]) => <div className="meal-component" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>}
      <div className="fusion-note"><Sparkles size={21} /><div><strong>Why this fusion works</strong><p>{recipe.fusionNote}</p></div></div>
      <div className="recipe-columns"><section className="ingredients-panel"><div className="subheading"><h3>What you’ll need</h3><span>{recipe.servings} servings</span></div><p className="subtle-small">Tick what you already have.</p><ul className="ingredient-list">{recipe.ingredients.map((ingredient) => <li key={ingredient.id} className={ingredient.inPantry || checked.includes(ingredient.id) ? "ingredient-checked" : ""}><label><input type="checkbox" checked={ingredient.inPantry || checked.includes(ingredient.id)} disabled={ingredient.inPantry} onChange={() => setChecked((items) => items.includes(ingredient.id) ? items.filter((id) => id !== ingredient.id) : [...items, ingredient.id])} /><span><strong>{ingredient.name}</strong>{ingredient.notes && <small>{ingredient.notes}</small>}{ingredient.inPantry && <small className="pantry-label">In your pantry</small>}</span><em>{amount(ingredient.amount, ingredient.unit)}</em></label></li>)}</ul><button className="button primary full" onClick={shoppingView}><ShoppingBasket size={18} /> Find these ingredients <ArrowRight size={16} /></button><p className="subtle-small centered">{needed.length} ingredients to shop for</p>{recipe.allergens.length > 0 && <p className="subtle-small">Contains: {recipe.allergens.join(", ")}. Check individual product labels.</p>}</section>
      <section className="method-panel"><div className="subheading"><h3>Let’s get cooking</h3><button className="text-button" onClick={() => setCookingStep(0)}><Utensils size={15} /> Cooking mode</button></div><div className="method-timing"><span>Prep <strong>~{duration(recipe.prepMinutes)}</strong></span><span>Cook <strong>~{duration(recipe.cookMinutes)}</strong></span></div><p className="equipment-note"><strong>Equipment:</strong> {recipe.equipment.join(" · ")}</p><ol className="method-list">{recipe.steps.map((step, index) => <li key={index}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><div><h4>{step.title}</h4><p>{step.detail}</p></div></li>)}</ol>{recipe.methodNotes?.length ? <section className="bbq-method-notes"><h4>Smoking, grilling & kitchen options</h4><ul>{recipe.methodNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></section> : null}{recipe.safetyNote && <p className="recipe-source"><CheckCheck size={14} /><span>{recipe.safetyNote} {recipe.safetySource && <a href={recipe.safetySource} target="_blank" rel="noreferrer">Food safety guidance ↗</a>}</span></p>}<p className="recipe-source"><BookOpen size={14} /> {recipe.sourceLabel}. Timing is estimated; allow longer for larger batches.</p>{recipe.dietaryNotes.map((note, i) => <p className="subtle-small" key={i}>{note}</p>)}<div className="recipe-actions"><button className="button secondary" onClick={() => downloadFile(`${recipeKey(recipe)}.json`, JSON.stringify(recipe, null, 2), "application/json")}><Download size={15} /> Download recipe</button><button className="text-button" onClick={() => window.print()}>Print recipe</button></div></section></div>
      {isSaved && <section className="kitchen-notes"><div><span className="eyebrow">THE BEST RECIPES EVOLVE</span><h3>Notes from your kitchen</h3><p>Keep what worked. Make it even better next time.</p></div><div><div className="rating-row" aria-label="Rate your recipe">{[1, 2, 3, 4, 5].map((n) => <button aria-label={`Rate ${n} out of 5`} aria-pressed={rating === n} key={n} onClick={() => setRating(n)}><Star size={23} fill={rating >= n ? "currentColor" : "none"} /></button>)}</div><textarea aria-label="Kitchen notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000} placeholder="A little more lemon? Less chilli? Your future self will thank you." rows={3} /><div className="notes-actions"><label><input type="checkbox" checked={tested} onChange={(e) => setTested(e.target.checked)} /> I’ve cooked this recipe</label><button className="button primary small" onClick={() => { setSaved((all) => all.map((entry) => recipeKey(entry.recipe) === recipeKey(recipe) ? { ...entry, notes, rating, tested } : entry)); setToast("Your kitchen notes are saved."); }}>Save notes <Check size={15} /></button></div></div></section>}
    </article>;
  }

  return <div className="site-shell"><a href="#main-content" className="skip-link">Skip to content</a>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => navigate("discover")} aria-label="Fusion Table home"><span className="brand-mark"><Sprout size={25} strokeWidth={1.65} /></span><span>fusion<span className="brand-light">table</span></span></button><nav aria-label="Main navigation" className={menuOpen ? "main-nav nav-open" : "main-nav"}>{([["discover", "Discover"], ["studio", "Recipe studio"], ["shops", "Local shops"], ["cookbook", "My cookbook"]] as [View, string][]).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} onClick={() => id === "shops" ? shoppingView() : navigate(id)}>{label}{id === "cookbook" && saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>)}</nav><div className="header-actions"><button className="location-button" onClick={() => setLocationOpen(true)}><MapPin size={16} /><span>{location?.name || "Set your location"}</span><ChevronDown size={13} /></button><button className="icon-button mobile-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div></div></header>
    <main id="main-content">
      {view === "discover" && <><section className="hero"><div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line" /> GOOD FOOD KNOWS NO BORDERS</span><h1>A world of flavour.<br /><em>A little closer<br className="desktop-break" /> to home.</em></h1><p>From familiar favourites to slow-smoked BBQ. Explore regional flavours, build around an ingredient you love, and find what you need close to home.</p><div className="hero-actions"><button className="button primary" onClick={() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}>Explore classics & BBQ <ArrowRight size={18} /></button><button className="text-button" onClick={shoppingView}><MapPin size={17} /> Explore local shops</button></div><div className="hero-footnote"><span className="little-leaves"><Leaf size={16} /><Sprout size={16} /><Wheat size={16} /></span><span>Global inspiration. Local ingredients. Your kitchen.</span></div></div><div className="hero-visual"><img src="/images/fusion-table-hero.png" alt="Miso mushroom tagliatelle with herbs and sesame in a sage ceramic bowl" fetchPriority="high" /><span className="photo-corner">A NEW TAKE ON AN OLD FAVOURITE</span><button className="dish-label" onClick={() => createRecipe(undefined, INSPIRATIONS[0])}><span className="dish-label-icon"><Utensils size={21} /></span><span><small>ITALY <span>×</span> JAPAN</small><strong>Miso mushroom pasta</strong></span><ArrowRight size={20} /></button><div className="round-stamp" aria-hidden="true"><span>CURIOUS COOKS</span><Sprout size={31} strokeWidth={1.3} /><span>WELCOME HERE</span></div></div></section>
        <div className="benefit-strip"><span><Globe2 size={19} /> {CLASSICS.length} classics. A world of flavour.</span><span><SlidersHorizontal size={19} /> Made to suit your table</span><span><ShoppingBasket size={19} /> Ingredients closer to home</span></div>
        <div className="page-width">{studio(true)}<section className="inspiration-section"><div className="section-heading"><div><span className="eyebrow">A LITTLE INSPIRATION</span><h2>Unexpectedly good together.</h2></div><button className="text-button" onClick={() => navigate("studio")}>Find your own pairing <ArrowRight size={17} /></button></div><div className="inspiration-grid">{INSPIRATIONS.map((item) => <button className="inspiration-card" key={item.classicId} onClick={() => createRecipe(undefined, item)}><div className="card-image"><img src={item.image} alt={item.title} loading="lazy" /><span className="card-pairing">{item.pairing}</span><span className="card-open"><ArrowRight size={19} /></span></div><div className="card-copy"><h3>{item.title}</h3><p>{item.description}</p><span className="card-tag"><Leaf size={13} /> {item.diet === "vegan" ? "Plant-based" : "Vegetarian"}<span>·</span> Make it yours</span></div></button>)}</div></section><section className="neighbourhood-banner"><div className="neighbourhood-art" aria-hidden="true"><Store size={64} strokeWidth={1} /><span><Sprout size={24} /></span></div><div><span className="eyebrow">YOUR NEIGHBOURHOOD, ON THE MENU</span><h2>Great ingredients are closer than you think.</h2><p>From the corner butcher to your favourite fruit market. Find local places to bring your recipe to life.</p></div><button className="button primary" onClick={shoppingView}><MapPin size={17} /> Find shops near me <ArrowRight size={16} /></button></section></div></>}
      {view === "studio" && <div className="page-width inner-page"><div className="page-intro"><span className="eyebrow"><ChefHat size={15} /> YOUR RECIPE STUDIO</span><h1>Familiar favourites.<br /><em>Fresh possibilities.</em></h1><p>Choose your starting point. We’ll help you take it somewhere delicious.</p></div>{studio()}{recipeDetail()}</div>}
      {view === "shops" && <div className="page-width inner-page shops-page">
        <div className="page-intro split-intro"><div><span className="eyebrow"><MapPin size={15} /> FROM AROUND THE CORNER</span><h1>Shop a little closer.</h1><p>Fresh produce, local specialists, and everyday essentials for your next fusion.</p></div>{recipe && <div className="shopping-for"><span>ON YOUR MENU</span><strong>{recipe.title}</strong><button className="text-button" onClick={() => navigate("studio")}>Back to recipe <ArrowRight size={14} /></button></div>}</div>
        <div className="location-toolbar">
          <button className="location-selector" onClick={() => setLocationOpen(true)}><MapPin size={19} /><span><small>Your starting point</small><strong>{location?.name || "Choose your location"}</strong></span><ChevronDown size={17} /></button>
          <label className="radius-control"><span>Within <strong>{radius} km</strong></span><input type="range" min="1" max="25" value={radius} onChange={(e) => changeRadius(Number(e.target.value))} aria-label="Shopping radius in kilometres" /></label>
          <button className="button primary" onClick={() => location ? void findShops(location, radius) : setLocationOpen(true)} disabled={shopsLoading}>{shopsLoading ? <LoaderCircle className="spin" size={17} /> : <Search size={17} />} {shopsLoading ? "Finding local shops…" : radiusChanged && location ? `Search within ${radius} km` : "Find nearby shops"}</button>
        </div>
        <p className="distance-note"><Compass size={13} /> Distances are measured in a straight line. Walking and driving routes may be longer.</p>
        {shopError && <div className="error-panel" role="alert"><Store size={25} /><div><strong>Shop search is temporarily unavailable.</strong><p>{shopError}</p>{recipe && <p>Your ingredient list and download are still available below.</p>}<button className="text-button" onClick={() => location && void findShops(location, radius)}>Try again <ArrowRight size={14} /></button></div></div>}
        <div className="shops-layout">
          <div className="shops-main">
            {!location ? <div className="empty-state location-empty"><div className="empty-icon"><MapPin size={35} /></div><h3>Where’s your kitchen?</h3><p>Set a suburb, town, or postcode to find supermarkets, fruit shops, markets, and butchers within your radius.</p>{recipe && <p>Your shopping list is ready. You can use or download it before choosing a location.</p>}<button className="button primary" onClick={() => setLocationOpen(true)}>Set your location <ArrowRight size={16} /></button></div> : <>
              <div className="shop-tabs" aria-label="Filter shop types">{SHOP_FILTERS.map((kind) => <button key={kind} className={shopFilter === kind ? "selected" : ""} aria-pressed={shopFilter === kind} onClick={() => setShopFilter(kind)}>{kind === "all" ? "All shops" : SHOP_LABELS[kind]}</button>)}</div>
              <div className="shop-results-heading"><h3>{shopsLoading ? "Looking around your neighbourhood…" : shopData ? `${shops.length} ${shops.length === 1 ? "shop" : "shops"} to explore` : "Ready when you are"}</h3>{shopData && <span>Within {shopData.radiusKm} km</span>}</div>
              {shopsLoading && <div className="shop-loading" role="status"><LoaderCircle className="spin" size={26} /><h4>Checking local map listings</h4><p>Finding shops within {radius} km. Your shopping list is available while we search.</p></div>}
              {!shopsLoading && !shopError && !shopData && <div className="empty-state small-empty"><Store size={30} /><p>{radiusChanged ? `Radius changed to ${radius} km. Select “Search within ${radius} km” to refresh nearby shops.` : "Select “Find nearby shops” to search this area."}</p></div>}
              {shopData && shops.length === 0 && <div className="empty-state small-empty"><Store size={30} /><h3>No matching shops in this search.</h3><p>Try another shop type or a wider radius. Map listings may be incomplete, especially for fresh produce and occasional markets.</p></div>}
              <div className="shop-list">{shops.map((shop) => {
                const coverage = needed.filter((i) => matchesShop(i, shop));
                return <article className={`shop-card ${selectedShop?.id === shop.id ? "selected-shop" : ""}`} key={shop.id}>
                  <div className={`shop-kind-icon kind-${shop.kind}`}>{shop.kind === "produce" ? <Sprout /> : shop.kind === "market" ? <ShoppingBasket /> : <Store />}</div>
                  <div className="shop-card-content">
                    <div className="shop-card-top"><div><span className="shop-kind">{SHOP_LABELS[shop.kind]}</span><h4>{shop.name}</h4></div><span className="shop-distance">{shop.distanceKm < 1 ? `${Math.round(shop.distanceKm * 1000)} m` : `${shop.distanceKm.toFixed(1)} km`}</span></div>
                    <p>{shop.address || "Address details not provided in map listing"}</p>
                    {coverage.length > 0 && <span className="coverage-note"><Leaf size={12} /> Suggested for {coverage.length} of your ingredients</span>}
                    {shop.kind === "market" && <span className="market-note">Check stall types and market days before visiting.</span>}
                    <div className="shop-actions">
                      <a href={`https://www.google.com/maps/dir/?api=1&origin=${location.lat},${location.lon}&destination=${shop.lat},${shop.lon}`} target="_blank" rel="noreferrer"><Navigation size={13} /> Directions</a>
                      {shop.website && <a href={shop.website} target="_blank" rel="noreferrer">Website <ExternalLink size={12} /></a>}
                      {shop.phone && <a href={`tel:${shop.phone.replace(/[^+\d]/g, "")}`}>Call shop</a>}
                      <button onClick={() => { setSelectedShop(shop); setShowMap(true); window.open(shop.osmUrl, "_blank", "noopener,noreferrer"); }}>On map</button>
                      <a href={shop.osmUrl} target="_blank" rel="noreferrer" className="listing-source">Listing <ExternalLink size={11} /></a>
                    </div>
                    {shop.openingHours && <details className="shop-hours"><summary>Listed opening hours</summary><p>{shop.openingHours}</p></details>}
                  </div>
                </article>;
              })}</div>
              {shopData && <p className="data-attribution">Listings: <a href={shopData.attributionUrl} target="_blank" rel="noreferrer">{shopData.attribution}</a>. Retrieved {new Date(shopData.fetchedAt).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}. {shopData.notice} {shopData.truncated ? "Results are limited; try a smaller radius for a more focused view." : ""}</p>}
            </>}
          </div>
          <aside className="shopping-sidebar">
            {location && <div className="map-card"><div className="subheading"><h3>{selectedShop ? selectedShop.name : "Your neighbourhood"}</h3><MapPin size={17} /></div>{showMap ? <iframe title="OpenStreetMap view of your shopping area" src={mapUrl} loading="lazy" referrerPolicy="no-referrer" /> : <button className="map-placeholder" onClick={() => setShowMap(true)}><span className="map-grid" /><span className="map-circle" /><span className="map-pin"><MapPin size={26} fill="currentColor" /></span><span className="map-show-label">Show area map <ArrowRight size={14} /></span></button>}<p>Map © OpenStreetMap contributors</p></div>}
            <div className="shopping-list-panel">
              <div className="subheading"><h3>Your shopping list</h3><ShoppingBasket size={18} /></div>
              {!recipe ? <div className="list-empty"><p>Create a recipe to match its ingredients with nearby shop types.</p><button className="text-button" onClick={() => navigate("studio")}>Create a fusion <ArrowRight size={14} /></button></div> : <>
                <p className="subtle-small">{needed.length} ingredients · {recipe.servings} servings</p>
                {!location && <p className="subtle-small">Your list works without a location. Set one when you want nearby shop suggestions.</p>}
                <div className="stock-note"><Leaf size={16} /><p>Suggestions are based on shop type. Ingredient stock and prices are unconfirmed.</p></div>
                {matches.length === 0 && <p className="list-empty"><CheckCheck size={23} /> You’ve got everything on your list.</p>}
                <ul className="sourcing-list">{matches.map(({ ingredient, candidates }) => <li key={ingredient.id}>
                  <div><strong>{ingredient.name}</strong><span>{amount(ingredient.amount, ingredient.unit)}</span></div>
                  {candidates.length ? <><a href={productSearch(candidates[0], ingredient.name, location?.name || "")} target="_blank" rel="noreferrer">Search at {candidates[0].name} <ExternalLink size={11} /></a><small>Suggested shop · stock unconfirmed</small></> : <small>{shopData ? "No matching shop type found nearby" : !location ? "Set a location to find nearby shops" : shopError ? "Shop suggestions are temporarily unavailable" : "Search shops to see a suggestion"}</small>}
                </li>)}</ul>
                <button className="button secondary full" onClick={exportShopping}><Download size={15} /> Download shopping list</button>
              </>}
            </div>
          </aside>
        </div>
      </div>}
      {view === "cookbook" && <div className="page-width inner-page"><div className="page-intro split-intro"><div><span className="eyebrow"><BookOpen size={15} /> YOUR PERSONAL COLLECTION</span><h1>Worth making again.</h1><p>Your favourite fusions, with notes from your own kitchen.</p></div>{saved.length > 0 && <button className="button secondary" onClick={() => downloadFile("fusion-table-cookbook.json", JSON.stringify(saved, null, 2), "application/json")}><Download size={16} /> Export cookbook</button>}</div><p className="device-note"><Heart size={14} /> Your cookbook is saved in this browser on this device.</p>{saved.length === 0 ? <div className="empty-state"><div className="empty-icon"><BookOpen size={35} /></div><h3>A cookbook with your name on it.</h3><p>Save a recipe you love, then add a rating and notes after cooking. Your collection starts with one good idea.</p><button className="button primary" onClick={() => navigate("studio")}>Create your first fusion <ArrowRight size={16} /></button></div> : <div className="saved-grid">{saved.map((entry) => <article className="saved-card" key={recipeKey(entry.recipe)}><span className="eyebrow">{regionName(entry.recipe.regionId)} <span>×</span> {recipeBaseName(entry.recipe)}</span><h3>{entry.recipe.title}</h3><p>{entry.recipe.description}</p><div className="recipe-meta"><span><Clock3 size={14} /> About {duration(entry.recipe.totalMinutes)}</span><span><Users size={14} /> {entry.recipe.servings}</span></div>{entry.tested && <span className="tested-label"><CheckCheck size={13} /> Kitchen-tested by you</span>}{entry.rating > 0 && <span className="saved-stars">{"★".repeat(entry.rating)}{"☆".repeat(5 - entry.rating)}</span>}{entry.notes && <p className="saved-notes">“{entry.notes.slice(0, 130)}{entry.notes.length > 130 ? "…" : ""}”</p>}<div className="saved-card-actions"><button className="text-button" onClick={() => openSaved(entry)}>Open recipe <ArrowRight size={15} /></button><button className="icon-button" aria-label={`Remove ${entry.recipe.title}`} onClick={() => { setSaved((all) => all.filter((s) => recipeKey(s.recipe) !== recipeKey(entry.recipe))); setToast("Recipe removed from your cookbook."); }}><Heart size={17} fill="currentColor" /></button></div></article>)}</div>}</div>}
    </main>
    <footer className="site-footer"><div className="page-width footer-inner"><button className="brand" onClick={() => navigate("discover")}><Sprout size={24} strokeWidth={1.5} /><span>fusion<span className="brand-light">table</span></span></button><span>A little curiosity. A lot of flavour.</span><div><button onClick={() => setAboutOpen(true)}>How it works</button><button onClick={shoppingView}>Find local shops</button><span className="footer-small">Made for curious cooks.</span></div></div></footer>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    {locationOpen && <Modal title="Where’s your kitchen?" close={closeLocation}><p className="modal-description">Find ingredients close to home. Search for a suburb, town, or postcode, then choose the right location.</p><form onSubmit={searchLocation} className="location-search"><label className="sr-only" htmlFor="location-search">Suburb, town or postcode</label><Search size={18} /><input id="location-search" value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="e.g. Newtown, Sydney" minLength={2} maxLength={160} required /><button type="submit" className="button primary small" disabled={locationLoading}>{locationLoading ? <LoaderCircle size={17} className="spin" /> : "Search"}</button></form><button className="current-location-button" onClick={currentLocation} disabled={locationLoading}><LocateFixed size={18} /> Use my current location <ArrowRight size={16} /></button>{locationError && <p className="error-message" role="alert">{locationError}</p>}{locationSearched && locationResults.length === 0 && <p className="search-empty">No locations found. Try adding a city, state, or country.</p>}<div className="location-results">{locationResults.map((place) => <button key={place.id} onClick={() => chooseLocation(place)}><MapPin size={19} /><span><strong>{place.name}</strong><small>{place.label}</small></span><ChevronRight size={17} /></button>)}</div><div className="modal-radius"><label htmlFor="modal-radius">Shopping radius <strong>{radius} km</strong></label><input id="modal-radius" type="range" min="1" max="25" value={radius} onChange={(e) => changeRadius(Number(e.target.value))} /><div><span>1 km · around the corner</span><span>25 km · further afield</span></div></div><p className="modal-privacy">Your chosen location is saved on this device. Searches use Photon and OpenStreetMap. Your precise location is only requested when you choose “Use my current location”.</p>{location && <button className="text-button clear-location" onClick={clearLocation}>Clear saved location</button>}</Modal>}
    {aboutOpen && <Modal title="A little curiosity goes a long way." close={closeAbout}><div className="about-steps"><div><span>01</span><h3>Start with an ingredient. Make a whole meal.</h3><p>Choose from {MAIN_INGREDIENTS.length} mains, compatible cooking methods, {MEAL_REGIONS.length} regional profiles and six side pairings: {getMealCombinationCount().toLocaleString("en-AU")} meal combinations. Or explore {CLASSICS.length} classic structures and {REGIONS.length} regional profiles, including smoking, grilling and BBQ.</p></div><div><span>02</span><h3>Bring it closer to home.</h3><p>Live map listings find shops inside your chosen straight-line radius. We match ingredients to relevant shop types and provide links to check products. We don’t have live shop inventory or prices.</p></div><div><span>03</span><h3>Make it your own.</h3><p>Save, cook, rate, and refine. Generated recipes haven’t been kitchen-tested; your notes and ratings are the next chapter. Cookbook data stays in your browser.</p></div></div><p className="subtle-small">Food imagery is illustrative and AI-generated. Listings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Source and setup details are included with the project.</p></Modal>}
    {cookingStep !== null && recipe && <Modal title="A little space to cook." close={closeCooking}><span className="eyebrow">{recipe.title}</span><div className="cooking-progress"><span style={{ width: `${((cookingStep + 1) / recipe.steps.length) * 100}%` }} /></div><span className="cooking-count">STEP {cookingStep + 1} OF {recipe.steps.length}</span><h3 className="cooking-title">{recipe.steps[cookingStep].title}</h3><p className="cooking-instruction">{recipe.steps[cookingStep].detail}</p><div className="cooking-controls"><button className="button secondary" disabled={cookingStep === 0} onClick={() => setCookingStep(cookingStep - 1)}><ArrowLeft size={16} /> Previous</button><button className="button primary" onClick={() => cookingStep === recipe.steps.length - 1 ? setCookingStep(null) : setCookingStep(cookingStep + 1)}>{cookingStep === recipe.steps.length - 1 ? "Enjoy your fusion" : "Next step"}<ArrowRight size={16} /></button></div></Modal>}
  </div>;
}
