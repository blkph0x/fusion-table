import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import type { Recipe } from "./recipe-types.ts";

const WIDTH = 640;
const HEIGHT = 400;
const PAINT_NOTE = "Painted on this computer from the ingredient list. Not a photograph of a cooked dish.";
const MODEL_NOTE = "Drawn by the local image model on this computer. Not a photograph of a cooked dish.";
const STILL_NOTE = "Template photograph for this style of plate. Not a photo of a dish you have cooked.";

const STILLS: Record<string, string> = {
  "pasta|japanese|vegetarian": "fusion-table-hero.png",
  "tacos|korean|vegan": "korean-tacos.png",
  "roast|moroccan|vegan": "moroccan-traybake.png",
};

/** Exact unseeded meals. Any other main, method or region is painted. */
const MEAL_STILLS: Record<string, string> = {
  "thai|curry|chicken": "meals/thai-chicken-curry.jpg",
  "korean|stir-fried|beef": "meals/korean-beef-stirfry.jpg",
  "japanese|grilled|salmon": "meals/japanese-salmon-grilled.jpg",
  "indian|curry|chickpeas": "meals/indian-chickpea-curry.jpg",
  "mexican|grilled|chicken": "meals/mexican-chicken-grilled.jpg",
  "levantine|grilled|chicken": "meals/levantine-chicken-grilled.jpg",
  "ethiopian|braised|lentils": "meals/ethiopian-lentil-braise.jpg",
  "vietnamese|grilled|chicken": "meals/vietnamese-chicken-grilled.jpg",
};

export interface PlatePicture {
  bytes: Uint8Array;
  contentType: "image/png" | "image/jpeg";
  note: string;
}

/** A local image server is accepted only on this machine. Nothing else is called. */
export function localImageEndpoint(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash) return null;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") return null;
  if (url.port !== "" && !/^\d{1,5}$/.test(url.port)) return null;
  return url.toString().replace(/\/$/, "");
}

export async function renderPlate(recipe: Recipe, options?: { model?: boolean }): Promise<PlatePicture> {
  const still = readStill(recipe);
  if (still) return still;
  if (options?.model !== false) {
    const drawn = await askLocalModel(recipe);
    if (drawn) return drawn;
  }
  const painted = paintPlate(recipe);
  return { bytes: encodePng(WIDTH, HEIGHT, painted), contentType: "image/png", note: PAINT_NOTE };
}

function stillName(recipe: Recipe): string | null {
  if (/-sat-\d+$/.test(recipe.id)) return null;
  if (recipe.kind === "meal" && recipe.methodId && recipe.mainId) {
    return MEAL_STILLS[`${recipe.regionId}|${recipe.methodId}|${recipe.mainId}`] ?? null;
  }
  if (recipe.kind === "meal") return null;
  return STILLS[`${recipe.classicId}|${recipe.regionId}|${recipe.diet}`] ?? null;
}

function readStill(recipe: Recipe): PlatePicture | null {
  const file = stillName(recipe);
  if (!file || !/^[a-z0-9./_-]+$/i.test(file) || file.includes("..")) return null;
  const roots = [
    join(dirname(fileURLToPath(import.meta.url)), "../public/images"),
    join(process.cwd(), "public", "images"),
    join(process.cwd(), "dist", "client", "images"),
  ];
  for (const root of roots) {
    try {
      const bytes = new Uint8Array(readFileSync(join(root, file)));
      const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
      const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!png && !jpeg) continue;
      return { bytes, contentType: jpeg ? "image/jpeg" : "image/png", note: STILL_NOTE };
    } catch {
      /* Try the next place the build may have copied public images. */
    }
  }
  return null;
}

/** Stable cache key from plate identity + visible ingredients (not a generic stock slug). */
export function platePictureKey(recipe: Recipe): string {
  const bits = [
    recipe.kind === "meal" ? "meal" : "classic",
    recipe.regionId || "",
    recipe.mainId || recipe.classicId || "",
    recipe.methodId || "",
    recipe.sideId || "",
    recipe.title || "",
    ...recipe.ingredients.slice(0, 16).map((item) => item.id),
  ];
  return bits.join("|").toLowerCase().replace(/[^a-z0-9.|_-]+/g, "-").slice(0, 240);
}

