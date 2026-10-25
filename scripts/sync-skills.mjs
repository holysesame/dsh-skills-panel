#!/usr/bin/env node
/**
 * 技能目录自检脚本（诊断用）。
 *
 *   node scripts/sync-skills.mjs
 *
 * 面板本身**不再依赖**这个脚本：它在运行时通过 DSH 的 skills/list 接口
 * 直接读取当前用户的技能，因此安装后无需生成任何清单。
 * 本脚本只用来在命令行确认"当前环境存在哪些技能、根目录在哪"。
 *
 * 根目录自动发现，不写死任何机器路径：
 *   - $DSH_HOME/skills（默认 ~/.dsh/skills）
 *   - ~/.agents/skills
 *   - $DSH_BUNDLED_SKILL_DIR（若设置）
 *   - 工作区 .dsh/skills 与 .agents/skills
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";

const env = process.env;
const dshHome = env.DSH_HOME || join(homedir(), ".dsh");
const agentsHome = env.DSH_AGENTS_HOME || join(homedir(), ".agents");

const ROOTS = [
  { dir: join(dshHome, "skills"), source: "user" },
  { dir: join(agentsHome, "skills"), source: "user" },
  { dir: join(dshHome, "profiles", env.DSH_PROFILE || "desktop", "skills"), source: "user" },
  env.DSH_BUNDLED_SKILL_DIR ? { dir: resolve(env.DSH_BUNDLED_SKILL_DIR), source: "builtin" } : null,
  { dir: join(process.cwd(), ".dsh", "skills"), source: "project" },
  { dir: join(process.cwd(), ".agents", "skills"), source: "project" }
].filter(Boolean);

function frontmatter(file) {
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  if (!text.startsWith("---")) return null;
  const end = text.indexOf("\n---", 3);
  if (end < 0) return null;
  const block = text.slice(3, end);
  const lines = block.split(/\r?\n/);
  let name = "";
  let description = "";
  for (let i = 0; i < lines.length; i++) {
    const n = /^name:\s*(.*)$/.exec(lines[i]);
    if (n) { name = n[1].trim().replace(/^["']|["']$/g, ""); continue; }
    const d = /^description:\s*(.*)$/.exec(lines[i]);
    if (!d) continue;
    let value = d[1].trim();
    if (/^[>|][-+]?$/.test(value)) {
      const parts = [];
      while (i + 1 < lines.length && (lines[i + 1].trim() === "" || /^\s/.test(lines[i + 1]))) { parts.push(lines[i + 1].trim()); i++; }
      value = parts.filter(Boolean).join(" ");
    }
    description = value.replace(/^["']|["']$/g, "");
  }
  return name ? { name, description } : null;
}

const found = new Map();
for (const root of ROOTS) {
  if (!existsSync(root.dir)) continue;
  for (const entry of readdirSync(root.dir, { withFileTypes: true })) {
    const full = join(root.dir, entry.name);
    const file = entry.isDirectory() ? join(full, "SKILL.md") : entry.name.endsWith(".md") ? full : null;
    if (!file || !existsSync(file)) continue;
    const meta = frontmatter(file);
    if (!meta || found.has(meta.name)) continue;
    found.set(meta.name, { ...meta, source: root.source, path: file });
  }
}

const list = [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
console.log("扫描到的技能根目录:");
for (const r of ROOTS) console.log("  " + (existsSync(r.dir) ? "[存在] " : "[缺失] ") + r.dir);
console.log("\n发现 " + list.length + " 个技能:");
for (const s of list) console.log("  - " + s.name + "  [" + s.source + "]  " + s.path);
console.log("\n提示：面板在运行时直接读取当前实例的技能目录，无需运行本脚本。");
