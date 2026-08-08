# ever-better

[![npm version](https://badge.fury.io/js/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![ci](https://github.com/isamu/ever-better/actions/workflows/ci.yml/badge.svg)](https://github.com/isamu/ever-better/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 日本語

既存のコードベースを、**良くなる方向にしか動かない**状態にするツール。

リポジトリを指定すると、足りない品質ツールを診断して導入し、その時点の違反件数を「天井」として記録します。そのコミット以降、既存コードは免除され、新しく書いたコードだけが全ルールの対象になります。天井は下がることはあっても上がりません。

```bash
npx ever-better diagnose     # 読み取りのみ: 何が足りないか、それが何を意味するか
npx ever-better bootstrap    # 導入して設定ファイルを生成
npx ever-better freeze       # 今日の違反件数を天井として固定
npx ever-better check        # CI のゲート: 件数が増えたら失敗
npx ever-better prune        # 直した分だけ天井を下げる
```

## Claude Code に丸投げする

こちらが本来の使い方です。プラグインを入れて、Claude Code をリポジトリに向けてこう言うだけ:

```
このレポに ever-better を回して
```

診断し、足りないものを導入し、フォーマットし、ベースラインを固定し、そこから**1ルール = 1 PR**でバックログを削っていきます。違反を直し、直すために必要な pure 関数を切り出し、テストを書き、天井を下げながら進みます。

**コードから判断できることは全部自分で決めます。** GitHub issue を立てて先に進むのは、本当に判断が必要な数少ないケースだけです — 挙動が曖昧（throw すべきか、retry か、log か）、公開 API の変更、それ自体がプロジェクト規模のリファクタリング、そしてそのルール自体がこのレポに合っていない可能性がある場合。issue には選択肢と「自分ならこれを選ぶ」まで書きます。

届く PR の順番: フォーマット → ツール導入 → freeze → 以降1ルールずつ。手つかずのリポジトリなら数本では済みません。始める前に知っておく価値があります。

```
/plugin marketplace add isamu/ever-better
/plugin install ever-better
```

スキルは `ever-better-run`（上の無人ループ）、`ever-better`（入口とルーティング）、`ever-better-bootstrap`、`ever-better-freeze`、`ever-better-drain`、`ever-better-dry`。

以下の CLI はこれらのスキルが呼ぶものですが、自分で動かしたい場合はそれだけでも使えます。

## なぜ必要か

古いリポジトリに厳しい linter を入れると4000件のエラーが出て、そのまま revert されます。よくある回避策 — 全部を `warn` にする — では何も強制されず、件数は静かに増え続けます。

ESLint はこれを本体の **bulk suppressions** で解決しました。`--suppress-all` が「どのファイルのどのルールに何件あるか」を記録し、その件数までは黙り、それを超えた分だけをエラーとして報告します。既存の1行も変えずに、全ルールを初日から `error` にできます。

`ever-better` はその周辺を担当します。そもそもどのルールを入れるかを決め、導入し、どこから始めたかを人間が読める形で記録し、数字が増えたら CI を落とす。

ratchet の再実装はしていません。linter でもありません。**あなたの** ESLint を、**あなたの** 設定で実行します。

## インストール

```bash
npm install -g ever-better     # npx でも、yarn add --dev でも可
```

Node 20.11 以上。yarn / npm / pnpm / bun に対応（lockfile から自動判定）。

## フレームワーク

生成される設定は、そのリポジトリが実際に何であるかによって変わります。依存関係から判定し、より具体的なものを優先するので、Next のアプリが「ただの React」として扱われることはありません。

| 判定結果 | 生成される内容 |
| --- | --- |
| **Vue** / **Nuxt** | `eslint-plugin-vue` の flat config、`.vue` を型プログラムに接続、typecheck script は `vue-tsc`、SFC に対しては unsafe-any 系を off |
| **React** | `eslint-plugin-react-hooks` — rules of hooks と exhaustive-deps という、実バグを捕まえるルール |
| **Next** | React 一式 + `@next/eslint-plugin-next` の core-web-vitals、`.next/` を ignore |
| **Svelte** / **Astro** | 検出はするが gap として報告。これらのファイル形式にはまだ未対応 |
| なし | 素の TypeScript / JavaScript |

フロントエンドのリポジトリには browser と node の**両方**の globals を与えます。設定ファイル・スクリプト・テストは Node で動くので、browser のみにすると意味のない `no-undef` が大量に出るためです。

意図的な選択が2つあります。知らないと「抜け」に見えるので明記します:

- **`eslint-plugin-react` は入れません。** peer range が ESLint `^9.7` までで、このツールが導入する ESLint 10 と同時にインストールすると npm が拒否し、**linter が1つも入っていない状態**になります。`eslint-plugin-react-hooks` は 10 に対応していてバグ検出ルールを持っており、残りは主に JSX のスタイルで Prettier が担当します。
- **Vue では `tsc` ではなく `vue-tsc`。** `tsc` は SFC を読めないため、Vue リポジトリの `tsc --noEmit` は exit 0 のまま**全コンポーネントを黙って飛ばします**。

設定ファイルは `package.json` に `"type": "module"` がなければ `eslint.config.mjs` として生成します。中身はどちらでも ESM なので、CommonJS のパッケージで `.js` にすると Node が毎回 reparse して警告を出すためです。

## 各コマンド

### `diagnose`

読み取りのみ。パッケージマネージャ、TypeScript の割合、ESLint / Prettier / テストランナー / knip / jscpd の有無、CI が何をどのプラットフォームで実行しているか、サイズ上限を超えたファイル数、そして各 gap とそれを閉じるフェーズを報告します。

`--write` で `QUALITY.md` と `.ever-better/state.json` を書き出します。`--json` で生の診断結果。

### `bootstrap`

そのリポジトリのパッケージマネージャで不足している devDependencies を導入し、階層構造を持つ flat ESLint 設定を生成し、CI が必要とする `lint` / `format` / `typecheck` / `test` スクリプトを追加し、3プラットフォームの GitHub Actions ワークフローを書きます。

既にある設定ファイルは決して上書きしません。`--dry-run` で計画だけを表示します。

### `freeze`

`eslint --suppress-all` を実行し、その結果のルール別件数を天井として記録して `QUALITY.md` を描画します。`eslint-suppressions.json`、`.ever-better/state.json`、`QUALITY.md` を**まとめて**コミットしてください。

2回目の実行は拒否されます。それをすると「その時点で存在するもの」を天井にしてしまい、前回以降に増えた分を追認することになるからです。天井を下げるには `prune`、ルールを意図的に変更した場合のみ `--force`。

### `check`

CI のゲート。抑制されていないエラーがある場合、または記録済みの件数が天井を超えた場合に失敗します。ワークフローの `lint` の後に追加してください。

### `prune`

免除されていた違反を直すと、その suppression は不要になります。`prune` がそれを回収し、直した分だけ天井を下げます。天井が下がる唯一の経路です。

### `status`

現在のフェーズ、残りの件数、そして残件数が**少ない**ルール — つまり最初に片付けるべきルール — を表示します。

## 成果物

| ファイル | 所有者 | コミットするか |
| --- | --- | --- |
| `eslint-suppressions.json` | ESLint | する — これが天井そのもの |
| `.ever-better/state.json` | ever-better | する — 台帳 |
| `QUALITY.md` | 台帳から描画 | する — 人間向けのビュー |

`QUALITY.md` は毎回再生成されます。`<!-- ever-better:notes:start -->` マーカーの間に書いたものは保持されます。

## Claude Code プラグイン

冒頭に書いたとおり、プラグインが主役で CLI はそれが呼ぶ道具です。この分担は意図的なもので、CLI は毎回同じ結果でなければならない作業（検出・導入・集計・描画・ゲート）を、スキルは判断が要る作業（この警告は本物のバグか、これは重複か偶然か、何を issue にすべきか）を担当します。

## フェーズ

| フェーズ | 内容 | 状態 |
| --- | --- | --- |
| P0 diagnose | 調査し、gap を洗い出す | 実装済み |
| P1 bootstrap | 導入し、設定を生成 | 実装済み |
| P2 freeze | 天井を固定し、CI で守る | 実装済み |
| P3 drain | 1ルールずつ潰す。見つけたバグはテストで固定 | 実装済み |
| P4 tighten | 次の階層のルールを追加して繰り返す | 実装済み |
| P5 split & DRY | 重複とデッドコードを排除 | 実装済み |

価値が出るのは P3 と P5 です。この2つは**原則として全自動**で動きます — 修正・関数の切り出し・テスト追加・孤立ファイルの削除は、聞かずにやります。オーナーの判断が要るリファクタリングだけを GitHub issue にし、その issue には選択肢と「自分ならこれを選ぶ」まで書きます。

## 設計

CLI は決定的な作業 — 検出・導入・集計・描画・ゲート — を担当します。スキルは判断が要る作業 — この警告は本物のバグか、これは重複か偶然か、何を issue にすべきか — を担当します。エージェントが実行するたびに違う答えを出しかねないものは CLI へ、markdown のチェックリストで表現できないものはスキルへ。

ランタイム依存はゼロです。

## ライセンス

MIT
