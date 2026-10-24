import { COOK_PACE_LABELS } from "./cook-pace.ts";
import type { Recipe } from "./recipe-types.ts";

/** A text recipe file. No native PDF library, so Windows and Linux builds stay the same. */
export function recipePdf(recipe: Recipe): Uint8Array {
  const lines: Array<{ text: string; size: number }> = [
    { text: recipe.title, size: 18 },
    { text: "Template-generated · not kitchen-tested. Check the packet.", size: 10 },
    { text: `${recipe.servings} servings · about ${recipe.totalMinutes} minutes · ${recipe.diet} · ${recipe.spiceHeat}${recipe.cookPace ? ` · ${COOK_PACE_LABELS[recipe.cookPace]}` : ""}`, size: 11 },
    { text: recipe.description, size: 11 },
    { text: "Ingredients", size: 14 },
    ...recipe.ingredients.map((item) => ({
      text: `${formatAmount(item.amount)} ${item.unit} ${item.name}`.replace(/\s+/g, " ").trim(),
      size: 11,
    })),
    { text: "Method", size: 14 },
    ...recipe.steps.flatMap((step, index) => [
      { text: `${index + 1}. ${step.title}`, size: 12 },
      { text: step.detail, size: 11 },
    ]),
  ];
  if (recipe.sessionNote) lines.push({ text: `Cook session. ${recipe.sessionNote}`, size: 10 });
  if (recipe.safetyNote) lines.push({ text: recipe.safetyNote, size: 10 });
  lines.push({ text: "Shared from Fusion Table. This file is the template, not a kitchen test.", size: 10 });

  const wrapped = lines.flatMap((line) => wrap(pdfSafe(line.text), line.size).map((text) => ({ text, size: line.size })));
  const pages: string[] = [];
  let cursor = 800;
  let commands = "";
  const flush = () => {
    pages.push(commands);
    commands = "";
    cursor = 800;
  };
  for (const line of wrapped) {
    const gap = line.size + 6;
    if (cursor - gap < 48) flush();
    commands += `BT /F1 ${line.size} Tf 48 ${cursor} Td (${line.text}) Tj ET\n`;
    cursor -= gap;
  }
  if (commands) pages.push(commands);
  return buildPdf(pages.length ? pages : ["BT /F1 12 Tf 48 800 Td (Empty recipe) Tj ET\n"]);
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

function pdfSafe(value: string): string {
  const text = value.normalize("NFKD").replace(/[^\x20-\x7E\u00A0-\u00FF]/g, (char) => {
    if (char === "°") return "\u00B0";
    if (char === "–" || char === "—") return "-";
    if (char === "’" || char === "‘") return "'";
    if (char === "“" || char === "”") return "\"";
    return "";
  });
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrap(text: string, size: number): string[] {
  const width = size >= 16 ? 42 : size >= 13 ? 58 : 86;
  if (text.length <= width) return [text || " "];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width && current) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines.length ? lines : [" "];
}

function buildPdf(pages: string[]): Uint8Array {
  const pagesId = 2;
  const fontId = 3;
  const pageIds = pages.map((_, index) => 4 + index * 2);
  const contentIds = pages.map((_, index) => 5 + index * 2);
  const bodies = new Map<number, Buffer>();
  const put = (id: number, body: string) => bodies.set(id, Buffer.from(body, "latin1"));
  put(1, `<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  put(pagesId, `<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  put(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  pages.forEach((page, index) => {
    put(pageIds[index], `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentIds[index]} 0 R >>`);
    put(contentIds[index], `<< /Length ${Buffer.from(page, "latin1").length} >>\nstream\n${page}endstream`);
  });
  const count = 3 + pages.length * 2;
  const header = Buffer.from("%PDF-1.4\n", "latin1");
  const chunks: Buffer[] = [header];
  const offsets = [0];
  let cursor = header.length;
  for (let id = 1; id <= count; id += 1) {
    offsets.push(cursor);
    const piece = Buffer.concat([
      Buffer.from(`${id} 0 obj\n`, "latin1"),
      bodies.get(id) ?? Buffer.from("<<>>", "latin1"),
      Buffer.from("\nendobj\n", "latin1"),
    ]);
    chunks.push(piece);
    cursor += piece.length;
  }
  let xref = `xref\n0 ${count + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= count; id += 1) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${count + 1} /Root 1 0 R >>\nstartxref\n${cursor}\n%%EOF`;
  chunks.push(Buffer.from(xref, "latin1"));
  return new Uint8Array(Buffer.concat(chunks));
}
