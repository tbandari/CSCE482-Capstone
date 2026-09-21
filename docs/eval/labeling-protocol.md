# Place-resolution labeling protocol

How Team Adobe hand-labels three weeks of real location history so we can report
an honest place-resolution accuracy number instead of a synthetic one.

Read this before you label anything. The rules exist so that five people
labeling separately produce one consistent dataset.

## The short version

1. Label **your own data only**. Nobody looks at anyone else's history.
2. Label every visit **≥ 10 minutes** in your three-week window.
3. Pick the candidate you were actually *at*. If you can't tell, it's `null` — write a note.
4. Files go in `backend/evaluation/data/real/`. That directory is **gitignored**. Never commit it.
5. Run `cd backend && python -m evaluation.places evaluation/data/real/<you>.jsonl`.

## Why it's split this way

The visits are our own movements for the past three weeks: where we sleep, who we
visit, which doctor we see. That is exactly the data Orbit promises to keep on the
user's device, so the evaluation set cannot become the one place it leaks.

Each person labels their own file, keeps it on their own machine, and shares only
the *metrics* the harness prints. This keeps us inside the IRB protocol, and it
also gets better labels: you know which building you were in, and a teammate
staring at a dot on a map does not.

## Who labels what

| Person | File | Window |
| --- | --- | --- |
| George Dai | `backend/evaluation/data/real/george.jsonl` | 3 weeks ending the Sunday before the Iteration 2 demo |
| Zayd Nadir | `.../zayd.jsonl` | same |
| Tanish Bandari | `.../tanish.jsonl` | same |
| Hussam Makhoul | `.../hussam.jsonl` | same |
| Roger Liu | `.../roger.jsonl` | same |

Use the same three-week window so seasonal effects (midterms, game weekends) hit
everyone equally.

**Target:** at least 60 labeled visits each, ~300 across the team. Below about 50
per person the per-category numbers are too thin to mean anything.

## Which visits to label

Label **every** visit of 10 minutes or longer in the window. Every one, in order,
no skipping.

Skipping the awkward ones is the fastest way to a number that looks good and
predicts nothing. If a visit is hard to label, that is a visit the ranker will
also find hard, and the honest answer is `null` with a note — not omission.

Visits under 10 minutes are out of scope: stay detection already requires 10
minutes (`min_duration_ms` in `backend/app/stays.py`), so they never reach the
resolver.

## Decision rules

Apply these in order. When two rules collide, the earlier one wins.

**1. Pick what you were doing, not what the polygon says.**
The truth is the place whose purpose you were there for. Sitting in the Evans
Library coffee bar for two hours reading is `Evans Library` if you were there to
study, the cafe if you were there to meet someone for coffee. You know which.

**2. Multi-tenant buildings: label the specific place if you can name it.**
In a strip mall, the truth is the individual shop. If the shop isn't among the
candidates but the building is, use the building and note `"specific tenant
missing from OSM"`. If neither is there, `null`.

**3. Campus buildings: the building, not the room.**
Zachry is `Zachry Engineering Complex` whether you were in a lecture hall, the
lab or the lobby. We do not have indoor resolution and will not pretend to.

**4. Home and work are `null` unless they are a real OSM place.**
Your apartment is not a place in OSM, so it gets `null` with the note `"home"`.
The same for a friend's house. If you work somewhere with a real OSM entry (a
department office, a shop), label it normally.

This is a deliberate limitation, not an oversight: home and work matter enormously
for the interest profile and we handle them with a different mechanism (frequency,
not OSM lookup). Mixing them in here would inflate accuracy on visits the
place-resolver is not meant to answer.

**5. Parking, roads and transit are `null`.**
A visit centred on a parking lot is `null` with the note `"parking"` even when a
`parking` candidate is on offer — you parked on your way somewhere, you did not
visit the lot. Same for being stuck in traffic, or waiting at a bus stop.

*Exception:* if you genuinely spent the time in the lot (tailgating before a
game), label the lot.

**6. Unsure → `null`, always with a note.**
"I think that was the Chick-fil-A but it might have been the Starbucks next door"
is a `null` with that sentence in `notes`. Guessing pollutes both the accuracy
number and the error analysis, and the note is what lets us revisit it later.

**7. Truth must be one of the candidates, or `null`.**
The loader enforces this. If the right place exists in the world but is not in
the candidate list, that is a **recall failure of the OSM import**, not of the
ranker: use `null` and note `"correct place not in candidates: <name>"`. Zayd
needs those notes to know whether the import radius or the OSM extract is the
problem.

