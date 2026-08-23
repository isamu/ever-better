import assert from "node:assert/strict";
import { describe, it } from "node:test";
import prettier from "prettier";
import { DEFAULT_PRINT_WIDTH } from "../src/bootstrapPlan.ts";
import { collapseShortArrays } from "../src/generate/knipConfig.ts";
import { CONFIG_SAMPLES, WORKFLOW_SAMPLES, type Sample } from "../src/generate/samples.ts";

const PARSERS: Record<string, string> = { js: "babel", json: "json", yaml: "yaml" };

const samples: Sample[] = [...CONFIG_SAMPLES, ...WORKFLOW_SAMPLES];

const formattable = samples.filter((sample) => PARSERS[sample.language] !== undefined);

/**
 * Every file `bootstrap` generates, checked against the Prettier config `bootstrap` generates
 * beside it. The generated `eslint.config.js` used to fail its own `prettier/prettier` rule (#66):
 * the `id-length` options were hand-wrapped across four lines and Prettier wanted them on one, so
 * every repository that ran `bootstrap` started with a violation the tool itself had written — in
 * a file whose header says not to edit it. Nothing here read the generated output the way Prettier
 * does, so nothing caught it.
 */
describe("generated files are Prettier-clean", () => {
  formattable.forEach((sample) => {
    it(`${sample.title}`, async () => {
      const formatted = await prettier.format(sample.contents, { parser: PARSERS[sample.language] ?? "", printWidth: DEFAULT_PRINT_WIDTH });
      assert.equal(sample.contents, formatted, `${sample.title} is not what Prettier would write`);
    });
  });

  /** A sample in a language Prettier cannot parse is exempt, so the exempt list has to be visible. */
  it("formats everything except the files Prettier has no parser for", () => {
    assert.deepEqual(
      samples.filter((sample) => PARSERS[sample.language] === undefined).map((sample) => sample.title),
      [".gitattributes"],
    );
    assert.ok(formattable.length > 10, "the sample set shrank; this test is only as wide as it is");
  });
});

describe("collapseShortArrays", () => {
  const json = (value: unknown): string => JSON.stringify(value, null, 2);

  it("puts an array that fits on one line, the way Prettier does", () => {
    assert.match(collapseShortArrays(json({ entry: ["a.ts", "b.ts"] }), 160), /"entry": \["a\.ts", "b\.ts"\]/);
  });

  /**
   * Not rebuilt from its parts — emitted exactly as it arrived. The first version reconstructed
   * these lines and prefixed every element with the field name, which corrupts the file for any
   * repository with enough entry points to wrap.
   */
  it("leaves an array that does not fit exactly as it was", () => {
    const long = json({ entry: Array.from({ length: 12 }, (_, at) => `src/some/quite/long/path/number-${at}/index.ts`) });
    assert.equal(collapseShortArrays(long, 160), long);
  });

  it("keeps the trailing comma when the field is not the last one", () => {
    const collapsed = collapseShortArrays(json({ entry: ["a.ts"], project: ["b.ts"] }), 160);
    assert.match(collapsed, /"entry": \["a\.ts"\],\n/);
    assert.match(collapsed, /"project": \["b\.ts"\]\n/);
  });

  it("leaves a document with no arrays alone", () => {
    const plain = json({ rules: { exports: "warn" } });
    assert.equal(collapseShortArrays(plain, 160), plain);
  });
});
