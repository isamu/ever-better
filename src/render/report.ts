import { DEFAULT_FILE_LINE_LIMIT } from "../detect/sizes.ts";
import type { Diagnosis, Gap } from "../types.ts";

const check = (value: boolean): string => (value ? "yes" : "no");

const toolingLines = (diagnosis: Diagnosis): string[] => [
  `  package manager   ${diagnosis.packageManager}`,
  `  language          ${diagnosis.language} (${Math.round(diagnosis.typescriptFileRatio * 100)}% TypeScript)`,
  `  framework         ${diagnosis.framework} (globals: ${diagnosis.runtime})`,
  `  eslint            ${diagnosis.tooling.eslint}`,
  `  prettier          ${check(diagnosis.tooling.prettier)}`,
  `  test runner       ${diagnosis.tooling.testRunner}`,
  `  knip / jscpd      ${check(diagnosis.tooling.knip)} / ${check(diagnosis.tooling.jscpd)}`,
  `  agent rules       ${diagnosis.tooling.agentInstructions.join(", ") || "none"}`,
];

const ciLine = (diagnosis: Diagnosis): string => {
  if (!diagnosis.ci.present) return "  ci                none";
  const runners = diagnosis.ci.runners.join(", ") || "unknown runners";
  const steps = [
    diagnosis.ci.runsLint ? "lint" : null,
    diagnosis.ci.runsTypecheck ? "typecheck" : null,
    diagnosis.ci.runsBuild ? "build" : null,
    diagnosis.ci.runsTest ? "test" : null,
  ].filter((step) => step !== null);
  return `  ci                ${runners} [${steps.join(" ") || "no known steps"}]`;
};

const sizeLines = (diagnosis: Diagnosis): string[] => [
  `  source files      ${diagnosis.sizes.total}`,
  `  over ${DEFAULT_FILE_LINE_LIMIT} lines     ${diagnosis.sizes.overFileLimit}`,
  ...diagnosis.sizes.largest.slice(0, 3).map((file) => `                      ${file.lines}  ${file.path}`),
];

const gapLines = (gaps: readonly Gap[]): string[] => {
  if (gaps.length === 0) return ["", "No gaps found. Freeze the baseline and start draining."];
  return ["", `${gaps.length} gap(s):`, ...gaps.flatMap((gap) => [`  [${gap.phase}] ${gap.title}`, `      ${gap.detail}`])];
};

export const renderReport = (diagnosis: Diagnosis): string =>
  ["ever-better diagnose", "", ...toolingLines(diagnosis), ciLine(diagnosis), ...sizeLines(diagnosis), ...gapLines(diagnosis.gaps), ""].join("\n");