/** Prompt built from the actual recipe — title, method, region, sides and visible ingredients. */
export function platePicturePrompt(recipe: Recipe): string {
  const method = recipe.methodId ? recipe.methodId.replace(/-/g, " ") : "";
  const region = recipe.regionId ? recipe.regionId.replace(/-/g, " ") : "";
  const main = recipe.mainId ? recipe.mainId.replace(/-/g, " ") : "";
  const side = recipe.sideId ? recipe.sideId.replace(/-/g, " ") : "";
  const components = recipe.kind === "meal" && "components" in recipe
    ? (recipe as { components?: { main?: string; side?: string; vegetables?: string; sauce?: string } }).components
    : undefined;
  const plateBits = [
    components?.main,
    components?.side,
    components?.vegetables,
    components?.sauce,
  ].filter(Boolean).join("; ");
  const visible = recipe.ingredients
    .filter((item) => !/stock|oil|salt|water|flour|breadcrumb|cornflour/i.test(item.id))
    .slice(0, 10)
    .map((item) => item.name)
    .join(", ");
  const cue = [
    recipe.title,
    method && `${method} cooking`,
    region && `${region}-inspired flavours`,
    main && `main: ${main}`,
    side && `side: ${side}`,
    plateBits && `on the plate: ${plateBits}`,
    visible && `visible ingredients: ${visible}`,
  ].filter(Boolean).join(". ");
  return `Realistic close-up food photograph of one finished home-cooked dinner plate, natural window light, ceramic plate on a wooden table, sharp focus, appetising, steam optional, no text, no logo, no people, no hands, no raw meat. Depict this exact meal — not a generic stock dish. ${cue}`.slice(0, 900);
}

async function askLocalModel(recipe: Recipe): Promise<PlatePicture | null> {
  const endpoint = localImageEndpoint(process.env.FUSION_LOCAL_IMAGE_URL);
  if (!endpoint) return null;
  const target = endpoint.includes("sdapi") ? endpoint : `${endpoint}/sdapi/v1/txt2img`;
  const prompt = platePicturePrompt(recipe);
  const identity = platePictureKey(recipe);
  try {
    const response = await fetch(target, {
      method: "POST",
      // workerd rejects redirect:"error". "manual" still does not follow a redirect.
      redirect: "manual",
      signal: AbortSignal.timeout(240_000),
      headers: { Accept: "application/json, image/png, image/jpeg", "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        negative_prompt: "text, watermark, logo, people, hands, cartoon, illustration, painting, plastic food, blurry, deformed, raw poultry, raw mince, wrong cuisine, generic buffet, stock photo collage",
        steps: 4,
        width: 512,
        height: 512,
        cfg_scale: 1,
        scheduler: "karras",
        // Seed the local model from the plate identity so the same meal redraws consistently.
        seed: Math.abs([...identity].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)),
      }),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") || "";
    if (type.includes("image/png") || type.includes("image/jpeg")) {
      const bytes = new Uint8Array(await response.arrayBuffer());
      return checkedImage(bytes, type.includes("jpeg") ? "image/jpeg" : "image/png");
    }
    const payload = await response.json() as { images?: unknown; image?: unknown };
    const raw = Array.isArray(payload.images) ? payload.images[0] : payload.image;
    if (typeof raw !== "string" || raw.length > 8_000_000) return null;
    const bytes = Buffer.from(raw.replace(/^data:image\/(?:png|jpeg);base64,/, ""), "base64");
    return checkedImage(new Uint8Array(bytes), bytes[0] === 0xff ? "image/jpeg" : "image/png");
  } catch {
    return null;
  }
}

function checkedImage(bytes: Uint8Array, contentType: "image/png" | "image/jpeg"): PlatePicture | null {
  if (bytes.length < 32 || bytes.length > 5_000_000) return null;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  if (contentType === "image/png" && !png) return null;
  if (contentType === "image/jpeg" && !jpeg) return null;
  return { bytes, contentType, note: MODEL_NOTE };
}

type Rgb = [number, number, number];
type FoodKind = "starch" | "protein" | "sauce" | "herb" | "veg" | "skip";

