/**
 * Whole-word food matching. "chillies" and "chilli" are the same word.
 * "eggplant" is not "egg". A short leftover such as the "s" from "bird's" is ignored.
 */

export function foldFoodWord(word: string): string {
  if (word === "chillies" || word === "chilies" || word === "chilis" || word === "chillie" || word === "chili") return "chilli";
  if (word === "eggs") return "egg";
  if (word === "anchovies") return "anchovy";
  if (word === "tomatoes") return "tomato";
  if (word === "potatoes") return "potato";
  if (word.length > 5 && word.endsWith("oes")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("s") && !/(?:ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

function normaliseFood(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/[’']/g, "").replace(/[^a-z0-9\s-]/g, " ").replace(/[–—-]/g, " ").replace(/\s+/g, " ").trim();
}

function wordsOf(value: string): string[] {
  return normaliseFood(value).split(" ").filter((word) => word.length >= 2).map(foldFoodWord);
}

/** True when every word of the token appears together in the name. One word matches any word, not a substring. */
export function foodWordHit(name: string, token: string): boolean {
  const wanted = wordsOf(token);
  if (wanted.length === 0) return false;
  const words = wordsOf(name);
  if (wanted.length === 1) {
    const one = wanted[0];
    if (words.some((word) => word === one)) return true;
    if (one === "milk" && words.includes("buttermilk")) return true;
    if (one === "wheat" && words.some((word) => word === "wholewheat" || word === "whole-wheat")) return true;
    if (one === "egg" && words.some((word) => word === "eggwhite" || word === "egg-white")) return true;
    return false;
  }
  return words.some((_, index) => wanted.every((word, offset) => words[index + offset] === word));
}
