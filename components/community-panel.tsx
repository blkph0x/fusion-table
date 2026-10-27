"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell } from "lucide-react";
import {
  COMMUNITY_LABEL,
  communityAdjustments,
  plateIdentity,
  summarizeRecipeFeedback,
  type Again,
  type Want,
  type CommunityBoard,
  type NewsItem,
} from "@/lib/community";
import type { Recipe } from "@/lib/recipe-types";
import { FEEDBACK_CATEGORIES, feedbackRecipeKey, readMealFeedback, requiresFeedback, type FeedbackCategory, type FeedbackExperience, type FeedbackSeverity, type MealFeedback } from "@/lib/meal-feedback";
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

interface CommunityDeskProps {
  recipe: Recipe;
  board: CommunityBoard | null;
  tried: boolean;
  onBoard: (board: CommunityBoard) => void;
  onToggleTry: () => void;
}

type FeedbackSelection = { want: Want; stars: number | null; again: Again };
const EMPTY_SELECTION: FeedbackSelection = { want: "", stars: null, again: "" };

export function CommunityDesk(props: CommunityDeskProps) {
  // A seed, cut, amount or instruction change starts a new draft. References must
  // never silently carry over to a different ingredient list or step sequence.
  return <CommunityFeedbackForm key={feedbackRecipeKey(props.recipe)} {...props} />;
}

