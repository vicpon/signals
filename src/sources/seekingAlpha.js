import { fetchRssItems } from "../lib/rss.js";

// Seeking Alpha's per-symbol RSS — free, keyless, equities only. Their feed
// description restricts the feed to "personal, non-commercial use"; this
// project treats that the same way it treats a personal locally-run
// dashboard. If you deploy this for others, re-check that restriction
// against your use case.
export async function getSeekingAlphaNews(ticker, limit) {
  const url = `https://seekingalpha.com/api/sa/combined/${encodeURIComponent(ticker)}.xml`;
  const items = await fetchRssItems(url, { "User-Agent": "Mozilla/5.0" });

  return items.slice(0, limit).map((item) => ({
    headline: String(item.title ?? "").trim(),
    source: "Seeking Alpha",
    publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
  }));
}
