# diagnose の誤検知3件

issue: #61

`@mulmocast/deck-web` に `diagnose` をかけて7件のギャップが出たうち、**3件が誤検知**だった。
どれもリポジトリ側は正しく設定できている。共通しているのは、3件とも
**ファイル内容からの推測**で外していること — `eslint --print-config` に基づく指摘は正確だった。

`diagnose` の価値は「読まずに信じられること」なので、誤検知は機能欠落より高くつく。
最上位の `strict` を外すと、その下の判断が全部ずれる。

## 3本に分ける

互いに独立で単独 revert 可能なので PR を分ける。各 PR は**修正前に落ちるテストを先に足す**。

| # | 症状 | 場所 | 直し方 |
|---|---|---|---|
| 1 | `yarn run lint` を CI 検出が取りこぼす | `src/detect/ci.ts` | `run` を全マネージャで任意にする |
| 2 | `tsx --test` を test runner 検出が取りこぼす | `src/detect/tooling.ts` | 実行ファイル名ではなく `--test` フラグを見る |
| 3 | solution-style tsconfig で `strict` off と誤報 | `src/probe/gather.ts` | references を辿り、対象ソースを含む project を見る |

## 1: `run` は全マネージャで任意

```js
new RegExp(`(yarn|npm run|pnpm|bun run)\s+${script}\b`)
```

`run` を消費する枝が `npm run` / `bun run` にしか無いので `yarn run lint` / `pnpm run lint` が
落ちる。Vite の scaffold が書くのはこの形。

境界も `\b` から `(?![\w-])` に変えた。`\b` は `test-setup` の `test` にもマッチしてしまう。
`:` は同じ tier の名前空間（`lint:fix` は lint）、`-` は別スクリプト（`test-setup` は test ではない）
という区別が `\b` にはできない。

## 2: 見るべきは `--test` フラグ

`node --test` という文字列を要求しているが、node:test は tsx / ts-node / type-stripping 経由でも
走る。`tsx --test`、`node --experimental-strip-types --test` が全部落ちる。

`--test-dir` のような別フラグを拾わないよう境界に注意する。

## 3: solution-style tsconfig ← 影響が一番大きい

`probeTsconfig` は `-p` 無しで `tsc --showConfig` する。ルートが references だけの
solution-style だと自分自身は `compilerOptions` を持たない:

```json
{ "compilerOptions": {}, "references": [{ "path": "./tsconfig.app.json" }, ...] }
```

これで `strict` off と読むが、参照先は `strict: true`。**Vite の Vue / React scaffold の既定形**
なので Vite 製プロジェクト全般に当たる。

`--showConfig -p <ref>` は解決済みの `files` 配列を返すので、**サンプルソースファイルを含む
参照先**を選べば「そのコードにコンパイラが実際に使う設定」が取れる。eslint 側で
`sampleSourceFile` がやっているのと同じ考え方で、entry point も一つに揃う。

参照解決は I/O なので `src/probe/gather.ts` に置き、`effectiveTsconfig.ts` は純粋なまま保つ
（「Pure decisions, one impure gatherer」）。

## 検証

単体テストに加えて、**修正版 CLI を実物の deck-web にかけて誤報が消えることを確認する**。
1 は確認済み: `ci ... [no known steps]` → `ci ... [lint typecheck build test]`。