function CommunityFeedbackForm({ recipe, board, tried, onBoard, onToggleTry }: CommunityDeskProps) {
  const plate = plateIdentity(recipe);
  const recipeKey = feedbackRecipeKey(recipe);
  const standing = board?.plates.find((item) => item.plateKey === plate.key);
  const legacyStanding = board?.plates.find((item) => !item.recipeVersion && item.kind === plate.kind &&
    item.classicId === plate.classicId && item.regionId === plate.regionId && item.diet === plate.diet &&
    item.spiceHeat === plate.spiceHeat && item.mainId === plate.mainId && item.methodId === plate.methodId && item.sideId === plate.sideId);
  const reasons = [...(standing?.whys || []), ...(legacyStanding?.whys || [])].sort((a, b) => b.at.localeCompare(a.at));
  const summary = summarizeRecipeFeedback(recipe, board?.plates || []);
  const adjustments = communityAdjustments(plate, recipe.ingredients, board?.plates || []).slice(0, 5);
  const [experience, setExperience] = useState<FeedbackExperience>("would-try");
  const [selection, setSelection] = useState<FeedbackSelection>({ ...EMPTY_SELECTION });
  const [pending, setPending] = useState(false);
  const [reasonSaved, setReasonSaved] = useState(false);
  const [categories, setCategories] = useState<FeedbackCategory[]>([]);
  const [severity, setSeverity] = useState<FeedbackSeverity>("major");
  const [detailNote, setDetailNote] = useState("");
  const [ingredientId, setIngredientId] = useState("");
  const [stepIndex, setStepIndex] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const needsWhy = pending || (!reasonSaved && !!standing?.askWhy);
  const otherSelected = categories.includes("other");

  function changeExperience(next: FeedbackExperience) {
    setExperience(next);
    setSelection({ ...EMPTY_SELECTION });
    setPending(false);
    setReasonSaved(false);
    setCategories([]);
    setSeverity("major");
    setDetailNote("");
    setIngredientId("");
    setStepIndex("");
    setError("");
    setNotice(next === "cooked" ? "Your next report will be marked as cooked feedback for this version." : "Your next report will be marked as a first impression. No cooked rating is assumed.");
  }

  async function sendVote(next: FeedbackSelection, feedback?: MealFeedback) {
    const device = deviceId();
    if (!device) {
      setError("This browser could not create a feedback ID. Nothing was sent; your draft is still here.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await postCook({
        action: "vote", device, plate: recipe, experience,
        want: next.want,
        ...(experience === "cooked" ? { stars: next.stars, again: next.again } : {}),
        ...(feedback ? { feedback } : {}),
      });
      if (data.error) { setError(data.error); return; }
      if (!data.board) { setError("The save was not confirmed. Your draft is still here; try again."); return; }
      onBoard(data.board);
      setPending(false);
      setReasonSaved(true);
      setNotice(feedback ? "Your feedback and reason were saved together for this exact recipe version. The template is unchanged." : `Your ${experience === "cooked" ? "cooked report" : "first impression"} was saved. It does not establish food safety.`);
    } catch {
      setError("Feedback was not saved because the cook's book could not be reached. Your draft is still here.");
    } finally {
      setBusy(false);
    }
  }

  function chooseVote(update: Partial<FeedbackSelection>) {
    const next = { ...selection, ...update };
    setSelection(next);
    setReasonSaved(false);
    setError("");
    if (requiresFeedback(next.stars, next.want, next.again)) {
      setPending(true);
      setNotice("Choose a reason below, then save your feedback. Nothing has been sent yet.");
    } else {
      setPending(false);
      void sendVote(next);
    }
  }

  function saveFeedback() {
    if (!selection.want && selection.stars === null && !selection.again) {
      setError("Choose Yes or No, or a rating after cooking, before saving your reason.");
      return;
    }
    const result = readMealFeedback({
      categories, severity, note: detailNote,
      ...(ingredientId ? { ingredientId } : {}),
      ...(stepIndex !== "" ? { stepIndex: Number(stepIndex) } : {}),
    }, recipeKey, { ingredientIds: recipe.ingredients.map((item) => item.id), stepCount: recipe.steps.length });
    if (!result.feedback) { setError(result.error || "Choose a reason for this feedback."); return; }
    void sendVote(selection, result.feedback);
  }

  return <section className="cook-book" aria-label="Tell the cook">
    <h3>Tell us about this recipe</h3>
    <p>{COMMUNITY_LABEL}</p>
    {standing?.shelved && <p className="cook-warn">Kept for review. Repeated reports moved this plate out of default suggestions; the recipe and its history are still available.</p>}
    <div className="yes-no" role="group" aria-label="Have you cooked this recipe version?">
      <button type="button" className={experience === "would-try" ? "button primary small" : "button secondary small"} aria-pressed={experience === "would-try"} disabled={busy} onClick={() => changeExperience("would-try")}>First impression</button>
      <button type="button" className={experience === "cooked" ? "button primary small" : "button secondary small"} aria-pressed={experience === "cooked"} disabled={busy} onClick={() => changeExperience("cooked")}>I cooked this version</button>
    </div>
    <p className="subtle-small">{experience === "cooked" ? "Rate the version you cooked. A low rating or a No asks what needs to change." : "Would you try it? First impressions are kept separately from cooked ratings."}</p>
    <div className="yes-no" role="group" aria-label={experience === "cooked" ? "Would you make this again?" : "Would you try this?"}>
      <button type="button" className={selection.want === "yes" ? "button primary" : "button secondary"} aria-pressed={selection.want === "yes"} disabled={busy} onClick={() => chooseVote({ want: "yes", ...(experience === "cooked" ? { again: "will" } : {}) })}>{experience === "cooked" ? "Yes, I would make it again" : "Yes, I would try this"}</button>
      <button type="button" className={selection.want === "no" ? "button primary" : "button secondary"} aria-pressed={selection.want === "no"} disabled={busy} onClick={() => chooseVote({ want: "no" })}>No, not for me</button>
    </div>
    {experience === "cooked" && <>
      <div className="rating-row" role="group" aria-label="Share a cooked star rating">
        {[0, 1, 2, 3, 4, 5].map((n) => <button key={n} type="button" aria-label={`Rate ${n} out of 5`} aria-pressed={selection.stars === n} disabled={busy} onClick={() => chooseVote({ stars: n })}>{n}</button>)}
      </div>
      <button type="button" className={selection.again === "wont" ? "button primary small" : "text-button"} disabled={busy} onClick={() => chooseVote({ want: "no", again: "wont" })}>I will not make this again</button>
    </>}
    <p className="subtle-small">0–2 stars, No, or “will not make again” needs a reason. A category is enough; a written note is only required for Something else.</p>
    {needsWhy && <form className="cook-why" aria-label="Explain your feedback" onSubmit={(event) => { event.preventDefault(); saveFeedback(); }}>
      <p><strong>What needs to change?</strong> Choose one or more.</p>
      <div className="yes-no" role="group" aria-label="Reasons for your feedback">
        {FEEDBACK_CATEGORIES.map((category) => <button key={category.id} type="button" className={categories.includes(category.id) ? "button primary small" : "button secondary small"} aria-pressed={categories.includes(category.id)} disabled={busy} onClick={() => { setCategories((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id]); setError(""); }}>{category.label}</button>)}
      </div>
      <label>How much did it affect the meal?
        <select aria-label="How much did it affect the meal" value={severity} disabled={busy} onChange={(event) => setSeverity(event.target.value as FeedbackSeverity)}>
          <option value="minor">Small issue</option><option value="major">Major issue</option><option value="critical">Serious concern</option>
        </select>
      </label>
      <label>Ingredient (optional)
        <select aria-label="Ingredient involved" value={ingredientId} disabled={busy} onChange={(event) => setIngredientId(event.target.value)}>
          <option value="">No particular ingredient</option>
          {recipe.ingredients.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.amount}{item.unit ? ` ${item.unit}` : ""}</option>)}
        </select>
      </label>
      <label>Step (optional)
        <select aria-label="Step involved" value={stepIndex} disabled={busy} onChange={(event) => setStepIndex(event.target.value)}>
          <option value="">No particular step</option>
          {recipe.steps.map((step, index) => <option key={index} value={String(index)}>{index + 1}. {step.title}</option>)}
        </select>
      </label>
      <label>{otherSelected ? "What happened? (required for Something else)" : "Anything else? (optional)"}
        <textarea aria-label="Feedback detail" aria-required={otherSelected} maxLength={1000} rows={2} value={detailNote} disabled={busy} onChange={(event) => setDetailNote(event.target.value)} placeholder={otherSelected ? "Add a few useful words about the problem." : "For example, which amount or instruction would you change?"} />
      </label>
      <button type="submit" className="button primary small" disabled={busy}>{busy ? "Saving feedback…" : "Save feedback and reason"}</button>
    </form>}
    {summary.cookedDevices > 0 || summary.previewDevices > 0 ? <div className="cook-try">
      <p><strong>This exact recipe version:</strong> {summary.cookedDevices} cooked {summary.cookedDevices === 1 ? "report" : "reports"}, {summary.previewDevices} first {summary.previewDevices === 1 ? "impression" : "impressions"}.{summary.starAverage !== null ? ` Cooked rating: ${summary.starAverage} out of 5.` : ""}</p>
      {summary.confidence === "small-sample" && <p className="subtle-small">Only a small number of browsers have reported cooking this version. Treat any pattern as a request to review.</p>}
      {summary.requiresReview && <p className="cook-warn">A doneness, allergen or serious concern has been reported for this version. It needs review; votes do not verify food safety.</p>}
      {summary.reasonCounts.length > 0 && <><p>What people want reviewed:</p><ul>{summary.reasonCounts.slice(0, 5).map((reason) => <li key={reason.category}>{reason.label}: {reason.cookedDevices} cooked reports, {reason.previewDevices} first impressions.</li>)}</ul></>}
      {summary.reasonCounts.length > 5 && <p className="subtle-small">Showing 5 reason categories. All submitted reasons remain saved.</p>}
    </div> : <p className="subtle-small">No cooked reports or first impressions for this exact version yet.</p>}
    {adjustments.length > 0 && <div className="cook-try">
      <p>Older amount notes are available to review. They do not rewrite the recipe and have not been kitchen-tested.</p>
      <ul>{adjustments.map((item) => <li key={item.ingredientId}>{item.because}</li>)}</ul>
      <button type="button" className="button secondary small" onClick={onToggleTry}>{tried ? "Close suggestions" : "Preview suggested amounts"}</button>
    </div>}
    {reasons.length ? <div className="cook-reasons"><p>Recent reasons for this plate. Earlier reports are labelled separately:</p><ul>{reasons.slice(0, 8).map((item) => <li key={item.id}>
      <strong>{item.experience === "cooked" ? "Cooked report" : item.experience === "would-try" ? "First impression" : "Earlier report"}:</strong> {item.wrong}{item.change ? <> <strong>Suggested review:</strong> {item.change}</> : null}
      {item.feedback && item.plateKey === recipeKey && <small>{item.feedback.ingredientId ? ` Ingredient: ${recipe.ingredients.find((ingredient) => ingredient.id === item.feedback?.ingredientId)?.name || item.ingredientName}.` : ""}{item.feedback.stepIndex !== undefined ? ` Step ${item.feedback.stepIndex + 1}: ${recipe.steps[item.feedback.stepIndex]?.title || "See saved report"}.` : ""}</small>}
    </li>)}</ul>{reasons.length > 8 && <p className="subtle-small">Showing the latest 8 reasons. Earlier reports remain in the cook&apos;s book.</p>}</div> : null}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}

