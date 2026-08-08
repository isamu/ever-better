import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderSamplesDoc } from "../src/generate/samplesDoc.ts";

const target = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "generated-config.md",
);

await writeFile(target, renderSamplesDoc(), "utf8");
process.stdout.write(`wrote ${target}\n`);
