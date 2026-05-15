import fs from "node:fs";
import path from "node:path";

const HERE = import.meta.dirname;

// Minimal .env parser. Shell env vars override .env, matching the dotenv convention.
export function loadEnv() {
  const env = {};
  const envPath = path.join(HERE, ".env");
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
      }
    }
  }
  return { ...env, ...process.env };
}
