import { TICKERS, MAX_ARTICLES_PER_TICKER, REQUEST_SPACING_MS } from "./config.js";
import { getStockQuote, getCryptoQuote } from "./sources/marketData.js";
import { getNewsForCompany } from "./sources/news.js";
import { getRecentFilings } from "./sources/secFilings.js";
import { judgeArticle } from "./judge.js";
import { aggregateTicker } from "./aggregate.js";
import { writeCache } from "./cache.js";
import { sleep } from "./lib/httpJson.js";

async function gatherForTicker(tickerMeta) {
  const quote =
    tickerMeta.a === "crypto"
      ? await getCryptoQuote(tickerMeta.coingeckoId)
      : await getStockQuote(tickerMeta.s);

  const [news, filings] =
    tickerMeta.a === "crypto"
      ? [await getNewsForCompany(`${tickerMeta.n} ${tickerMeta.s} crypto`, MAX_ARTICLES_PER_TICKER), []]
      : await Promise.all([
          getNewsForCompany(`${tickerMeta.n} stock`, MAX_ARTICLES_PER_TICKER),
          getRecentFilings(tickerMeta.s).catch((err) => {
            console.warn(`[pipeline] SEC filings skipped for ${tickerMeta.s}: ${err.message}`);
            return [];
          }),
        ]);

  const articles = [...filings, ...news];
  const judged = [];
  for (const article of articles) {
    try {
      const judgment = await judgeArticle({
        ticker: tickerMeta.s,
        company: tickerMeta.n,
        headline: article.headline,
        source: article.source,
      });
      judged.push({ ...article, judgment });
    } catch (err) {
      console.warn(`[pipeline] Jev judgment failed for ${tickerMeta.s} article "${article.headline}": ${err.message}`);
    }
  }

  return aggregateTicker(tickerMeta, quote, judged);
}

export async function runPipeline() {
  const results = [];
  for (const tickerMeta of TICKERS) {
    try {
      const record = await gatherForTicker(tickerMeta);
      results.push(record);
      console.log(`[pipeline] ${tickerMeta.s}: ${record.sig} (conviction ${record.cv}, ${record.src.length} sources)`);
    } catch (err) {
      console.error(`[pipeline] Skipping ${tickerMeta.s}: ${err.message}`);
    }
    await sleep(REQUEST_SPACING_MS);
  }

  const payload = { generatedAt: new Date().toISOString(), tickers: results };
  await writeCache(payload);
  console.log(`[pipeline] Wrote ${results.length}/${TICKERS.length} tickers to cache.`);
  return payload;
}
