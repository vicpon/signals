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

## UI

`public/index.html` is the shipped dashboard — a card-style row list with a
right-side sliding detail panel that opens with the synthesized one-line
summary above the raw source list. It fetches live data from `/api/signals`
(backed by `data/signals.json`); all externally-sourced text (headlines,
outlet names) is HTML-escaped before rendering (see Security notes).

## Data shape (real pipeline output, `data/signals.json`)

```js
{ s, n, sec, a /* 'stock'|'crypto' */, p /* price */, c /* %chg */,
  jev: { sig /* 'bull'|'bear'|'neu' */, cv /* 0-100 conviction */,
         summary /* one-line plain-English readout, code-composed */,
         regulatoryFlag /* true if any source trips the regulatory Noul */ },
  openai: /* same shape as `jev`, or null if OPENAI_API_KEY is unset */,
  src: [{ so /* source name */, h /* headline */, t /* time-ago */,
          jevTag /* 'bull'|'bear'|'neu' */, openaiTag /* same, or null */ }] }
```

`jev` and `openai` are two independent aggregations of judgments over the
*same* `src` list — see "TypeSafe vs OpenAI comparison" below.

## Real pipeline — built, free data sources only

Everything except Jev, the optional OpenAI comparison, and (optionally)
Reddit runs against fully free, keyless public endpoints — no paid tier, no
account. Reddit's anonymous read API was retired (confirmed: anonymous
requests now get a login-wall 403), so it needs a free OAuth app instead —
see below.

- **Stock quotes**: Yahoo Finance's public chart endpoint
  (`query1.finance.yahoo.com/v8/finance/chart/<TICKER>`).
- **Crypto quotes**: CoinGecko's public `/simple/price` endpoint.
- **News**: Google News RSS search per company (`news.google.com/rss/search`).
- **Seeking Alpha** (`src/sources/seekingAlpha.js`): per-symbol RSS
  (`seekingalpha.com/api/sa/combined/<TICKER>.xml`), stocks only. Their feed
  description restricts it to "personal, non-commercial use" — worth
  re-checking if this project is ever deployed for others rather than run
  locally.
- **Reddit** (`src/sources/reddit.js`, optional): r/stocks or
  r/CryptoCurrency search via `oauth.reddit.com`. Requires a free "script"
  app (`reddit.com/prefs/apps` → `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`
  in `.env`) using the OAuth2 client-credentials grant — no user password
  needed. Skipped entirely if those vars are unset.
- **Filings**: SEC's own `data.sec.gov/submissions/CIK…` API, resolved from
  the official `company_tickers.json` ticker→CIK map. Form 4s (insider
  trades) get their actual transaction detail fetched and summarized —
  e.g. "Jane Doe (CFO) net disposed of 12,000 shares (open-market sale)" —
  instead of just "a Form 4 was filed" (`src/sources/secFilings.js`). SEC's
  fair-access policy requires a descriptive `User-Agent` (not a secret) —
  set `SEC_USER_AGENT` in `.env`.
- **Tried and dropped**: MarketWatch and Reuters no longer expose free
  per-ticker RSS (tested live: MarketWatch's redirects to a 404, Reuters'
  feed 301s to a dead endpoint); CNBC's RSS is general business news, not
  per-company, so it wasn't useful for this per-ticker pipeline.
- **Judgment engine**: TypeSafe/Jev, called server-side only
  (`src/judge.js`). Per article, one `systemOne` request asks three
  independent questions — a `Choice` for sentiment direction (bull/bear/
  neutral), a `Score` for how market-moving the headline is (→ conviction),
  and a `Noul` for "does this mention regulatory action" — and the answers
  are combined into the ticker's `sig`/`cv`/`regulatoryFlag` in code
  (`src/aggregate.js`), per TypeSafe's own guidance to keep composition and
  thresholds in reviewable code rather than another model call.
