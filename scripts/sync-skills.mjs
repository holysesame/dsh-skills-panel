#!/usr/bin/env node
/**
 * Regenerate the skill manifest inside lib/client.js.
 *
 *   node scripts/sync-skills.mjs
 *
 * Scans the DSH skill roots, reads each SKILL.md frontmatter, and rewrites the
 * marker block in lib/client.js. Run it after installing or removing a skill,
 * then reload the DSH window.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const ROOTS = [
  { dir: join(homedir(), ".dsh", "skills"), source: "user" },
  { dir: join(homedir(), ".agents", "skills"), source: "user" },
  { dir: join(homedir(), ".dsh", "profiles", "desktop", "skills"), source: "user" },
  { dir: "D:/tools/deepseekHarness/resources/runtime/office-skills", source: "builtin" },
  { dir: join(process.cwd(), ".dsh", "skills"), source: "project" },
  { dir: join(process.cwd(), ".agents", "skills"), source: "project" }
];

function readFrontmatter(file) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const block = text.slice(3, end);
  const lines = block.split(/\r?\n/);
  let name = "";
  let description = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nameMatch = /^name:\s*(.*)$/.exec(line);
    if (nameMatch) { name = nameMatch[1].trim().replace(/^["']|["']$/g, ""); continue; }
    const descMatch = /^description:\s*(.*)$/.exec(line);
    if (!descMatch) continue;
    let value = descMatch[1].trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const parts = [];
      while (i + 1 < lines.length) {
        const next = lines[i + 1];
        if (next.length > 0 && !/^\s/.test(next)) break;
        parts.push(next.trim());
        i++;
      }
      value = parts.filter(Boolean).join(" ");
    }
    description = value.replace(/^["']|["']$/g, "");
  }
  return name ? { name, description } : null;
}

function collect() {
  const found = new Map();
  for (const root of ROOTS) {
    if (!existsSync(root.dir)) continue;
    let entries;
    try { entries = readdirSync(root.dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = join(root.dir, entry.name);
      let skillFile = null;
      if (entry.isDirectory()) {
        const candidate = join(full, "SKILL.md");
        if (existsSync(candidate)) skillFile = candidate;
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        skillFile = full;
      }
      if (!skillFile) continue;
      const meta = readFrontmatter(skillFile);
      if (!meta) continue;
      if (found.has(meta.name)) continue;
      found.set(meta.name, {
        name: meta.name,
        description: meta.description.replace(/\s+/g, " ").trim(),
        source: root.source,
        path: skillFile
      });
    }
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const skills = collect();
const target = join(process.cwd(), "lib", "client.js");
const banner = "/* @skills-start */";
const tail = "/* @skills-end */";
const source = readFileSync(target, "utf8");
const start = source.indexOf(banner);
const end = source.indexOf(tail);
if (start < 0 || end < 0) {
  console.error("marker block not found in lib/client.js");
  process.exit(1);
}
const json = JSON.stringify(skills);
const next = source.slice(0, start + banner.length) + json + source.slice(end);
writeFileSync(target, next, "utf8");
console.log("synced " + skills.length + " skills:");
for (const s of skills) console.log("  - " + s.name + " [" + s.source + "]");
