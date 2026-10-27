"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { Recipe } from "@/lib/recipe-types";
import type { LocationResult } from "@/lib/locations";
import { parsePantry, pantryHas } from "@/lib/recipes";
import { weekNeeds, type Stock } from "@/lib/pantry";
import { normalizeShoppingList } from "@/lib/shopping-list";
import { publicPath } from "@/lib/public-path";
import { RecipeShoppingCost } from "./recipe-shopping-cost";
import { IngredientPriceProvider } from "./ingredient-cost";
import { readAccount } from "@/lib/account-client";
export function SharedRecipeShopping({ recipe, token, children }: { recipe: Recipe; token: string; children?: ReactNode }) {
  const [settings, setSettings] = useState<{ location: LocationResult | null; pantry: Stock[]; pantryText: string }>({ location: null, pantry: [], pantryText: "" });
  useEffect(() => {
    let active = true;
    const apply = (data: Record<string, unknown>) => {
      const place = data.location as LocationResult | undefined;
      const location = place && typeof place.id === "string" && typeof place.name === "string" && typeof place.label === "string" && Number.isFinite(place.lat) && Math.abs(place.lat) <= 90 && Number.isFinite(place.lon) && Math.abs(place.lon) <= 180 && (place.country === undefined || typeof place.country === "string" && place.country.length <= 80) ? place : null;
      const pantry = Array.isArray(data.pantry) ? data.pantry.filter((item: Stock) => item && typeof item.name === "string" && typeof item.unit === "string" && Number.isFinite(item.onHand) && item.onHand >= 0) : [];
      const preferences = data.preferences as { pantry?: unknown } | undefined;
      if (active) setSettings({ location, pantry, pantryText: typeof preferences?.pantry === "string" ? preferences.pantry.slice(0, 8000) : "" });
    };
    try {
      const data = JSON.parse(localStorage.getItem("fusion-table-v1") || "{}");
      apply(data);
    } catch { /* A shared recipe can still check the Australian online guide. */ }
    void readAccount().then(account => { if (account.user) apply(account.state?.data || {}); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const lines = useMemo(() => {
    const names = parsePantry(settings.pantryText);
    const needed = weekNeeds(settings.pantry, recipe.ingredients.filter(item => !pantryHas(item, names)));
    return normalizeShoppingList(needed, recipe.ingredients);
  }, [recipe, settings]);
  const open = () => { window.location.href = publicPath(`/?r=${encodeURIComponent(token)}&view=shops`); };
  return <><RecipeShoppingCost lines={lines} servings={recipe.servings} location={settings.location} onSetLocation={open} onOpenShopping={open} /><IngredientPriceProvider recipe={recipe} location={settings.location}>{children}</IngredientPriceProvider></>;
}
