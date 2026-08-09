# ever-better

[![npm version](https://badge.fury.io/js/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![ci](https://github.com/isamu/ever-better/actions/workflows/ci.yml/badge.svg)](https://github.com/isamu/ever-better/actions/workflows/ci.yml)
[![node](https://img.shields.io/node/v/ever-better.svg)](https://www.npmjs.com/package/ever-better)
[![dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen.svg)](package.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](README.md) | 日本語

既存のコードベースを、**良くなる方向にしか動かない**状態にするツール。

足りない品質ツールを診断して導入し、その時点の違反件数を「天井」として記録します。そのコミット以降、既存コードは免除され、新しく書いたコードだけが全ルールの対象になります。天井は下がることはあっても上がりません。

## 使い方: リポジトリごと Claude Code に渡す

これが主役の使い方です。プラグインの導入は最初の1回だけ、どの Claude Code セッションからでも構いません:

```
/plugin marketplace add isamu/ever-better
/plugin install ever-better
```

あとは、良くしたいリポジトリに `cd` して、**そこで** Claude Code を起動し、こう言うだけです:

```
このレポに ever-better を回して
```

準備はこれで全部です。対象リポジトリ側に事前設定は要りませんし、CLI を自分で入れる必要もありません（スキルが `npx` 経由で呼びます）。

### この一言で何が起きるか

診断し、足りないものを導入し、フォーマットし、ベースラインを固定し、そこから**1ルール = 1 PR**でバックログを削っていきます。違反を直し、直すために必要な pure 関数を切り出し、テストを書き、天井を下げながら進みます。

**コードから判断できることは全部自分で決めます。** GitHub issue を立てて先に進むのは、本当に判断が必要な数少ないケースだけです — 挙動が曖昧（throw すべきか、retry か、log か）、公開 API の変更、それ自体がプロジェクト規模のリファクタリング、そしてそのルール自体がこのレポに合っていない可能性がある場合。issue には選択肢と「自分ならこれを選ぶ」まで書きます。

届く PR の順番: フォーマット → ツール導入 → freeze → 以降1ルールずつ。手つかずのリポジトリなら数本では済みません。始める前に知っておく価値があります。

### 全部ではなく一部だけ頼む

上の一言は「無人で全部」の起動です。もっと狭く頼めば、その範囲のスキルに自動で振り分けられます（スキル名を自分で指定する必要はありません）:

| こう言うと | こうなる |
| --- | --- |
| 「このレポに ever-better を回して」「きれいにして」「全部やっておいて」 | 全工程を無人で — `ever-better-run` |
| 「この repo の品質を上げたい」「何から手を付ければいい？」 | 診断してフェーズごとに案内 — `ever-better` |
| 「CLAUDE.md を整えて」「規約を追加して」 | `ever-better-prepare` |
| 「TypeScript にしたい」「ts化して」 | `ever-better-migrate` |
| 「lint を入れて」「eslint 設定して」 | `ever-better-bootstrap` |
| 「ベースラインを固定して」「既存のエラーは許して新しいのだけ止めたい」 | `ever-better-freeze` |
| 「バックログを潰して」「リファクタリングして」 | `ever-better-drain` |
| 「重複を消して」「dead code を消して」 | `ever-better-dry` |

### この README を読ませるのとは別物です

このページを Claude Code に読ませても、渡るのはコマンドだけで、**プロセスは渡りません** — この違反は本物のバグか、直すべきか issue にすべきか、どこで止まって聞くべきか、work log に何を書くか。その部分はスキルにあり、スキルはプラグインで入ります。

## なぜ必要か

古いリポジトリに厳しい linter を入れると4000件のエラーが出て、そのまま revert されます。よくある回避策 — 全部を `warn` にする — では何も強制されず、件数は静かに増え続けます。

ESLint はこれを本体の **bulk suppressions** で解決しました。`--suppress-all` が「どのファイルのどのルールに何件あるか」を記録し、その件数までは黙り、それを超えた分だけをエラーとして報告します。既存の1行も変えずに、全ルールを初日から `error` にできます。

`ever-better` はその周辺を担当します。そもそもどのルールを入れるかを決め、導入し、どこから始めたかを人間が読める形で記録し、数字が増えたら CI を落とす。

ratchet の再実装はしていません。linter でもありません。**あなたの** ESLint を、**あなたの** 設定で実行します。

## CLI を自分で叩く

上のスキルが呼んでいるのがこの CLI です。自分で動かしたい場合はそれだけでも使えます。

```bash
npx ever-better diagnose     # 読み取りのみ: 何が足りないか、それが何を意味するか
npx ever-better bootstrap    # 導入して設定ファイルを生成
npx ever-better freeze       # 今日の違反件数を天井として固定
npx ever-better check        # CI のゲート: 件数が増えたら失敗
npx ever-better next         # 何から潰すか、そしてそれが何を enforce するか
npx ever-better prune        # 直した分だけ天井を下げる
```

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

bootstrap が書くファイルの実物は **[docs/generated-config.md](docs/generated-config.md)** にあります。
ジェネレータそのものから生成しているので、実装とずれません。

## 各コマンド

### `diagnose`

読み取りのみ。パッケージマネージャ、TypeScript の割合、ESLint / Prettier / テストランナー / knip / jscpd の有無、CI が何をどのプラットフォームで実行しているか、サイズ上限を超えたファイル数、そして各 gap とそれを閉じるフェーズを報告します。

`--write` で `QUALITY.md` と `.ever-better/state.json` を書き出します。`--json` で生の診断結果。

### `bootstrap`

そのリポジトリのパッケージマネージャで不足している devDependencies を導入し、この手法が依存する**4つの層**を生成します。それぞれ、他の層には見えないものを見ます:

| 層 | ツール | 見えるもの |
| --- | --- | --- |
| 関数の大きさ・複雑度 | ESLint コアルール | 長い関数、深いネスト、分岐過多 |
| 型と可読性 | SonarJS + `strictTypeChecked` | 危険な `any`、認知的複雑度 |
| ファイル横断の重複 | jscpd → Code Scanning | linter には見えないコピペ |
| デッドコード | knip | 誰も import しない export、孤立ファイル |

あわせて CI が必要とする `lint` / `format` / `typecheck` / `test` / `knip` スクリプト、3プラットフォームのワークフロー、`.gitattributes`、`.prettierignore`、そして `dependabot.yml` を書きます。最後のものは、ever-better が見なくなった後もピン留めした action バージョンを最新に保つためです。

既にある設定ファイルは決して上書きしません — そこに書かれた例外には、ファイルに書かれていない理由があるからです。唯一の例外は行ベースの `.prettierignore` で、これは追記します。`--dry-run` で計画だけを表示します。

### `freeze`

`eslint --suppress-all` を実行し、その結果のルール別件数を天井として記録して `QUALITY.md` を描画します。`eslint-suppressions.json`、`.ever-better/state.json`、`QUALITY.md` を**まとめて**コミットしてください。

2回目の実行は拒否されます。それをすると「その時点で存在するもの」を天井にしてしまい、前回以降に増えた分を追認することになるからです。天井を下げるには `prune`、ルールを意図的に変更した場合のみ `--force`。

### `check`

CI のゲート。抑制されていないエラーがある場合、または記録済みの件数が天井を超えた場合に失敗します。ワークフローの `lint` の後に追加してください。

### `next`

```bash
ever-better next
ever-better next --json
```

**潰す順番を、勘ではなく計算で出します。** suppressions ファイルは件数を**ファイル単位・ルール単位**で持っていて、ratchet も同じ粒度で効きます — あるファイルにそのルールの suppression が残っていなければ、そのファイルでは次の1件で落ちます（そのルールの総数が他にどれだけ残っていても関係ありません）。つまり問うべきは「どのルールが一番少ないか」ではなく「**どの修正が一番多くを enforce するか**」で、`next` はそれを4つのリストで答えます:

| セクション | 何のためか |
| --- | --- |
| take these first | あと1〜2件で clean になるファイル。1回の修正で、そのファイルのそのルールが恒久的に enforce される |
| rules by files to touch | 「3ファイルに40件」と「31ファイルに38件」は `status` では同じ大きさ、作業量は10倍違う |
| the last files carrying a rule in their directory | 誰もやり切らなかったディレクトリの残り |
| leave these until last | 件数がバックログではなく再設計になっているファイル |

出しているのは「そのルールを**まだ持っている**最後のファイル」であって、「そのディレクトリの残りが clean」ではありません — ESLint が一度も見ていないファイルにもエントリは無く、このファイルの計算だけでは両者を区別できないからです。

### `prune`

免除されていた違反を直すと、その suppression は不要になります。`prune` がそれを回収し、直した分だけ天井を下げます。天井が下がる唯一の経路です。

### `log`

```bash
ever-better log --kind drained  --rule max-depth "6件、うち1件は本物のバグ"
ever-better log --kind deferred --rule max-lines "router.ts が1400行。分割はそれ自体がプロジェクト"
ever-better log --kind issue    --rule no-floating-promises "#42 を起票 — 挙動は製品判断"
```

現在の commit を添えて記録します。効くのは `deferred` です。`QUALITY.md` の **Carried over** チェックリストに、見た時点の commit 付きで出ます。「router.ts は分割が必要」というメモは、400コミット後には*いつ真だったのか*が分からなければ役に立たないからです。

### `migrate`

```bash
ever-better migrate                              # 依存順の移行計画
ever-better migrate --all                        # レポ全体を一括改名、コスト付き
ever-better migrate --file src/util/text.js      # 1ファイル改名、コスト付き
```

JavaScript から TypeScript へ。まず `allowJs` + `checkJs: false` の `tsconfig.json` を書いて「今のまま」コンパイルが通る状態を作り、そこから `--all` で一括、または1ファイルずつ改名して**型エラーが何件増えたか**を報告します。

**lint エラーは止まる理由になりません。** それこそが ratchet の役目です。`freeze` が ceiling として記録し、その後ルール単位で下げていきます。このレポでは正当なパターンに反応するルールがあるなら、それは移行ではなく設定の判断です。

**grandfather できないのは型エラーだけです。** `--suppress-all` が効くのは lint 違反で、コンパイラには相当物がありません。だから `--all` は改名のコストを数えて目の前に出します。ビルドを止めるものを直すか、緩い `tsconfig.json` から始めて `ever-better strictness`（各フラグのコストを有効化前に計測します）で締めていくかを選べます。

**`--file` は依存順**（import グラフから計算）で進みます。エラーを少しずつ受け取りたいレポ向けです。import 先がまだ JavaScript のファイルに型を付けるのは `any` に対して型を付けることで、依存側が型付けされた後にやり直しになります。

### `catalog`

```bash
ever-better catalog
```

`docs/shared-helpers.md` を書き出します。export された全関数を、ディレクトリごとに、doc コメントの先頭1文付きで一覧にします。CLAUDE.md からここを指してください。

2つのスキャンの隙間を埋めるものです。linter は1ファイルの中しか見えず、重複検出は「テキストとして似ている」段階になって初めて気づきます。同じ発想を独立に実装した2つは、たいてい似ていません。**同じ関数が6回目の名前で書かれている**ことを報告できるものは他にありません。

### `emit-diff`

```bash
ever-better emit-diff                  # HEAD と比較
ever-better emit-diff --against main
```

作業ツリーと git ref をそれぞれコンパイルし、**生成された JavaScript** を比較します。

型だけを動かすリファクタリング — 引数の型を狭める、`as` を消す、interface を分割する — はコンパイル時に消えます。出力がバイト単位で同一なら、その変更が振る舞いを変え得ないことが**証明**されます。どれだけテストを書いてもここまで強くは言えませんし、所要時間は数秒です。差分が出た場合は、出たファイルがそのまま「見るべき場所」になります。

### `status`

現在のフェーズ、残りの件数、そして残件数が**少ない**ルール — つまり最初に片付けるべきルール — を表示します。診断から30日超・50コミット超、あるいは記録した commit がこの履歴に無い（rebase / force-push）場合は、先頭に `STALE` 行が出ます。ratchet 自体は陳腐化しません（ESLint が現ツリーに対して維持するため）が、gap 一覧・ファイルサイズ・見送りメモは陳腐化します。

## 成果物

| ファイル | 所有者 | コミットするか |
| --- | --- | --- |
| `eslint-suppressions.json` | ESLint | する — これが天井そのもの |
| `.ever-better/state.json` | ever-better | する — 台帳 |
| `QUALITY.md` | 台帳から描画 | する — 人間向けのビュー |

`QUALITY.md` は毎回再生成され、台帳から描画された4つのセクションを持ちます: フェーズをチェックボックスにし残件の少ないルールを子項目にした **Worklist**、意図的に見送ったリファクタリングの **Carried over**、**Ratchet** 表、そして **Work log**。`<!-- ever-better:notes:start -->` マーカーの間に書いたものは保持されます。

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