export function paintPlate(recipe: Recipe): Uint8Array {
  const rgb = new Uint8Array(WIDTH * HEIGHT * 3);
  const rand = mulberry32(fnv(platePictureKey(recipe)));
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const grain = Math.round(Math.sin(y / 7) * 5) + ((x * 3 + y) % 9) - 4;
      put(rgb, x, y, 196 + grain, 154 + grain, 112 + grain);
    }
  }
  const method = recipe.methodId || "";
  const bowl = method === "curry" || method === "braised" || /soup|stew|broth/.test(recipe.title.toLocaleLowerCase("en"));
  const rim: Rgb = rand() > 0.45 ? [186, 196, 168] : [214, 198, 176];
  const well: Rgb = [rim[0] + 22, rim[1] + 18, rim[2] + 14];
  const cx = 320;
  const cy = bowl ? 204 : 208;
  const rx = bowl ? 168 : 228;
  const ry = bowl ? 148 : 140;
  fillEllipse(rgb, cx, cy + 16, rx + 18, ry + 10, [120, 96, 72]);
  fillEllipse(rgb, cx, cy, rx, ry, [rim[0] - 28, rim[1] - 24, rim[2] - 22]);
  fillEllipse(rgb, cx, cy - 2, rx - 16, ry - 14, well);
  const grouped = new Map<FoodKind, string[]>();
  for (const item of recipe.ingredients) {
    if (item.amount <= 0) continue;
    const kind = foodKind(item.name);
    if (kind === "skip") continue;
    const list = grouped.get(kind) ?? [];
    if (list.length < 4) list.push(item.name);
    grouped.set(kind, list);
  }
  const starch = grouped.get("starch")?.[0];
  if (starch) drawStarch(rgb, starch, cx, cy, rand);
  const sauce = grouped.get("sauce")?.[0];
  if (sauce) fillEllipse(rgb, cx + 78, cy + 36, 46, 28, foodColour(sauce, rand));
  (grouped.get("veg") ?? []).slice(0, 3).forEach((name, index) => {
    const colour = foodColour(name, rand);
    fillEllipseRotated(rgb, cx - 70 + index * 38, cy + 48, 22, 12, -0.5 + index * 0.35, colour);
    fillEllipse(rgb, cx - 78 + index * 36, cy + 36, 8, 8, colour);
  });
  (grouped.get("protein") ?? []).slice(0, 2).forEach((name, index) => {
    drawProtein(rgb, name, cx + index * 36, cy - 8, rand);
  });
  (grouped.get("herb") ?? []).slice(0, 5).forEach((name) => {
    const hx = cx - 40 + Math.round(rand() * 120);
    const hy = cy - 20 + Math.round(rand() * 70);
    fillEllipse(rgb, hx, hy, 4, 3, foodColour(name, rand));
  });
  return rgb;
}

function foodKind(name: string): FoodKind {
  const text = name.toLocaleLowerCase("en");
  if (/oil|stock|water|salt|flour|sugar|cornflour|vinegar/.test(text) && !/chilli|chili|sesame|rice vinegar/.test(text)) return "skip";
  if (/^black pepper$|ground black pepper|white pepper/.test(text)) return "skip";
  if (/rice|noodle|pasta|couscous|bread|tortilla|wrap|potato|injera|teff|quinoa|polenta|flatbread/.test(text)) return "starch";
  if (/sauce|curry|paste|coconut milk|coconut cream|yoghurt|yogurt|miso|gravy|passata|tahini/.test(text)) return "sauce";
  if (/chicken|beef|lamb|pork|fish|salmon|prawn|shrimp|tofu|tempeh|egg|halloumi|turkey|mince|duck|kangaroo|tuna|sardine|paneer|jackfruit|black bean|kidney bean/.test(text)) return "protein";
  if (/herb|coriander|cilantro|parsley|mint|basil|chilli|chili|sesame|spring onion|scallion|lemon|lime|dill|thyme|rosemary|onion/.test(text)) return "herb";
  return "veg";
}

function drawStarch(rgb: Uint8Array, name: string, cx: number, cy: number, rand: () => number) {
  const text = name.toLocaleLowerCase("en");
  const colour = foodColour(name, rand);
  if (/noodle|pasta/.test(text)) {
    for (let strand = 0; strand < 9; strand += 1) {
      fillEllipseRotated(rgb, cx - 78, cy - 10 + strand * 6, 52, 3, -0.15 + rand() * 0.3, colour);
    }
    return;
  }
  if (/bread|tortilla|wrap|flatbread|injera/.test(text)) {
    fillEllipseRotated(rgb, cx - 86, cy + 4, 58, 28, -0.4, colour);
    return;
  }
  if (/potato/.test(text)) {
    for (let piece = 0; piece < 5; piece += 1) fillEllipse(rgb, cx - 108 + piece * 16, cy - 8 + (piece % 2) * 14, 12, 9, colour);
    return;
  }
  for (let grain = 0; grain < 28; grain += 1) {
    const angle = rand() * Math.PI * 2;
    const reach = Math.sqrt(rand());
    fillEllipse(rgb, Math.round(cx - 82 + Math.cos(angle) * reach * 46), Math.round(cy - 6 + Math.sin(angle) * reach * 28), 6, 4, colour);
  }
}