- **Correction to the original plan above**: Jev returns typed judgments and
  probabilities, not generated prose, so it can't produce the dashboard's
  synthesized summary directly. That summary is instead assembled
  deterministically in code from the aggregated judgments (majority signal,
  agreement ratio, and the highest-confidence anchor headline) — see
  `synthesize`-equivalent logic in `src/aggregate.js`.

Per ticker, all sources are merged and capped at `MAX_ARTICLES_PER_TICKER`
(8, most-recent-first) before any Jev calls — adding sources broadens what's
considered without letting per-ticker Jev cost grow unbounded.

## TypeSafe vs OpenAI comparison (optional)

Set `OPENAI_API_KEY` in `.env` to also judge every article with an OpenAI
model (`src/judgeOpenAI.js`), so each ticker gets two independently
aggregated views over the *identical* source list — the dashboard shows
both, tags disagreements, and the detail panel shows each engine's own
summary and per-source tags. Unset, `openai` is simply `null` everywhere
and the dashboard shows Jev's result only.

**This is not an apples-to-apples methodology comparison, and that matters
for reading the results honestly:**

- TypeSafe's `Choice`/`Score` return a real probability distribution from a
  model architected specifically to produce calibrated judgments — that's
  the whole "System One" design.
- The OpenAI side is a general chat model given a system prompt describing
  the same three questions (sentiment / conviction level / regulatory
  probability) via structured outputs (`openai.responses.parse` +
  `zodTextFormat`), and asked to *self-report* its own confidence in a JSON
  field. That's an introspective guess, not a distribution — treat OpenAI's
  "confidence" as a materially weaker signal than Jev's.

Also worth knowing before running this: **OpenAI is a paid API**, unlike
every other integration in this project. It's opt-in for exactly that
reason. Enabling it roughly doubles per-article judgment calls (one to Jev,
one to OpenAI) and their cost/latency. `OPENAI_MODEL` (`.env`) picks the
model — OpenAI's model lineup moves fast, so check their current docs for
the current fast/cheap option rather than trusting the shipped default to
still be current.

### Running it

```sh
npm install
cp .env.example .env   # add your TYPESAFE_API_KEY and SEC_USER_AGENT
                         # (optionally OPENAI_API_KEY for the comparison)
npm run pipeline        # fetches quotes/news/filings, judges via Jev,
                         # writes data/signals.json
npm start                # serves the dashboard + /api/signals
```

`data/signals.json` is git-ignored — it's generated output, not source.
Re-run `npm run pipeline` on a schedule (e.g. cron) to refresh it; the
server itself is read-only and never triggers the pipeline, so it never
spends TypeSafe/API quota on its own.

The ticker universe (`src/config.js`) is a curated ~110 names across
sectors (stocks + crypto) — a hand-picked list, not a live top-100-by-
market-cap ranking. A full run makes several HTTP calls and up to 8 Jev
calls per ticker, so it takes a while (tens of minutes) and uses real Jev
quota; trim `TICKERS` for faster/cheaper iteration while developing.

### Security notes

- `TYPESAFE_API_KEY` and `OPENAI_API_KEY` are read from the environment
  (`.env`, git-ignored) and never sent to or read by the browser —
  `TypeSafeClient` itself refuses to run in a browser context, which
  matches this architecture: all model calls (`src/judge.js`,
  `src/judgeOpenAI.js`) live on the server.
- News headlines and outlet names are live, external, untrusted text. The
  dashboard (`public/index.html`) HTML-escapes every externally-sourced
  string before it touches `innerHTML`.
- No secrets, cache data, or `node_modules` are committed — see
  `.gitignore` and `.env.example`.

## Not yet built (next steps discussed)

- Signal-credibility weighting (a Seeking Alpha article vs. a Reddit post
  currently count equally in the aggregation) — flagged as a risk, not yet
  addressed
- Other feature ideas raised but not built: alerts on signal flips,
  backtested accuracy per ticker, sector heatmap, multi-timeframe signals
