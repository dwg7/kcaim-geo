# /places/tsukisamu-park
- status: derived
- updated: 2026-10-31

札幌市豊平区の月寒公園。最小インスタンスの試作として、公園の位置と散策の軌跡を散文と一緒に置く。

座標は地図上で目測した概略値であり、現地では未確認。したがって位置の正確さは `open` として扱う。

### geometry
```json
{
  "type": "Point",
  "coordinates": [141.4045, 43.0262]
}
```

# /traces/sample-walk
- status: open
- date: 2026-10-31

## パート1：公園の外周を歩く
想定ルートの下書き。実際に歩いたログではなく、地図上で引いた線である。歩いた後に `verified` へ更新し、気づきを `/lessons/` に移す。

### geometry
```json
{
  "type": "LineString",
  "coordinates": [[141.4020, 43.0250], [141.4035, 43.0268], [141.4062, 43.0272], [141.4070, 43.0255]]
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

期待する答え: 位置は目測の概略値で `open`。散策の軌跡も想定線であり、歩いた事実ではない。この区別ができれば pass。
