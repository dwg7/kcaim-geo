# kcaim-geo

テキストが主役、地図は図示の利便。**地誌(geographic documentation)を、1つの Markdown 形式と小さなビューアで書く**ための試みです。

親プロジェクト [dwg7/kcaim](https://github.com/dwg7/kcaim)(Knowledge Co-created with AI, in a single Markdown file)の考え方を、空間の知識へ広げています。

**見てみる**: [ユクエピラチャシ(良好なサンプル)](https://dwg7.github.io/kcaim-geo/viewer.html?kcaim-geo=examples/yukuepira-chashi.md) / [月寒公園](https://dwg7.github.io/kcaim-geo/viewer.html?kcaim-geo=examples/tsukisamu-park.md)

## 考え方

- **正本は Markdown だけ。** データベースも、Office 文書も、PDF も、生成サイトも正本ではありません。
- **文法は設計せず、書きながら育てる。** クラシックな GIS の重い属性スキーマの代わりに、散文と GeoJSON をその場で結びつけます。属性表を取り込むときも、列をそのまま移さず、物語・背景・運用上の注意へほどきます。
- **確からしさを散文に溶かさない。** 知識には必ず、5つの状態のどれかを付けます。
- **質は受け入れテストで測る。** ファイルの大きさではなく、「5状態を区別して答えられるか」で見ます。

## 書き方

`#` が **踏み跡**(1つの知識の単位)、`##` がその中のセクションです。地図に出したいときは、踏み跡の中に `## geometry` を1つだけ置き、標準の GeoJSON Geometry を書きます。

````markdown
# /places/yukuepira-chashi
- status: derived
- updated: 2026-10-31

北海道陸別町にある、アイヌのチャシの史跡。利別川に臨む。

位置は出典の座標から取った概略値で、現地では未確認。

## 出典
- [Yukuepira Chashi — Wikipedia](https://en.wikipedia.org/wiki/Yukuepira_Chashi)

## geometry
```json
{ "type": "Point", "coordinates": [143.735727, 43.464356] }
```
````

- `# /仮想パス` は、ファイル全体で一意にします。
- `- status:` は踏み跡ごとに1つ。ジオメトリは所属する踏み跡の状態を引き継ぎます。
- `## geometry` は1つの踏み跡に高々1つ。`### geometry` は認めません。踏み跡の中の要素ごとに別の位置を付けたいときは、その要素を別の踏み跡に分けます。

### 5つの状態

| 状態 | 意味 |
| --- | --- |
| `verified` | 事実として確認済み |
| `derived` | 出来事や事実から導かれた解釈 |
| `normative` | 守るべき規則・規範 |
| `open` | 未解決の問い・不確かさ |
| `volatile` | 変わりやすい情報(鮮度の記述が要る) |

良好な書き方の見本は [`docs/examples/yukuepira-chashi.md`](docs/examples/yukuepira-chashi.md) です。5状態を踏み跡ごとに分け、出典と確認日を付け、未確認のことは `open` と `volatile` として残しています。

## ビューア

本文を1カラムで流し、読んでいる踏み跡の図形へ地図が付いてきます。ホバーした図形だけが濃くなり、点は先端が座標になるピンで描かれます。

```
viewer.html?kcaim-geo=<md ファイルの URL>
```

公開サイトでは `examples/…` のような相対パスで指定できます。別のサーバーの md を指定するときは、そのサーバーが CORS を許可している必要があります。

地図のスタイルは [stars](https://stars.optgeo.org/) の `bvmap-starlight`(国土地理院の最適化ベクトルタイルがもと)です。

## 開発

```bash
npm install
npm run dev      # /site/viewer.html?kcaim-geo=../docs/examples/yukuepira-chashi.md
npm run build    # site/ から docs/ へ出力
python3 scripts/check_kcaim.py
```

`check_kcaim.py` は、UTF-8、バイナリ混入、仮想パスの一意性、5状態の付与、ジオメトリの規約と妥当性を検査します。

```
AGENTS.md      エージェントへの指示(正本)。CLAUDE.md はこれを読み込むだけ
DECISIONS.md   決めたことと理由
site/          ビューアのソース(Vite + MapLibre GL JS)
docs/          GitHub Pages の配信ルート
  examples/    Markdown のインスタンス(正本)
  viewer.html, assets/   ビルド成果物(手で編集しない)
scripts/       整合性チェック
```

## ライセンス

[CC0 1.0](LICENSE)
