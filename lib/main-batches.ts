/** Practical small-batch estimates for a domestic 28-30 cm wok; endpoints prevail. */
export function stirFryBatches(mainId: string, rawGramsForFour: number, servings: number, mince = false): { batches: number; range: string; minutes: number } {
  const batches = Math.max(1, Math.ceil(rawGramsForFour * servings / 4 / 250));
  const perBatch = ["chicken", "turkey", "duck"].includes(mainId) ? [3, 5]
    : ["beef", "lamb", "pork", "kangaroo"].includes(mainId) ? mince ? [3, 5] : [2, 3]
    : ["salmon", "white-fish", "prawns", "tuna"].includes(mainId) ? [3, 5]
    : mainId === "aubergine" ? [8, 10]
    : mainId === "cauliflower" ? [6, 8]
    : mainId === "broccoli" ? [5, 7]
    : [4, 6];
  return { batches, range: `${perBatch[0]}\u2013${perBatch[1]}`, minutes: batches * Math.ceil((perBatch[0] + perBatch[1]) / 2) };
}
