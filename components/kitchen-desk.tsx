"use client";

import { useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import { VERDICTS, formatPantryQuantity, isConsumable, makeRecipe, pantryOwnedIds, prepareRecipe, type ShopNeed, type Stock, type UseLine, type VerdictId } from "@/lib/pantry";

const pantrySignature = (pantry: readonly Stock[]) => JSON.stringify(pantry.map((item) => [item.key, item.unit, item.onHand]).sort());

export function KitchenDesk({
  ingredients,
  pantry,
  verdict,
  stars,
  onPantry,
  onVerdict,
  onStars,
  onShopping,
}: {
  ingredients: { id: string; name: string; amount: number; unit: string }[];
  pantry: Stock[];
  verdict: VerdictId | "";
  stars: number;
  onPantry: (next: Stock[]) => void;
  onVerdict: (next: VerdictId) => void;
  onStars: (next: number) => void;
  onShopping: (lines: ShopNeed[], warnings: string[]) => void;
}) {
  const initial = useMemo(() => pantryOwnedIds(pantry, ingredients), [ingredients, pantry]);
  const signature = pantrySignature(pantry);
  const [selection, setSelection] = useState({ signature, owned: initial });
  const owned = selection.signature === signature ? selection.owned : initial;
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState<{ before: Stock[]; after: string } | null>(null);
  const recorded = useRef(false);

  function selectedLines(): UseLine[] {
    return ingredients.map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      have: owned.has(item.id),
    }));
  }

  function shopping() {
    const result = prepareRecipe(pantry, selectedLines());
    onPantry(result.pantry);
    onShopping(result.shopping, result.warnings);
    setMessage(result.shopping.length
      ? `${result.shopping.length} item${result.shopping.length === 1 ? "" : "s"} still to buy. Prices are not included.`
      : "The pantry covers this meal. Nothing extra to buy.");
  }

  function cook() {
    if (recorded.current) return;
    recorded.current = true;
    const lines = selectedLines();
    const before = prepareRecipe(pantry, lines).pantry;
    const result = makeRecipe(before, lines);
    setReceipt({ before, after: pantrySignature(result.pantry) });
    onPantry(result.pantry);
    setMessage("Cook recorded. Tracked pantry amounts have been used. You can undo this below.");
  }

  function undoCook() {
    if (!receipt || signature !== receipt.after) return;
    onPantry(receipt.before);
    setReceipt(null);
    recorded.current = false;
    setMessage("Undid this cook. Pantry amounts have been restored.");
  }

  return (
    <section className="kitchen-desk" aria-label="Pantry and shopping">
      <div className="subheading"><h3>Pantry and shopping</h3></div>
      <p className="subtle-small">Tick what you already have, then make your shopping list. Pantry amounts are only used when you record a finished cook. Nothing here has a shelf price.</p>
      <ul className="ingredient-list">
        {ingredients.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={owned.has(item.id)}
                onChange={() => {
                  const next = new Set(owned);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  setSelection({ signature, owned: next });
                }}
              />
              <span>
                <strong>{item.name}</strong>
                {isConsumable(item.name) && <small>Pantry staple</small>}
              </span>
              <em>{formatPantryQuantity(item.amount, item.unit)}</em>
            </label>
          </li>
        ))}
      </ul>
      <div className="recipe-actions">
        <button className="button primary" type="button" onClick={shopping}>Make shopping list</button>
        <button className="button secondary" type="button" onClick={cook} disabled={!!receipt}>{receipt ? "Cook recorded" : "Finished cooking"}</button>
        {receipt && <button className="text-button" type="button" onClick={undoCook} disabled={signature !== receipt.after}>Undo pantry use</button>}
      </div>
      {receipt && signature !== receipt.after && <p className="subtle-small">The pantry changed after this cook. Undo is unavailable so newer amounts are kept.</p>}
      {message && <p className="subtle-small" role="status">{message}</p>}
      <div className="rating-row" role="group" aria-label="Personal cookbook rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`Personal rating ${n} out of 5`} aria-pressed={stars === n} onClick={() => onStars(stars === n ? 0 : n)}>
            <Star size={23} fill={stars >= n ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <p className="subtle-small">These stars and make-again notes stay in this browser&apos;s cookbook. They do not change shared suggestions. Use “Tell us about this recipe” to share a cooked report. Ratings do not verify food safety.</p>
      <div className="avoid-row" role="group" aria-label="Personal make-again note">
        {VERDICTS.map((choice) => (
          <button key={choice.id} type="button" className={verdict === choice.id ? "button primary small" : "text-button"} aria-pressed={verdict === choice.id} onClick={() => onVerdict(choice.id)}>
            {choice.label}
          </button>
        ))}
      </div>
    </section>
  );
}