function drawProtein(rgb: Uint8Array, name: string, cx: number, cy: number, rand: () => number) {
  const text = name.toLocaleLowerCase("en");
  const colour = foodColour(name, rand);
  if (/prawn|shrimp/.test(text)) {
    for (let piece = 0; piece < 4; piece += 1) fillEllipseRotated(rgb, cx - 10 + piece * 16, cy + (piece % 2) * 10, 14, 6, piece * 0.6, colour);
    return;
  }
  if (/fish|salmon|tuna|sardine/.test(text)) {
    fillEllipseRotated(rgb, cx + 8, cy, 48, 18, -0.25, colour);
    return;
  }
  if (/egg/.test(text)) {
    fillEllipse(rgb, cx, cy, 22, 16, [236, 230, 214]);
    fillEllipse(rgb, cx + 2, cy + 1, 8, 8, [214, 168, 42]);
    return;
  }
  const pieces = /tofu|tempeh|halloumi|paneer|jackfruit/.test(text) ? 3 : 4;
  for (let piece = 0; piece < pieces; piece += 1) {
    fillEllipse(rgb, cx - 16 + (piece % 2) * 28, cy - 16 + Math.floor(piece / 2) * 24, 16, 11, colour);
  }
}

function foodColour(name: string, rand: () => number): Rgb {
  const text = name.toLocaleLowerCase("en");
  const jitter = Math.round(rand() * 14) - 7;
  const base: Rgb = /chilli|chili|tomato|gochujang|harissa|paprika|sriracha|capsicum/.test(text) ? [176, 58, 40]
    : /herb|coriander|cilantro|parsley|mint|lime|salad|spinach|broccoli|cabbage|basil|bean/.test(text) ? [62, 122, 58]
    : /lemon|turmeric|corn|mango|egg/.test(text) ? [214, 170, 48]
    : /rice|noodle|bread|tortilla|potato|pasta|couscous|wrap|injera|quinoa/.test(text) ? [214, 190, 132]
    : /beef|lamb|pork|kangaroo/.test(text) ? [122, 72, 52]
    : /salmon|fish|prawn|shrimp|tuna|sardine/.test(text) ? [196, 112, 78]
    : /chicken|turkey|duck|tofu|mushroom|tempeh|halloumi|paneer/.test(text) ? [168, 122, 74]
    : /sauce|coconut|cream|yoghurt|yogurt|cheese|miso|curry|paste/.test(text) ? [168, 86, 42]
    : [108, 124, 70];
  return [base[0] + jitter, base[1] + jitter, base[2] + jitter];
}

function fillEllipse(rgb: Uint8Array, cx: number, cy: number, rx: number, ry: number, colour: Rgb) {
  fillEllipseRotated(rgb, cx, cy, rx, ry, 0, colour);
}

function fillEllipseRotated(rgb: Uint8Array, cx: number, cy: number, rx: number, ry: number, angle: number, colour: Rgb) {
  if (rx < 1 || ry < 1) return;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const reach = Math.ceil(Math.max(rx, ry));
  const x0 = Math.max(0, cx - reach);
  const x1 = Math.min(WIDTH - 1, cx + reach);
  const y0 = Math.max(0, cy - reach);
  const y1 = Math.min(HEIGHT - 1, cy + reach);
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const dx = x - cx;
      const dy = y - cy;
      const px = (dx * cos + dy * sin) / rx;
      const py = (-dx * sin + dy * cos) / ry;
      if (px * px + py * py <= 1) put(rgb, x, y, colour[0], colour[1], colour[2]);
    }
  }
}

function put(rgb: Uint8Array, x: number, y: number, r: number, g: number, b: number) {
  const index = (y * WIDTH + x) * 3;
  rgb[index] = clamp(r);
  rgb[index + 1] = clamp(g);
  rgb[index + 2] = clamp(b);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function fnv(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function encodePng(width: number, height: number, rgb: Uint8Array): Uint8Array {
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dest = y * (stride + 1);
    raw[dest] = 0;
    for (let x = 0; x < stride; x += 1) raw[dest + 1 + x] = rgb[y * stride + x];
  }
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return concat([signature, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function chunk(type: string, data: Buffer): Uint8Array {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (~crc) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
