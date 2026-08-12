import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planBootstrap } from "../src/bootstrapPlan.ts";
import { diagnose } from "../src/diagnose.ts";
import type { RepoFacts } from "../src/types.ts";

const facts = (overrides: Partial<RepoFacts> = {}): RepoFacts => ({
  cwd: "/repo",
  rootEntries: ["package.json"],
  allFiles: ["package.json"],
  packageJson: { name: "demo" },
  sourceFiles: [],
  workflows: [],
  probes: { rules: null, tsconfig: null },
  ...overrides,
});

const gapIds = (input: RepoFacts): string[] => diagnose(input).gaps.map((gap) => gap.id);

describe("diagnose", () => {
  it("survives a repository that has nothing at all", () => {
    const result = diagnose(facts());
    assert.equal(result.packageManager, "npm");
    assert.equal(result.language, "javascript");
    assert.ok(result.gaps.length > 0);
  });

  it("names every missing foundation on a bare repo", () => {
    const ids = gapIds(facts());
    for (const expected of ["eslint", "typescript", "prettier", "test-runner", "ci"]) {
      assert.ok(ids.includes(expected), `expected gap ${expected}, got ${ids.join(", ")}`);
    }
  });

  it("reports a legacy eslintrc as a gap rather than as configured", () => {
    const ids = gapIds(facts({ rootEntries: ["package.json", ".eslintrc.js"] }));
    assert.ok(ids.includes("eslint"));
  });

  it("does not raise the TypeScript gap once the repo is typed", () => {
    const ids = gapIds(
      facts({
        rootEntries: ["package.json", "tsconfig.json"],
        sourceFiles: [{ path: "src/a.ts", lines: 10, ext: "ts" }],
      }),
    );
    assert.ok(!ids.includes("typescript"));
    assert.ok(!ids.includes("typescript-partial"));
  });

  it("raises the partial-migration gap for a half-converted repo", () => {
    const ids = gapIds(
      facts({
        rootEntries: ["package.json", "tsconfig.json"],
        sourceFiles: [
          { path: "src/a.ts", lines: 10, ext: "ts" },
          { path: "src/b.js", lines: 10, ext: "js" },
        ],
      }),
    );
    assert.ok(ids.includes("typescript-partial"));
  });

  it("keeps the size backlog out of the gaps when every file is small", () => {
    const ids = gapIds(facts({ sourceFiles: [{ path: "src/a.js", lines: 10, ext: "js" }] }));
    assert.ok(!ids.includes("file-size"));
  });
});

