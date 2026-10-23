/**
 * Community reports sit beside the templates. They never change an unseeded recipe,
 * never relax a diet or allergen filter, and never delete a plate.
 * A plate leaves the default list only when at least five people have said whether
 * they would make it again, at least four of those say they will not, and those
 * "will not" votes are at least 80% of that group. The plate and the reasons stay.
 */

export const COMMUNITY_LABEL =
  "Cook reports from people who used this site. Not a kitchen test, and not a safety check.";

export const ASK_WHY_PEOPLE = 3;
export const SHELVE_PEOPLE = 5;
export const SHELVE_WONT = 4;
export const SHELVE_SHARE = 0.8;
const MAX_VOTES = 20_000;
const MAX_WHYS = 20_000;
const MAX_NEWS = 500;
const LESS_STEP = 0.75;
const MORE_STEP = 1.25;

export type Want = "yes" | "no" | "";
export type Again = "wont" | "might" | "will" | "staple" | "";
export type Direction = "less" | "more" | "note";
export type NewsKind = "ask-why" | "shelved" | "restored" | "trending-up" | "trending-down";

export interface PlateRef {
  key: string;
  title: string;
  family: string;
  kind: "classic" | "meal";
  classicId: string;
  regionId: string;
  diet: string;
  spiceHeat: string;
  mainId: string;
  methodId: string;
  sideId: string;
  ingredientIds: string[];
}

export interface Vote {
  id: string;
  at: string;
  device: string;
  plateKey: string;
  title: string;
  family: string;
  kind: "classic" | "meal";
  classicId: string;
  regionId: string;
  diet: string;
  spiceHeat: string;
  mainId: string;
  methodId: string;
  sideId: string;
  ingredientIds: string[];
  /** Null means this report did not include a star. 0 and 1 are poor reports, not "cleared". */
  stars: number | null;
  want: Want;
  again: Again;
}

export interface WhyNote {
  id: string;
  at: string;
  device: string;
  plateKey: string;
  family: string;
  title: string;
  wrong: string;
  change: string;
  ingredientId: string;
  ingredientName: string;
  direction: Direction;
}

export interface NewsItem {
  id: string;
  at: string;
  kind: NewsKind;
  plateKey: string;
  title: string;
  text: string;
}

export interface CommunityLedger {
  votes: Vote[];
  whys: WhyNote[];
  news: NewsItem[];
}

export interface PlateStanding {
  plateKey: string;
  title: string;
  family: string;
  kind: "classic" | "meal";
  classicId: string;
  regionId: string;
  diet: string;
  spiceHeat: string;
  mainId: string;
  methodId: string;
  sideId: string;
  people: number;
  reports: number;
  starAverage: number | null;
  starPeople: number;
  lowPeople: number;
  whyPeople: number;
  askWhy: boolean;
  wontPeople: number;
  againPeople: number;
  yesPeople: number;
  noPeople: number;
  shelved: boolean;
  trendingUp: boolean;
  trendingDown: boolean;
  showScore: number;
  whys: WhyNote[];
  /** Amount notes kept for the try. The template amounts are not changed. */
  amountNotes: WhyNote[];
}

export interface CommunityBoard {
  label: string;
  plates: PlateStanding[];
  offers: PlateStanding[];
  trendingUp: PlateStanding[];
  trendingDown: PlateStanding[];
  askWhy: PlateStanding[];
  shelved: PlateStanding[];
  news: NewsItem[];
}

export interface AmountAdjustment {
  ingredientId: string;
  ingredientName: string;
  factor: number;
  people: number;
  direction: "less" | "more";
  because: string;
}

interface IdentityInput {
  id: string;
  title: string;
  kind?: string;
  classicId: string;
  regionId: string;
  diet: string;
  spiceHeat: string;
  mainId?: string;
  methodId?: string;
  sideId?: string;
  ingredients?: readonly { id: string }[];
}

const TOKEN = /^[a-z0-9:_-]{1,80}$/;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function token(value: unknown): string {
  const text = cleanText(value, 80).toLowerCase();
  return TOKEN.test(text) ? text : "";
}

function wantOf(value: unknown): Want {
  return value === "yes" || value === "no" ? value : "";
}

function againOf(value: unknown): Again {
  return value === "wont" || value === "might" || value === "will" || value === "staple" ? value : "";
}

