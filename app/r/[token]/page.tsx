import type { Metadata } from "next";
import { headers } from "next/headers";
import { COOK_PACE_LABELS } from "@/lib/cook-pace";
import { publicPath } from "@/lib/public-path";
import { decodeShare, recipeFromShare } from "@/lib/share-recipe";

async function origin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") || headerList.get("host") || "";
  if (!/^[A-Za-z0-9.-]+(?::\d{1,5})?$/.test(host)) return "";
  const forwarded = headerList.get("x-forwarded-proto");
  const proto = forwarded === "http" || forwarded === "https" ? forwarded : "https";
  return `${proto}://${host}`;
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  try {
    const recipe = recipeFromShare(decodeShare(decodeURIComponent(token)));
    const root = await origin();
    const image = `${root}${publicPath("/api/plate")}?t=${encodeURIComponent(token)}`;
    return {
      title: `${recipe.title} — Fusion Table`,
      description: `${recipe.description} Template-generated, not kitchen-tested. Check the packet.`,
      openGraph: {
        title: recipe.title,
        description: "Template-generated · not kitchen-tested. Check the packet.",
        images: root ? [image] : undefined,
      },
    };
  } catch {
    return { title: "Recipe link — Fusion Table" };
  }
}

export default async function SharedRecipe({ params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  let token = raw;
  try { token = decodeURIComponent(raw); } catch { token = raw; }
  let recipe: ReturnType<typeof recipeFromShare> | null = null;
  try {
    recipe = recipeFromShare(decodeShare(token));
  } catch {
    recipe = null;
  }
  if (!recipe) {
    return <main className="page-width inner-page"><h1>This link is not a recipe.</h1><p>Ask for a new Fusion Table link. Nothing was opened from this address.</p><a className="button primary" href={publicPath("/")}>Back to Fusion Table</a></main>;
  }
  const plate = `${publicPath("/api/plate")}?t=${encodeURIComponent(token)}`;
  const pdf = `${publicPath("/api/recipe-pdf")}?t=${encodeURIComponent(token)}`;
  return <main className="page-width inner-page shared-recipe">
    <p className="eyebrow">FUSION TABLE · SHARED RECIPE</p>
    <h1>{recipe.title}</h1>
    <p>{recipe.description}</p>
    <p className="meal-source-badge">{recipe.sourceLabel}. Check the packet.</p>
    <figure className="recipe-plate">
      <img src={plate} alt={`Plate picture for ${recipe.title}`} />
      <figcaption>Each dish has its own picture, made on the computer that hosts this site. It is not a photograph of a cooked dish.</figcaption>
    </figure>
    <p className="recipe-meta">{recipe.servings} servings · about {recipe.totalMinutes} minutes · {recipe.diet} · {recipe.spiceHeat}{recipe.cookPace ? ` · ${COOK_PACE_LABELS[recipe.cookPace]}` : ""}</p>
    <div className="recipe-actions">
      <a className="button primary" href={pdf}>Save PDF</a>
      <a className="button secondary" href={publicPath(`/?r=${encodeURIComponent(token)}`)}>Open in the planner</a>
    </div>
    <section className="ingredients-panel">
      <h2>Ingredients</h2>
      <ul className="ingredient-list">{recipe.ingredients.map((item) => <li key={item.id}><span><strong>{item.name}</strong></span><em>{Number(item.amount.toFixed(2))} {item.unit}</em></li>)}</ul>
      {recipe.allergens.length > 0 && <p>Lists {recipe.allergens.join(", ")}. Check the packet.</p>}
    </section>
    <section>
      <h2>Method</h2>
      <ol className="method-list">{recipe.steps.map((step, index) => <li key={`${step.title}-${index}`}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><div><h3>{step.title}</h3><p>{step.detail}</p></div></li>)}</ol>
      {recipe.sessionNote && <section className="bbq-method-notes"><h2>Cook session</h2><p>{recipe.sessionNote}</p></section>}
      {recipe.methodNotes?.length ? <section className="bbq-method-notes"><h2>Smoking, grilling & kitchen options</h2><ul>{recipe.methodNotes.map((note) => <li key={note}>{note}</li>)}</ul></section> : null}
      {recipe.safetyNote && <p>{recipe.safetyNote}</p>}
    </section>
  </main>;
}