describe("planBootstrap", () => {
  const planFor = (input: RepoFacts, prettierIgnore: string | null = null) =>
    planBootstrap({
      diagnosis: diagnose(input),
      packageJson: input.packageJson,
      rootEntries: input.rootEntries,
      allFiles: input.allFiles,
      sourceFiles: input.sourceFiles,
      nodeVersion: "24",
      prettierIgnore,
    });

  it("installs, adds scripts and writes configs for a bare repo", () => {
    const kinds = planFor(facts()).map((action) => action.kind);
    const unique = [...new Set(kinds)].sort((a, b) => a.localeCompare(b));
    assert.deepEqual(unique, ["addScripts", "install", "writeFile"]);
  });

  it("never overwrites an ESLint config that already exists", () => {
    const plan = planFor(facts({ rootEntries: ["package.json", "eslint.config.js"] }));
    const written = plan.filter((action) => action.kind === "writeFile").map((a) => a.path);
    assert.ok(!written.includes("eslint.config.js"));
  });

  const scriptsFrom = (input: RepoFacts): Record<string, string> => {
    const action = planFor(input).find((step) => step.kind === "addScripts");
    return action?.kind === "addScripts" ? action.scripts : {};
  };

  /**
   * The knip script used to be keyed on the knip *dependency*, which comes apart from the script in
   * both directions — and one of those directions silently overwrote something somebody wrote.
   */
  it("never replaces a knip script the repo already has", () => {
    const withScript = facts({ packageJson: { scripts: { knip: "knip --production" } } });
    assert.equal(scriptsFrom(withScript)["knip"], undefined);
  });

  /**
   * An empty script is how a script gets disabled without being deleted. Guarding on truthiness
   * rather than on presence treated it as absent and replaced it — and the same guard was on
   * `format:check`, which no finding mentioned.
   */
  it("never replaces a script that is present but empty", () => {
    const emptied = facts({ packageJson: { scripts: { knip: "", "format:check": "" } } });
    assert.equal(scriptsFrom(emptied)["knip"], undefined);
    assert.equal(scriptsFrom(emptied)["format:check"], undefined);
  });

  it("adds the knip script when knip is installed but nothing runs it", () => {
    // Otherwise the generated dead-code workflow runs `<pm> knip || true` against a missing
    // script: the scan reports nothing forever, which reads exactly like a clean inventory.
    const withDependency = facts({ packageJson: { devDependencies: { knip: "^6" } } });
    assert.equal(scriptsFrom(withDependency)["knip"], "knip");
  });

  it("does not reinstall what is already a dependency", () => {
    const plan = planFor(facts({ packageJson: { devDependencies: { eslint: "^10", prettier: "^3" } } }));
    const install = plan.find((action) => action.kind === "install");
    assert.ok(install);
    assert.ok(!install.packages.includes("eslint"));
    assert.ok(!install.packages.includes("prettier"));
  });

  it("writes a gate workflow even when the repo already has CI", () => {
    // Its own file, never a step spliced into a pipeline this tool did not write. A repo with
    // thorough CI that never runs `check` enforces nothing at all.
    const withCi = facts({
      workflows: [{ path: ".github/workflows/ci.yml", content: "run: yarn lint" }],
    });
    const written = planFor(withCi)
      .filter((action) => action.kind === "writeFile")
      .map((action) => action.path);
    assert.ok(written.includes(".github/workflows/ever-better.yml"));
  });

  it("does not add the gate twice when CI already runs it", () => {
    const wired = facts({
      workflows: [{ path: ".github/workflows/x.yml", content: "run: npx ever-better check" }],
    });
    const written = planFor(wired)
      .filter((action) => action.kind === "writeFile")
      .map((action) => action.path);
    assert.ok(!written.includes(".github/workflows/ever-better.yml"));
  });

  it("writes .gitattributes, without which Windows CI reports every file as unformatted", () => {
    const written = planFor(facts())
      .filter((action) => action.kind === "writeFile")
      .map((action) => action.path);
    assert.ok(written.includes(".gitattributes"));
  });

  it("leaves an existing .gitattributes alone", () => {
    const plan = planFor(facts({ rootEntries: ["package.json", ".gitattributes"] }));
    const written = plan.filter((action) => action.kind === "writeFile").map((a) => a.path);
    assert.ok(!written.includes(".gitattributes"));
  });

  it("writes a Prettier config wide enough not to fight the code it lints", () => {
    const plan = planFor(facts());
    const written = plan.filter((action) => action.kind === "writeFile");
    const config = written.find((action) => action.path === ".prettierrc.json");
    assert.ok(config?.kind === "writeFile");
    assert.deepEqual(JSON.parse(config.contents), { printWidth: 160 });
  });

  it("leaves an existing Prettier config alone", () => {
    const plan = planFor(facts({ rootEntries: ["package.json", ".prettierrc"] }));
    const written = plan.filter((action) => action.kind === "writeFile").map((a) => a.path);
    assert.ok(!written.includes(".prettierrc.json"));
  });

  it("writes a .prettierignore that excludes what ever-better generates", () => {
    // Without it the first `diagnose --write` turns format:check red on a file the developer
    // never touched: JSON.stringify always expands arrays that Prettier collapses.
    const plan = planFor(facts());
    const written = plan.filter((action) => action.kind === "writeFile");
    const ignore = written.find((action) => action.path === ".prettierignore");
    assert.ok(ignore?.kind === "writeFile");
    assert.match(ignore.contents, /\.ever-better\//);
    assert.match(ignore.contents, /eslint-suppressions\.json/);
  });

  it("proposes no work at all for a repo that already has everything", () => {
    const complete = facts({
      rootEntries: ["package.json", "tsconfig.json", "eslint.config.js", ".prettierrc.json", ".gitattributes"],
      allFiles: [".github/dependabot.yml", ".github/workflows/ci.yml", ".github/workflows/codex-review.yml", "knip.json"],
      packageJson: {
        scripts: {
          lint: "eslint .",
          format: "prettier -w .",
          typecheck: "tsc",
          test: "vitest run",
          knip: "knip",
          "format:check": "prettier --check .",
        },
        devDependencies: {
          eslint: "^10",
          "@eslint/js": "^10",
          globals: "^17",
          "typescript-eslint": "^8",
          "eslint-plugin-sonarjs": "^4",
          "eslint-config-prettier": "^10",
          "eslint-plugin-prettier": "^5",
          "eslint-plugin-import-x": "^4",
          "eslint-plugin-security": "^4",
          knip: "^6",
          prettier: "^3",
          vitest: "^4",
          typescript: "^6",
          "@types/node": "^24",
        },
      },
      workflows: [
        {
          path: ".github/workflows/ci.yml",
          content: "run: yarn lint\nrun: npx jscpd .\nrun: npx ever-better check",
        },
      ],
    });
    assert.deepEqual(planFor(complete, ".ever-better/\nQUALITY.md\neslint-suppressions.json\n"), []);
  });

  it("targets the generated workflow at the scripts it is about to add, not today's", () => {
    const plan = planFor(facts());
    const workflow = plan.find((action) => action.kind === "writeFile" && action.path.endsWith("ci.yml"));
    assert.ok(workflow?.kind === "writeFile");
    assert.match(workflow.contents, /npm run lint/);
  });
});
