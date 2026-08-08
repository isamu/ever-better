/**
 * What a config file SAYS and what ESLint actually runs are different things. Preset inheritance,
 * a framework's own config and later blocks all silently drop rules, and a rule that is off
 * reports nothing — so the gap is invisible from the outside and from reading the file.
 *
 * `--print-config` is ESLint's own answer to that question. Everything here works from its output
 * rather than from the config source.
 */
export type PrintedConfig = {
  rules?: Record<string, unknown>;
};

export type HighValueRule = {
  name: string;
  why: string;
  /** What to set it to when strengthening a config that already exists. */
  setting: string;
  /** Needs a type program. Setting one without `project`/`projectService` makes ESLint fatal. */
  typeAware?: boolean;
};

/**
 * Rules worth reporting as off. Each one has cost somebody real bugs — the counts in the linked
 * write-up were 149 unchecked `as` casts and 407 unsafe-any findings in a repo its author believed
 * was already strict.
 */
export const HIGH_VALUE_RULES: readonly HighValueRule[] = [
  {
    name: "@typescript-eslint/no-explicit-any",
    why: "`any` switches off every other type rule",
    setting: '"error"',
  },
  {
    name: "@typescript-eslint/no-unsafe-assignment",
    why: "unvalidated JSON and API responses flow in as `any`",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/no-unsafe-member-access",
    why: "reads through an unchecked `any`",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/no-unsafe-call",
    why: "calls through an unchecked `any`",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/no-unsafe-return",
    why: "leaks `any` back out to callers",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/no-unsafe-argument",
    why: "passes `any` into a typed parameter",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/no-floating-promises",
    why: "a forgotten await fails silently",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/no-misused-promises",
    why: "an async callback where none is awaited",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/await-thenable",
    why: "awaiting a non-promise hides a missing call",
    setting: '"error"',
    typeAware: true,
  },
  {
    name: "@typescript-eslint/consistent-type-assertions",
    why: "`as` asserts what the compiler could not check; it lives in the stylistic preset, not strict",
    setting: '["error", { assertionStyle: "never" }]',
  },
  {
    name: "@typescript-eslint/no-non-null-assertion",
    why: "`!` is an unchecked claim",
    setting: '"error"',
  },
  {
    name: "sonarjs/cognitive-complexity",
    why: "how hard a function is for a human, not a machine",
    setting: '["error", 15]',
  },
  {
    name: "max-lines-per-function",
    why: "the guard that keeps a function comprehensible at a glance",
    setting: '["error", { max: 60, skipBlankLines: true, skipComments: true }]',
  },
  {
    name: "max-lines",
    why: "per-file size; the per-function guards pass while a file reaches 2000 lines",
    setting: '["error", { max: 600, skipBlankLines: true, skipComments: true }]',
  },
  { name: "complexity", why: "branch count", setting: '["error", 20]' },
  { name: "max-depth", why: "nesting", setting: '["error", 4]' },
  { name: "max-params", why: "argument count", setting: '["error", 6]' },
];

const OFF_LEVELS = new Set<number | string>([0, "off"]);

/** ESLint prints a level, or `[level, ...options]`. Both forms have to be read the same way. */
const severityOf = (setting: unknown): number | string | null => {
  const level: unknown = Array.isArray(setting) ? setting[0] : setting;
  if (typeof level === "number" || typeof level === "string") return level;
  return null;
};

export const isRuleOff = (setting: unknown): boolean => {
  const level = severityOf(setting);
  return level === null || OFF_LEVELS.has(level);
};

export const isRuleWarnOnly = (setting: unknown): boolean => {
  const level = severityOf(setting);
  return level === 1 || level === "warn";
};

export type RuleVerdict = {
  rule: HighValueRule;
  state: "off" | "warn";
};

/**
 * Pure: given what ESLint printed, which of the rules that matter are not enforcing anything.
 * `warn` is reported separately because it is a deliberate stop on the way to `error` — but one
 * that stays there forever unless somebody is counting.
 */
export const findWeakRules = (printed: PrintedConfig | null, wanted: readonly HighValueRule[] = HIGH_VALUE_RULES): RuleVerdict[] => {
  if (!printed) return [];
  const rules = printed.rules ?? {};
  return wanted.flatMap((rule): RuleVerdict[] => {
    const setting = rules[rule.name];
    if (isRuleOff(setting)) return [{ rule, state: "off" }];
    if (isRuleWarnOnly(setting)) return [{ rule, state: "warn" }];
    return [];
  });
};
