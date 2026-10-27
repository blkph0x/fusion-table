import { COOK_PACE_LABELS } from "./cook-pace.ts";
import type { Recipe } from "./recipe-types.ts";
import { canonAllergen } from "./staples.ts";

type Font = "regular" | "bold";
type Line = { text: string; size: number; font: Font; indent?: number };
type Block = { lines: Line[]; before?: number; after?: number; together?: boolean; withNext?: boolean };
const LEFT = 48, RIGHT = 547, TOP = 790, BOTTOM = 62;
const BODY_HEIGHT = TOP - BOTTOM;
const MAX_PAGES = 40;

// Standard Helvetica advances, in thousandths of an em, for ASCII 32-126.
// Embedded metrics keep wrapping consistent without a font/library dependency.
const WIDTHS: Record<Font, number[]> = {
  regular: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584],
  bold: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584],
};

function textWidth(text: string, size: number, font: Font): number {
  let units = 0;
  for (const char of text) units += WIDTHS[font][char.charCodeAt(0) - 32] ?? 1000;
  return units * size / 1000;
}

/** Plain cooking text rendered with the built-in WinAnsi Helvetica fonts. */
function displayText(value: string): string {
  const fractions: Record<string, string> = { "¼": "1/4", "½": "1/2", "¾": "3/4", "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8" };
  return value.replace(/[¼½¾⅛⅜⅝⅞]/g, (char) => fractions[char])
    .replace(/[–—−‑]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
    .normalize("NFKD").replace(/[^\x20-\x7E\u00A0-\u00FF\s]/g, "")
    .replace(/\s+/g, " ").trim();
}

function literal(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(value: string, size: number, font: Font, indent = 0): Line[] {
  const width = RIGHT - LEFT - indent;
  const words = displayText(value).split(" ").filter(Boolean);
  const lines: Line[] = [];
  let current = "";
  const push = () => { if (current) lines.push({ text: current, size, font, indent }); current = ""; };
  for (const word of words) {
    if (textWidth(current ? `${current} ${word}` : word, size, font) <= width) {
      current = current ? `${current} ${word}` : word;
      continue;
    }
    push();
    // Unbroken product names/URLs cannot be allowed to escape the page margin.
    let part = "";
    for (const char of word) {
      if (part && textWidth(part + char, size, font) > width) {
        current = part; push(); part = "";
      }
      part += char;
    }
    current = part;
  }
  push();
  return lines;
}

const leading = (line: Line) => line.size * 1.35;
const linesHeight = (lines: Line[]) => lines.reduce((height, line) => height + leading(line), 0);
const paragraph = (text: string, size = 11, font: Font = "regular", indent = 0) => wrap(text, size, font, indent);
const heading = (text: string): Block => ({ lines: paragraph(text, 13, "bold"), before: 12, after: 7, withNext: true });

/** A complete cooking copy; Windows and Linux builds need no native PDF library. */
export function recipePdf(recipe: Recipe): Uint8Array {
  const allergens = [...new Set([...recipe.allergens, ...recipe.ingredients.flatMap((item) => item.allergens)].map(canonAllergen))].sort();
  const blocks: Block[] = [
    { lines: paragraph(recipe.title, 18, "bold"), after: 8, withNext: true },
    { lines: paragraph("Template-generated - not kitchen-tested. Check the packet.", 9.5), after: 7 },
    { lines: paragraph(`${recipe.servings} servings · about ${recipe.totalMinutes} minutes · ${recipe.diet} · ${recipe.spiceHeat}${recipe.cookPace ? ` · ${COOK_PACE_LABELS[recipe.cookPace]}` : ""}`, 10.5), after: 7 },
    { lines: paragraph(recipe.description, 10.5), after: 5 },
    heading("Equipment"),
    { lines: paragraph(recipe.equipment.join(" · "), 10.5), after: 5, together: true },
    { lines: paragraph(`Recorded allergens: ${allergens.length ? allergens.join(", ") : "none listed in this template"}. Check product labels and prevent cross-contact.`, 10), after: 5, together: true },
    heading("Ingredients"),
    ...recipe.ingredients.map((item): Block => ({
      lines: [
        ...paragraph(`${formatAmount(item.amount)} ${item.unit} ${item.name}`.replace(/\s+/g, " ").trim()),
        ...(item.notes ? paragraph(`Note: ${item.notes}`, 9.5, "regular", 12) : []),
      ],
      after: item.notes ? 7 : 4,
      together: true,
    })),
    heading("Method"),
    ...recipe.steps.map((step, index): Block => ({
      lines: [...paragraph(`${index + 1}. ${step.title}`, 11, "bold"), ...paragraph(step.detail, 10.5)],
      before: index ? 8 : 0,
      after: 5,
      together: true,
    })),
  ];
  if (recipe.methodNotes?.length) blocks.push(heading("Method notes"), ...recipe.methodNotes.map((note): Block => ({ lines: paragraph(note, 10), after: 7, together: true })));
  if (recipe.sessionNote) blocks.push(heading("Cook session"), { lines: paragraph(recipe.sessionNote, 10), after: 5, together: true });
  if (recipe.safetyNote) blocks.push(heading("Food safety"), { lines: paragraph(recipe.safetyNote, 10), after: 5, together: true });
  blocks.push({ lines: paragraph("Shared from Fusion Table. This file is the template, not a kitchen test.", 9), before: 12 });

  const pages: string[] = [];
  let cursor = TOP;
  let commands = "";
  const flush = () => {
    if (!commands) return;
    if (pages.length >= MAX_PAGES) throw new Error("This recipe is too long to export as PDF. Download the recipe JSON instead.");
    pages.push(commands);
    commands = "";
    cursor = TOP;
  };
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    if (!block.lines.length) continue;
    let before = commands ? block.before ?? 0 : 0;
    const contentHeight = linesHeight(block.lines);
    let required = block.together && contentHeight <= BODY_HEIGHT
      ? contentHeight
      : linesHeight(block.lines.slice(0, Math.min(3, block.lines.length)));
    if (block.withNext) {
      const next = blocks.slice(index + 1).find((item) => item.lines.length);
      required = contentHeight + (block.after ?? 0) + (next?.before ?? 0) + (next ? linesHeight(next.lines.slice(0, Math.min(3, next.lines.length))) : 0);
      // Prefer keeping the whole next step/ingredient if it fits a fresh page.
      if (next?.together && contentHeight + linesHeight(next.lines) + (block.after ?? 0) <= BODY_HEIGHT) required = contentHeight + (block.after ?? 0) + linesHeight(next.lines);
    }
    if (commands && cursor - before - required < BOTTOM) { flush(); before = 0; }
    cursor -= before;
    for (const line of block.lines) {
      if (cursor - leading(line) < BOTTOM) flush();
      commands += `BT /${line.font === "bold" ? "F2" : "F1"} ${line.size} Tf ${LEFT + (line.indent ?? 0)} ${cursor.toFixed(2)} Td (${literal(line.text)}) Tj ET\n`;
      cursor -= leading(line);
    }
    cursor -= block.after ?? 0;
  }
  flush();
  const numbered = pages.map((page, index) => {
    const label = `Page ${index + 1} of ${pages.length}`;
    const right = RIGHT - textWidth(label, 9, "regular");
    return `${page}q 0.8 G 48 44 m 547 44 l S Q\nBT /F1 9 Tf 48 29 Td (Fusion Table) Tj ET\nBT /F1 9 Tf ${right.toFixed(2)} 29 Td (${label}) Tj ET\n`;
  });
  return buildPdf(numbered);
}

function formatAmount(value: number): string {
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "";
}

function buildPdf(pages: string[]): Uint8Array {
  const pagesId = 2;
  const pageIds = pages.map((_, index) => 5 + index * 2);
  const contentIds = pages.map((_, index) => 6 + index * 2);
  const bodies = new Map<number, Buffer>();
  const put = (id: number, body: string) => bodies.set(id, Buffer.from(body, "latin1"));
  put(1, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  put(pagesId, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  put(3, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  put(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pages.forEach((page, index) => {
    put(pageIds[index], `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentIds[index]} 0 R >>`);
    put(contentIds[index], `<< /Length ${Buffer.from(page, "latin1").length} >>\nstream\n${page}endstream`);
  });
  const count = 4 + pages.length * 2;
  const header = Buffer.from("%PDF-1.4\n", "latin1");
  const chunks: Buffer[] = [header];
  const offsets = [0];
  let cursor = header.length;
  for (let id = 1; id <= count; id += 1) {
    offsets.push(cursor);
    const piece = Buffer.concat([Buffer.from(`${id} 0 obj\n`, "latin1"), bodies.get(id) ?? Buffer.from("<<>>", "latin1"), Buffer.from("\nendobj\n", "latin1")]);
    chunks.push(piece);
    cursor += piece.length;
  }
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= count; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`;
  chunks.push(Buffer.from(xref, "latin1"));
  return new Uint8Array(Buffer.concat(chunks));
}
