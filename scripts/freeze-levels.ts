import { frozenHash, readCatalog, writeManifest } from "./catalog";

// npm run levels:freeze [-- --through <id>]
// Run before publishing: marks levels as published so gen:levels and validate:levels protect them.
const i = process.argv.indexOf("--through");
const { manifest, levels } = readCatalog();
const through = i >= 0 ? Number(process.argv[i + 1]) : levels.length;
if (!Number.isInteger(through) || through < manifest.frozenThrough || through > levels.length) {
	console.error(`--through must be between ${manifest.frozenThrough} (already frozen) and ${levels.length}`);
	process.exit(1);
}
writeManifest({ ...manifest, frozenThrough: through, frozenHash: frozenHash(levels, through) });
console.log(`Levels 1-${through} frozen.`);