function directionOf(value: unknown): Direction {
  return value === "less" || value === "more" ? value : "note";
}

function starsOf(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 5) return null;
  return value;
}

export function plateIdentity(recipe: IdentityInput): PlateRef {
  const kind = recipe.kind === "meal" ? "meal" : "classic";
  const classicId = token(recipe.classicId);
  const regionId = token(recipe.regionId);
  const diet = token(recipe.diet) || "balanced";
  const spiceHeat = token(recipe.spiceHeat) || "medium";
  const mainId = token(recipe.mainId);
  const methodId = token(recipe.methodId);
  const sideId = token(recipe.sideId);
  const ingredientIds = (recipe.ingredients ?? []).map((item) => token(item.id)).filter(Boolean).slice(0, 40);
  if (kind === "meal") {
    return {
      key: `meal:${mainId}:${methodId}:${regionId}:${sideId}:${diet}:${spiceHeat}`,
      title: cleanText(recipe.title, 160) || "Untitled meal",
      family: `meal:${mainId}:${methodId}`,
      kind, classicId, regionId, diet, spiceHeat, mainId, methodId, sideId, ingredientIds,
    };
  }
  return {
    key: `classic:${classicId}:${regionId}:${diet}:${spiceHeat}`,
    title: cleanText(recipe.title, 160) || "Untitled plate",
    family: `classic:${classicId}`,
    kind, classicId, regionId, diet, spiceHeat, mainId, methodId, sideId, ingredientIds,
  };
}

function deviceOf(value: unknown): string {
  const text = cleanText(value, 64).toLowerCase();
  return /^[a-z0-9]{16,64}$/.test(text) ? text : "";
}

function asVote(value: unknown): Vote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Vote>;
  if (!deviceOf(row.device) || !token(row.plateKey) || typeof row.at !== "string") return null;
  const stars = row.stars == null ? null : starsOf(row.stars);
  if (row.stars != null && stars == null) return null;
  return {
    id: cleanText(row.id, 80) || "vote",
    at: cleanText(row.at, 40),
    device: deviceOf(row.device),
    plateKey: token(row.plateKey),
    title: cleanText(row.title, 160) || "Untitled plate",
    family: token(row.family) || token(row.plateKey),
    kind: row.kind === "meal" ? "meal" : "classic",
    classicId: token(row.classicId),
    regionId: token(row.regionId),
    diet: token(row.diet) || "balanced",
    spiceHeat: token(row.spiceHeat) || "medium",
    mainId: token(row.mainId),
    methodId: token(row.methodId),
    sideId: token(row.sideId),
    ingredientIds: Array.isArray(row.ingredientIds) ? row.ingredientIds.map((item) => token(item)).filter(Boolean).slice(0, 40) : [],
    stars,
    want: wantOf(row.want),
    again: againOf(row.again),
  };
}

function asWhy(value: unknown): WhyNote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<WhyNote>;
  if (!deviceOf(row.device) || !token(row.plateKey) || typeof row.at !== "string") return null;
  const wrong = cleanText(row.wrong, 500);
  const change = cleanText(row.change, 500);
  if (wrong.length < 8 || change.length < 8) return null;
  return {
    id: cleanText(row.id, 80) || "why",
    at: cleanText(row.at, 40),
    device: deviceOf(row.device),
    plateKey: token(row.plateKey),
    family: token(row.family) || token(row.plateKey),
    title: cleanText(row.title, 160) || "Untitled plate",
    wrong, change,
    ingredientId: token(row.ingredientId),
    ingredientName: cleanText(row.ingredientName, 80),
    direction: directionOf(row.direction),
  };
}

