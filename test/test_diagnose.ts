import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planBootstrap } from "../src/bootstrapPlan.ts";
import { diagnose } from "../src/diagnose.ts";
import type { RepoFacts } from "../src/types.ts";

const facts = (overrides: Partial<RepoFacts> = {}): RepoFacts => ({
  cwd: "/repo",
  rootEntries: ["package.json"],
  packageJson: { name: "demo" },
  sourceFiles: [],
  workflows: [],
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
  const planFor = (input: RepoFacts) =>
    planBootstrap({
      diagnosis: diagnose(input),
      packageJson: input.packageJson,
      rootEntries: input.rootEntries,
      nodeVersion: "24",
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

  it("does not reinstall what is already a dependency", () => {
    const plan = planFor(
      facts({ packageJson: { devDependencies: { eslint: "^10", prettier: "^3" } } }),
    );
    const install = plan.find((action) => action.kind === "install");
    assert.ok(install);
    assert.ok(!install.packages.includes("eslint"));
    assert.ok(!install.packages.includes("prettier"));
  });

  it("proposes no work at all for a repo that already has everything", () => {
    const complete = facts({
      rootEntries: ["package.json", "tsconfig.json", "eslint.config.js", ".prettierrc.json"],
      packageJson: {
        scripts: {
          lint: "eslint .",
          format: "prettier -w .",
          typecheck: "tsc",
          test: "vitest run",
        },
        devDependencies: {
          eslint: "^10",
          "@eslint/js": "^10",
          globals: "^17",
          "typescript-eslint": "^8",
          "eslint-plugin-sonarjs": "^4",
          "eslint-config-prettier": "^10",
          prettier: "^3",
          vitest: "^4",
          typescript: "^6",
          "@types/node": "^24",
        },
      },
      workflows: [{ path: ".github/workflows/ci.yml", content: "run: yarn lint" }],
    });
    assert.deepEqual(planFor(complete), []);
  });

  it("targets the generated workflow at the scripts it is about to add, not today's", () => {
    const plan = planFor(facts());
    const workflow = plan.find(
      (action) => action.kind === "writeFile" && action.path.endsWith("ci.yml"),
    );
    assert.ok(workflow?.kind === "writeFile");
    assert.match(workflow.contents, /npm run lint/);
  });
});
