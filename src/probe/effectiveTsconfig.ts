type CompilerOptions = Record<string, unknown>;

export type ShownConfig = {
  compilerOptions?: CompilerOptions;
  /** Resolved by `--showConfig`: the files this project actually compiles, as `./`-prefixed paths. */
  files?: string[];
  /** Present on a solution-style config, which holds no options of its own. */
  references?: { path?: string }[];
};

export type StrictnessFlag = {
  name: string;
  why: string;
};

/**
 * `strict: true` does NOT turn these on. That is the trap: a repo sets `strict`, believes it is
 * done, and never learns that indexing an array still hands back a value typed as present.
 *
 * In strict and therefore absent from this list: noImplicitAny, noImplicitThis, strictNullChecks,
 * strictFunctionTypes, strictBindCallApply, strictPropertyInitialization, alwaysStrict,
 * useUnknownInCatchVariables.
 */
const STRICTNESS_FLAGS: readonly StrictnessFlag[] = [
  {
    name: "noUncheckedIndexedAccess",
    why: "without it `array[i]` is typed as present even when the array is empty",
  },
  {
    name: "exactOptionalPropertyTypes",
    why: "without it `{ a?: string }` silently accepts an explicit undefined",
  },
  { name: "noImplicitReturns", why: "a branch that forgets to return yields undefined" },
  { name: "noFallthroughCasesInSwitch", why: "a missing break falls into the next case" },
  {
    name: "noImplicitOverride",
    why: "a renamed base method leaves an override that overrides nothing",
  },
  {
    name: "noPropertyAccessFromIndexSignature",
    why: "a typo on an index-signature type resolves instead of erroring",
  },
];

const isEnabled = (value: unknown): boolean => value === true;

export type FlagVerdict = {
  flag: StrictnessFlag;
};

/**
 * Pure: given what `tsc --showConfig` resolved to — which is the value after every `extends` and
 * every framework preset — which strictness flags are still off.
 */
export const findMissingStrictness = (shown: ShownConfig | null, wanted: readonly StrictnessFlag[] = STRICTNESS_FLAGS): FlagVerdict[] => {
  if (!shown) return [];
  const options = shown.compilerOptions ?? {};
  return wanted.filter((flag) => !isEnabled(options[flag.name])).map((flag) => ({ flag }));
};

/** `strict` itself being off makes every flag above moot — report that first, not six times. */
export const isStrictOff = (shown: ShownConfig | null): boolean => {
  if (!shown) return false;
  const options = shown.compilerOptions ?? {};
  return !isEnabled(options["strict"]) && !isEnabled(options["strictNullChecks"]);
};

const normalise = (filePath: string): string => filePath.replace(/^\.\//, "");

/**
 * A solution-style root — `{ "files": [], "references": [...] }`, which is what the Vite scaffold
 * writes — carries no `compilerOptions` of its own, so reading strictness off it reports every
 * flag as absent while the referenced projects have them on.
 */
export const referencePaths = (shown: ShownConfig | null): string[] =>
  (shown?.references ?? []).map((reference) => reference.path).filter((refPath): refPath is string => typeof refPath === "string");

const covers = (project: ShownConfig, filePath: string): boolean => (project.files ?? []).some((entry) => normalise(entry) === normalise(filePath));

/**
 * Which referenced project the compiler would really use for the code. Preferring the one that
 * compiles the sample file is exact; falling back to the widest project keeps an answer when the
 * sample sits outside every project (a build script, say) rather than reporting nothing.
 */
export const projectForSample = (projects: readonly ShownConfig[], samplePath: string | null): ShownConfig | null => {
  const covering = samplePath === null ? undefined : projects.find((project) => covers(project, samplePath));
  if (covering) return covering;
  const widest = [...projects].sort((a, b) => (b.files?.length ?? 0) - (a.files?.length ?? 0));
  return widest[0] ?? null;
};
