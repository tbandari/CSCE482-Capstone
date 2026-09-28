# Evaluation results

Every number Orbit claims, and where it came from. Kept in one file so a figure
in a report, a slide or the demo can be traced to the command that produced it.

**Status: 2026-09-28.** Place resolution has synthetic numbers and no real ones
yet. The recommender and next-place models are being written this sprint; their
baselines are already measured, so the bar exists before the model does.

Nothing here is estimated. Where a number is not in yet it says **TODO**, with
who owns it and the command that will produce it. A gap is a fact about the
project; a made-up figure is a lie in a report.

## How to reproduce anything on this page

```bash
cd backend && source .venv/bin/activate && pip install -e ".[dev]"

python -m evaluation.places                                  # place resolution
python -m evaluation.recommend                               # recommender vs. the bar
python -m evaluation.predict                                 # next-place prediction
python -m evaluation.agreement <owner>.jsonl <blind>.jsonl   # kappa + OSM coverage gap
```

Synthetic fixtures are committed, so the first three run on a fresh checkout and
in CI. Real runs need a label file or an export in `backend/evaluation/data/real/`,
which is gitignored and never leaves the machine it was labeled on.

---

## 1. Place resolution

### 1a. Real hand labels — **TODO**

The headline accuracy number for the report. Blocked on the labeling itself, not
on tooling: the harness has been ready since Month 2 Part 1.

| Metric | Merged set | Notes |
| --- | --- | --- |
| Labeled visits | **TODO** | target ≥ 60 per person, ~300 across the team |
| top-1 | **TODO** | ranking quality, ignores confidence |
| top-3 | **TODO** | |
| Precision @ 0.35 | **TODO** | what a user experiences as "it labeled this wrong" |
| Recall @ 0.35 | **TODO** | what they experience as "it didn't label it" |
| Abstain rate | **TODO** | |
| `nearest` baseline top-1 | **TODO** | the bar; a learned ranker that loses to it is not worth the code |

Owner: everyone labels their own file (protocol: [labeling-protocol.md](labeling-protocol.md));
George merges and runs:

```bash
python -m evaluation.places evaluation/data/real/*.jsonl --sweep \
  --json ../docs/reports/assets/place-eval.json
```

Report the merged set as the headline and per-person numbers in an appendix, per
the protocol. Per-category top-1 goes in the appendix too (`--categories`).

### 1b. Inter-annotator agreement — **TODO**

10% of each file is double-labeled blind. Bands were fixed in the protocol before
anyone saw a number, so they are not negotiable after the fact.

| Pair | Double-labeled | Raw agreement | Cohen's κ | Band |
| --- | --- | --- | --- | --- |
| george ↔ zayd | **TODO** | **TODO** | **TODO** | |
| zayd ↔ tanish | **TODO** | **TODO** | **TODO** | |
| tanish ↔ hussam | **TODO** | **TODO** | **TODO** | |
| hussam ↔ roger | **TODO** | **TODO** | **TODO** | |
| roger ↔ george | **TODO** | **TODO** | **TODO** | |

- κ ≥ 0.8 — report accuracy as-is.
- 0.6 ≤ κ < 0.8 — report κ next to every accuracy figure.
- κ < 0.6 — the protocol is ambiguous. Fix the rules, re-label, and do **not**
  report accuracy from labels we don't trust.

Owner: George. `python -m evaluation.agreement evaluation/data/real/<owner>.jsonl
evaluation/data/real/agreement/<owner>-blind.jsonl`

### 1c. OSM coverage gap — **TODO**

Labels whose notes say `"correct place not in candidates"`. These are a recall
failure of the OSM import, not of the ranker, and they are Zayd's backlog: the
same command prints the missing place names.

| | Count | Share of labeled visits |
| --- | --- | --- |
| Correct place not in candidates | **TODO** | **TODO** |

### 1d. Synthetic set — measured

Regression numbers only. The noise model is Gaussian and the candidate sets are
tidy, so these are optimistic and are **not** quotable as accuracy. See
`docs/reports/assets/place-eval.json` after a run, and `evaluation/make_synthetic.py`
for what the fixture is.

---

## 2. Recommender

The iteration's exit criterion, from the proposal: **the recommender beats a
popularity baseline on held-out months.** `python -m evaluation.recommend` prints
the verdict as its last line.

### Protocol

Temporal hold-out, three weeks. The interest profile is built only from visits
that finished before the cutoff; the score is whether the places the user went to
*after* it appear in the top-k. Two truth sets are reported:

- **new places** — held-out places never visited during training. The headline.
  `recommend_places` is contractually barred from re-suggesting somewhere you
  already go, so this is the only column every recommender can compete on, and
  discovery is what the feature is for.
- **all held-out places** — revisits included. Context only.
  `personal_frequency` wins it by construction; it is not the verdict.