## Double-labeling and agreement

**10% of each person's visits get labeled twice**, by the owner and by one other
person — because the owner cannot see their own inconsistencies, and a protocol
nobody has tested on a second reader is just a preference.

The second labeler works from the visit and candidates **only**: no map history,
no personal knowledge. That is a lower bar than the owner has, so expect
disagreement; what we want to know is how much, and where.

Procedure, once per person:

1. Owner labels their full file.
2. Owner picks every 10th visit (deterministic, not cherry-picked) and copies
   those lines, **with `truth_place_id` removed**, into
   `backend/evaluation/data/real/agreement/<owner>-blind.jsonl`.
3. A teammate (rotate: George→Zayd→Tanish→Hussam→Roger→George) labels the blind copy.
4. George computes Cohen's κ over the pairs and reports it with the accuracy numbers.

Interpretation, agreed in advance so we don't argue with the number after seeing it:

- **κ ≥ 0.8** — labels are solid, report accuracy as-is.
- **0.6 ≤ κ < 0.8** — usable, but report κ alongside every accuracy figure.
- **κ < 0.6** — the protocol is ambiguous, not the labelers. Fix the rules above
  and re-label. Do not report accuracy from labels we don't trust.

The blind copies are location data too, so `agreement/` sits inside the ignored
`real/` directory.

## Producing a label file

Each line is one visit. The format is in `backend/evaluation/labels.py`; a line
looks like:

```json
{"id": "george-2026-09-28-01",
 "visit": {"start_ts": 1790000000000, "end_ts": 1790005400000, "lat": 30.6161, "lon": -96.3392, "radius": 18.4},
 "candidates": [{"place_id": 1, "name": "Evans Library", "category": "library", "lat": 30.616, "lon": -96.3393, "opening_hours": null},
                {"place_id": 2, "name": "Library Coffee Bar", "category": "cafe", "lat": 30.6161, "lon": -96.3392, "opening_hours": null}],
 "truth_place_id": 1, "labeler": "george", "notes": ""}
```

Ids are `<labeler>-<date>-<nn>` and must be unique across the whole team, since
we evaluate the merged set.

The candidate snapshot is copied into the line on purpose: a label stays valid
after Zayd refreshes the OSM import, and the harness never needs the database.

**Getting the visits and candidates.** Once `feat/m2-places-api` has landed, sign
in and, for each visit from `GET /visits`, call
`GET /places/nearby?lat=&lon=&radius_m=50` and write the two together. Zayd is
adding `backend/scripts/` for the export; until that exists, pull from your own
device database. Either way the search radius must be **50 m**
(`ORBIT_PLACE_SEARCH_RADIUS_M`) or the labels won't match what the resolver sees.

Validate as you go — the loader gives you a file and line number:

```bash
cd backend
python -c "from evaluation.labels import load_labels; print(len(load_labels('evaluation/data/real/george.jsonl')), 'labels OK')"
```

## Running the harness

```bash
cd backend
python -m evaluation.places evaluation/data/real/george.jsonl            # just yours
python -m evaluation.places evaluation/data/real/*.jsonl --sweep         # the merged set
python -m evaluation.places evaluation/data/real/*.jsonl --json ../docs/reports/assets/place-eval.json
```

Report the **merged** numbers as the headline, with per-person numbers in an
appendix. One person's unusual week should not become the team's accuracy claim.

Read three things, in this order:

1. **precision vs. recall at 0.35.** Precision is what a user experiences as "the
   app labeled this wrong". Recall is what they experience as "the app didn't
   label it". We would rather abstain than be wrong, so precision is the one to
   defend.
2. **The misses list.** Systematic misses (always the cafe next to the library)
   are a ranker problem for Roger. Scattered ones are usually GPS.
3. **`--sweep`.** If 0.35 is not near the knee of the curve, we should change
   `ORBIT_PLACE_MIN_CONFIDENCE` rather than argue about the ranker.

Always report the `nearest` baseline next to the ranker. A learned ranker that
doesn't beat "closest candidate wins" is not worth the code.

## Privacy checklist

Before every push:

- [ ] `git status` shows nothing under `backend/evaluation/data/real/`
- [ ] No coordinates pasted into the report, the slides, an issue or Slack
- [ ] Screenshots of real visits are cropped or use the synthetic week
- [ ] Metrics only — counts, percentages, category names

If a label file is ever committed by accident, tell George immediately. It comes
out with a history rewrite and a force-push, and every clone has to be re-cloned;
deleting it in a later commit does **not** remove it.
