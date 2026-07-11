// Loads ripple/.env for test scripts; silent if missing (mock mode kicks in).
import { fileURLToPath } from "node:url";
try {
  process.loadEnvFile(fileURLToPath(new URL("../.env", import.meta.url)));
} catch {
  /* no .env yet — agents run in mock mode */
}
