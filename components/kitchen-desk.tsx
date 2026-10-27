"use client";

import { useMemo, useRef, useState } from "react";
import { Star } from "lucide-react";
import { VERDICTS, declarePantryOwnership, formatPantryQuantity, isConsumable, makeRecipe, pantryAmountKey, pantryOnHand, pantryOwnedIds, prepareRecipe, type ShopNeed, type Stock, type UseLine, type VerdictId } from "@/lib/pantry";

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
  const declarations = useRef(new Map<string, { amount: number; unit: string; expected: number; added: Set<string> }>());

  function declare(item: typeof ingredients[number]) {
    const nextOwned = new Set(owned), have = !nextOwned.has(item.id);
    if (have) nextOwned.add(item.id); else nextOwned.delete(item.id);
    const key = pantryAmountKey(item.name, item.unit);
    let prior = declarations.current.get(key);
    if (prior && pantryOnHand(pantry, item.name, prior.unit) !== prior.expected) {
      declarations.current.delete(key); prior = undefined;
    }
    // Unticking an originally owned use is a correction, not a reversal of a new top-up.
    if (prior && !have && !prior.added.has(item.id)) prior.amount = 0;
    const next = declarePantryOwnership(pantry, ingredients.map(line => ({ ...line, have: nextOwned.has(line.id) })), item.id, !have && prior ? prior : undefined);
    const before = pantryOnHand(pantry, item.name, item.unit), after = pantryOnHand(next, item.name, item.unit);
    if (have && after > before) {
      prior ||= { amount: before, unit: item.unit, expected: before, added: new Set<string>() };
      prior.added.add(item.id);
      declarations.current.set(key, prior);
    } else if (!have && prior) {
      prior.added.delete(item.id);
      if (!prior.added.size) declarations.current.delete(key);
    }
    if (prior) prior.expected = pantryOnHand(next, item.name, prior.unit);
    setSelection({ signature: pantrySignature(next), owned: nextOwned });
    onPantry(next);
    setMessage(have ? `Pantry updated for ${item.name}. Your shopping shortfall updates automatically.` : `Updated what you have for ${item.name}. Nothing has been used up.`);
  }

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
      <p className="subtle-small">Tick what you already have to update your pantry and shopping costs immediately. Untick to correct what you have. Amounts are only used up when you record a finished cook.</p>
      <ul className="ingredient-list">
        {ingredients.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={owned.has(item.id)}
                onChange={() => declare(item)}
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
      <p className="subtle-small">These stars and make-again notes stay in your private kitchen. They do not change shared suggestions. Use “Tell us about this recipe” to share a cooked report. Ratings do not verify food safety.</p>
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