export function CookNotes({ board, onTrends }: { board: CommunityBoard | null; onTrends: () => void }) {
  return <section className="cook-notes">
    <div className="section-heading"><div><span className="eyebrow">THE COOK&apos;S BOOK</span><h2>What is being kept.</h2></div><button className="text-button" type="button" onClick={onTrends}>Open trends</button></div>
    <p>{board?.label || COMMUNITY_LABEL} First impressions and cooked reports are kept separately. Low ratings ask what needs to change; repeated reports can move a plate out of default suggestions without deleting it.</p>
    {!board || board.offers.length === 0 ? <p>No shared reports yet. Cook a plate and say whether you want it.</p> : <ul className="cook-offer-list">{board.offers.slice(0, 5).map((plate) => <li key={plate.plateKey}><strong>{plate.title}</strong><span>{plate.yesPeople} yes · {plate.noPeople} no{plate.starAverage != null ? ` · ${plate.starAverage} stars` : ""}</span></li>)}</ul>}
  </section>;
}

export function WeekNote({ recipe, board }: { recipe: Recipe; board: CommunityBoard | null }) {
  const standing = board?.plates.find((item) => item.plateKey === plateIdentity(recipe).key);
  if (!standing) return null;
  if (standing.shelved) return <p className="cook-warn">Kept in the book. Most people said they will not make this again, so it is not offered as a suggestion. This week was not changed.</p>;
  if (standing.askWhy) return <p>This plate has low ratings or negative reports awaiting reasons. Open it to share what needs review. It is still in the book.</p>;
  if (standing.starAverage != null) return <p>{standing.recipeVersion ? "Cooked ratings" : "Earlier ratings"}: {standing.starAverage} from {standing.starPeople} {standing.starPeople === 1 ? "browser" : "browsers"}. Not a kitchen test.</p>;
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
    {open && <div className="news-panel" role="region" aria-label="Cook notices">{items.length === 0 ? <p>No notices yet. Ratings and specials will show here.</p> : <ul>{items.slice(0, 8).map((item) => <li key={item.id}><strong>{item.title}</strong><span>{item.text}</span></li>)}</ul>}{items.length > 8 && <p className="subtle-small">Showing the latest 8 notices. Open trends for more.</p>}</div>}
  </div>;
}
