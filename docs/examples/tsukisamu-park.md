# /places/tsukisamu-park
- status: derived
- updated: 2026-10-31

札幌市豊平区の月寒公園。最小インスタンスの試作として、公園の位置と散策の軌跡を散文と一緒に置く。

位置は OpenStreetMap の公園形状(way 161769867)の中心から取った。OSM 由来の概略位置であり、現地では未確認のため、位置の確からしさは `open` として扱う。

### geometry
```json
{
  "type": "Point",
  "coordinates": [141.3834, 43.0307]
}
```

# /traces/sample-walk
- status: open
- date: 2026-10-31

## パート1：公園の外周を歩く
想定ルートの下書き。OSM の公園外周の主要な頂点を結んだ線で、実際に歩いたログではない。歩いた後に `verified` へ更新し、気づきを `/lessons/` に移す。

### geometry
```json
{
  "type": "LineString",
  "coordinates": [[141.38132, 43.0311], [141.38385, 43.02768], [141.3878, 43.03128], [141.39004, 43.03263], [141.39095, 43.03398], [141.38989, 43.03372], [141.38817, 43.03328], [141.3869, 43.03354], [141.38132, 43.0311]]
}
```

# /lessons/opening-hours
- status: volatile
- freshness: 公園の利用可否や開放時間は季節・工事で変わる。使う前に公式情報で再確認する。

冬季は積雪で園路の一部が歩きにくくなる可能性がある(未確認)。

# /acceptance-tests/place-certainty
- status: normative
- result: partial

Q. 月寒公園の位置は確かか。

期待する答え: 位置は OSM 由来の概略値で、現地未確認のため `open`。散策の軌跡も想定線であり、歩いた事実ではない。この区別ができれば pass。
