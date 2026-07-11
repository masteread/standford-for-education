// Bundle the React client with esbuild (already a devDep) and copy index.html
// into client/dist, which the Express server serves as static files.
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dist = path.join(root, "client/dist");

export const buildOptions = {
  entryPoints: [path.join(root, "client/src/main.jsx")],
  bundle: true,
  outfile: path.join(dist, "app.js"),
  format: "iife",
  jsx: "automatic",
  loader: { ".js": "jsx" },
  define: { "process.env.NODE_ENV": '"development"' },
  logLevel: "info",
};

export function copyHtml() {
  mkdirSync(dist, { recursive: true });
  copyFileSync(path.join(root, "client/index.html"), path.join(dist, "index.html"));
}

// Run directly: one-shot build.
if (import.meta.url === `file://${process.argv[1]}`) {
  copyHtml();
  await esbuild.build(buildOptions);
  console.log("[build] client bundled → client/dist");
}