Held-out visits to places missing from the candidate catalog stay in the
denominator as a miss for everyone and are reported separately as `unreachable`,
so an OSM coverage gap is never read as a model failure.

### 2a. Baselines on the synthetic cohort — measured 2026-09-28

Six synthetic students, 641 training visits, 233 held out, 38 new-place truth
points (3 unreachable), 200-place catalog.
Full output: [`docs/reports/assets/recommend-eval.txt`](../reports/assets/recommend-eval.txt).

New places only — the headline:

| Recommender | hit@5 | hit@10 | hit@20 | MRR | Places ever suggested |
| --- | --- | --- | --- | --- | --- |
| **popularity** (the bar) | 13.2% | **18.4%** | 34.2% | 5.5% | 30 / 200 |
| personal_frequency | 0.0% | 0.0% | 0.0% | 0.0% | 33 / 200 |
| random (seed 0) | 0.0% | 0.0% | 5.3% | 0.3% | 68 / 200 |
| `recommend_places` | **TODO** | **TODO** | **TODO** | **TODO** | **TODO** |

All held-out places, revisits included — context:

| Recommender | hit@5 | hit@10 | hit@20 | MRR |
| --- | --- | --- | --- | --- |
| popularity | 6.9% | 9.7% | 18.1% | 2.9% |
| personal_frequency | 36.1% | 47.2% | 47.2% | 18.0% |
| random (seed 0) | 0.0% | 0.0% | 2.8% | 0.2% |
| `recommend_places` | **TODO** | **TODO** | **TODO** | **TODO** |

**The bar to clear is 18.4% hit@10 on new places.** Owner: Roger implements,
George measures. The verdict line goes here verbatim when it exists.

**Read these as a floor test, not as accuracy.** The synthetic cohort's held-out
discoveries are drawn from each student's own top categories, so an
interest-driven recommender *can* win here by construction. Clearing the bar on
this fixture is necessary, not sufficient. The claim in the report has to come
from real exports.

### 2b. Real exported history — **TODO**

| Metric | Merged | Notes |
| --- | --- | --- |
| Users / held-out weeks | **TODO** | |
| New-place truth points | **TODO** | thin data is the risk here, not the model |
| popularity hit@10 | **TODO** | |
| `recommend_places` hit@10 | **TODO** | |
| Verdict | **TODO** | |

`python -m evaluation.recommend evaluation/data/real/*.json --json ../docs/reports/assets/recommend-eval.json`.
Exports are read directly — no hand conversion. Same privacy rules as labels.

---

## 3. Next-place prediction

The proposal's metric is top-1 and top-3 accuracy. The protocol is a walk-forward
over one history: for every visit after a five-visit warm-up, predict from
everything strictly before it.

### 3a. Baseline on the synthetic student — measured 2026-09-28

217 visits over 83 days, 212 scored.
Full output: [`docs/reports/assets/predict-eval.txt`](../reports/assets/predict-eval.txt).

| Predictor | top-1 | top-3 |
| --- | --- | --- |
| **most_frequent** (the bar) | 16.0% | 61.8% |
| `predict_next_place` | **TODO** | **TODO** |

By slice, `most_frequent`:

| Slice | n | top-1 | top-3 |
| --- | --- | --- | --- |
| morning | 102 | 33.3% | 88.2% |
| afternoon | 63 | 0.0% | 65.1% |
| evening | 47 | 0.0% | 0.0% |
| weekday | 176 | 19.3% | 68.8% |
| weekend | 36 | 0.0% | 27.8% |

The slices are the interesting part: "wherever you go most" collapses to zero in
the evening and at weekends, because the routine it is averaging over is a
weekday-morning routine. That gap is what a time-aware model has to close, and
it is where Roger should look first.

### 3b. Real exported history — **TODO**

| Metric | Merged | Notes |
| --- | --- | --- |
| Predictions scored | **TODO** | |
| most_frequent top-1 / top-3 | **TODO** | |
| `predict_next_place` top-1 / top-3 | **TODO** | |
| Worst slice | **TODO** | |

---

## What would make me distrust these numbers

Written down now, so it is not rationalised later:

1. **Thin truth.** 38 new-place points on the synthetic cohort means one hit
   moves hit-rate by 2.6 points. Real exports will be thinner still. Any margin
   under ~5 points is noise, and the report should say so rather than round it up.
2. **A fixture built to be winnable.** §2a says how the synthetic discoveries are
   drawn. If `recommend_places` beats popularity only on synthetic data, we have
   shown the harness works, not that the model does.
3. **Coverage without hit-rate.** A recommender naming 30 of 200 places can look
   fine on hit-rate while being the same five cafés every time. Both columns, always.
4. **κ below 0.6.** Then the labels disagree with each other and no accuracy
   number computed from them means anything, however good it looks.
