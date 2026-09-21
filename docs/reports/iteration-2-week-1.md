# Orbit – Iteration 2 Progress Report (Week 1)

Team Adobe: George Dai (lead), Zayd Nadir, Tanish Bandari, Hussam Makhoul, Roger Liu
CSCE 482 · September 21, 2026

Orbit is a mobile app that records your location history on your own phone, imports your Google Timeline export, and shows your visits on a map and a timeline. Iteration 2 is about interpreting that history: turning each visit into a real place, and turning those places into an interest profile.

## What we did last week

- Finished v0.1: the app runs on iOS, Android and web, with onboarding, permissions, and the Map, Timeline, Import and Settings tabs.
- Stay detection finds all 23 visits in our synthetic test week with no false positives, and the same algorithm now runs on both the phone and the server so the two agree.
- The backend handles accounts, point upload, visit recompute and full export. 17 backend tests and 71 app tests pass on every push.
- Planned Iteration 2 and split it in half. Part 1 (this sprint) is places and the interest profile; Part 2 is recommendations and the next-place predictor.
- Agreed the shared data contract (`backend/app/ml/types.py`) so all five of us could start on day 1 instead of waiting for each other.

## What we are doing this week

Everyone started Monday. The only thing anyone had to wait for was the contract, which we settled first.

- **Roger** — the place ranker (`rank_candidates`) and the interest model (`build_interest_profile`). Given a visit and the places near it, decide which one you were actually at, and how confident to be.
- **Zayd** — the places table, the OpenStreetMap loader, the nearby-places query, and the `/profile` endpoints. He also wires Roger's ranker into `POST /visits/recompute` so visits come back with a place attached.
- **Tanish** — sign-in from the app and reliable point upload: batching, a resume cursor, and retry with backoff, so a dropped connection halfway through an upload neither loses points nor duplicates them.
- **Hussam** — a heatmap mode on the Map tab and a new Profile tab. Both run on sample data this week; wiring them to the live API is Part 2.
- **George** — the evaluation harness for place resolution, the protocol we'll use to hand-label three weeks of real data, and this report.

### The evaluation harness

The harness (`backend/evaluation/`) scores any ranker against hand-labeled visits and prints the same table for all of them, so Roger's ranker can be read directly against a "pick the closest place" baseline. It runs with one command:

```
cd backend && python -m evaluation.places
```

It reports two things separately, on purpose. **Top-1 / top-3** ask whether the right place is near the top of the list. **Precision / recall** ask whether, at the confidence threshold the API actually uses, we wrote the right place onto the visit. A ranker can be good at the first and bad at the second, and we want to see that rather than average it away.

Here are this week's numbers on the committed synthetic set — 40 visits around campus, 36 at a real place and 4 that are deliberately nowhere:

```
    Place resolution · synthetic-places.jsonl · 40 labeled visits (36 with a place, 4 none)
    assignment threshold 0.35

ranker             top-1     top-3 precision    recall   abstain  assigned
--------------     -----     ----- ---------    ------   -------  --------
nearest            88.9%    100.0%     83.8%     86.1%      7.5%    37/40
random(seed=0)     22.2%     69.4%      0.0%      0.0%     92.5%     3/40
```

**These are baselines, not results.** Roger's ranker hasn't merged yet, so the table shows what it has to beat. Two things are worth reading now:

- **"Nearest place wins" already gets 88.9%.** That is the bar. A learned ranker that doesn't clearly beat it isn't earning its complexity. The 11% it misses are the interesting cases — the cafe inside the library, the smoothie counter at the gym — where distance alone can't tell you which of two overlapping places you were at. That is exactly where opening hours and visit duration should help.
- **The threshold sweep says 0.35 is roughly right.** Precision holds around 83–84% from 0.0 up to 0.4 and then recall falls off a cliff (86% → 47% by 0.50). We picked 0.35 before we had any data; the curve doesn't contradict it. We will re-check it on real labels before we defend it.

One caveat we want on the record: this set is synthetic. The noise is Gaussian and the candidate lists are tidy, so 88.9% is optimistic. Its job is to catch regressions and rank rankers against each other, not to predict real-world accuracy. The real number comes from hand labels.

### Hand labeling

`docs/eval/labeling-protocol.md` sets out how we label three weeks of real history: each person labels their own data only, every visit of 10 minutes or more, with written rules for the cases that would otherwise be judgment calls (multi-tenant buildings, home and work, parking lots, and when to give up and mark a visit `null`).

10% of each person's visits get labeled a second time by a teammate working blind, so we can report inter-annotator agreement alongside accuracy. We agreed the thresholds in advance — below κ = 0.6 we fix the protocol and re-label rather than report a number we don't trust — specifically so we can't talk ourselves into accepting bad labels after seeing them.

Label files stay in `backend/evaluation/data/real/`, which is gitignored and never committed. This is our own location history and it is covered by the IRB protocol; only the metrics leave our laptops.

## What we will do by the end of Iteration 2

The goal is v0.5 beta: profile, recommendations and predictions live in the app.

By the end of Part 1 (October 4), a visit should arrive in the app already knowing what place it was, and the Profile tab should show what those places say about you. Part 2 then adds recommendations, the next-place predictor, and the popularity baseline they have to beat.

The evaluation work follows the same shape: the place-resolution harness is done and running this week, so once real labels exist we can report a real accuracy number. The recommender needs its own harness and its own baseline, and that is Part 2.

## Risks

- **OSM coverage.** If the campus extract is missing the places we actually go, resolution recall is capped no matter how good the ranker is. The protocol has labelers note this case separately (`"correct place not in candidates"`) so we can tell an import problem from a ranker problem. <!-- TODO: report the count once real labels exist -->
- **Label volume.** We need roughly 300 labeled visits for the per-category numbers to mean anything. That is real work for five people in a week, and it depends on everyone having three weeks of tracking already recorded.
- **Background tracking on real phones.** Still the long pole from Iteration 1. Expo Go can't do background location, so this needs development builds. <!-- TODO: status at the end of the week -->

## Results from the rest of the team

<!-- TODO: Roger — rank_candidates numbers from `python -m evaluation.places`, read against the nearest baseline above -->
<!-- TODO: Zayd — OSM places loaded, /places/nearby latency, share of visits resolved on recompute -->
<!-- TODO: Tanish — sync numbers: points uploaded, behaviour on a forced network drop, battery over 24h -->
<!-- TODO: Hussam — heatmap and Profile tab screenshots -->

## Screenshots

<!-- TODO: add once the heatmap and Profile tab land (Hussam). Iteration 1 shots are in docs/reports/assets/. -->

| | | |
| --- | --- | --- |
| TODO heatmap | TODO profile tab | TODO visit with a place |
