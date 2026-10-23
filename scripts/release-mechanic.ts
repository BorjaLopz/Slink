import { DEBUT_SPACING } from "../src/generator/curriculum";
import { REGISTRY } from "../src/mechanics";
import { readCatalog, writeManifest } from "./catalog";

// npm run mechanic:release -- <id>
// Appends a finished mechanic to the timeline. It debuts on the first unpublished level, and never
// closer than DEBUT_SPACING to the previous debut so two mechanics are not taught at once.
const id = process.argv[2];
if (!id || !REGISTRY[id]) {
	console.error(`usage: npm run mechanic:release -- <id>   (registered: ${Object.keys(REGISTRY).join(", ")})`);
	process.exit(1);
}

const { manifest } = readCatalog();
if (manifest.timeline.some((e) => e.id === id)) {
	console.error(`"${id}" is already in the timeline`);
	process.exit(1);
}
const lastDebut = Math.max(0, ...manifest.timeline.map((e) => e.debut));
const debut = Math.max(manifest.frozenThrough + 1, lastDebut + DEBUT_SPACING);
writeManifest({ ...manifest, timeline: [...manifest.timeline, { id, debut }] });
console.log(`"${id}" debuts at level ${debut}. Next: npm run gen:levels -- --from ${debut} --count <n> --force`);
