#!/usr/bin/env bun
import plugin from "bun-plugin-tailwind";
import { existsSync } from "fs";
import { rm } from "fs/promises";
import path from "path";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`
🏗️  Bun Build Script

Usage: bun run build.ts [options]

Common Options:
  --outdir <path>          Output directory (default: "dist")
  --minify                 Enable minification (or --minify.whitespace, --minify.syntax, etc)
  --sourcemap <type>      Sourcemap type: none|linked|inline|external
  --target <target>        Build target: browser|bun|node
  --format <format>        Output format: esm|cjs|iife
  --splitting              Enable code splitting
  --packages <type>        Package handling: bundle|external
  --public-path <path>     Public path for assets
  --env <mode>             Environment handling: inline|disable|prefix*
  --conditions <list>      Package.json export conditions (comma separated)
  --external <list>        External packages (comma separated)
  --banner <text>          Add banner text to output
  --footer <text>          Add footer text to output
  --define <obj>           Define global constants (e.g. --define.VERSION=1.0.0)
  --help, -h               Show this help message

Example:
  bun run build.ts --outdir=dist --minify --sourcemap=linked --external=react,react-dom
`);
  process.exit(0);
}

type BuildConfigOverrides = Partial<Bun.BuildConfig> & Record<string, unknown>;
type NestedBuildConfig = Record<string, unknown>;

const toCamelCase = (str: string): string =>
  str.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());

const parseValue = (value: string): boolean | number | string | string[] => {
  if (value === "true") return true;
  if (value === "false") return false;

  if (/^\d+$/.test(value)) return parseInt(value, 10);
  if (/^\d*\.\d+$/.test(value)) return parseFloat(value);

  if (value.includes(",")) return value.split(",").map(v => v.trim());

  return value;
};

function parseArgs(): Partial<Bun.BuildConfig> {
  const config: BuildConfigOverrides = {};
  const args = process.argv.slice(2);

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (!arg.startsWith("--")) continue;

    if (arg.startsWith("--no-")) {
      const key = toCamelCase(arg.slice(5));
      config[key] = false;
      continue;
    }

    if (!arg.includes("=") && (i === args.length - 1 || args[i + 1]?.startsWith("--"))) {
      const key = toCamelCase(arg.slice(2));
      config[key] = true;
      continue;
    }

    let key: string;
    let value: string;

    if (arg.includes("=")) {
      const option = arg.slice(2);
      const separatorIndex = option.indexOf("=");
      key = option.slice(0, separatorIndex);
      value = option.slice(separatorIndex + 1);
    } else {
      key = arg.slice(2);
      value = args[++i] ?? "";
    }

    key = toCamelCase(key);

    if (key.includes(".")) {
      const [parentKey, childKey] = key.split(".", 2);

      if (parentKey === undefined || childKey === undefined) continue;

      const existingParent = config[parentKey];
      const parentConfig: NestedBuildConfig =
        existingParent !== null && typeof existingParent === "object" && !Array.isArray(existingParent)
          ? (existingParent as NestedBuildConfig)
          : {};

      parentConfig[childKey] = parseValue(value);
      config[parentKey] = parentConfig;
    } else {
      config[key] = parseValue(value);
    }
  }

  return config;
}

const formatFileSize = (bytes: number): string => {
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
};

console.log("\n🚀 Starting build process...\n");

const cliConfig = parseArgs();
const outdir = cliConfig.outdir || path.join(process.cwd(), "dist");

if (existsSync(outdir)) {
  console.log(`🗑️ Cleaning previous build at ${outdir}`);
  await rm(outdir, { recursive: true, force: true });
}

const start = performance.now();

const entrypoints = [...new Bun.Glob("**.html").scanSync("src")]
  .map(a => path.resolve("src", a))
  .filter(dir => !dir.includes("node_modules"));
console.log(`📄 Found ${entrypoints.length} HTML ${entrypoints.length === 1 ? "file" : "files"} to process\n`);

const result = await Bun.build({
  entrypoints,
  outdir,
  plugins: [plugin],
  minify: true,
  target: "browser",
  sourcemap: "none",
  define: {
    "__APP_NODE_ENV__": JSON.stringify(process.env.NODE_ENV ?? "production"),
    "__BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND__": JSON.stringify(
      process.env.BUN_PUBLIC_DEADLINE_FOOD_API_BACKEND ?? "",
    ),
    "__BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL__": JSON.stringify(
      process.env.BUN_PUBLIC_FIREBASE_FUNCTIONS_BASE_URL ?? "",
    ),
    "__BUN_PUBLIC_FIREBASE_PROJECT_ID__": JSON.stringify(process.env.BUN_PUBLIC_FIREBASE_PROJECT_ID ?? ""),
    "__BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION__": JSON.stringify(
      process.env.BUN_PUBLIC_FIREBASE_FUNCTIONS_REGION ?? "",
    ),
    "__BUN_PUBLIC_POSTHOG_PROJECT_TOKEN__": JSON.stringify(process.env.BUN_PUBLIC_POSTHOG_PROJECT_TOKEN ?? ""),
    "__BUN_PUBLIC_POSTHOG_HOST__": JSON.stringify(process.env.BUN_PUBLIC_POSTHOG_HOST ?? ""),
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  ...cliConfig,
});

const end = performance.now();

const outputTable = result.outputs.map(output => ({
  File: path.relative(process.cwd(), output.path),
  Type: output.kind,
  Size: formatFileSize(output.size),
}));

console.table(outputTable);
const buildTime = (end - start).toFixed(2);

console.log(`\n✅ Build completed in ${buildTime}ms\n`);
