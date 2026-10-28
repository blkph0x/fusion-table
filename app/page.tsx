"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Check, CheckCheck, ChefHat, ChevronDown, ChevronRight, Clock3, Download, Globe2, Heart, Leaf, LoaderCircle, LocateFixed, MapPin, Menu, Minus, Plus, Search, Share2, ShoppingBasket, SlidersHorizontal, Sparkles, Sprout, Star, Store, Utensils, Users, Wheat, X } from "lucide-react";
import { CLASSICS, REGIONS, DIETS, generateRecipe, parsePantry, pantryHas } from "@/lib/recipes";
import { BBQ_CLASSICS } from "@/lib/bbq-classics";
import { BBQ_REGIONS } from "@/lib/bbq-regions";
import { COOK_PACE_LABELS } from "@/lib/cook-pace";
import { chooseDinner, explainBlockedSide, planWeek, sideOptions, swapDinner, swapSide, type WeekPlan } from "@/lib/planner";
import { SPICE_HEATS, type CookPace, type Recipe, type DietId, type SpiceHeat } from "@/lib/recipe-types";
import { type LocationResult, type ShopResponse } from "@/lib/locations";
import { fetchLocationResults, fetchNearbyShops } from "@/lib/location-client";
import { KitchenDesk } from "@/components/kitchen-desk";
import { rememberConsumables, weekNeeds, type ShopNeed, type Stock, type VerdictId } from "@/lib/pantry";
import { rankShopsForList, type ShoppingLine } from "@/lib/shopping";
import { normalizeShoppingList, readCustomShopping } from "@/lib/shopping-list";
import { ShoppingHub } from "@/components/shopping-hub";
import MealBuilder from "@/components/meal-builder";
import { mealDraftMatchesRecipe, type MealBuilderDraft } from "@/lib/meal-builder-state";
import { WeekDayPlate } from "@/components/week-day-plate";
import { CommunityDesk, CookNotes, NewsBell } from "@/components/community-panel";
import { TrendsPage } from "@/components/trends-page";
import { RecipeImage } from "@/components/recipe-image";
import { RecipeShoppingCost } from "@/components/recipe-shopping-cost";
import { AccountPanel } from "@/components/account-panel";
import { prepareGuestKitchen, persistKitchenStorage } from "@/lib/account-client";
import { IngredientCost, IngredientPriceProvider, MealCostBadge } from "@/components/ingredient-cost";
import { catalogueCounts } from "@/components/catalogue-count";
import { communityAdjustments, plateIdentity, scaleIngredients, type CommunityBoard, type PlateStanding } from "@/lib/community";
import { MAIN_INGREDIENTS, MEAL_REGIONS, MEAL_SIDES, COOKING_METHODS, generateMeal } from "@/lib/meals";
import { CLEAN_KNOB_LABELS, cleanActive, mealCleanStats, normalizeCleanPrefs, type CleanPrefs } from "@/lib/clean-prefs";
import type { MealInput } from "@/lib/meal-types";
import { buildHomeDiscover } from "@/lib/home-suggestions";
import { DISCOVER_HISTORY_KEY, DISCOVER_POOL_STATS, readDiscoverHistory, rememberDiscoverCores } from "@/lib/discover-pool";
import { CLASSIC_INSPIRATIONS as INSPIRATIONS, classicInspirationSpec, openClassicInspiration } from "@/lib/classic-inspirations";
import { openFeaturedRecipe } from "@/lib/featured-recipes";
import { publicPath } from "@/lib/public-path";
import { decodeShare, encodeShare, recipeFromShare, shareSpecMatchesRecipe, specFromRecipe, type ShareSpec } from "@/lib/share-recipe";
import { AVOID_CHOICES, importCookbook, parseView, planBriefKey, readMealPreferences, readPlanSession, recipeConflicts, validRecipeSnapshot, validSaved, type View, type SavedRecipe, type MealPreferences, type PlanBrief } from "@/lib/kitchen-state";
import { cookingRecipeKey } from "@/lib/recipe-identity";
import { chosenCutLabel } from "@/lib/chosen-cut-label";
import { PLATE_IMAGE_VERSION } from "@/lib/plate-version";

