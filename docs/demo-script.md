# v0.5 demo script — 5 minutes

Iteration 2 demo: **profile, recommendations and predictions live in-app.**

One person drives, one narrates. Read this once the morning of, run the setup
below at least an hour before, and leave the terminals open. Everything after
"Setup" is the five minutes we actually perform.

> Steps marked ⛳ depend on a Part 2 branch that has to be merged first:
> the job queue and worker (Tanish), the Discover screen (Hussam), and the
> `/recommendations` and `/predict/next` endpoints (Zayd). If one of them has not
> landed by demo day, cut that beat — the script says how.

---

## Setup — 60 minutes before, on the demo machine

Do this once, then leave it running. **Do not** pull or rebase after it works.

```bash
# 1. Backend, on a clean database
cd backend
source .venv/bin/activate
pip install -e ".[dev]"
python -m pytest -q                       # must be green before we show anything

# 2. Places. --save writes a local copy so the demo never needs Overpass again.
python scripts/load_osm.py --bbox 30.57,-96.39,30.66,-96.28 --save cstat.json

# 3. API
uvicorn app.main:app --reload             # http://127.0.0.1:8000/docs

# 4. ⛳ Worker, in a second terminal (Tanish's branch)
cd backend && source .venv/bin/activate
python -m app.worker

# 5. App, in a third terminal, from the repo root
npm install
npx expo start                            # press i for the iOS simulator
```

Check before you walk away:

- `http://127.0.0.1:8000/docs` loads.
- The app opens, and **Import → Load sample week** fills the map.
- `GET /profile` returns categories, not an empty list.
- ⛳ `POST /visits/recompute` returns `202` with a `job_id`, and
  `GET /jobs/<id>` reaches `done`.

**Run the demo on the iOS simulator on the demo laptop, not on a phone.** The
simulator reaches `127.0.0.1` directly; a phone needs the LAN, and conference
Wi-Fi is exactly where that breaks.

---

## The five minutes

### 0:00 — What Orbit is (30s, no screen)

> "Orbit turns the location history your phone already collects into something
> you own: where you've been, what you're interested in, and what's worth going
> to next. Everything you'll see runs on this laptop — the OSM data is a local
> copy, and no location data leaves the device."

### 0:30 — Import (45s)

Import tab → **Load sample week**.

> "This is a synthetic week around campus, so we're not showing anyone's real
> movements. Same pipeline as a real Google Timeline export: raw fixes in, noise
> filtered, stay detection clusters them into visits."

Map tab. Point at the clustered pins.

### 1:15 — Visits have real names (60s)

Timeline tab. Scroll.

> "Each visit resolves to an actual OpenStreetMap place. Not 'a point at
> 30.616, -96.339' — Evans Library."

Tap one visit → visit detail.

> "And the resolver abstains when it isn't sure. A visit in a parking lot stays
> unlabeled rather than guessing the shop next door — we'd rather say nothing
> than be wrong."

Scroll to an unlabeled visit if there is one on screen. Don't hunt for one.

### 2:15 — Profile (60s)

Profile tab.

> "Those named visits add up to an interest profile: categories weighted by how
> long you spend and how recently, so one long visit doesn't drown out a habit."

Hide a category (tap the toggle on, say, `parking` or `fast_food`).

> "It's yours to correct. Hide a category and it's gone from the profile and from
> everything downstream — immediately, on device and on the server."

Wait for the weights to re-normalise on screen. That re-normalisation is the beat.

### 3:15 — ⛳ Discover (75s)

Discover tab.

> "Here's what that profile is for. These are places this person has never been,
> ranked against their interests, each with the reason it's here."

Read one card's reason line out loud.

> "And this is measured, not asserted. The proposal set the bar at beating a
> popularity baseline on held-out months — build the profile from the first nine
> weeks, then check whether the places they actually went to in the last three
> show up in the top ten."

Tap **dismiss** on a card.

> "Dismissed is permanent. It never comes back."

### 4:30 — ⛳ Next place (30s)

The next-place card at the top of Discover.

> "And from the sequence of visits, where you're likely to go next, with a
> confidence. Top-three accuracy is the number we report."

### 5:00 — Close (15s)

> "Profile, recommendations and predictions, all from one week of imported
> history, all on this machine. Next iteration is background sync and battery."

---

## If something breaks

**Rule: never debug on stage.** Take the fallback, finish the demo, fix it after.

| What breaks | Fallback |
| --- | --- |
| **No network at all** | Nothing in the demo needs it. Places came from `cstat.json` at setup, the sample week is bundled, and the simulator talks to `127.0.0.1`. Say so out loud — it's a feature. |
| **`load_osm.py` fails at setup** | `python scripts/load_osm.py --file cstat.json` from the saved copy. Keep a known-good `cstat.json` on the demo machine and in a backup on someone else's laptop. |
| **API is down / app shows a sync error** | The app works offline against its local SQLite store. Do the Import, Map, Timeline and Profile beats, and say the server parts are on the laptop next to it. |
| ⛳ **Worker is down, recompute hangs** | Skip recompute entirely. The sample week is already computed; nothing in the five minutes needs a fresh job. |
| ⛳ **Discover is empty** | Show `http://127.0.0.1:8000/docs` → `GET /recommendations` → Try it out. The JSON has the same scores and reason lines. Less pretty, same claim. |
| ⛳ **Discover or /predict/next did not merge** | Cut 3:15 and 4:30. Replace with the terminal: `cd backend && python -m evaluation.recommend`, and read the verdict line. It shows the recommender against the popularity baseline, which is the exit criterion. |
| **Simulator freezes** | `r` in the Expo terminal reloads. If that fails, `npm run web` in a browser — every screen in this script works on web. |
| **Someone asks for real data** | We don't demo real location history, on purpose. Offer the evaluation numbers in `docs/eval/results.md` instead. |

## Questions we should have an answer ready for

- *"How accurate is the place resolution?"* — `docs/eval/results.md` §1. Quote the
  merged hand-labeled number and the `nearest` baseline next to it. If the real
  labels aren't in yet, say that, and say what the synthetic set shows.
- *"Does the recommender actually beat the baseline?"* — §2. Quote the verdict
  line from `python -m evaluation.recommend`, including the margin. If it doesn't
  clear the bar, say by how much and why; that answer is in the report.
- *"What about privacy?"* — Nothing left this laptop. Places are a local OSM copy,
  history is on device, and the export button gives the user every row we hold.
