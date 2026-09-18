import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { CACHE_PATH } from "./config.js";

const path = fileURLToPath(CACHE_PATH);

export async function readCache() {
  try {
    const text = await readFile(path, "utf8");
    return JSON.parse(text);
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

export async function writeCache(payload) {
  await mkdir(dirname(path), { recursive: true });
  const tmpPath = `${path}.tmp`;
  await writeFile(tmpPath, JSON.stringify(payload, null, 2));
  // Rename so readers never see a half-written file.
  await rename(tmpPath, path);
}