function latestVotes(votes: readonly Vote[]): Vote[] {
  const map = new Map<string, { vote: Vote; index: number }>();
  votes.forEach((vote, index) => {
    const key = `${vote.plateKey}\n${vote.device}`;
    const prev = map.get(key);
    if (!prev || vote.at > prev.vote.at || (vote.at === prev.vote.at && index > prev.index)) map.set(key, { vote, index });
  });
  return [...map.values()].map((item) => item.vote);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function standingFor(plateKey: string, votes: readonly Vote[], whys: readonly WhyNote[]): PlateStanding | null {
  const history = votes.filter((vote) => vote.plateKey === plateKey);
  if (!history.length) return null;
  const latest = latestVotes(history);
  const sample = latest[latest.length - 1];
  const starred = latest.filter((vote) => vote.stars != null);
  const starSum = starred.reduce((sum, vote) => sum + (vote.stars as number), 0);
  const lowPeople = latest.filter((vote) => vote.stars === 0 || vote.stars === 1).length;
  const whyDevices = new Set(whys.filter((note) => note.plateKey === plateKey).map((note) => note.device));
  const againVotes = latest.filter((vote) => vote.again !== "");
  const wontPeople = againVotes.filter((vote) => vote.again === "wont").length;
  const againPeople = againVotes.length;
  const shelved = againPeople >= SHELVE_PEOPLE && wontPeople >= SHELVE_WONT && wontPeople / againPeople >= SHELVE_SHARE;
  const starAverage = starred.length ? round1(starSum / starred.length) : null;
  const yesPeople = latest.filter((vote) => vote.want === "yes").length;
  const noPeople = latest.filter((vote) => vote.want === "no").length;
  const people = latest.length;
  const wantBalance = people ? (yesPeople - noPeople) / people : 0;
  const againBalance = againPeople ? (againVotes.filter((vote) => vote.again === "will" || vote.again === "staple").length - wontPeople) / againPeople : 0;
  const starPart = starred.length ? starSum / starred.length : 0;
  const showScore = shelved ? -1000 : starPart * 2 + wantBalance * 3 + againBalance * 3;
  const trendingUp = !shelved && starred.length >= 3 && starSum / starred.length >= 4 && yesPeople >= noPeople;
  const trendingDown = !shelved && (lowPeople >= ASK_WHY_PEOPLE || (starred.length >= 3 && starSum / starred.length <= 1.5));
  const plateWhys = whys.filter((note) => note.plateKey === plateKey);
  const amountNotes = plateWhys.filter((note) => note.direction === "less" || note.direction === "more").slice(-40);
  return {
    plateKey,
    title: sample.title,
    family: sample.family,
    kind: sample.kind,
    classicId: sample.classicId,
    regionId: sample.regionId,
    diet: sample.diet,
    spiceHeat: sample.spiceHeat,
    mainId: sample.mainId,
    methodId: sample.methodId,
    sideId: sample.sideId,
    people,
    reports: history.length,
    starAverage,
    starPeople: starred.length,
    lowPeople,
    whyPeople: whyDevices.size,
    askWhy: lowPeople >= ASK_WHY_PEOPLE && whyDevices.size < lowPeople,
    wontPeople,
    againPeople,
    yesPeople,
    noPeople,
    shelved,
    trendingUp,
    trendingDown,
    showScore,
    whys: plateWhys.slice(-12).reverse(),
    amountNotes,
  };
}

function byScore(left: PlateStanding, right: PlateStanding): number {
  return right.showScore - left.showScore || left.title.localeCompare(right.title, "en");
}

export function buildBoard(ledger: CommunityLedger): CommunityBoard {
  const votes = ledger.votes.map(asVote).filter((vote): vote is Vote => !!vote);
  const whys = ledger.whys.map(asWhy).filter((note): note is WhyNote => !!note);
  const keys = [...new Set(votes.map((vote) => vote.plateKey))];
  const plates = keys.map((key) => standingFor(key, votes, whys)).filter((plate): plate is PlateStanding => !!plate);
  const news = ledger.news.filter((item) => item && typeof item.text === "string" && typeof item.at === "string").slice(-40).reverse();
  return {
    label: COMMUNITY_LABEL,
    plates,
    offers: plates.filter((plate) => !plate.shelved && plate.people > 0).sort(byScore),
    trendingUp: plates.filter((plate) => plate.trendingUp).sort(byScore),
    trendingDown: plates.filter((plate) => plate.trendingDown).sort(byScore),
    askWhy: plates.filter((plate) => plate.askWhy).sort(byScore),
    shelved: plates.filter((plate) => plate.shelved).sort((left, right) => right.wontPeople - left.wontPeople || left.title.localeCompare(right.title, "en")),
    news,
  };
}

export interface VoteInput {
  device: unknown;
  plate: IdentityInput;
  stars?: unknown;
  want?: unknown;
  again?: unknown;
}

function plateFromInput(input: IdentityInput): PlateRef | null {
  const plate = plateIdentity(input);
  if (plate.kind === "meal") {
    if (!plate.mainId || !plate.methodId || !plate.regionId || !plate.sideId) return null;
  } else if (!plate.classicId || !plate.regionId) return null;
  return plate;
}

function addNews(news: NewsItem[], item: NewsItem): NewsItem[] {
  if (news.length >= MAX_NEWS) return news;
  return [...news, item];
}

export function submitVote<T extends CommunityLedger>(ledger: T, input: VoteInput, now: string, id: string): { ledger: T; board: CommunityBoard; error?: string; askWhy: boolean } {
  const device = deviceOf(input.device);
  if (!device) return { ledger, board: buildBoard(ledger), error: "This browser could not keep a cook id. The report was not shared.", askWhy: false };
  const plate = plateFromInput(input.plate || { id: "", title: "", classicId: "", regionId: "", diet: "", spiceHeat: "" });
  if (!plate) return { ledger, board: buildBoard(ledger), error: "That plate is missing a classic or a meal. Nothing was saved.", askWhy: false };
  const prior = latestVotes(ledger.votes.map(asVote).filter((vote): vote is Vote => !!vote && vote.plateKey === plate.key && vote.device === device));
  const earlier = prior[0];
  let stars: number | null;
  if (input.stars === undefined) stars = earlier?.stars ?? null;
  else if (input.stars == null || input.stars === "") stars = null;
  else {
    stars = starsOf(input.stars);
    if (stars == null) return { ledger, board: buildBoard(ledger), error: "Stars are a whole number from 0 to 5.", askWhy: false };
  }
  const want = input.want === undefined ? (earlier?.want ?? "") : wantOf(input.want);
  const again = input.again === undefined ? (earlier?.again ?? "") : againOf(input.again);
  if (stars == null && !want && !again) return { ledger, board: buildBoard(ledger), error: "Say yes or no, or give a star, before this is shared.", askWhy: false };
  if (ledger.votes.length >= MAX_VOTES) return { ledger, board: buildBoard(ledger), error: "The cook's book is full. Nothing already saved was deleted.", askWhy: false };
  const before = buildBoard(ledger);
  const vote: Vote = {
    id, at: now, device,
    plateKey: plate.key, title: plate.title, family: plate.family, kind: plate.kind,
    classicId: plate.classicId, regionId: plate.regionId, diet: plate.diet, spiceHeat: plate.spiceHeat,
    mainId: plate.mainId, methodId: plate.methodId, sideId: plate.sideId, ingredientIds: plate.ingredientIds,
    stars, want, again,
  };
  const nextLedger: T = { ...ledger, votes: [...ledger.votes, vote] };
  const after = buildBoard(nextLedger);
  const previous = before.plates.find((item) => item.plateKey === plate.key);
  const current = after.plates.find((item) => item.plateKey === plate.key);
  let news = ledger.news;
  if (current && !previous?.askWhy && current.askWhy) {
    news = addNews(news, { id: `${id}-ask`, at: now, kind: "ask-why", plateKey: plate.key, title: plate.title, text: `Three or more people gave ${plate.title} 0 or 1 star. The cook is asking what went wrong.` });
  }
  if (current && !previous?.shelved && current.shelved) {
    news = addNews(news, { id: `${id}-shelf`, at: now, kind: "shelved", plateKey: plate.key, title: plate.title, text: `${plate.title} stays in the book, but most people said they will not make it again. It is off the default list. The reasons are kept.` });
  }
  if (current && previous?.shelved && !current.shelved) {
    news = addNews(news, { id: `${id}-back`, at: now, kind: "restored", plateKey: plate.key, title: plate.title, text: `${plate.title} is back on the list. Later votes changed the majority. Nothing was thrown away.` });
  }
  if (current && !previous?.trendingUp && current.trendingUp) {
    news = addNews(news, { id: `${id}-up`, at: now, kind: "trending-up", plateKey: plate.key, title: plate.title, text: `${plate.title} is trending well. People who tried it are rating it highly. That is a cook report, not a kitchen test.` });
  }
  if (current && !previous?.trendingDown && current.trendingDown) {
    news = addNews(news, { id: `${id}-down`, at: now, kind: "trending-down", plateKey: plate.key, title: plate.title, text: `${plate.title} is trending poorly. It stays available. The cook is collecting what to change.` });
  }
  const saved: T = { ...nextLedger, news };
  const board = buildBoard(saved);
  const standing = board.plates.find((item) => item.plateKey === plate.key);
  const askWhy = stars === 0 || stars === 1 || again === "wont" || !!standing?.askWhy;
  return { ledger: saved, board, askWhy };
}

export interface WhyInput {
  device: unknown;
  plate: IdentityInput;
  wrong: unknown;
  change: unknown;
  ingredientId?: unknown;
  ingredientName?: unknown;
  direction?: unknown;
}

export function submitWhy<T extends CommunityLedger>(ledger: T, input: WhyInput, now: string, id: string): { ledger: T; board: CommunityBoard; error?: string } {
  const device = deviceOf(input.device);
  if (!device) return { ledger, board: buildBoard(ledger), error: "This browser could not keep a cook id. The note was not shared." };
  const plate = plateFromInput(input.plate || { id: "", title: "", classicId: "", regionId: "", diet: "", spiceHeat: "" });
  if (!plate) return { ledger, board: buildBoard(ledger), error: "That plate is missing a classic or a meal. Nothing was saved." };
  const wrong = cleanText(input.wrong, 500);
  const change = cleanText(input.change, 500);
  if (wrong.length < 8 || change.length < 8) return { ledger, board: buildBoard(ledger), error: "Say what was wrong and what you would change. A few words is enough." };
  if (ledger.whys.length >= MAX_WHYS) return { ledger, board: buildBoard(ledger), error: "The cook's book is full. Nothing already saved was deleted." };
  const note: WhyNote = {
    id, at: now, device, plateKey: plate.key, family: plate.family, title: plate.title,
    wrong, change, ingredientId: token(input.ingredientId), ingredientName: cleanText(input.ingredientName, 80),
    direction: directionOf(input.direction),
  };
  const saved: T = { ...ledger, whys: [...ledger.whys, note] };
  return { ledger: saved, board: buildBoard(saved) };
}

function agreedDirection(notes: readonly WhyNote[]): { direction: "less" | "more"; people: number } | null {
  const latest = new Map<string, WhyNote>();
  notes.forEach((note, index) => {
    if (note.direction === "note" || !note.ingredientId) return;
    const prev = latest.get(note.device);
    if (!prev || note.at > prev.at || (note.at === prev.at && index >= 0)) latest.set(note.device, note);
  });
  const rows = [...latest.values()];
  const less = rows.filter((note) => note.direction === "less").length;
  const more = rows.filter((note) => note.direction === "more").length;
  if (less >= 2 && less > more) return { direction: "less", people: less };
  if (more >= 2 && more > less) return { direction: "more", people: more };
  return null;
}

/** One agreed step, then another if more people say the same thing. Never removes the ingredient. */
export function communityAdjustments(plate: PlateRef, ingredients: readonly { id: string; name: string; amount: number }[], plates: readonly PlateStanding[]): AmountAdjustment[] {
  const adjustments: AmountAdjustment[] = [];
  for (const ingredient of ingredients) {
    const notes = plates.flatMap((item) => (item.family === plate.family || item.plateKey === plate.key) ? item.amountNotes : [])
      .filter((note) => note.ingredientId === ingredient.id);
    const agreed = agreedDirection(notes);
    if (!agreed) continue;
    const steps = Math.min(3, Math.floor(agreed.people / 2));
    const raw = agreed.direction === "less" ? LESS_STEP ** steps : MORE_STEP ** steps;
    const factor = agreed.direction === "less" ? Math.max(0.5, raw) : Math.min(2, raw);
    const name = ingredient.name;
    adjustments.push({
      ingredientId: ingredient.id,
      ingredientName: name,
      factor,
      people: agreed.people,
      direction: agreed.direction,
      because: `${agreed.people} people who cooked a similar plate said ${agreed.direction} ${name}. This is one try beside the template, not a new template.`,
    });
  }
  return adjustments;
}

export function scaleIngredients<T extends { id: string; amount: number }>(ingredients: readonly T[], adjustments: readonly AmountAdjustment[]): T[] {
  const factors = new Map(adjustments.map((item) => [item.ingredientId, item.factor]));
  return ingredients.map((item) => {
    const factor = factors.get(item.id);
    if (factor == null) return { ...item };
    const amount = Math.round(item.amount * factor * 10000) / 10000;
    if (!Number.isFinite(amount) || amount <= 0) return { ...item };
    return { ...item, amount };
  });
}
