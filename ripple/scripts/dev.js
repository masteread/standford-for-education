// Dev runner: esbuild in watch mode (rebuilds the client on change) + the
// Express world server, in one process. Single origin → the client's relative
// fetches to /join, /state, /intent … just work with no proxy.
import * as esbuild from "esbuild";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { buildOptions, copyHtml } from "./build-client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

copyHtml();
const ctx = await esbuild.context(buildOptions);
await ctx.watch();
console.log("[dev] watching client/src …");

const server = spawn("node", [path.join(__dirname, "../server/index.js")], { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));

process.on("SIGINT", async () => {
  await ctx.dispose();
  server.kill("SIGINT");
  process.exit(0);
});
