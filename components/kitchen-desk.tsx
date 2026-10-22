"use client";

import { useEffect, useMemo, useState } from "react";
import { Star } from "lucide-react";
import { VERDICTS, isConsumable, makeRecipe, pantryKey, type Stock, type UseLine, type VerdictId } from "@/lib/pantry";

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
  onShopping: (lines: { name: string; amount: number; unit: string }[], warnings: string[]) => void;
}) {
  const initial = useMemo(() => {
    const owned = new Set<string>();
    for (const item of ingredients) {
      const stock = pantry.find((entry) => entry.key === pantryKey(item.name) && entry.unit.toLowerCase() === item.unit.toLowerCase());
      if (stock && stock.onHand + 1e-9 >= item.amount) owned.add(item.id);
    }
    return owned;
  }, [ingredients, pantry]);
  const [owned, setOwned] = useState<Set<string>>(initial);
  const [message, setMessage] = useState("");
  useEffect(() => { setOwned(initial); }, [initial]);

  function cook() {
    const lines: UseLine[] = ingredients.map((item) => ({
      id: item.id,
      name: item.name,
      amount: item.amount,
      unit: item.unit,
      have: owned.has(item.id),
    }));
    const result = makeRecipe(pantry, lines);
    onPantry(result.pantry);
    onShopping(result.shopping, result.warnings);
    setMessage(result.shopping.length
      ? `${result.shopping.length} item${result.shopping.length === 1 ? "" : "s"} still to buy. Prices are not included.`
      : "The pantry covers this meal. Nothing extra to buy.");
  }

  return (
    <section className="kitchen-desk" aria-label="Pantry and shopping">
      <div className="subheading"><h3>Pantry and shopping</h3></div>
      <p className="subtle-small">Tick what you already have. Oils, butter and flour stay on the pantry list and are used before they are bought again. Nothing here has a shelf price.</p>
      <ul className="ingredient-list">
        {ingredients.map((item) => (
          <li key={item.id}>
            <label>
              <input
                type="checkbox"
                checked={owned.has(item.id)}
                onChange={() => setOwned((current) => {
                  const next = new Set(current);
                  if (next.has(item.id)) next.delete(item.id);
                  else next.add(item.id);
                  return next;
                })}
              />
              <span>
                <strong>{item.name}</strong>
                {isConsumable(item.name) && <small>Pantry staple</small>}
              </span>
              <em>{item.amount} {item.unit}</em>
            </label>
          </li>
        ))}
      </ul>
      <button className="button primary" type="button" onClick={cook}>I&apos;m making this</button>
      {message && <p className="subtle-small" role="status">{message}</p>}
      <div className="rating-row" role="group" aria-label="Rate this recipe">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" aria-label={`Rate ${n} out of 5`} aria-pressed={stars === n} onClick={() => onStars(stars === n ? 0 : n)}>
            <Star size={23} fill={stars >= n ? "currentColor" : "none"} />
          </button>
        ))}
      </div>
      <p className="subtle-small">Stars are yours. They do not mean this template was kitchen-tested.</p>
      <div className="avoid-row" role="group" aria-label="Would you make this again?">
        {VERDICTS.map((choice) => (
          <button key={choice.id} type="button" className={verdict === choice.id ? "button primary small" : "text-button"} aria-pressed={verdict === choice.id} onClick={() => onVerdict(choice.id)}>
            {choice.label}
          </button>
        ))}
      </div>
    </section>
  );
}
