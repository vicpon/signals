# Signals

A dashboard that scans a top-100 list of stocks & crypto and surfaces an
aggregate bullish/bearish/neutral signal per ticker, derived from news,
filings, and social sources — with the source articles shown alongside the
signal so it's explainable, not a black box.

## Judgment engine: TypeSafe / Jev

Signal extraction runs on [TypeSafe](https://docs.typesafe.ai)'s Jev model
— a fast/cheap "System One" judgment model, not a forecaster. Pattern:
**ML feature extraction** (see TypeSafe's use-case map) — per article, ask
typed questions (`Choice`: sentiment direction, `Score`: conviction, `Noul`:
"mentions regulatory action") and aggregate the typed answers per ticker
into the dashboard's signal + conviction score. Implemented in
`src/judge.js` (Jev calls, via `@typesafe-ai/sdk`) and `src/aggregate.js`
(the composition/aggregation logic) — see "Real pipeline" below for the
exact call shape and how it differs from the original plan for the
synthesized summary.

Docs entry points: `https://docs.typesafe.ai/llms.txt` (index),
`/primitives.md` (Choice/Score/Noul question types + SDK call shape),
`/concepts/use-case-map.md` (feature-extraction pattern + financial-crime
use case).

## UI direction: chosen — "Focus"

Four UI/UX mockups were designed and compared as one Claude Artifact:
`mockups/signal-desk.html` (also live at
https://claude.ai/artifact/5H7WVENMXKGZhdtYiyWPbr — private, owned by
poncev@gmail.com). Directions explored: Terminal (dense trading-desk,
phosphor amber), Heat Grid (HUD tile grid), Ticker Tape (mechanical
paper-tape), Focus (quiet, spacious consumer app). That file is kept as a
historical reference for the comparison; it still uses fabricated sample
data and isn't wired to the pipeline.

**Focus was picked**, and is the real shipped UI at `public/index.html` —
the minimal/spacious direction: big readable typography (Newsreader serif
for numerals + Manrope sans for UI), a card-style row list, and a
right-side sliding panel for detail (not a full-page navigation) that opens
with a **synthesized one-line plain-English summary** above the raw source
list. It fetches live data from `/api/signals` (backed by
`data/signals.json`) instead of the mockup's hardcoded array.

## Data shape (real pipeline output, `data/signals.json`)

```js
{ s, n, sec, a /* 'stock'|'crypto' */, p /* price */, c /* %chg */,
  sig /* 'bull'|'bear'|'neu' */, cv /* 0-100 conviction */,
  summary /* one-line plain-English readout, code-composed — see below */,
  regulatoryFlag /* true if any source trips the regulatory Noul */,
  src: [{ so /* source name */, h /* headline */, t /* time-ago */,
          tag /* 'bull'|'bear'|'neu' */ }] }
```

## Real pipeline — built, free/keyless data sources only

Everything except the Jev calls runs against free, keyless public endpoints
— no paid API tier and nothing that requires an account, so the project
stays runnable by anyone who clones it and adds only a TypeSafe key.

- **Stock quotes**: Yahoo Finance's public chart endpoint
  (`query1.finance.yahoo.com/v8/finance/chart/<TICKER>`).
- **Crypto quotes**: CoinGecko's public `/simple/price` endpoint.
- **News**: Google News RSS search per company (`news.google.com/rss/search`).
- **Filings**: SEC's own `data.sec.gov/submissions/CIK…` API, resolved from
  the official `company_tickers.json` ticker→CIK map. SEC's fair-access
  policy requires a descriptive `User-Agent` (not a secret) — set
  `SEC_USER_AGENT` in `.env` before running the pipeline.
- **Judgment engine**: TypeSafe/Jev, called server-side only
  (`src/judge.js`). Per article, one `systemOne` request asks three
  independent questions — a `Choice` for sentiment direction (bull/bear/
  neutral), a `Score` for how market-moving the headline is (→ conviction),
  and a `Noul` for "does this mention regulatory action" — and the answers
  are combined into the ticker's `sig`/`cv`/`regulatoryFlag` in code
  (`src/aggregate.js`), per TypeSafe's own guidance to keep composition and
  thresholds in reviewable code rather than another model call.
- **Correction to the original plan above**: Jev returns typed judgments and
  probabilities, not generated prose, so it can't produce the Focus panel's
  synthesized summary directly. That summary is instead assembled
  deterministically in code from the aggregated judgments (majority signal,
  agreement ratio, and the highest-confidence anchor headline) — see
  `synthesize`-equivalent logic in `src/aggregate.js`.

### Running it

```sh
npm install
cp .env.example .env   # add your TYPESAFE_API_KEY and SEC_USER_AGENT
npm run pipeline        # fetches quotes/news/filings, judges via Jev,
                         # writes data/signals.json
npm start                # serves the Focus dashboard + /api/signals
```

`data/signals.json` is git-ignored — it's generated output, not source.
Re-run `npm run pipeline` on a schedule (e.g. cron) to refresh it; the
server itself is read-only and never triggers the pipeline, so it never
spends TypeSafe/API quota on its own.

The ticker universe (`src/config.js`) is a curated ~15 names, not the full
100, so a first run stays fast and light on the free/rate-limited sources
above — extend the list there when ready to scale up.

### Security notes

- `TYPESAFE_API_KEY` is read from the environment (`.env`, git-ignored) and
  never sent to or read by the browser — `TypeSafeClient` itself refuses to
  run in a browser context, which matches this architecture: all Jev calls
  live in `src/judge.js` on the server.
- News headlines and outlet names are live, external, untrusted text. The
  dashboard (`public/index.html`) HTML-escapes every externally-sourced
  string before it touches `innerHTML`.
- No secrets, cache data, or `node_modules` are committed — see
  `.gitignore` and `.env.example`.

## Not yet built (next steps discussed)

- Scaling the ticker list from ~15 toward the full top-100
- Signal-credibility weighting (a Reuters headline vs. an anonymous forum
  post currently count equally) — flagged as a risk, not yet addressed
- Social-media source ingestion (news + filings are covered; social is not)
- Other feature ideas raised but not built: alerts on signal flips,
  backtested accuracy per ticker, sector heatmap, multi-timeframe signals
