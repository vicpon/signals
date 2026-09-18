import {
  TICKERS,
  MAX_NEWS_PER_TICKER,
  MAX_SEEKING_ALPHA_PER_TICKER,
  MAX_REDDIT_PER_TICKER,
  MAX_ARTICLES_PER_TICKER,
  REQUEST_SPACING_MS,
} from "./config.js";
import { getStockQuote, getCryptoQuote } from "./sources/marketData.js";
import { getNewsForCompany } from "./sources/news.js";
import { getSeekingAlphaNews } from "./sources/seekingAlpha.js";
import { getRedditPosts } from "./sources/reddit.js";
import { getRecentFilings } from "./sources/secFilings.js";
import { judgeArticle } from "./judge.js";
import { aggregateTicker } from "./aggregate.js";
import { writeCache } from "./cache.js";
import { sleep } from "./lib/httpJson.js";

function skipOnError(promise, label) {
  return promise.catch((err) => {
    console.warn(`[pipeline] ${label} skipped: ${err.message}`);
    return [];
  });
}

async function gatherArticles(tickerMeta) {
  if (tickerMeta.a === "crypto") {
    const [news, reddit] = await Promise.all([
      skipOnError(getNewsForCompany(`${tickerMeta.n} ${tickerMeta.s} crypto`, MAX_NEWS_PER_TICKER), `news/${tickerMeta.s}`),
      skipOnError(getRedditPosts(tickerMeta.n, "crypto", MAX_REDDIT_PER_TICKER), `reddit/${tickerMeta.s}`),
    ]);
    return [...news, ...reddit];
  }

  const [news, seekingAlpha, reddit, filings] = await Promise.all([
    skipOnError(getNewsForCompany(`${tickerMeta.n} stock`, MAX_NEWS_PER_TICKER), `news/${tickerMeta.s}`),
    skipOnError(getSeekingAlphaNews(tickerMeta.s, MAX_SEEKING_ALPHA_PER_TICKER), `seekingAlpha/${tickerMeta.s}`),
    skipOnError(getRedditPosts(tickerMeta.s, "stock", MAX_REDDIT_PER_TICKER), `reddit/${tickerMeta.s}`),
    skipOnError(getRecentFilings(tickerMeta.s), `secFilings/${tickerMeta.s}`),
  ]);
  return [...filings, ...news, ...seekingAlpha, ...reddit];
}

async function gatherForTicker(tickerMeta) {
  const quote =
    tickerMeta.a === "crypto"
      ? await getCryptoQuote(tickerMeta.coingeckoId)
      : await getStockQuote(tickerMeta.s);

  const articles = (await gatherArticles(tickerMeta))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_ARTICLES_PER_TICKER);

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
