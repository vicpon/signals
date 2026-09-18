import { XMLParser } from "fast-xml-parser";
import { fetchText } from "../lib/httpJson.js";

const parser = new XMLParser({ ignoreAttributes: false });

// Google News RSS search — free, keyless, no rate-limit key required.
// Title format is "<headline> - <source>"; we split that back apart so the
// UI can show the outlet name separately, matching the target data shape.
export async function getNewsForCompany(query, limit) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await fetchText(url);
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  const list = Array.isArray(items) ? items : items ? [items] : [];

  return list.slice(0, limit).map((item) => {
    const rawTitle = String(item.title ?? "").trim();
    const sepIndex = rawTitle.lastIndexOf(" - ");
    const headline = sepIndex === -1 ? rawTitle : rawTitle.slice(0, sepIndex);
    const source = sepIndex === -1 ? "Google News" : rawTitle.slice(sepIndex + 3);
    const pubDate = item.pubDate ? new Date(item.pubDate) : new Date();
    return { headline, source, publishedAt: pubDate };
  });
}
