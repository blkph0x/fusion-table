import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { generateRecipe } from "../lib/recipes.ts";
import { recipePdf } from "../lib/recipe-pdf.ts";
import type { Recipe } from "../lib/recipe-types.ts";

const fixture = () => generateRecipe({ classicId: "roast", regionId: "moroccan", diet: "vegan", servings: 4, spiceHeat: "medium" });
const pdfText = (recipe: Recipe) => Buffer.from(recipePdf(recipe)).toString("latin1");
const streams = (pdf: string) => [...pdf.matchAll(/stream\n([\s\S]*?)endstream/g)].map((match) => match[1]);
const decodedLines = (stream: string) => [...stream.matchAll(/BT \/F[12] ([\d.]+) Tf ([\d.]+) ([\d.]+) Td \(((?:\\.|[^\\)])*)\) Tj ET/g)].map((match) => ({
  size: Number(match[1]), x: Number(match[2]), y: Number(match[3]), text: match[4].replace(/\\([\\()])/g, "$1"),
}));

describe("complete recipe PDF export", () => {
  it("includes equipment, recorded allergens, preparation/label notes and method guidance", () => {
    const original = fixture();
    const recipe: Recipe = {
      ...original, equipment: ["Oven", "Food thermometer"], allergens: ["sesame", "wheat"],
      ingredients: original.ingredients.map((item, index) => index ? item : { ...item, notes: "Use certified gluten-free stock. Keep chilled." }),
      methodNotes: ["Use the oven option when an outdoor cooker is unavailable."],
      sessionNote: "Prepare in the morning and refrigerate until cooking.", safetyNote: "Use a clean food thermometer.",
    };
    const text = streams(pdfText(recipe)).flatMap(decodedLines).map((line) => line.text).join(" ");
    for (const expected of ["Equipment", "Food thermometer", "Recorded allergens: sesame, wheat", "Use certified gluten-free stock. Keep chilled.", "Method notes", "Use the oven option", "Cook session", "Prepare in the morning", "Food safety", "Use a clean food thermometer.", "not kitchen-tested"]) assert.ok(text.includes(expected), expected);
  });

  it("moves a whole cooking step onto the next page when it fits there", () => {
    const original = fixture();
    const recipe: Recipe = {
      ...original, title: "Pagination fixture", description: "", methodNotes: undefined, safetyNote: undefined,
      ingredients: Array.from({ length: 15 }, (_, index) => ({ ...original.ingredients[0], id: `item-${index}`, name: `Ingredient ${index + 1}`, notes: undefined })),
      steps: [
        { title: "Prepare", detail: "Carefully prepare the ingredients. ".repeat(12) },
        { title: "Finish together", detail: `BEGIN_STEP_TWO ${"Cook gently and check the centre before serving. ".repeat(35)} END_STEP_TWO` },
      ],
    };
    const pages = streams(pdfText(recipe));
    assert.ok(pages.length >= 2);
    const stepPage = pages.find((page) => page.includes("BEGIN_STEP_TWO"));
    assert.ok(stepPage?.includes("END_STEP_TWO"), "A step that fits one page must stay together");
    for (const page of pages) {
      const body = decodedLines(page).filter((line) => line.y >= 62);
      assert.ok(!["Ingredients", "Method", "Equipment", "Food safety"].includes(body[body.length - 1]?.text), "Section heading must keep following content");
    }
  });

  it("retains ingredient-level allergens when an older summary is incomplete", () => {
    const original = generateRecipe({ classicId: "pasta", regionId: "japanese", servings: 2 });
    const text = streams(pdfText({ ...original, allergens: [] })).flatMap(decodedLines).map((line) => line.text).join(" ");
    assert.ok(text.includes("Recorded allergens:"));
    assert.ok(text.includes("soy"));
    assert.ok(!text.includes("none listed in this template"));
  });

  it("wraps wide unbroken words inside the printable area and safely escapes PDF literals", () => {
    const original = fixture();
    const recipe: Recipe = { ...original, description: "W".repeat(300), safetyNote: "Keep (covered \\ upright) at 75°C; use ½ tsp and ají - never guess." };
    const pdf = pdfText(recipe);
    const lines = streams(pdf).flatMap(decodedLines);
    const wide = lines.filter((line) => /^W+$/.test(line.text));
    assert.ok(wide.length >= 5, "Long words must break rather than run off the page");
    for (const line of wide) assert.ok(line.x + line.text.length * line.size * 0.944 <= 547.01, "Helvetica W advance must stay within the right margin");
    const text = lines.map((line) => line.text).join(" ");
    assert.ok(text.includes("(covered \\ upright)"));
    assert.ok(text.includes("75°C"));
    assert.ok(text.includes("1/2 tsp"), "Unicode fractions must not become a different quantity");
    assert.ok(text.includes("aji"));
    assert.ok(pdf.includes("/Encoding /WinAnsiEncoding"));
  });

  it("writes correct page counts, footer numbering, stream lengths and cross-reference offsets", () => {
    const pdf = pdfText(fixture());
    const pages = streams(pdf);
    assert.ok(pdf.startsWith("%PDF-1.4"));
    assert.ok(pdf.endsWith("%%EOF"));
    assert.ok(pdf.includes(`/Count ${pages.length}`));
    pages.forEach((page, index) => assert.ok(page.includes(`Page ${index + 1} of ${pages.length}`)));
    for (const match of pdf.matchAll(/<< \/Length (\d+) >>\nstream\n([\s\S]*?)endstream/g)) assert.equal(Buffer.byteLength(match[2], "latin1"), Number(match[1]));
    const xrefOffset = Number(pdf.match(/startxref\n(\d+)/)?.[1]);
    assert.equal(pdf.slice(xrefOffset, xrefOffset + 4), "xref");
    const offsets = [...pdf.matchAll(/^(\d{10}) 00000 n /gm)].map((match) => Number(match[1]));
    offsets.forEach((offset, index) => assert.ok(pdf.slice(offset).startsWith(`${index + 1} 0 obj\n`)));
    for (const page of pages) for (const line of decodedLines(page)) assert.ok(line.y === 29 || (line.y >= 62 && line.y <= 790), "Body text must not collide with footer");
  });

  it("rejects excessive output rather than silently dropping cooking instructions", () => {
    const original = fixture();
    assert.throws(() => recipePdf({ ...original, steps: [{ title: "Excessive", detail: "A long cooking instruction. ".repeat(25000) }] }), /too long to export as PDF/);
  });
});