const STORAGE_KEY = "fusion-table-v1";
const CATALOGUE_COUNTS = catalogueCounts();
const PLATE_FALLBACK = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="100%" height="100%" fill="#e7ecdf"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#315940" font-family="Georgia" font-size="28">Plate picture unavailable</text></svg>')}`;
function keepImage(event: { currentTarget: HTMLImageElement }) {
  const img = event.currentTarget;
  const step = img.dataset.fallback || "";
  if (step === "svg") return;
  const spec = img.dataset.spec;
  const file = img.dataset.file;
  if (step !== "plate" && step !== "file" && spec && !img.src.includes("/api/plate")) {
    img.dataset.fallback = "plate";
    img.src = `${publicPath("/api/plate")}?t=${encodeURIComponent(spec)}&v=${PLATE_IMAGE_VERSION}`;
    return;
  }
  if (step !== "file" && file && !img.src.includes(file)) {
    img.dataset.fallback = "file";
    img.src = publicPath(file);
    return;
  }
  img.dataset.fallback = "svg";
  img.src = PLATE_FALLBACK;
}
function inspirationSpec(item: typeof INSPIRATIONS[number]): string {
  return encodeShare(classicInspirationSpec(item));
}
function inspirationSrc(item: typeof INSPIRATIONS[number]): string {
  return publicPath(item.image.replace(".png", "-960.webp"));
}
const duration = (minutes: number) => minutes < 120 ? `${minutes} min` : `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ""}`;
const amount = (value: number, unit: string) => `${Number(value.toFixed(2))} ${unit}`.trim();
const recipeKey = cookingRecipeKey;
const plateUrlCache = new WeakMap<Recipe, string>();
const BBQ_CLASSIC_IDS = new Set(BBQ_CLASSICS.map((item) => item.id));
const BBQ_REGION_IDS = new Set(BBQ_REGIONS.map((item) => item.id));
const EVERYDAY_CLASSICS = CLASSICS.filter((item) => !BBQ_CLASSIC_IDS.has(item.id));
const SMOKE_CLASSICS = CLASSICS.filter((item) => BBQ_CLASSIC_IDS.has(item.id));
const ORIGINAL_REGIONS = REGIONS.filter((item) => !BBQ_REGION_IDS.has(item.id) && item.id !== "home-style");
const SMOKE_REGIONS = REGIONS.filter((item) => BBQ_REGION_IDS.has(item.id));
const HOME_REGIONS = REGIONS.filter((item) => item.id === "home-style");
const regionName = (id: string) => REGIONS.find((r) => r.id === id)?.name || MEAL_REGIONS.find((r) => r.id === id)?.name.replace("-inspired", "") || id;
const flavourHeading = (current: Recipe) => current.regionId === "home-style" || current.regionId === "home-kitchen" ? "Home-kitchen flavour" : "Why this fusion works";
const classicName = (id: string) => CLASSICS.find((r) => r.id === id)?.name || id;
const recipeBaseName = (recipe: Recipe) => recipe.kind === "meal" ? `${MAIN_INGREDIENTS.find((m) => m.id === recipe.mainId)?.name || "Meal"} · ${COOKING_METHODS.find((m) => m.id === recipe.methodId)?.name || "Fusion"}` : classicName(recipe.classicId);
function freshSeed(): number {
  const buf = new Uint32Array(1);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(buf);
    return buf[0];
  }
  return Math.floor(Math.random() * 0x100000000);
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
  const [homeLoadSeed, setHomeLoadSeed] = useState(1);
  const [homeRecentCores, setHomeRecentCores] = useState<string[]>([]);
  const homeSeenCores = useRef<string[]>([]);
  const [builderMode, setBuilderMode] = useState<"meal" | "classic">("classic");
  const [builderRevision, setBuilderRevision] = useState(0);
  const [mealDraft, setMealDraft] = useState<MealBuilderDraft | null>(null);
  const [classicId, setClassicId] = useState("pasta");
  const [regionId, setRegionId] = useState("japanese");
  const [diet, setDiet] = useState<DietId>("balanced");
  const [spiceHeat, setSpiceHeat] = useState<SpiceHeat>("medium");
  const [cookPace, setCookPace] = useState<CookPace | "">("");
  const [servings, setServings] = useState(2);
  const [pantryText, setPantryText] = useState("");
  const [weekDays, setWeekDays] = useState(7);
  const [avoidAllergens, setAvoidAllergens] = useState<string[]>([]);
  const [dislikeText, setDislikeText] = useState("");
  const [cleanPrefs, setCleanPrefs] = useState<CleanPrefs>({});
  const [week, setWeek] = useState<WeekPlan | null>(null);
  const [appliedWeekBrief, setAppliedWeekBrief] = useState<PlanBrief | null>(null);
  const [weekUndo, setWeekUndo] = useState<WeekPlan[]>([]);
  const [weekError, setWeekError] = useState("");
  const [lockedDays, setLockedDays] = useState<number[]>([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [shareSpec, setShareSpec] = useState<ShareSpec | null>(null);
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
  const [checked, setChecked] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedRecipe[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [toast, setToast] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [cookingStep, setCookingStep] = useState<number | null>(null);
  const [notes, setNotes] = useState("");
  const [rating, setRating] = useState(0);
  const [pantry, setPantry] = useState<Stock[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, VerdictId>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [cookNote, setCookNote] = useState("");
  const [buyList, setBuyList] = useState<ShopNeed[]>([]);
  const [buyListLabel, setBuyListLabel] = useState("");
  const [shoppingSource, setShoppingSource] = useState("saved");
  const [customShopping, setCustomShopping] = useState<ShoppingLine[]>([]);
  const [tested, setTested] = useState(false);
  const [community, setCommunity] = useState<CommunityBoard | null>(null);
  const [useTry, setUseTry] = useState(false);
  const lastShopSearch = useRef("");
  const shopRequest = useRef(0), locationRequest = useRef(0);
  const latestRadius = useRef(radius);
  const shopAbort = useRef<AbortController | null>(null), locationAbort = useRef<AbortController | null>(null);
  const recipeRef = useRef<HTMLElement>(null), composerRef = useRef<HTMLElement>(null);
  const cookbookImportRef = useRef<HTMLInputElement>(null);
  const preferences = useMemo<MealPreferences>(() => ({ diet, spiceHeat, servings, cookPace, pantry: pantryText }), [diet, spiceHeat, servings, cookPace, pantryText]);
  const currentWeekBrief = useMemo<PlanBrief>(() => ({ days: weekDays, servings, diet, spiceHeat, pantry: pantryText, avoidAllergens, dislikes: dislikeText.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean), ...(cleanActive(cleanPrefs) ? { clean: cleanPrefs } : {}) }), [weekDays, servings, diet, spiceHeat, pantryText, avoidAllergens, dislikeText, cleanPrefs]);
  const weekIsStale = !!week && planBriefKey(appliedWeekBrief) !== planBriefKey(currentWeekBrief);
  const filledDinnerCount = week?.days.filter((day) => !!day.recipe).length || 0;
  const weekShopping = useMemo(() => week ? weekNeeds(pantry, week.shopping) : [], [pantry, week]);
  const weekSides = useMemo(() => new Map(week && appliedWeekBrief && !weekIsStale && view === "week" ? week.days.map((day) => [day.day, day.recipe?.kind === "meal" ? sideOptions(appliedWeekBrief, week, day.day) : []]) : []), [week, appliedWeekBrief, weekIsStale, view]);
  const recipeWarnings = useMemo(() => recipe ? recipeConflicts(recipe, currentWeekBrief) : [], [recipe, currentWeekBrief]);
  const verifiedShareSpec = useMemo(() => {
    if (!recipe) return null;
    try {
      const candidate = shareSpec || specFromRecipe(recipe);
      return shareSpecMatchesRecipe(candidate, recipe) ? candidate : null;
    } catch { return null; }
  }, [recipe, shareSpec]);

  function updatePreferences(next: MealPreferences) {
    setDiet(next.diet); setSpiceHeat(next.spiceHeat); setServings(next.servings); setCookPace(next.cookPace); setPantryText(next.pantry);
  }

  // A confirmed account or guest restore uses the same validation as browser hydration.
  const restoreKitchen = useCallback((raw: Record<string, unknown>) => {
    const data = JSON.parse(JSON.stringify(raw));
    updatePreferences({ diet: "balanced", spiceHeat: "medium", servings: 2, cookPace: "", pantry: "" });
    setAvoidAllergens([]); setDislikeText(""); setCleanPrefs({}); setWeekDays(7);
    setWeek(null); setAppliedWeekBrief(null); setLockedDays([]); setWeekUndo([]); setWeekError("");
    setClassicId("pasta"); setRegionId("japanese"); setRecipe(null); setMealDraft(null); setShareSpec(null);
    setBuilderMode("classic"); setBuilderRevision(value => value + 1); setNotes(""); setRating(0); setTested(false);
    setSaved([]); setLocation(null); setRadius(5); latestRadius.current=5; setPantry([]);
    setBuyList([]); setBuyListLabel(""); setCustomShopping([]); setShoppingSource("saved"); setVerdicts({}); setRatings({});
    setChecked([]); setCookNote(""); setUseTry(false); setShopData(null); lastShopSearch.current="";
    shopRequest.current++; shopAbort.current?.abort(); setShopsLoading(false); setShopError("");
      const restoredPreferences = readMealPreferences(data.preferences);
      if (restoredPreferences) updatePreferences(restoredPreferences);
      if (Array.isArray(data.avoidAllergens)) setAvoidAllergens(data.avoidAllergens.filter((item: string) => (AVOID_CHOICES as readonly string[]).includes(item)));
      if (typeof data.dislikeText === "string") setDislikeText(data.dislikeText.slice(0, 4000));
      setCleanPrefs(normalizeCleanPrefs(data.cleanPrefs));
      if (Number.isInteger(data.weekDays) && data.weekDays >= 1 && data.weekDays <= 14) setWeekDays(data.weekDays);
      const restoredPlan = readPlanSession(data.planSession);
      if (restoredPlan) { setWeek(restoredPlan.plan); setAppliedWeekBrief(restoredPlan.brief); setLockedDays(restoredPlan.locks); }
      if (validRecipeSnapshot(data.activeRecipe) && data.activeRecipe.kind !== "meal") { setClassicId(data.activeRecipe.classicId); setRegionId(data.activeRecipe.regionId); }
      if (validRecipeSnapshot(data.activeRecipe)) { const activeSaved = (Array.isArray(data.saved) ? data.saved.filter(validSaved) : []).find((entry: SavedRecipe) => recipeKey(entry.recipe) === recipeKey(data.activeRecipe)); setNotes(activeSaved?.notes || ""); const activeRating = activeSaved?.rating ?? data.ratings?.[recipeKey(data.activeRecipe)] ?? data.ratings?.[data.activeRecipe.id] ?? 0; setRating(Number.isInteger(activeRating) && activeRating >= 0 && activeRating <= 5 ? activeRating : 0); setTested(activeSaved?.tested ?? false); setRecipe(data.activeRecipe); setBuilderMode(data.activeRecipe.kind === "meal" ? "meal" : "classic"); try { setShareSpec(specFromRecipe(data.activeRecipe)); } catch { setShareSpec(null); } }
      if (Array.isArray(data.saved)) setSaved(data.saved.filter(validSaved));
      if (data.location && typeof data.location.name === "string" && Number.isFinite(data.location.lat) && Math.abs(data.location.lat) <= 90 && Number.isFinite(data.location.lon) && Math.abs(data.location.lon) <= 180) setLocation({ ...data.location, id: typeof data.location.id === "string" ? data.location.id : "saved-location", label: typeof data.location.label === "string" ? data.location.label : data.location.name, country: data.location.country === undefined ? undefined : typeof data.location.country === "string" ? data.location.country.slice(0, 80) : "unknown" });
      if (Number.isFinite(data.radius) && data.radius >= 1 && data.radius <= 25) { latestRadius.current = data.radius; setRadius(data.radius); }
if (Array.isArray(data.pantry)) setPantry(data.pantry.filter((item: Stock) => item && typeof item.key === "string" && typeof item.name === "string" && typeof item.unit === "string" && Number.isFinite(item.onHand) && item.onHand >= 0));
      if (Array.isArray(data.buyList)) setBuyList(data.buyList.filter((item: ShopNeed) => item && typeof item.name === "string" && typeof item.unit === "string" && Number.isFinite(item.amount) && item.amount > 0));
      if (typeof data.buyListLabel === "string") setBuyListLabel(data.buyListLabel.slice(0, 500));
      setCustomShopping(readCustomShopping(data.customShopping));
      if (["saved", "recipe", "week", "custom"].includes(data.shoppingSource)) setShoppingSource(data.shoppingSource);
      if (data.verdicts && typeof data.verdicts === "object") {
        const next: Record<string, VerdictId> = {};
        for (const [key, value] of Object.entries(data.verdicts)) {
          if (value === "wont" || value === "might" || value === "will" || value === "staple") next[key] = value;
        }
        for (const entry of (Array.isArray(data.saved) ? data.saved.filter(validSaved) : []) as SavedRecipe[]) if (next[entry.recipe.id] && !next[recipeKey(entry.recipe)]) next[recipeKey(entry.recipe)] = next[entry.recipe.id];
        setVerdicts(next);
      }
      if (data.ratings && typeof data.ratings === "object") {
        const next: Record<string, number> = {};
        for (const [key, value] of Object.entries(data.ratings)) {
          if (Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 5) next[key] = value as number;
        }
        for (const entry of (Array.isArray(data.saved) ? data.saved.filter(validSaved) : []) as SavedRecipe[]) if (next[entry.recipe.id] !== undefined && next[recipeKey(entry.recipe)] === undefined) next[recipeKey(entry.recipe)] = next[entry.recipe.id];
        setRatings(next);
      }
  }, []);
  /* Browser storage is unavailable during SSR. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    try {
      prepareGuestKitchen(localStorage);
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      restoreKitchen(data);
      setView(parseView(new URLSearchParams(window.location.search).get("view")) || parseView(data.view) || "discover");
      const validPlace = data.location && typeof data.location.name === "string" && Number.isFinite(data.location.lat) && Math.abs(data.location.lat) <= 90 && Number.isFinite(data.location.lon) && Math.abs(data.location.lon) <= 180;
      if (!validPlace && sessionStorage.getItem("fusion-location-prompt") !== "later") setLocationOpen(true);
    } catch { /* Invalid browser data starts a fresh collection. */ }
    setLoaded(true);
  }, [restoreKitchen]);
  const kitchenSnapshot = useMemo(() => JSON.stringify({ saved, location, radius, pantry, verdicts, ratings, buyList, buyListLabel, shoppingSource, customShopping, preferences, avoidAllergens, dislikeText, cleanPrefs, weekDays, view, activeRecipe: recipe, planSession: week && appliedWeekBrief ? { plan: week, brief: appliedWeekBrief, locks: lockedDays } : null }), [saved, location, radius, pantry, verdicts, ratings, buyList, buyListLabel, shoppingSource, customShopping, preferences, avoidAllergens, dislikeText, cleanPrefs, weekDays, view, recipe, week, appliedWeekBrief, lockedDays]);
  useEffect(() => {
    if (!loaded) return;
    try { persistKitchenStorage(localStorage, kitchenSnapshot); }
    catch { setToast("Your browser could not save this change. You can still download your recipe."); }
  }, [kitchenSnapshot, loaded]);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timer); }, [toast]);
  // Keep recent core dishes across visits; side changes do not count as new meals.
  useEffect(() => {
    try { homeSeenCores.current = readDiscoverHistory(localStorage.getItem(DISCOVER_HISTORY_KEY)); } catch { homeSeenCores.current = []; }
    setHomeRecentCores(homeSeenCores.current);
    setHomeLoadSeed(freshSeed() || 1);
  }, []);
  const homeDiscover = useMemo(() => buildHomeDiscover({
    loadSeed: homeLoadSeed || 1, suggestionCount: 6, recentCoreKeys: homeRecentCores,
    diet, spiceHeat, servings, pantry: pantryText, clean: cleanPrefs,
    ...(cookPace ? { cookPace } : {}), avoidAllergens,
    dislikes: dislikeText.split(/[,;\n]/).map(part => part.trim()).filter(Boolean),
  }), [homeLoadSeed, homeRecentCores, diet, spiceHeat, servings, pantryText, cleanPrefs, cookPace, avoidAllergens, dislikeText]);
  useEffect(() => {
    if (!loaded || view !== "discover") return;
    homeSeenCores.current = rememberDiscoverCores(homeSeenCores.current, homeDiscover.suggestions.map(item => item.plate));
    try { localStorage.setItem(DISCOVER_HISTORY_KEY, JSON.stringify(homeSeenCores.current)); } catch { /* Discovery still works when browser storage is unavailable. */ }
  }, [homeDiscover.suggestions, loaded, view]);
  const shuffleHomeIdeas = () => {
    setHomeRecentCores(rememberDiscoverCores(homeSeenCores.current, homeDiscover.suggestions.map(item => item.plate)));
    setHomeLoadSeed(freshSeed() || 1);
  };
  const motwShare = homeDiscover.mealOfWeek.recipe;
  const motwToken = useMemo(() => {
    try {
      return encodeShare(specFromRecipe(motwShare));
    } catch {
      return "";
    }
  }, [motwShare]);
  const motwImage = motwToken
    ? `${publicPath("/api/plate")}?t=${encodeURIComponent(motwToken)}&v=${PLATE_IMAGE_VERSION}`
    : publicPath("/images/fusion-table-hero.png");
  useEffect(() => {
    if (!loaded) return;
    let cancel = false;
    void fetch(publicPath("/api/community"), { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return;
      const data = await response.json() as CommunityBoard;
      if (!cancel && data && Array.isArray(data.plates)) setCommunity(data);
    }).catch(() => undefined);
    return () => { cancel = true; };
  }, [loaded]);
  useEffect(() => {
    if (!loaded || typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("r");
    if (!token) return;
    try {
      const spec = decodeShare(token);
      const next = recipeFromShare(spec);
      // Hydrate studio once from ?r= after cookbook load (external URL sync).
      /* eslint-disable react-hooks/set-state-in-effect -- one-shot share-link open */
      setShareSpec(spec);
      showRecipe(next);
      setBuilderMode(spec.kind === "meal" ? "meal" : "classic");
      if (spec.kind === "classic" && spec.classicId) { setClassicId(spec.classicId); setRegionId(spec.regionId); }

      const openShopping = new URLSearchParams(window.location.search).get("view") === "shops";
      if (openShopping) setShoppingSource("recipe");
      navigate(openShopping ? "shops" : "studio", true);
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      setToast("That shared link is not a recipe this site can open.");
    }
    // Open a shared recipe once the saved cookbook has loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  useEffect(() => () => { shopAbort.current?.abort(); locationAbort.current?.abort(); }, []);
  useEffect(() => {
    const restoreView = () => {
      const query = new URLSearchParams(window.location.search);
      const token = query.get("r");
      if (token) {
        try {
          const spec = decodeShare(token), next = recipeFromShare(spec);
          const entry = saved.find((item) => recipeKey(item.recipe) === recipeKey(next));
          setMealDraft(null);
          if (next.kind !== "meal") { setClassicId(next.classicId); setRegionId(next.regionId); }
          setRecipe(next); setShareSpec(spec); setNotes(entry?.notes || ""); setRating(entry?.rating ?? ratings[recipeKey(next)] ?? 0); setTested(entry?.tested ?? false);
          setBuilderMode(next.kind === "meal" ? "meal" : "classic"); setBuilderRevision((value) => value + 1); setView(query.get("view") === "shops" ? "shops" : "studio"); if (query.get("view") === "shops") setShoppingSource("recipe");
        } catch { setToast("That shared link cannot be opened. Your saved recipes are unchanged."); }
      } else setView(parseView(query.get("view")) || "discover");
      setMenuOpen(false); setCookingStep(null);
    };
    window.addEventListener("popstate", restoreView);
    return () => window.removeEventListener("popstate", restoreView);
  }, [saved, ratings]);
  const navigate = useCallback((next: View, preserveShared = false) => {
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    if (!preserveShared) url.searchParams.delete("r");
    if (url.href !== window.location.href) window.history.pushState({}, "", url);
    setView(next); setMenuOpen(false); setCookingStep(null); window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const closeLocation = useCallback(() => {
    locationRequest.current++; locationAbort.current?.abort();
    setLocationLoading(false); setLocationOpen(false);
  }, []);
  const closeAbout = useCallback(() => setAboutOpen(false), []);
  const closeCooking = useCallback(() => setCookingStep(null), []);
  const isSaved = !!recipe && saved.some((s) => recipeKey(s.recipe) === recipeKey(recipe));
  const currentPantryNames = useMemo(() => parsePantry(pantryText), [pantryText]);
  const needed = useMemo(() => {
    const candidates = recipe?.ingredients.filter((item) => !pantryHas(item, currentPantryNames) && !checked.includes(item.id)) || [];
    return weekNeeds(pantry, candidates).flatMap((line) => {
      const original = candidates.find((item) => item.id === line.id);
      return original ? [{ ...original, amount: line.amount, unit: line.unit }] : [];
    });
  }, [recipe, checked, pantry, currentPantryNames]);
  const shoppingMetadata = useMemo(() => [...(recipe?.ingredients || []), ...(week?.days.flatMap((day) => day.recipe?.ingredients || []) || [])], [recipe, week]);
  const recipeShopping = useMemo(() => normalizeShoppingList(needed, shoppingMetadata), [needed, shoppingMetadata]);
  const savedShopping = useMemo(() => normalizeShoppingList(buyList, shoppingMetadata), [buyList, shoppingMetadata]);
  const plannedShopping = useMemo(() => normalizeShoppingList(weekShopping, shoppingMetadata), [weekShopping, shoppingMetadata]);
  const effectiveShoppingSource = shoppingSource === "saved" && !buyList.length ? recipe ? "recipe" : week && !weekIsStale && filledDinnerCount ? "week" : "custom" : shoppingSource === "recipe" && !recipe || shoppingSource === "week" && (!week || weekIsStale || !filledDinnerCount) ? "custom" : shoppingSource;
  const shoppingLines = effectiveShoppingSource === "recipe" ? recipeShopping : effectiveShoppingSource === "week" ? plannedShopping : effectiveShoppingSource === "saved" ? savedShopping : customShopping;
  const shoppingLabel = effectiveShoppingSource === "recipe" ? recipe?.title || "Current recipe" : effectiveShoppingSource === "week" ? "Week plan" : effectiveShoppingSource === "saved" ? buyListLabel || "Saved shopping list" : "My own shopping list";
  const shoppingSources = [
    { id: "saved", label: "Saved shopping list", count: savedShopping.length, disabled: !buyList.length },
    { id: "recipe", label: "Current recipe", count: recipeShopping.length, disabled: !recipe },
    { id: "week", label: weekIsStale ? "Week plan · rebuild required" : "Week plan", count: plannedShopping.length, disabled: !week || weekIsStale || !filledDinnerCount },
    { id: "custom", label: "My own list", count: customShopping.length },
  ];
  const findShops = useCallback(async (place: LocationResult, distance: number) => {
    lastShopSearch.current = `${place.lat}|${place.lon}|${distance}`;
    const sequence = ++shopRequest.current;
    shopAbort.current?.abort();
    const controller = new AbortController(); shopAbort.current = controller;
    setShopsLoading(true); setShopError(""); setShopData(null);
    try {
      const data = await fetchNearbyShops(place, distance, controller.signal);
      if (sequence === shopRequest.current) setShopData(data);
    } catch (error) { if (sequence === shopRequest.current && !controller.signal.aborted) setShopError(error instanceof Error ? error.message : "Shop search is unavailable."); }
    finally { if (sequence === shopRequest.current) { setShopsLoading(false); shopAbort.current = null; } }
  }, []);
  useEffect(() => {
    if (!loaded || view !== "shops" || !location) return;
    const key = `${location.lat}|${location.lon}|${radius}`;
    if (lastShopSearch.current === key) return;
    const timer = setTimeout(() => void findShops(location, radius), 250);
    return () => clearTimeout(timer);
  }, [loaded, view, location, radius, findShops]);
  useEffect(() => { if (location) setLocationOpen(false); }, [location]); // eslint-disable-line react-hooks/set-state-in-effect
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
setLocation(place); setLocationOpen(false);
    void findShops(place, latestRadius.current); setToast(`Location set to ${place.name}.`);
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
    setShopsLoading(false); setShopData(null); setShopError("");
  }
  function clearLocation() {
    shopRequest.current++; shopAbort.current?.abort(); closeLocation();
    setLocation(null); setShopData(null); setShopsLoading(false); setShopError("");
    lastShopSearch.current = ""; setToast("Location cleared.");
  }
  function openReport(plate: PlateStanding) {
    const dietOk = DIETS.some((item) => item.id === plate.diet);
    const heatOk = (SPICE_HEATS as readonly string[]).includes(plate.spiceHeat);
    if (!dietOk || !heatOk) { setToast("That report does not match a template on this site."); return; }
    try {
      const next = plate.kind === "meal"
        ? generateMeal({ mainId: plate.mainId, methodId: plate.methodId, regionId: plate.regionId, sideId: plate.sideId, diet: plate.diet as DietId, spiceHeat: plate.spiceHeat as SpiceHeat, servings })
        : generateRecipe({ classicId: plate.classicId, regionId: plate.regionId, diet: plate.diet as DietId, spiceHeat: plate.spiceHeat as SpiceHeat, servings });
      showRecipe(next);
      setShareSpec(specFromRecipe(next));
      navigate("studio");
      if (plateIdentity(next).key !== plate.plateKey) setToast("Opened the current base template at your household servings. It differs from the reported version; those reports have not been transferred.");
    } catch {
      setToast("That plate is still in the book, but this version of the templates could not open it.");
    }
  }
  function showRecipe(next: Recipe) {
    const entry = saved.find((item) => recipeKey(item.recipe) === recipeKey(next));
    const stars = entry?.rating ?? ratings[recipeKey(next)] ?? ratings[next.id] ?? 0;
    setMealDraft(null);
    setBuilderMode(next.kind === "meal" ? "meal" : "classic");
    if (next.kind !== "meal") { setClassicId(next.classicId); setRegionId(next.regionId); }
    setUseTry(false); setRecipe(next); setNotes(entry?.notes || ""); setRating(stars); setTested(entry?.tested || false);
    setRatings((current) => current[recipeKey(next)] === stars ? current : { ...current, [recipeKey(next)]: stars });
  }
  function weekBrief(seed: number) {
    // Fetch-time reports affect this operation, not the stored household brief or stale-plan signature.
    return { ...currentWeekBrief, seed, feedback: community?.plates };
  }
  function toggleClean(key: keyof CleanPrefs) {
    setCleanPrefs((current) => {
      const next = { ...current };
      if (next[key]) delete next[key];
      else next[key] = true;
      return next;
    });
  }
  function householdControls() {
    return <details className="household-settings"><summary>Your household · {servings}{" "}{servings === 1 ? "person" : "people"} · {DIETS.find((item) => item.id === diet)?.name} · {spiceHeat} heat{avoidAllergens.length ? ` · ${avoidAllergens.length} exclusions` : ""}</summary>
      <div className="household-fields">
        <label className="field"><span>Household diet</span><select value={diet} onChange={(event) => setDiet(event.target.value as DietId)}>{DIETS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>People to feed</span><select value={servings} onChange={(event) => setServings(Number(event.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 1).map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="field"><span>Household heat</span><select value={spiceHeat} onChange={(event) => setSpiceHeat(event.target.value as SpiceHeat)}>{SPICE_HEATS.map((heat) => <option key={heat} value={heat}>{heat}</option>)}</select></label>
        <label className="field"><span>Already at home</span><input value={pantryText} onChange={(event) => setPantryText(event.target.value)} maxLength={500} placeholder="rice, garlic, olive oil" /></label>
        <label className="field"><span>Hard dislikes</span><input value={dislikeText} onChange={(event) => setDislikeText(event.target.value)} maxLength={1000} placeholder="coriander, mushroom" /></label>
      </div>
      <div className="avoid-row" role="group" aria-label="Allergens to avoid">{AVOID_CHOICES.map((name) => <label key={name} className="text-button"><input type="checkbox" checked={avoidAllergens.includes(name)} onChange={() => setAvoidAllergens((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name])} /> {name}</label>)}</div>
      <p className="subtle-small">These settings are shared by both builders and the week planner and saved with your private kitchen. Guests use browser storage; signed-in kitchens sync to your account. Exclusions stay strict; check packaged ingredients and preparation for your needs.</p>
    </details>;
  }
  async function restoreCookbook(file?: File) {
    if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error("Choose a cookbook file under 8 MB.");
      const next = importCookbook(await file.text(), saved);
      const added = next.length - saved.length;
      const active = recipe ? next.find((entry) => recipeKey(entry.recipe) === recipeKey(recipe)) : undefined;
      if (active) { setNotes(active.notes); setRating(active.rating); setTested(active.tested); setRatings((current) => ({ ...current, [recipeKey(active.recipe)]: active.rating })); }
      setSaved(next); setToast(added ? `Imported ${added} ${added === 1 ? "recipe" : "recipes"}. Existing notes and ratings were kept.` : "Those recipes are already in your cookbook. Existing notes and ratings were kept.");
    } catch (error) { setToast(error instanceof Error ? error.message : "That cookbook could not be imported. Your saved recipes have not changed."); }
    finally { if (cookbookImportRef.current) cookbookImportRef.current.value = ""; }
  }
  function cleanKnobs(idPrefix: string) {
    return <div className="clean-knobs" role="group" aria-label="Cleaner meal preferences">
      {(Object.keys(CLEAN_KNOB_LABELS) as (keyof typeof CLEAN_KNOB_LABELS)[]).map((key) => (
        <label key={key} className={`clean-knob ${cleanPrefs[key] ? "on" : ""}`}>
          <input
            id={`${idPrefix}-${key}`}
            type="checkbox"
            checked={!!cleanPrefs[key]}
            onChange={() => toggleClean(key)}
          />
          <span>{CLEAN_KNOB_LABELS[key]}</span>
        </label>
      ))}
      <p className="subtle-small">Soft prefs only. Diet, allergens and hard dislikes are never relaxed.</p>
    </div>;
  }
  function applyWeek(next: WeekPlan, options?: { clearUndo?: boolean }) {
    if (options?.clearUndo) setWeekUndo([]);
    else if (week) setWeekUndo((stack) => [...stack.slice(-9), week]);
    setWeek(next);
  }
  function undoWeekChange() {
    const previous = weekUndo[weekUndo.length - 1];
    if (previous) setWeek(previous);
    setWeekUndo((stack) => stack.slice(0, -1));
    setWeekError("");
    setToast("Undid the last randomise or swap.");
  }
  function buildWeek(event?: FormEvent) {
    event?.preventDefault(); setWeekError("");
    try {
      applyWeek(planWeek(weekBrief(freshSeed())), { clearUndo: true });
      setAppliedWeekBrief(currentWeekBrief);
      setLockedDays([]);
    }
    catch (error) { setWeekError(error instanceof Error ? error.message : "The week could not be planned."); }
  }
  function randomiseDay(day: number) {
    if (weekIsStale) { setWeekError("Your settings changed. Rebuild the week before changing individual dinners."); return; }
    if (!week || lockedDays.includes(day)) {
      if (lockedDays.includes(day)) setWeekError("That dinner is locked. Unlock it if you want a different one.");
      return;
    }
    setWeekError("");
    try {
      const next = swapDinner(weekBrief(freshSeed()), week, day);
      const before = week.days.find((item) => item.day === day)?.recipe?.id;
      applyWeek(next);
      if (next.days.find((item) => item.day === day)?.recipe?.id === before) setWeekError("No other template matches your filters for that day. Filters stay in place.");
    } catch (error) { setWeekError(error instanceof Error ? error.message : "That dinner could not be changed."); }
  }
  function changeSide(day: number, sideId: string) {
    if (weekIsStale) { setWeekError("Your settings changed. Rebuild the week before changing a side."); return; }
    if (!week || lockedDays.includes(day)) {
      if (lockedDays.includes(day)) setWeekError("That dinner is locked. Unlock it before changing the side.");
      return;
    }
    setWeekError("");
    try {
      const before = week.days.find((item) => item.day === day)?.recipe;
      const next = swapSide(weekBrief(freshSeed()), week, day, sideId);
      const after = next.days.find((item) => item.day === day)?.recipe;
      applyWeek(next);
      if (!after || after.sideId === before?.sideId) {
        const hint = explainBlockedSide(weekBrief(freshSeed()), week, day, sideId);
        setWeekError(hint.reason);
      }
    } catch (error) {
      const hint = explainBlockedSide(weekBrief(freshSeed()), week, day, sideId);
      setWeekError(hint.reason || (error instanceof Error ? error.message : "That side could not be changed."));
    }
  }
  function pickDinner(day: number, classicIdToUse: string, regionIdToUse: string) {
    if (weekIsStale) { setWeekError("Your settings changed. Rebuild the week before changing individual dinners."); return; }
    if (!week || lockedDays.includes(day)) {
      if (lockedDays.includes(day)) setWeekError("That dinner is locked. Unlock it if you want a different one.");
      return;
    }
    setWeekError("");
    try {
      const before = week.days.find((item) => item.day === day)?.recipe?.id;
      const next = chooseDinner(weekBrief(freshSeed()), week, day, classicIdToUse, regionIdToUse);
      applyWeek(next);
      if (next.days.find((item) => item.day === day)?.recipe?.id === before) setWeekError("That choice does not match your recorded filters, so it was not used.");
    } catch (error) { setWeekError(error instanceof Error ? error.message : "That dinner could not be changed."); }
  }
  function openPlanned(recipeToOpen: Recipe) {
    try { setShareSpec(specFromRecipe(recipeToOpen)); } catch { setShareSpec(null); }
    showRecipe(recipeToOpen);
    if (recipeToOpen.kind === "meal") setBuilderMode("meal");
    else { setClassicId(recipeToOpen.classicId); setRegionId(recipeToOpen.regionId); setBuilderMode("classic"); }
    setChecked([]);
    setBuilderRevision((value) => value + 1);
    navigate("studio");
  }
  function openHomeMeal(recipeToOpen: Recipe, token?: string) {
    try {
      const opened = openFeaturedRecipe(recipeToOpen, token);
      setShareSpec(opened.spec);
    } catch (error) {
      setToast(error instanceof Error ? error.message : "This featured plate could not be opened. Refresh Discover and try again.");
      return;
    }
    showRecipe(recipeToOpen);
    setBuilderMode("meal");
    setBuilderRevision((value) => value + 1);
    setChecked([]);
    navigate("studio");
    setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  }
  function openInspiration(item: typeof INSPIRATIONS[number]) {
    try {
      const { recipe: next, spec } = openClassicInspiration(item);
      setShareSpec(spec); setClassicId(item.classicId); setRegionId(item.regionId); setFormError("");
      showRecipe(next); setChecked([]); setBuilderMode("classic"); navigate("studio");
      setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
    } catch (error) { setToast(error instanceof Error ? error.message : "This featured recipe could not be opened."); }
  }
  function createRecipe(event?: FormEvent) {
    event?.preventDefault(); setFormError("");
    try {
      const dislikes = dislikeText.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
      const spec: ShareSpec = {
        v: 1, kind: "classic",
        classicId,
        regionId,
        diet,
        spiceHeat, servings,
        seed: freshSeed(), ...(cookPace ? { cookPace } : {}), ...(avoidAllergens.length ? { avoid: avoidAllergens } : {}), ...(dislikes.length ? { dislikes } : {}),
      };
      const next = generateRecipe({
        classicId: spec.classicId || classicId,
        regionId: spec.regionId,
        diet: spec.diet,
        servings: spec.servings,
        spiceHeat: spec.spiceHeat,
        pantry: pantryText,
        ...(cleanActive(cleanPrefs) ? { clean: cleanPrefs } : {}),
        ...(spec.seed !== undefined ? { seed: spec.seed } : {}), avoidAllergens, dislikes,
        ...(spec.cookPace ? { cookPace: spec.cookPace } : {}),
      });
      setShareSpec(specFromRecipe(next));
      showRecipe(next); setChecked([]); setBuilderMode("classic"); navigate("studio");
      if (location && !shopData && !shopsLoading) void findShops(location, radius);
      setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
    } catch (error) { setFormError(error instanceof Error ? error.message : "Please check your recipe choices."); }
  }
  function receiveMeal(next: Recipe, made?: MealInput) {
    try { setShareSpec(specFromRecipe(next)); } catch { setShareSpec(null); }
    if (made) updatePreferences({ diet: made.diet || next.diet, spiceHeat: made.spiceHeat || next.spiceHeat, servings: made.servings, cookPace: made.cookPace || "", pantry: typeof made.pantry === "string" ? made.pantry : (made.pantry || []).join(", ") });
    showRecipe(next); setChecked([]); navigate("studio");
    if (location && !shopData && !shopsLoading) void findShops(location, radius);
    setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
  }
  function saveRecipe() {
    if (!recipe) return; const key = recipeKey(recipe);
    if (isSaved) { setSaved((all) => all.filter((s) => recipeKey(s.recipe) !== key)); setToast("Recipe removed from your cookbook."); }
    else {
      if (saved.length >= 100) { setToast("Your cookbook has reached 100 recipes. Export a backup, then remove a recipe to make room."); return; }
      let token = "";
      try { token = verifiedShareSpec ? encodeShare(verifiedShareSpec) : ""; } catch { token = ""; }
      setSaved((all) => [{ recipe, savedAt: new Date().toISOString(), notes: "", tested: false, rating: ratings[key] || 0, ...(token ? { token } : {}) }, ...all]); setToast("Added to your private cookbook.");
    }
  }
  function openSaved(entry: SavedRecipe) {
    try { setShareSpec(specFromRecipe(entry.recipe)); }
    catch { if (entry.token) { try { setShareSpec(decodeShare(entry.token)); } catch { setShareSpec(null); } } else setShareSpec(null); }
    showRecipe(entry.recipe); setBuilderMode(entry.recipe.kind === "meal" ? "meal" : "classic"); setBuilderRevision((value) => value + 1);
    if (entry.recipe.kind !== "meal") { setClassicId(entry.recipe.classicId); setRegionId(entry.recipe.regionId); }
    setChecked([]); navigate("studio");
    setTimeout(() => { recipeRef.current?.focus({ preventScroll: true }); recipeRef.current?.scrollIntoView({ behavior: "smooth" }); }, 50);
  }
  function shoppingView() {
    if (view === "studio" && recipe) setShoppingSource("recipe");
    else if (view === "week" && week && !weekIsStale && filledDinnerCount) setShoppingSource("week");
    navigate("shops");
    if (!location) setLocationOpen(true);
  }
  function exportShopping() {
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const ranked = rankShopsForList(shoppingLines, shopData?.shops || [], { radiusKm: radius });
    const rows = ["Ingredient,Quantity,Nearby shop suggestions,Area", ...shoppingLines.map((line) => [line.name, amount(line.amount, line.unit), ranked.filter((entry) => entry.matchedIngredientIds.includes(line.id)).slice(0, 3).map((entry) => entry.shop.name).join("; ") || "Search nearby shops", location?.label || location?.name || "Area not set"].map(escape).join(","))];
    downloadFile("fusion-table-shopping-list.csv", rows.join("\n"), "text/csv;charset=utf-8");
  }
  function studio(compact = false) {
    const mealDislikes = dislikeText.split(/[,;\n]/).map((part) => part.trim()).filter(Boolean);
    return <section className="studio-shell" ref={composerRef} id="recipe-studio" aria-label="Create a meal or remix a classic">{householdControls()}<div className="studio-mode-tabs" aria-label="Recipe starting point"><button className={builderMode === "meal" ? "active" : ""} onClick={() => setBuilderMode("meal")} aria-pressed={builderMode === "meal"}><ChefHat size={16} /> Build a meal</button><button className={builderMode === "classic" ? "active" : ""} onClick={() => setBuilderMode("classic")} aria-pressed={builderMode === "classic"}><Utensils size={16} /> Classics & BBQ</button></div>{builderMode === "meal" ? <MealBuilder key={builderRevision} onCreated={receiveMeal} initialRecipe={recipe} initialDraft={mealDraft || undefined} onDraftChange={setMealDraft} preferences={preferences} onPreferencesChange={updatePreferences} avoidAllergens={avoidAllergens} dislikes={mealDislikes} clean={cleanPrefs} onCleanChange={setCleanPrefs} /> : composer(compact)}</section>;
  }
  function composer(compact = false) {
    return <section className={`composer ${compact ? "compact" : ""}`} aria-label="Remix a classic recipe">
      <div className="section-heading"><div><span className="eyebrow"><Sparkles size={14} /> RECIPE</span><h2>Choose a classic and a flavour.</h2></div><span className="tiny-note">Templates only. Not kitchen-tested.</span></div>
      <form onSubmit={(e) => createRecipe(e)}><div className="compose-main">
        <label className="field"><span>Start with a classic</span><div className="select-wrap"><Utensils size={19} /><select value={classicId} onChange={(e) => setClassicId(e.target.value)} aria-label="Classic dish"><optgroup label="Everyday classics">{EVERYDAY_CLASSICS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup><optgroup label="Smoke, grill & BBQ">{SMOKE_CLASSICS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</optgroup></select><ChevronDown size={16} /></div></label>
        <span className="fusion-plus" aria-hidden="true"><Plus size={21} /></span>
        <label className="field"><span>Choose a region</span><div className="select-wrap"><Globe2 size={19} /><select value={regionId} onChange={(e) => setRegionId(e.target.value)} aria-label="Regional flavour"><optgroup label="Home kitchen">{HOME_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup><optgroup label="Original regional flavours">{ORIGINAL_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup><optgroup label="Smoke & grill traditions">{SMOKE_REGIONS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup></select><ChevronDown size={16} /></div></label>
        <div className="field serving-field"><span>Servings</span><div className="stepper"><button type="button" onClick={() => setServings((n) => Math.max(1, n - 1))} disabled={servings <= 1} aria-label="Fewer servings"><Minus size={15} /></button><span>{servings} <Users size={15} /></span><button type="button" onClick={() => setServings((n) => Math.min(12, n + 1))} disabled={servings >= 12} aria-label="More servings"><Plus size={15} /></button></div></div>
        <button className="button primary compose-submit" type="submit"><Sparkles size={17} /> {regionId === "home-style" ? "Create this plate" : "Create my fusion"} <ArrowRight size={18} /></button>
      </div><div className="compose-options"><button type="button" className="text-button" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}><SlidersHorizontal size={15} /> Diet, heat, session & pantry <ChevronDown className={advanced ? "rotated" : ""} size={14} /></button><span><Leaf size={14} /> Diet, heat, cook session, and pantry stay under your control.</span></div>
      {advanced && <div className="advanced-options"><label className="field"><span>Dietary preference</span><select aria-label="Dietary preference" value={diet} onChange={(e) => setDiet(e.target.value as DietId)}>{DIETS.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label><label className="field"><span>Heat</span><select aria-label="Spice level" value={spiceHeat} onChange={(e) => setSpiceHeat(e.target.value as SpiceHeat)}><option value="gentle">Gentle</option><option value="mild">Mild</option><option value="medium">Medium</option><option value="hot">Hot</option><option value="fiery">Fiery</option></select></label><label className="field"><span>Cook session</span><select aria-label="Cook session" value={cookPace} onChange={(e) => setCookPace(e.target.value as CookPace | "")}><option value="">Template timing</option>{(Object.keys(COOK_PACE_LABELS) as CookPace[]).map((pace) => <option key={pace} value={pace}>{COOK_PACE_LABELS[pace]}</option>)}</select><small>Optional. Steps and temperatures stay as written. A long smoke day is a schedule note, not a new clock.</small></label><label className="field pantry-field"><span>Already in your pantry</span><input value={pantryText} onChange={(e) => setPantryText(e.target.value)} maxLength={500} placeholder="e.g. garlic, olive oil, rice" /><small>Separate ingredients with commas. Matching items come off your shopping list.</small></label><div className="field clean-field"><span>Cleaner plate</span>{cleanKnobs("classic")}</div></div>}{formError && <p className="error-message" role="alert">{formError}</p>}<p className="classic-count-note">Choose a familiar dish and a regional flavour. Each new variation keeps your household exclusions. Cook sessions add scheduling guidance; cooking times remain estimates. Templates are not kitchen-tested.</p></form>
    </section>;
  }
  function plateSrc(target: Recipe, spec: ShareSpec | null): string {
    void spec;
    const cached = plateUrlCache.get(target);
    if (cached) return cached;
    try {
      const chosen = specFromRecipe(target);
      const source = shareSpecMatchesRecipe(chosen, target) ? `${publicPath("/api/plate")}?t=${encodeURIComponent(encodeShare(chosen))}&v=${PLATE_IMAGE_VERSION}` : PLATE_FALLBACK;
      plateUrlCache.set(target, source);
      return source;
    } catch {
      plateUrlCache.set(target, PLATE_FALLBACK);
      return PLATE_FALLBACK;
    }
  }
  function shareBar(current: Recipe) {
    let token = "";
    if (!verifiedShareSpec) return <p className="subtle-small">This saved version cannot be reproduced as a link or PDF. Download the recipe JSON below to keep its exact ingredients and steps.</p>;
    try { token = encodeShare(verifiedShareSpec); } catch { return null; }
    const path = publicPath(`/r/${token}`);
    const link = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
    const pdf = `${publicPath("/api/recipe-pdf")}?t=${encodeURIComponent(token)}`;
    const text = `${current.title}. Template-generated, not kitchen-tested.`;
    async function send() {
      try {
        if (navigator.share) { await navigator.share({ title: current.title, text, url: link }); return; }
        await navigator.clipboard.writeText(link);
        setToast("Link copied. Anyone with the link can open this recipe.");
      } catch {
        setToast(link);
      }
    }
    return <div className="recipe-actions">
      <a className="button secondary" href={pdf}>Save PDF <Download size={16} /></a>
      <button type="button" className="button secondary" onClick={() => void send()}>Copy or share link <Share2 size={16} /></button>
      <a className="text-button" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <a className="text-button" href={`mailto:?subject=${encodeURIComponent(current.title)}&body=${encodeURIComponent(`${text}\n${link}`)}`}>Email</a>
      <a className="text-button" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">Post on X</a>
      <a className="text-button" href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(link)}`} target="_blank" rel="noreferrer">Facebook</a>
    </div>;
  }
  function recipeDetail() {
    if (recipe && (builderMode === "meal" ? !mealDraftMatchesRecipe(mealDraft, recipe) : recipe.kind === "meal" || recipe.classicId !== classicId || recipe.regionId !== regionId)) return <div className="empty-state" role="status"><div className="empty-icon"><ChefHat size={35} /></div><h3>Your recipe choices have changed.</h3><p>Choose Create above to see the ingredients and method for your new choices.</p></div>;
    if (!recipe) return <div className="empty-state"><div className="empty-icon"><ChefHat size={35} /></div><h3>Choose a meal to see the ingredients.</h3><p>Pick a main, a method, and a region. The result is a template with steps. It is not kitchen-tested. Check the packet.</p></div>;
    const earlierVariation = recipe.tags.includes("Seeded plate") && (recipe.ingredients.some((item) => ["sat-fish", "sat-prawns", "sat-tofu"].includes(item.id)) || recipe.ingredients.filter((item) => item.id.startsWith("sat-")).length > 2 || /as plated with|cold stir-fry|hot toss|lettuce wraps|chopped salad/i.test(recipe.title));
    const adjustments = communityAdjustments(plateIdentity(recipe), recipe.ingredients, community?.plates || []);
    const shown = recipe.ingredients;
    const preview = useTry ? scaleIngredients(recipe.ingredients, adjustments) : [];
    const stats = recipe.cleanStats ?? mealCleanStats(recipe);
    return <IngredientPriceProvider recipe={recipe} location={location} shops={shopData?.shops} radiusKm={radius}><article className="recipe-detail" ref={recipeRef} tabIndex={-1} aria-label={recipe.title}>
      {earlierVariation && <div className="settings-warning" role="status"><strong>Refresh this earlier variation.</strong><p>This variation predates the tighter ingredient matching. Choose Create above for an updated recipe.</p></div>}
      <div className="recipe-heading"><div><span className="eyebrow">{recipeBaseName(recipe)} <span className="pair-x">×</span> {regionName(recipe.regionId)}</span><h2>{recipe.title}</h2>{chosenCutLabel(recipe) && <p className="subtle-small"><strong>Chosen cut:</strong> {chosenCutLabel(recipe)}</p>}<p>{recipe.description}</p><div className="recipe-meta"><span><Clock3 size={16} /> About {duration(recipe.totalMinutes)}{recipe.steps.some((step) => /fridge until cold/i.test(step.detail)) ? " + chilling" : ""}</span>{recipe.cookPace && <span><Clock3 size={16} /> {COOK_PACE_LABELS[recipe.cookPace]}</span>}<span><Users size={16} /> {recipe.servings} servings</span><span><Leaf size={16} /> {DIETS.find((d) => d.id === recipe.diet)?.name}</span><span className="meal-source-badge"><BookOpen size={12} /> {recipe.sourceLabel}</span></div><div className="clean-stats" aria-label="Plate clutter counts"><span>{stats.ingredientCount} ingredients</span><span>{stats.stepCount} steps</span><span>{stats.bottleCount} bottle{stats.bottleCount === 1 ? "" : "s"}</span>{recipe.cleanSummary && <span className="clean-summary-pill">{recipe.cleanSummary}</span>}</div></div><button className={`button secondary save-recipe ${isSaved ? "is-saved" : ""}`} onClick={saveRecipe}><Heart size={17} fill={isSaved ? "currentColor" : "none"} /> {isSaved ? "Saved to cookbook" : "Save recipe"}</button></div>
      {recipeWarnings.length > 0 && <div className="settings-warning" role="alert"><strong>This saved or opened recipe does not match your current household settings.</strong><p>{recipeWarnings.join(". ")}. Review it before cooking, or create another meal using your current settings.</p></div>}
      <figure className="recipe-plate"><RecipeImage src={plateSrc(recipe, shareSpec)} alt={`Plate picture for ${recipe.title}`} onError={keepImage} /><figcaption>Generated inspiration image. Missing pictures prepare in the background and appear automatically when ready. Follow the ingredient list and method.</figcaption></figure>
      {shareBar(recipe)}
      <RecipeShoppingCost lines={recipeShopping} servings={recipe.servings} location={location} shops={shopData?.shops} radiusKm={radius} onSetLocation={() => setLocationOpen(true)} onOpenShopping={() => { setShoppingSource("recipe"); navigate("shops"); }} />
      {recipe.components && <div className="meal-components">{Object.entries(recipe.components).map(([label, value]) => <div className="meal-component" key={label}><small>{label}</small><strong>{value}</strong></div>)}</div>}
      <div className="fusion-note"><Sparkles size={21} /><div><strong>{flavourHeading(recipe)}</strong><p>{recipe.fusionNote.split(". ")[0].replace(/[.]$/, "")}.</p><details className="recipe-template-notes"><summary>More about this template</summary><p>{recipe.fusionNote}</p></details></div></div>
      <div className="recipe-columns"><section className="ingredients-panel"><div className="subheading"><h3>What you will need</h3><span>{recipe.servings} servings</span></div><p className="subtle-small">Costs beside each ingredient estimate the amount used, including pantry food. The shopping budget above covers packs you still need to buy. All amounts are AUD; planning estimates are labelled.</p>{useTry && <aside className="settings-warning"><strong>Preview cook feedback</strong><p>Suggested amounts for review only. Your ingredient list, method, pantry and downloads below keep the original recipe.</p><ul>{adjustments.map((change) => { const item = preview.find((ingredient) => ingredient.id === change.ingredientId); return item ? <li key={item.id}>{item.name}: suggested {amount(item.amount, item.unit)} · {change.because}</li> : null; })}</ul></aside>}<ul className="ingredient-list">{shown.map((ingredient) => <li key={ingredient.id}><span><strong>{ingredient.name}</strong>{ingredient.notes && <small>{ingredient.notes}</small>}{pantryHas(ingredient, currentPantryNames) && <small className="pantry-label">Named in your current pantry note</small>}</span><span className="ingredient-quantity-cost"><em>{amount(ingredient.amount, ingredient.unit)}</em><IngredientCost ingredient={ingredient} /></span></li>)}</ul>{recipe.allergens.length > 0 && <p className="subtle-small">Contains: {recipe.allergens.join(", ")}. Check the packet.</p>}
        <KitchenDesk key={recipeKey(recipe)} ingredients={recipe.ingredients.map((item) => ({ id: item.id, name: item.name, amount: item.amount, unit: item.unit }))} pantry={pantry} verdict={verdicts[recipeKey(recipe)] || ""} stars={ratings[recipeKey(recipe)] || 0} onPantry={setPantry} onVerdict={(next) => setVerdicts((current) => ({ ...current, [recipeKey(recipe)]: next }))} onStars={(next) => { const key = recipeKey(recipe); setRatings((current) => ({ ...current, [key]: next })); setRating(next); setSaved((all) => all.map((entry) => recipeKey(entry.recipe) === key ? { ...entry, rating: next } : entry)); }} onShopping={(lines, warnings) => { setCookNote(warnings.join(" ")); setBuyList(lines); setBuyListLabel(recipe.title); setShoppingSource("saved"); navigate("shops"); }} />
        <CommunityDesk recipe={recipe} board={community} tried={useTry} onBoard={setCommunity} onToggleTry={() => setUseTry((current) => !current)} />
        {cookNote && <p className="subtle-small" role="status">{cookNote}</p>}
      </section>
      <section className="method-panel"><div className="subheading"><h3>Method</h3><button className="text-button" onClick={() => setCookingStep(0)}><Utensils size={15} /> Cooking mode</button></div><div className="method-timing"><span>Prep <strong>~{duration(recipe.prepMinutes)}</strong></span><span>Cook <strong>~{duration(recipe.cookMinutes)}</strong></span></div><p className="equipment-note"><strong>Equipment:</strong> {recipe.equipment.join(" · ")}</p><ol className="method-list">{recipe.steps.map((step, index) => <li key={index}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><div><h4>{step.title}</h4><p>{step.detail}</p></div></li>)}</ol>{recipe.sessionNote ? <section className="bbq-method-notes"><h4>Cook session</h4><p>{recipe.sessionNote}</p></section> : null}{recipe.methodNotes?.length ? <section className="bbq-method-notes"><h4>Technique notes</h4><ul>{recipe.methodNotes.map((note, index) => <li key={index}>{note}</li>)}</ul></section> : null}{recipe.safetyNote && <p className="recipe-source"><CheckCheck size={14} /><span>{recipe.safetyNote} {recipe.safetySource && <a href={recipe.safetySource} target="_blank" rel="noreferrer">Food safety guidance ↗</a>}</span></p>}<p className="recipe-source"><BookOpen size={14} /> {recipe.sourceLabel}. Timing is estimated; allow longer for larger batches.</p><details className="recipe-template-notes"><summary>Ingredient and template notes</summary>{recipe.dietaryNotes.map((note, i) => <p className="subtle-small" key={i}>{note}</p>)}</details><div className="recipe-actions"><button className="button secondary" onClick={() => downloadFile(`${recipeKey(recipe)}.json`, JSON.stringify(recipe, null, 2), "application/json")}><Download size={15} /> Download recipe</button><button className="text-button" onClick={() => window.print()}>Print recipe</button></div></section></div>
      {isSaved && <section className="kitchen-notes"><div><span className="eyebrow">AFTER COOKING</span><h3>Personal rating and notes</h3><p>These stay in your private kitchen and do not change shared suggestions. Use “Tell us about this recipe” to share a cooked report.</p></div><div><div className="rating-row" aria-label="Personal saved-recipe rating">{[1, 2, 3, 4, 5].map((n) => <button aria-label={`Personal cookbook rating ${n} out of 5`} aria-pressed={rating === n} key={n} onClick={() => setRating(n)}><Star size={23} fill={rating >= n ? "currentColor" : "none"} /></button>)}</div><textarea aria-label="Kitchen notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={3000} placeholder="What you would change next time." rows={3} /><div className="notes-actions"><label><input type="checkbox" checked={tested} onChange={(e) => setTested(e.target.checked)} /> I’ve cooked this recipe</label><button className="button primary small" onClick={() => { setSaved((all) => all.map((entry) => recipeKey(entry.recipe) === recipeKey(recipe) ? { ...entry, notes, rating, tested } : entry)); setRatings((current) => ({ ...current, [recipeKey(recipe)]: rating })); setToast("Your kitchen notes are saved."); }}>Save notes <Check size={15} /></button></div></div></section>}
    </article></IngredientPriceProvider>;
  }

  return <div className="site-shell"><a href="#main-content" className="skip-link">Skip to content</a>
    <header className="site-header"><div className="header-inner"><button className="brand" onClick={() => navigate("discover")} aria-label="Fusion Table home"><span className="brand-mark"><Sprout size={25} strokeWidth={1.65} /></span><span>fusion<span className="brand-light">table</span></span></button><nav aria-label="Main navigation" id="main-navigation" className={menuOpen ? "main-nav nav-open" : "main-nav"}>{([["discover", "Discover"], ["studio", "Recipe studio"], ["week", "Week plan"], ["shops", "Local shops"], ["trends", "Trends"], ["cookbook", "My cookbook"]] as [View, string][]).map(([id, label]) => <button key={id} className={view === id ? "active" : ""} aria-current={view === id ? "page" : undefined} onClick={() => id === "shops" ? shoppingView() : navigate(id)}>{label}{id === "cookbook" && saved.length > 0 && <span className="nav-count">{saved.length}</span>}</button>)}<a className="mobile-nav-extra" href="/downloads/MealPlannerAU.apk">Download Android app</a></nav><div className="header-actions"><AccountPanel snapshot={kitchenSnapshot} ready={loaded} onRestore={restoreKitchen} onNotice={setToast} /><NewsBell items={community?.news || []} /><a className="text-button android-download" href="/downloads/MealPlannerAU.apk">Android app</a><button className="location-button" aria-label={location ? `Change location: ${location.name}` : "Set your location"} title={location?.name || "Set your location"} onClick={() => setLocationOpen(true)}><MapPin size={16} /><span>{location?.name || "Set your location"}</span><ChevronDown size={13} /></button><button className="icon-button mobile-menu" aria-label="Toggle navigation" aria-controls="main-navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button></div></div></header>
    <main id="main-content">
      {view === "discover" && <>{homeDiscover.mealOfWeekMatchesFilters && <section className="hero hero-motw"><div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line" /> MEAL OF THE WEEK</span><h1>{homeDiscover.mealOfWeek.title}</h1><p className="motw-lead">Simple, wholesome and quick to cook — protein, veg and a proper side, chosen for its ingredients, time and method. Templates are not kitchen-tested. Check the packet.</p><ul className="motw-score" aria-label="Why this plate"><li><strong>{homeDiscover.mealOfWeek.score.total}/120</strong><span>plate score</span></li><li><strong>~{duration(homeDiscover.mealOfWeek.score.totalMinutes)}</strong><span>total time</span></li><li><strong>{homeDiscover.mealOfWeek.score.ingredientCount}</strong><span>ingredients</span></li></ul><MealCostBadge recipe={homeDiscover.mealOfWeek.recipe} location={location} radiusKm={radius} /><div className="hero-actions"><button className="button primary" onClick={() => openHomeMeal(homeDiscover.mealOfWeek.recipe, motwToken || undefined)}>Open this plate <ArrowRight size={18} /></button><button className="text-button" onClick={() => navigate("week")}><CalendarDays size={17} /> Plan seven dinners</button><button className="text-button" onClick={() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })}><ChefHat size={17} /> Build your own</button></div><div className="hero-footnote"><span className="little-leaves"><Leaf size={16} /><Sprout size={16} /><Wheat size={16} /></span><span>Templates, not kitchen tests. No shelf prices.</span></div></div><div className="hero-visual"><RecipeImage src={motwImage} alt={homeDiscover.mealOfWeek.title} fetchPriority="high" data-spec={motwToken} data-file="/images/fusion-table-hero.png" onError={keepImage} /><span className="photo-corner">MEAL OF THE WEEK · TEMPLATE</span><button className="dish-label" onClick={() => openHomeMeal(homeDiscover.mealOfWeek.recipe, motwToken || undefined)}><span className="dish-label-icon"><Sparkles size={21} /></span><span><small>THIS WEEK&apos;S PICK</small><strong>{homeDiscover.mealOfWeek.title}</strong></span><ArrowRight size={20} /></button><div className="round-stamp" aria-hidden="true"><span>CHECK THE</span><Sprout size={31} strokeWidth={1.3} /><span>PACKET</span></div></div></section>}
        <div className="benefit-strip"><span><Globe2 size={19} /> {CATALOGUE_COUNTS.authoredCombinations.toLocaleString("en-AU")} authored combinations</span><span><Sparkles size={19} /> {CATALOGUE_COUNTS.regions} regions - {CATALOGUE_COUNTS.sides} sides</span><span><ShoppingBasket size={19} /> {CATALOGUE_COUNTS.classicDishes} classic dishes</span></div><p className="subtle-small page-width">The count includes compatible cuts, cooking methods, sides and five diet settings, plus classic remixes, at four servings and medium heat. Random seeds and other heat or serving choices add further variations.</p>
        <div className="page-width"><section className="inspiration-section suggestion-section"><div className="section-heading"><div><span className="eyebrow">TONIGHT&apos;S IDEAS</span><h2>Fresh plates for this visit.</h2><p>Explore {DISCOVER_POOL_STATS.cores.toLocaleString("en-AU")} different main dishes across {DISCOVER_POOL_STATS.regions} regional flavours. Each shuffle changes the mains, methods and flavours, with fewer recent repeats.</p></div><button className="text-button" onClick={shuffleHomeIdeas}>Shuffle again <ArrowRight size={17} /></button></div>{homeDiscover.suggestions.length === 0 && <p role="status" className="cook-warn">No matching ideas were found in this shuffle. Your recorded filters stay in place. Use the Recipe Studio to choose a specific plate.</p>}{homeDiscover.reusedRecentCores > 0 && <p className="subtle-small">Some compatible favourites are returning because the matching pool is smaller with these settings.</p>}<div className="inspiration-grid suggestion-grid">{homeDiscover.suggestions.map((item) => <button className="inspiration-card suggestion-card" key={`${item.plate.regionId}-${item.plate.mainId}-${item.plate.methodId}-${item.plate.sideId}-${item.title}`} onClick={() => openHomeMeal(item.recipe, item.shareToken)}><div className="card-image"><RecipeImage src={`${publicPath("/api/plate")}?t=${encodeURIComponent(item.shareToken)}&v=${PLATE_IMAGE_VERSION}`} alt={item.title} loading="lazy" data-spec={item.shareToken} data-file="/images/fusion-table-hero.png" onError={keepImage} /><span className="card-pairing">{item.regionLabel}</span><span className="card-open"><ArrowRight size={19} /></span></div><div className="card-copy"><h3>{item.title}</h3><p>{item.description}</p><MealCostBadge recipe={item.recipe} location={location} radiusKm={radius} /><span className="card-tag"><Clock3 size={13} /> ~{duration(item.totalMinutes)}<span>·</span> Open template</span></div></button>)}</div></section>{studio(true)}<section className="inspiration-section"><div className="section-heading"><div><span className="eyebrow">CLASSIC FUSIONS</span><h2>A few remixes to start from.</h2></div><button className="text-button" onClick={() => navigate("studio")}>Open the recipe studio <ArrowRight size={17} /></button></div><div className="inspiration-grid">{INSPIRATIONS.map((item) => <button className="inspiration-card" key={item.classicId} onClick={() => openInspiration(item)}><div className="card-image"><RecipeImage src={inspirationSrc(item)} srcSet={`${publicPath(item.image.replace(".png", "-480.webp"))} 480w, ${inspirationSrc(item)} 960w`} sizes="(max-width: 700px) 100vw, 33vw" width={960} height={640} alt={item.title} loading="lazy" data-spec={inspirationSpec(item)} data-file={item.image} onError={keepImage} /><span className="card-pairing">{item.pairing}</span><span className="card-open"><ArrowRight size={19} /></span></div><div className="card-copy"><h3>{item.title}</h3><p>{item.description}</p><MealCostBadge recipe={openClassicInspiration(item).recipe} location={location} radiusKm={radius} /><span className="card-tag"><Leaf size={13} /> {item.diet === "vegan" ? "Plant-based" : "Vegetarian"}<span>·</span> {item.servings} servings<span>·</span> {item.spiceHeat} heat<span>·</span> Open template</span></div></button>)}</div></section><CookNotes board={community} onTrends={() => navigate("trends")} /><section className="neighbourhood-banner"><div className="neighbourhood-art" aria-hidden="true"><Store size={64} strokeWidth={1} /><span><Sprout size={24} /></span></div><div><span className="eyebrow">LOCAL SHOPS</span><h2>Supermarkets and food shops near you.</h2><p>Supermarkets, grocers, butchers and markets. Petrol stations are left out. No shelf price is added.</p></div><button className="button primary" onClick={shoppingView}><MapPin size={17} /> Find local shops <ArrowRight size={16} /></button></section></div></>}
      {view === "studio" && <div className="page-width inner-page"><div className="page-intro"><span className="eyebrow"><ChefHat size={15} /> RECIPE STUDIO</span><h1>Build a recipe.</h1><p>Pick a classic or a main, a regional flavour or home kitchen, then set servings, diet and an optional cook session.</p></div>{studio()}{recipeDetail()}</div>}
      {view === "week" && <div className="page-width inner-page"><div className="page-intro"><span className="eyebrow"><CalendarDays size={15} /> WEEK PLAN</span><h1>A different week each time.</h1><p>The same pantry can lead to different dinners. Plan the week, pick another idea, or press Randomise. Filters stay in place. Templates are not kitchen-tested. Check the packet. Nothing here has a shelf price.</p></div>
        <form className="week-layout" onSubmit={buildWeek}>
          <div className="week-controls">
            <label>Days<input type="number" min={1} max={14} value={weekDays} onChange={(event) => setWeekDays(Math.max(1, Math.min(14, Number(event.target.value) || 1)))} /></label>

            <button className="button primary" type="submit"><CalendarDays size={17} /> Plan my week</button>
          </div>
          {householdControls()}
          <details className="household-settings week-clean-block"><summary>Meal preferences{cleanActive(cleanPrefs) ? ` · ${Object.values(cleanPrefs).filter(Boolean).length} selected` : ""}</summary>{cleanKnobs("week")}</details>
          <p className="subtle-small">Choose your household settings above, then plan your dinners. You can lock favourites and change individual meals or sides. Templates are not kitchen-tested; check packaged ingredients.</p>
          {weekError && <p className="error-message" role="alert">{weekError}</p>}
        </form>
        {weekIsStale && <div className="settings-warning" role="alert"><strong>Your settings changed.</strong><p>The dinners below still use the previous settings shown in their summary. Rebuild the week to apply your changes.</p><button className="button primary" onClick={() => buildWeek()}>Rebuild with current settings</button></div>}
        {week && <div className="week-shopping-summary"><p>{!filledDinnerCount ? "No matching dinners were planned. Review your choices and try again; exclusions stay strict." : weekShopping.length ? `Shopping list ready for ${filledDinnerCount} dinners · ${weekShopping.length} items still to buy` : `Nothing left to buy for the ${filledDinnerCount} planned dinners.`}{filledDinnerCount > 0 && !pantry.length && " Pantry quantities have not been set up yet."}</p><button className="button secondary" type="button" disabled={weekIsStale || !filledDinnerCount} onClick={() => { const tracked = rememberConsumables(pantry, week.shopping); setPantry(tracked); setBuyList(weekNeeds(tracked, week.shopping)); setBuyListLabel("Week plan"); setShoppingSource("saved"); setCookNote("Shopping list updated from the week. Pantry stock has not been used up."); navigate("shops"); }}>Open week shopping list</button></div>}
        {week && <aside className="week-plan-summary" aria-label="Week plan summary">
          <div className="week-plan-summary-inner">
            <div>
              <strong>This week · {filledDinnerCount} of {week?.days.length} dinners planned</strong>
              <p>Applied settings: {appliedWeekBrief?.servings} people · {appliedWeekBrief?.diet} · {appliedWeekBrief?.spiceHeat} heat. Avoid: {appliedWeekBrief?.avoidAllergens?.join(", ") || "none recorded"}. Dislikes: {appliedWeekBrief?.dislikes?.join(", ") || "none"}. Shopping amounts exclude recorded pantry stock.</p>
            </div>
            <div className="week-plan-summary-actions">
              {weekUndo.length > 0 && <button type="button" className="button secondary" onClick={undoWeekChange}>Undo last change</button>}
              <span className="subtle-small">{MEAL_SIDES.length} sides in the catalogue · templates not kitchen-tested</span>
            </div>
          </div>
        </aside>}
        {week && <div className="week-layout"><div className="week-days">{week.days.map((day) => {
          const sides = weekSides.get(day.day) || [];
          return <WeekDayPlate
            key={day.day}
            day={day}
            board={community}
            plateSrc={plateSrc}
            keepImage={keepImage}
            locked={lockedDays.includes(day.day)}
            settingsChanged={weekIsStale}
            sideChoices={sides}
            onOpen={openPlanned}
            onRandomise={() => randomiseDay(day.day)}
            onChangeSide={(sideId) => changeSide(day.day, sideId)}
            onPickDinner={(classicId, regionId) => pickDinner(day.day, classicId, regionId)}
            onToggleLock={() => setLockedDays((current) => current.includes(day.day) ? current.filter((item) => item !== day.day) : [...current, day.day])}
          />;
        })}</div>
          <details className="week-shopping-details"><summary>Shopping list · {weekShopping.length} items still to buy</summary><p className="subtle-small">Amounts still needed after recorded pantry stock. Preparing this list does not use up your pantry.</p>{weekShopping.length === 0 ? <p>The pantry covers this week.</p> : <ul>{weekShopping.map((line) => <li key={`${line.id}-${line.unit}`}>{line.name} — {amount(line.amount, line.unit)}</li>)}</ul>}</details>
          <details className="week-shopping-details"><summary>Planning notes</summary><ul className="week-notes">{week.notes.map((note) => <li key={note}>{note}</li>)}</ul></details>
          <button className="button secondary" type="button" onClick={() => downloadFile("fusion-table-week.json", JSON.stringify(week, null, 2), "application/json")}><Download size={16} /> Download week</button>
        </div>}
      </div>}
      {view === "shops" && <ShoppingHub
        sourceOptions={shoppingSources}
        sourceId={effectiveShoppingSource}
        onSourceChange={setShoppingSource}
        lines={shoppingLines}
        listLabel={shoppingLabel}
        onLinesChange={(lines) => { setCustomShopping(normalizeShoppingList(lines, shoppingMetadata, { preserveUnits: true })); setShoppingSource("custom"); }}
        location={location}
        radius={radius}
        onRadiusChange={changeRadius}
        onChangeArea={() => setLocationOpen(true)}
        shopData={shopData}
        shopsLoading={shopsLoading}
        shopError={shopError}
        onSearchShops={() => location ? void findShops(location, radius) : setLocationOpen(true)}
        onExport={exportShopping}
        onOpenRecipe={recipe ? () => navigate("studio") : undefined}
      />}
      {view === "trends" && <TrendsPage board={community} onOpen={openReport} />}
      {view === "cookbook" && <div className="page-width inner-page"><div className="page-intro split-intro"><div><span className="eyebrow"><BookOpen size={15} /> YOUR PERSONAL COLLECTION</span><h1>Saved recipes</h1><p>Personal ratings and notes stay in your private kitchen. They do not feed shared suggestions.</p></div>{saved.length > 0 && <button className="button secondary" onClick={() => downloadFile("fusion-table-cookbook.json", JSON.stringify(saved, null, 2), "application/json")}><Download size={16} /> Export cookbook</button>}</div><div className="cookbook-backup"><input ref={cookbookImportRef} type="file" accept=".json,application/json" className="sr-only" aria-label="Import cookbook file" onChange={(event) => void restoreCookbook(event.target.files?.[0])} /><button className="button secondary" onClick={() => cookbookImportRef.current?.click()}>Import cookbook</button><p className="device-note"><Heart size={14} /> Your cookbook stays on this device. Export a backup to move it to another browser.</p></div>{saved.length === 0 ? <div className="empty-state"><div className="empty-icon"><BookOpen size={35} /></div><h3>No saved recipes yet.</h3><p>Save a recipe, then add a star rating and whether you would make it again.</p><button className="button primary" onClick={() => navigate("studio")}>Open the recipe studio <ArrowRight size={16} /></button></div> : <div className="saved-grid">{saved.map((entry) => <article className="saved-card" key={recipeKey(entry.recipe)}><RecipeImage className="week-plate" src={plateSrc(entry.recipe, null)} loading="lazy" alt="" onError={keepImage} /><span className="eyebrow">{regionName(entry.recipe.regionId)} <span>×</span> {recipeBaseName(entry.recipe)}</span><h3>{entry.recipe.title}</h3><p>{entry.recipe.description}</p><div className="recipe-meta"><span><Clock3 size={14} /> About {duration(entry.recipe.totalMinutes)}</span><span><Users size={14} /> {entry.recipe.servings}</span></div>{entry.tested && <span className="tested-label"><CheckCheck size={13} /> Kitchen-tested by you</span>}{entry.rating > 0 && <span className="saved-stars">{"★".repeat(entry.rating)}{"☆".repeat(5 - entry.rating)}</span>}{verdicts[recipeKey(entry.recipe)] && <span className="saved-notes">{({ wont: "Won't have again", might: "Might have again", will: "Will have again", staple: "New staple" } as Record<string, string>)[verdicts[recipeKey(entry.recipe)]]}</span>}{entry.notes && <p className="saved-notes">“{entry.notes.slice(0, 130)}{entry.notes.length > 130 ? "…" : ""}”</p>}<div className="saved-card-actions"><button className="text-button" onClick={() => openSaved(entry)}>Open recipe <ArrowRight size={15} /></button><button className="icon-button" aria-label={`Remove ${entry.recipe.title}`} onClick={() => { setSaved((all) => all.filter((s) => recipeKey(s.recipe) !== recipeKey(entry.recipe))); setToast("Recipe removed from your cookbook."); }}><Heart size={17} fill="currentColor" /></button></div></article>)}</div>}</div>}
    </main>
    <footer className="site-footer"><div className="page-width footer-inner"><button className="brand" onClick={() => navigate("discover")}><Sprout size={24} strokeWidth={1.5} /><span>fusion<span className="brand-light">table</span></span></button><span>Meal plans and one shopping list.</span><div><button onClick={() => setAboutOpen(true)}>How it works</button><button onClick={shoppingView}>Find local shops</button><span className="footer-small">Templates are not kitchen-tested.</span></div></div></footer>
    {toast && <div className="toast" role="status"><Check size={17} />{toast}<button onClick={() => setToast("")} aria-label="Dismiss notification"><X size={14} /></button></div>}
    {locationOpen && <Modal title="Set your location" close={closeLocation}><p className="modal-description">Choose your shopping area for nearby shops and more relevant prices. Search for a suburb, town or postcode, then select the matching place.</p><form onSubmit={searchLocation} className="location-search"><label className="sr-only" htmlFor="location-search">Suburb, town or postcode</label><Search size={18} /><input id="location-search" value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="e.g. Newtown, Sydney" minLength={2} maxLength={160} required /><button type="submit" className="button primary small" disabled={locationLoading}>{locationLoading ? <LoaderCircle size={17} className="spin" /> : "Search"}</button></form><button className="current-location-button" onClick={currentLocation} disabled={locationLoading}><LocateFixed size={18} /> Use my current location <ArrowRight size={16} /></button>{locationError && <p className="error-message" role="alert">{locationError}</p>}{locationSearched && locationResults.length === 0 && <p className="search-empty">No locations found. Try adding a city, state, or country.</p>}<div className="location-results">{locationResults.map((place) => <button key={place.id} onClick={() => chooseLocation(place)}><MapPin size={19} /><span><strong>{place.name}</strong><small>{place.label}</small></span><ChevronRight size={17} /></button>)}</div><div className="modal-radius"><label htmlFor="modal-radius">Shopping radius <strong>{radius} km</strong></label><input id="modal-radius" type="range" min="1" max="25" value={radius} onChange={(e) => changeRadius(Number(e.target.value))} /><div><span>1 km</span><span>25 km</span></div></div><p className="modal-privacy">Your chosen area is saved with your kitchen, in this browser or your optional account. Searches use Photon and OpenStreetMap. Your precise location is only requested when you choose “Use my current location”.</p>{!location && <button type="button" className="button secondary" onClick={() => { try { sessionStorage.setItem("fusion-location-prompt", "later"); } catch {} closeLocation(); }}>Choose later - use Australian estimates</button>}{location && <button className="text-button clear-location" onClick={clearLocation}>Clear saved location</button>}</Modal>}
    {aboutOpen && <Modal title="How Fusion Table works" close={closeAbout}><div className="about-steps"><div><span>01</span><h3>Choose the meals.</h3><p>Choose from {MAIN_INGREDIENTS.length} mains, compatible cooking methods, {MEAL_REGIONS.length} regional profiles and {MEAL_SIDES.length} side pairings. Across compatible cuts and the five diet settings, the catalogue supports {CATALOGUE_COUNTS.authoredCombinations.toLocaleString("en-AU")} authored combinations including classic remixes, at four servings and medium heat. These are combinations of choices, not separately kitchen-tested dishes. Home kitchen is the weekday flavour, without a second regional paste. The other profiles are fusion. Or use {CLASSICS.length} classic structures and {REGIONS.length} regional profiles, including smoking, grilling, rib racks, foil boats, shotgun shells and rotisserie.</p></div><div><span>02</span><h3>Shop one list.</h3><p>Tick what you already have. Oils, butter and flour stay on the pantry list. Map listings show supermarkets, grocers, butchers and markets inside your straight-line radius. Petrol stations are left out. Recipe shopping costs are checked automatically from available online catalogues and recorded local prices. You can review and change product choices in Local shops. That is not the shelf at your local shop. Butchers and fruit shops have no published board — record the price you see. A missing price is never $0.</p></div><div><span>03</span><h3>Rate what you cook.</h3><p>Save personal ratings and notes in this browser’s cookbook. Use “Tell us about this recipe” to share a cooked report or a first impression. Matching cooked reports can influence comparable suggestions after at least three browsers report; dietary exclusions stay strict. Reports do not establish food safety.</p></div></div><p className="subtle-small">Each plate picture is painted on this computer from that recipe, or drawn by a local image model on this computer when one is configured. A few example plates use a saved picture. None of these is a photograph of a cooked dish. Listings © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a>. Source and setup details are included with the project.</p></Modal>}
    {cookingStep !== null && recipe && <Modal title="Cook" close={closeCooking}><span className="eyebrow">{recipe.title}</span><div className="cooking-progress"><span style={{ width: `${((cookingStep + 1) / recipe.steps.length) * 100}%` }} /></div><span className="cooking-count">STEP {cookingStep + 1} OF {recipe.steps.length}</span><h3 className="cooking-title">{recipe.steps[cookingStep].title}</h3><p className="cooking-instruction">{recipe.steps[cookingStep].detail}</p><div className="cooking-controls"><button className="button secondary" disabled={cookingStep === 0} onClick={() => setCookingStep(cookingStep - 1)}><ArrowLeft size={16} /> Previous</button><button className="button primary" onClick={() => cookingStep === recipe.steps.length - 1 ? setCookingStep(null) : setCookingStep(cookingStep + 1)}>{cookingStep === recipe.steps.length - 1 ? "Done" : "Next step"}<ArrowRight size={16} /></button></div></Modal>}
  </div>;
}
