import { XMLParser } from "fast-xml-parser";
import { fetchText } from "./httpJson.js";

const parser = new XMLParser({ ignoreAttributes: false });

export async function fetchRssItems(url, headers) {
  const xml = await fetchText(url, { headers });
  const parsed = parser.parse(xml);
  const items = parsed?.rss?.channel?.item;
  return Array.isArray(items) ? items : items ? [items] : [];
}
