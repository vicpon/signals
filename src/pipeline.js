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
import { judgeArticleOpenAI, OPENAI_ENABLED } from "./judgeOpenAI.js";
import { buildTickerRecord } from "./aggregate.js";
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

// Judges one article with both engines independently — a failure in one
// (e.g. an OpenAI rate limit) never blocks the other from being recorded.
async function judgeWithBothEngines(tickerMeta, article) {
  const input = {
    ticker: tickerMeta.s,
    company: tickerMeta.n,
    headline: article.headline,
    source: article.source,
  };

  try {
    article.jevJudgment = await judgeArticle(input);
  } catch (err) {
    console.warn(`[pipeline] Jev judgment failed for ${tickerMeta.s} article "${article.headline}": ${err.message}`);
  }

  if (OPENAI_ENABLED) {
    try {
      article.openaiJudgment = await judgeArticleOpenAI(input);
    } catch (err) {
      console.warn(`[pipeline] OpenAI judgment failed for ${tickerMeta.s} article "${article.headline}": ${err.message}`);
    }
  }

  return article;
}

async function gatherForTicker(tickerMeta) {
  const quote =
    tickerMeta.a === "crypto"
      ? await getCryptoQuote(tickerMeta.coingeckoId)
      : await getStockQuote(tickerMeta.s);

  const articles = (await gatherArticles(tickerMeta))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_ARTICLES_PER_TICKER);

  for (const article of articles) {
    await judgeWithBothEngines(tickerMeta, article);
  }

  return buildTickerRecord(tickerMeta, quote, articles, { openaiEnabled: OPENAI_ENABLED });
}

export async function runPipeline() {
  if (OPENAI_ENABLED) {
    console.log("[pipeline] OpenAI comparison enabled — this doubles per-article judgment calls and cost.");
  }

  const results = [];
  for (const tickerMeta of TICKERS) {
    try {
      const record = await gatherForTicker(tickerMeta);
      results.push(record);
      const openaiNote = record.openai ? `, OpenAI: ${record.openai.sig}/${record.openai.cv}` : "";
      console.log(`[pipeline] ${tickerMeta.s}: Jev ${record.jev.sig}/${record.jev.cv}${openaiNote} (${record.src.length} sources)`);
    } catch (err) {
      console.error(`[pipeline] Skipping ${tickerMeta.s}: ${err.message}`);
    }
    await sleep(REQUEST_SPACING_MS);
  }

  const payload = { generatedAt: new Date().toISOString(), openaiEnabled: OPENAI_ENABLED, tickers: results };
  await writeCache(payload);
  console.log(`[pipeline] Wrote ${results.length}/${TICKERS.length} tickers to cache.`);
  return payload;
}
