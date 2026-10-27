import assert from "node:assert/strict";
import { test } from "node:test";
import { exploreRegionProfile, regionTrueIds } from "../lib/region-diversity.ts";
import { buildRegionProfile, REGION_TASTES } from "../lib/region-pantry.ts";

function flavourIds(profile: ReturnType<typeof exploreRegionProfile>): string[] {
  return [...profile.aromatics, ...profile.seasonings, ...profile.finish].map(item => item.id);
}

test("Japanese exploration excludes curry-only seasonings across seeds and heat levels", () => {
  const excluded = ["turmeric", "curry-powder"];
  for (const id of excluded) assert.equal(regionTrueIds("japanese").has(id), false, id);
  for (const heat of ["gentle", "medium", "fiery"] as const) {
    for (let seed = 0; seed < 256; seed++) {
      const ids = flavourIds(exploreRegionProfile("japanese", false, heat, { seed }));
      for (const id of excluded) assert.equal(ids.includes(id), false, `${heat} seed ${seed}: ${id}`);
      assert.ok(ids.includes("yuzu-kosho"), `${heat} seed ${seed}: authored heat missing`);
    }
  }
});

test("sharing a staple does not import another region's authored flavour markers", () => {
  const cases = [
    { region: "french", excludes: ["khmeli-suneli", "lemon-myrtle", "caraway", "allspice", "paprika"] },
    { region: "thai", excludes: ["annatto", "calamansi", "nutmeg", "cloves", "curry-powder"] },
    { region: "cantonese", excludes: ["cumin", "ground-coriander", "lemon-juice"] },
  ];
  for (const { region, excludes } of cases) {
    for (const id of excludes) assert.equal(regionTrueIds(region).has(id), false, `${region}: ${id}`);
    for (let seed = 0; seed < 256; seed++) {
      const ids = flavourIds(exploreRegionProfile(region, false, "hot", { seed }));
      for (const id of excludes) assert.equal(ids.includes(id), false, `${region} seed ${seed}: ${id}`);
    }
  }
});

test("each region retains its own authored core and deterministic seeded variation", () => {
  for (const regionId of ["japanese", "japanese-curry", "french", "thai", "cantonese"]) {
    const region = REGION_TASTES.find(row => row.id === regionId)!;
    const signatures = new Set<string>();
    const seen = new Set<string>();
    for (let seed = 0; seed < 128; seed++) {
      const profile = exploreRegionProfile(regionId, false, "medium", { seed });
      const ids = flavourIds(profile);
      assert.ok(ids.includes(region.heat), `${regionId}: missing authored heat`);
      if (region.simmer?.length) assert.ok(profile.seasonings.some(item => region.simmer!.includes(item.id)), `${regionId}: missing authored simmer core`);
      for (const id of ids) seen.add(id);
      signatures.add([...ids].sort().join(","));
    }
    assert.ok(signatures.size >= 8, `${regionId}: only ${signatures.size} distinct profiles`);
    if (regionId === "japanese-curry") {
      assert.ok(seen.has("turmeric"));
      assert.ok(seen.has("curry-powder"));
    }
    assert.deepEqual(exploreRegionProfile(regionId, false, "medium", { seed: 42 }), exploreRegionProfile(regionId, false, "medium", { seed: 42 }));
  }
});

test("unseeded profiles remain exactly the authored profiles", () => {
  for (const region of REGION_TASTES) {
    for (const heat of ["gentle", "medium", "fiery"] as const) {
      assert.deepEqual(exploreRegionProfile(region.id, false, heat), buildRegionProfile(region.id, false, heat), `${region.id}: ${heat}`);
    }
  }
});
