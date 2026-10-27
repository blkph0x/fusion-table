"use client";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Recipe, RecipeIngredient } from "@/lib/recipe-types";
import type { LocationResult, Shop } from "@/lib/locations";
import type { ShoppingLine } from "@/lib/shopping";
import { normalizeShoppingList } from "@/lib/shopping-list";
import { areaKey } from "@/lib/price-memory";
import { resolveIngredientPricing, type ShoppingCostLine } from "@/lib/shopping-costs";
import { australianPriceGuide } from "@/lib/shopping-request";
import { formatAudCents } from "@/lib/product-match";
import { observeRecipePrices, priceContextKey, type RecipePriceContext, type RecipePriceResult } from "./recipe-price-client";

function requestFor(lines: ShoppingLine[], location: LocationResult | null, shops: Shop[] = []): RecipePriceContext {
  return { lines, area: areaKey(`${location?.label || ""} ${location?.name || ""}`) || areaKey("Australia online"), country: location?.country === undefined ? "Australia" : typeof location.country === "string" ? location.country : "unknown", localRecords: !!location && location.id !== "current-location", shops: shops.map(shop => ({ id: shop.id, name: shop.name })) };
}

/** Baselines render immediately; catalogue checks are shared, deferred and bounded. */
export function useIngredientPrices(lines: ShoppingLine[], location: LocationResult | null, shops: Shop[] = [], enabled = true) {
  const input = requestFor(lines, location, shops), key = priceContextKey(input);
  const request = useMemo(() => input, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [result, setResult] = useState<{ key: string; data: RecipePriceResult } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled || !lines.length || !australianPriceGuide(request.country)) return;
    let stop = () => {}, queueTimer: ReturnType<typeof setTimeout> | undefined;
    const timer = setTimeout(() => { stop = observeRecipePrices(request, data => {
      setResult({ key, data });
      // Visible suggestions can outnumber the four shared checks. Retry only
      // admission failures, never blocked providers, so later cards also warm.
      if (data.error.startsWith("Other recipe price checks") && retry < 16) queueTimer = setTimeout(() => setRetry(value => value + 1), 1800);
    }); }, 450);
    return () => { clearTimeout(timer); clearTimeout(queueTimer); stop(); };
  }, [key, request, enabled, lines.length, retry]);
  return result?.key === key ? result.data : null;
}

const PriceRows = createContext<ShoppingCostLine[]>([]);
export function IngredientPriceProvider({ recipe, location, shops, children }: { recipe: Recipe; location: LocationResult | null; shops?: Shop[]; children: ReactNode }) {
  const lines = useMemo(() => normalizeShoppingList(recipe.ingredients, recipe.ingredients), [recipe]);
  const prices = useIngredientPrices(lines, location, shops);
  return <PriceRows.Provider value={prices?.rows || []}>{children}</PriceRows.Provider>;
}

export function IngredientCost({ ingredient }: { ingredient: RecipeIngredient }) {
  const rows = useContext(PriceRows);
  const line = normalizeShoppingList([ingredient], [ingredient])[0];
  const price = line ? resolveIngredientPricing(line, rows.find(row => row.id === line.id)) : null;
  return <small className="ingredient-cost" title={price?.label || "No supported quantity estimate"}>
    {price?.recipeCents == null ? "Estimate unavailable" : `~${formatAudCents(price.recipeCents)}`}<span>{price?.source === "observed" ? "store guide · amount used" : "planning estimate · amount used"}</span>
  </small>;
}

export function MealCostBadge({ recipe, location = null }: { recipe: Recipe; location?: LocationResult | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const lines = useMemo(() => normalizeShoppingList(recipe.ingredients, recipe.ingredients), [recipe]);
  const result = useIngredientPrices(lines, location, [], visible);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } }, { rootMargin: "80px" });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  const prices = lines.map(line => resolveIngredientPricing(line, result?.rows.find(row => row.id === line.id)));
  const complete = prices.every(row => row.recipeCents !== null);
  const cents = prices.reduce((sum, row) => sum + (row.recipeCents ?? 0), 0);
  const observed = prices.filter(row => row.source === "observed").length;
  return <span ref={ref} className="meal-cost-badge" title="Cost of ingredient amounts used, including pantry ingredients. Packs to buy can cost more. Australian dollars; store guides and labelled planning assumptions, not confirmed local shelf prices.">
    <strong>~{formatAudCents(cents)}{!complete ? "+" : ""} per meal</strong><span>~{formatAudCents(Math.round(cents / recipe.servings))} / serve · {recipe.servings} servings</span>
    <small>{observed ? `${observed}/${prices.length} store guides · remaining estimates` : "AUD planning estimate · ingredients used"}</small>
  </span>;
}
