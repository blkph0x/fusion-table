"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import {
  COMMUNITY_LABEL,
  communityAdjustments,
  plateIdentity,
  type CommunityBoard,
  type NewsItem,
} from "@/lib/community";
import type { Recipe } from "@/lib/recipe-types";
import { publicPath } from "@/lib/public-path";

function deviceId(): string {
  try {
    const existing = localStorage.getItem("fusion-device") || "";
    if (/^[a-z0-9]{16,64}$/.test(existing)) return existing;
    const next = (crypto.randomUUID?.() || `${Date.now()}`.padEnd(16, "0")).replace(/-/g, "").toLowerCase().slice(0, 32);
    if (!/^[a-z0-9]{16,64}$/.test(next)) return "";
    localStorage.setItem("fusion-device", next);
    return next;
  } catch {
    return "";
  }
}

async function postCook(body: unknown): Promise<{ board?: CommunityBoard; askWhy?: boolean; error?: string }> {
  const response = await fetch(publicPath("/api/community"), {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json() as { board?: CommunityBoard; askWhy?: boolean; error?: string };
  if (!response.ok) return { error: data.error || "The cook's book did not save this. Nothing was deleted." };
  return data;
}

export function CommunityDesk({
  recipe,
  board,
  tried,
  onBoard,
  onToggleTry,
}: {
  recipe: Recipe;
  board: CommunityBoard | null;
  tried: boolean;
  onBoard: (board: CommunityBoard) => void;
  onToggleTry: () => void;
}) {
  const plate = plateIdentity(recipe);
  const standing = board?.plates.find((item) => item.plateKey === plate.key);
  const adjustments = communityAdjustments(plate, recipe.ingredients, board?.plates || []);
  const [want, setWant] = useState<"yes" | "no" | "">("");
  const [stars, setStars] = useState<number | null>(null);
  const [again, setAgain] = useState("");
  const [wrong, setWrong] = useState("");
  const [change, setChange] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [direction, setDirection] = useState<"note" | "less" | "more">("note");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const needsWhy = stars === 0 || stars === 1 || again === "wont" || !!standing?.askWhy;

  async function vote(next: { want?: "yes" | "no"; stars?: number | null; again?: "wont" | "might" | "will" | "staple" }) {
    const device = deviceId();
    if (!device) {
      setNote("This browser could not keep a cook id, so the report stays on this device only.");
      return;
    }
    setBusy(true);
    setNote("");
    try {
      const data = await postCook({ action: "vote", device, plate: recipe, ...next });
      if (data.board) onBoard(data.board);
      if (data.error) setNote(data.error);
      else if (data.askWhy || next.stars === 0 || next.stars === 1 || next.again === "wont") setNote("Say what was wrong and what you would change. The plate stays in the book.");
      else setNote("Saved in the cook's book. This is your report, not a kitchen test.");
    } catch {
      setNote("The cook's book could not be reached. Your recipe is still here. Nothing was deleted.");
    } finally {
      setBusy(false);
    }
  }

  async function saveWhy() {
    const device = deviceId();
    if (!device) {
      setNote("This browser could not keep a cook id, so the note stays on this device only.");
      return;
    }
    const ingredient = recipe.ingredients.find((item) => item.id === ingredientId);
    setBusy(true);
    try {
      const data = await postCook({
        action: "why",
        device,
        plate: recipe,
        wrong,
        change,
        ingredientId: ingredient?.id || "",
        ingredientName: ingredient?.name || "",
        direction: ingredient ? direction : "note",
      });
      if (data.board) onBoard(data.board);
      setNote(data.error || "The reason is kept. The template itself is unchanged.");
    } catch {
      setNote("The cook's book could not be reached. Nothing was deleted.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="cook-book" aria-label="Tell the cook">
    <h3>Do you want this?</h3>
    <p>{COMMUNITY_LABEL}</p>
    {standing?.shelved && <p className="cook-warn">Kept in the book. Most people said they will not make this again, so it is off the default list. The reasons stay.</p>}
    {standing && !standing.shelved && <p>{standing.people} {standing.people === 1 ? "person has" : "people have"} reported this. {standing.starAverage != null ? `Stars average ${standing.starAverage} from ${standing.starPeople}.` : "No stars yet."} {standing.yesPeople} yes, {standing.noPeople} no.</p>}
    <div className="yes-no">
      <button type="button" className={want === "yes" ? "button primary" : "button secondary"} disabled={busy} onClick={() => { setWant("yes"); void vote({ want: "yes" }); }}>Yes, I want this</button>
      <button type="button" className={want === "no" ? "button primary" : "button secondary"} disabled={busy} onClick={() => { setWant("no"); void vote({ want: "no" }); }}>No, not for me</button>
    </div>
    <button type="button" className={again === "wont" ? "button primary small" : "text-button"} disabled={busy} onClick={() => { setAgain("wont"); setWant("no"); void vote({ want: "no", again: "wont" }); }}>I will not make this again</button>
    <div className="rating-row" role="group" aria-label="Share a star rating">
      <button type="button" aria-label="Rate 0 out of 5" aria-pressed={stars === 0} disabled={busy} onClick={() => { setStars(0); void vote({ stars: 0 }); }}>0</button>
      {[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`Rate ${n} out of 5`} aria-pressed={stars === n} disabled={busy} onClick={() => { setStars(n); void vote({ stars: n }); }}>{n}</button>)}
    </div>
    <p className="subtle-small">0 or 1 star asks what went wrong. Three poor reports ask everyone who opens the plate. The recipe is not deleted.</p>
    {needsWhy && <div className="cook-why">
      <label>What was wrong?<textarea aria-label="What was wrong" maxLength={500} rows={2} value={wrong} onChange={(event) => setWrong(event.target.value)} placeholder="Too salty, the sauce split, it took too long" /></label>
      <label>What would you change?<textarea aria-label="What would you change" maxLength={500} rows={2} value={change} onChange={(event) => setChange(event.target.value)} placeholder="Less soy, more lime, cook the vegetables less" /></label>
      <label>Ingredient, if it was an amount
        <select aria-label="Ingredient to change" value={ingredientId} onChange={(event) => setIngredientId(event.target.value)}>
          <option value="">Not one ingredient</option>
          {recipe.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>
      <label>Amount
        <select aria-label="How the amount should change" value={direction} onChange={(event) => setDirection(event.target.value === "less" || event.target.value === "more" ? event.target.value : "note")}>
          <option value="note">Leave the amount</option>
          <option value="less">Less</option>
          <option value="more">More</option>
        </select>
      </label>
      <button type="button" className="button primary small" disabled={busy} onClick={() => void saveWhy()}>Save this for the cook</button>
    </div>}
    {adjustments.length > 0 && <div className="cook-try">
      <p>The template amounts stay as written. A later try only changes the amount people agreed on. Nothing is removed.</p>
      <ul>{adjustments.map((item) => <li key={item.ingredientId}>{item.because}</li>)}</ul>
      <button type="button" className="button secondary small" onClick={onToggleTry}>{tried ? "Show the template amounts" : "Show this try"}</button>
    </div>}
    {standing?.whys.length ? <ul className="cook-reasons">{standing.whys.map((item) => <li key={item.id}><strong>What was wrong:</strong> {item.wrong} <strong>Change:</strong> {item.change}</li>)}</ul> : null}
    {note && <p role="status">{note}</p>}
  </section>;
}

export function CookNotes({ board, onTrends }: { board: CommunityBoard | null; onTrends: () => void }) {
  return <section className="cook-notes">
    <div className="section-heading"><div><span className="eyebrow">THE COOK&apos;S BOOK</span><h2>What is being kept.</h2></div><button className="text-button" type="button" onClick={onTrends}>Open trends</button></div>
    <p>{board?.label || COMMUNITY_LABEL} A yes or a no is enough. Plates people will not make again stay listed, but they are not offered first.</p>
    {!board || board.offers.length === 0 ? <p>No shared reports yet. Cook a plate and say whether you want it.</p> : <ul className="cook-offer-list">{board.offers.slice(0, 5).map((plate) => <li key={plate.plateKey}><strong>{plate.title}</strong><span>{plate.yesPeople} yes · {plate.noPeople} no{plate.starAverage != null ? ` · ${plate.starAverage} stars` : ""}</span></li>)}</ul>}
  </section>;
}

export function WeekNote({ recipe, board }: { recipe: Recipe; board: CommunityBoard | null }) {
  const standing = board?.plates.find((item) => item.plateKey === plateIdentity(recipe).key);
  if (!standing) return null;
  if (standing.shelved) return <p className="cook-warn">Kept in the book. Most people said they will not make this again, so it is not offered as a suggestion. This week was not changed.</p>;
  if (standing.askWhy) return <p>People gave this 0 or 1 star. Open it and say what was wrong. It is still in the book.</p>;
  if (standing.starAverage != null) return <p>Cook reports: {standing.starAverage} from {standing.starPeople} {standing.starPeople === 1 ? "person" : "people"}. Not a kitchen test.</p>;
  return null;
}

function newsSeen(): string {
  try { return localStorage.getItem("fusion-news-seen") || ""; } catch { return ""; }
}

export function NewsBell({ items }: { items: NewsItem[] }) {
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState("");
  const stored = useSyncExternalStore(() => () => undefined, newsSeen, () => "");
  const seen = openedAt > stored ? openedAt : stored;
  const unread = items.filter((item) => item.at > seen).length;
  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && items[0]?.at) {
      setOpenedAt(items[0].at);
      try { localStorage.setItem("fusion-news-seen", items[0].at); } catch { /* The list is still on screen. */ }
    }
  }
  return <div className="news-bell">
    <button type="button" className="icon-button" aria-label={unread ? `${unread} cook notices` : "Cook notices"} aria-expanded={open} onClick={toggle}><Bell size={18} />{unread > 0 && <span className="nav-count">{unread}</span>}</button>
    {open && <div className="news-panel" role="region" aria-label="Cook notices">{items.length === 0 ? <p>No notices yet. Ratings and specials will show here.</p> : <ul>{items.slice(0, 8).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.text}</span></li>)}</ul>}</div>}
  </div>;
}
