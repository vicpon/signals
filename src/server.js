import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readCache } from "./cache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const app = express();

// Read-only by design: this process never triggers the pipeline (which
// costs quota against TypeSafe and the free market/news APIs). Populate
// data/signals.json with `npm run pipeline`, on a schedule via cron.
app.get("/api/signals", async (_req, res) => {
  const cache = await readCache();
  if (!cache) {
    res.status(503).json({ error: "No signals yet. Run `npm run pipeline` to populate data/signals.json." });
    return;
  }
  res.json(cache);
});

app.use(express.static(join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`[server] Signals dashboard listening on http://localhost:${PORT}`);
});
