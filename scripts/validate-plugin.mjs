#!/usr/bin/env node

/**
 * Validates this single-plugin repo against Cursor Marketplace rules:
 * https://cursor.com/docs/reference/plugins
 * https://github.com/cursor/plugins/blob/main/schemas/plugin.schema.json
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, posix, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

const pluginNamePattern = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/;
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedManifestKeys = new Set([
  "name",
  "displayName",
  "description",
  "version",
  "minClientVersions",
  "author",
  "publisher",
  "homepage",
  "repository",
  "license",
  "logo",
  "keywords",
  "category",
  "tags",
  "commands",
  "agents",
  "skills",
  "rules",
  "hooks",
  "variables",
  "mcpServers",
]);
const allowedAuthorKeys = new Set(["name", "email"]);
const secretKeyPattern =
  /^(authorization|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|secret|bearer|private[_-]?key)$/i;
const placeholderPattern = /\$\{([A-Z][A-Z0-9_]*)\}/g;
const expectedMcpUrl = "https://api.wavemaker.io/mcp";

function fail(message) {
  errors.push(message);
}

function warn(message) {
  warnings.push(message);
}

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    fail(`${label} is missing: ${relative(root, filePath)}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`${label} is not valid JSON (${relative(root, filePath)}): ${error.message}`);
    return null;
  }
}

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) {
    return false;
  }
  if (isHttpUrl(value)) {
    return true;
  }
  if (isAbsolute(value)) {
    return false;
  }
  const normalized = posix.normalize(value.replace(/\\/g, "/"));
  return !normalized.startsWith("../") && normalized !== "..";
}

function extractPathValues(value) {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => extractPathValues(entry));
  }
  if (value && typeof value === "object") {
    const candidates = [];
    if (typeof value.path === "string") {
      candidates.push(value.path);
    }
    if (typeof value.file === "string") {
      candidates.push(value.file);
    }
    return candidates;
  }
  return [];
}

function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) {
    return null;
  }
  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return null;
  }
  const fields = {};
  for (const line of normalized.slice(4, closingIndex).split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

function walkFiles(dirPath) {
  const files = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const entryPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        files.push(entryPath);
      }
    }
  }
  return files;
}

function collectPlaceholders(value, found = new Set()) {
  if (typeof value === "string") {
    for (const match of value.matchAll(placeholderPattern)) {
      found.add(match[1]);
    }
  } else if (Array.isArray(value)) {
    for (const entry of value) {
      collectPlaceholders(entry, found);
    }
  } else if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (secretKeyPattern.test(key) && typeof nested === "string" && !nested.includes("${")) {
        fail(`Secret-like field "${key}" must not contain a literal value.`);
      }
      collectPlaceholders(nested, found);
    }
  }
  return found;
}

function validateReferencedPath(fieldName, pathValue) {
  if (isHttpUrl(pathValue)) {
    if (fieldName !== "logo") {
      fail(`Field "${fieldName}" must be a relative path, not a URL: ${pathValue}`);
    }
    return;
  }
  if (!isSafeRelativePath(pathValue)) {
    fail(
      `Field "${fieldName}" has invalid path "${pathValue}". Use a relative path without ".." or absolute prefixes.`
    );
    return;
  }
  const resolved = resolve(root, pathValue);
  if (!existsSync(resolved)) {
    fail(`Field "${fieldName}" references missing path "${pathValue}".`);
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("plugin.json must be a JSON object.");
    return;
  }

  for (const key of Object.keys(manifest)) {
    if (!allowedManifestKeys.has(key)) {
      fail(`plugin.json has unknown field "${key}" (Cursor schema additionalProperties: false).`);
    }
  }

  if (typeof manifest.name !== "string" || !pluginNamePattern.test(manifest.name)) {
    fail('plugin.json "name" must be lowercase kebab-case and start/end with an alphanumeric character.');
  } else if (manifest.name !== "wavemaker") {
    fail(`plugin.json "name" must be "wavemaker" (found "${manifest.name}").`);
  }

  if (typeof manifest.description !== "string" || manifest.description.trim().length === 0) {
    fail('plugin.json "description" is required for marketplace review.');
  }

  if (typeof manifest.version !== "string" || !semverPattern.test(manifest.version)) {
    fail('plugin.json "version" must be a semantic version such as "1.0.0".');
  }

  if (!manifest.author || typeof manifest.author !== "object" || Array.isArray(manifest.author)) {
    fail('plugin.json "author" must be an object with "name".');
  } else {
    for (const key of Object.keys(manifest.author)) {
      if (!allowedAuthorKeys.has(key)) {
        fail(`plugin.json author has unknown field "${key}".`);
      }
    }
    if (typeof manifest.author.name !== "string" || manifest.author.name.length === 0) {
      fail('plugin.json "author.name" is required.');
    } else if (manifest.author.name !== "Adwave") {
      fail(`plugin.json "author.name" must be "Adwave" (found "${manifest.author.name}").`);
    }
    if (manifest.author.email !== undefined && !emailPattern.test(manifest.author.email)) {
      fail('plugin.json "author.email" must be a valid email address.');
    }
  }

  if (manifest.license !== "MIT") {
    fail('plugin.json "license" must be "MIT".');
  }

  if (manifest.homepage !== "https://wavemaker.adwave.com/developers") {
    fail('plugin.json "homepage" must be "https://wavemaker.adwave.com/developers".');
  }

  if (manifest.repository !== undefined) {
    if (typeof manifest.repository !== "string" || !/^https:\/\//.test(manifest.repository)) {
      fail('plugin.json "repository" must be an https URL.');
    }
  }

  if (manifest.minClientVersions) {
    if (typeof manifest.minClientVersions !== "object" || Array.isArray(manifest.minClientVersions)) {
      fail('plugin.json "minClientVersions" must be an object.');
    } else {
      for (const [client, version] of Object.entries(manifest.minClientVersions)) {
        if (typeof version !== "string" || !semverPattern.test(version)) {
          fail(`plugin.json minClientVersions.${client} must be a semantic version.`);
        }
      }
    }
  }

  for (const field of ["logo", "rules", "skills", "agents", "commands", "hooks", "mcpServers"]) {
    for (const value of extractPathValues(manifest[field])) {
      validateReferencedPath(field, value);
    }
  }
}

function validateMcpConfig(mcp, declaredVariables) {
  if (!mcp || typeof mcp !== "object" || Array.isArray(mcp)) {
    fail("mcp.json must be a JSON object.");
    return;
  }

  const servers = mcp.mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    fail('mcp.json must define "mcpServers" as an object.');
    return;
  }

  const wavemaker = servers.wavemaker;
  if (!wavemaker || typeof wavemaker !== "object") {
    fail('mcp.json must define mcpServers.wavemaker.');
    return;
  }

  const serverKeys = Object.keys(wavemaker);
  if (serverKeys.length !== 1 || serverKeys[0] !== "url") {
    fail(
      'mcpServers.wavemaker must be URL-only: { "url": "https://api.wavemaker.io/mcp" }. No type, headers, secrets, or API key.'
    );
  }

  if (wavemaker.url !== expectedMcpUrl) {
    fail(`mcpServers.wavemaker.url must be "${expectedMcpUrl}" (wavemaker.adwave.com/mcp 404s).`);
  }

  if (typeof wavemaker.url === "string" && /wavemaker\.adwave\.com\/mcp/i.test(wavemaker.url)) {
    fail("mcpServers.wavemaker.url must not use wavemaker.adwave.com/mcp (that endpoint 404s).");
  }

  try {
    const parsed = new URL(wavemaker.url);
    if (parsed.protocol !== "https:") {
      fail("mcpServers.wavemaker.url must use https.");
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "::1") {
      fail("mcpServers.wavemaker.url must not point at localhost.");
    }
  } catch {
    fail("mcpServers.wavemaker.url is not a valid URL.");
  }

  const forbidden = ["headers", "env", "authorization", "apiKey", "api_key", "token", "secret"];
  for (const key of forbidden) {
    if (key in wavemaker) {
      fail(`mcpServers.wavemaker must not include "${key}". Auth is OAuth 2.1 + PKCE with no plugin secrets.`);
    }
  }

  const placeholders = collectPlaceholders(mcp);
  for (const name of placeholders) {
    if (!declaredVariables.has(name)) {
      fail(`mcp.json uses \${${name}} but plugin.json does not declare that variable.`);
    }
  }
}

function validateSkills() {
  const skillsDir = join(root, "skills");
  if (!existsSync(skillsDir) || !statSync(skillsDir).isDirectory()) {
    fail("skills/ directory is missing.");
    return;
  }

  const skillFiles = walkFiles(skillsDir).filter((file) => file.endsWith(`${posix.sep}SKILL.md`) || file.endsWith("/SKILL.md"));
  if (skillFiles.length === 0) {
    fail("No skills/*/SKILL.md files found.");
    return;
  }

  for (const file of skillFiles) {
    const parsed = parseFrontmatter(readFileSync(file, "utf8"));
    const rel = relative(root, file);
    if (!parsed) {
      fail(`Skill file missing YAML frontmatter: ${rel}`);
      continue;
    }
    if (!parsed.name) {
      fail(`Skill file missing "name" in frontmatter: ${rel}`);
    }
    if (!parsed.description) {
      fail(`Skill file missing "description" in frontmatter: ${rel}`);
    }
    const body = readFileSync(file, "utf8");
    const requiredSpendTools = [
      "generate_and_render",
      "generate_video",
      "refine_video",
      "render_video",
      "generate_static_ad",
      "edit_static_ad",
      "scrape_and_analyze",
      "plan_video",
      "compose_video",
      "upscale_video",
    ];
    for (const tool of requiredSpendTools) {
      if (!body.includes(tool)) {
        fail(`Skill ${rel} must name credit-spending tool "${tool}" and require user confirmation.`);
      }
    }
    if (!/confirm/i.test(body)) {
      fail(`Skill ${rel} must tell the agent to confirm with the user before generate/render.`);
    }
  }
}

function validateComponents() {
  for (const [dirName, extOk, requiredKeys, label] of [
    ["rules", new Set([".md", ".mdc", ".markdown"]), ["description"], "rule"],
    ["agents", new Set([".md", ".mdc", ".markdown"]), ["name", "description"], "agent"],
    ["commands", new Set([".md", ".mdc", ".markdown", ".txt"]), ["name", "description"], "command"],
  ]) {
    const dir = join(root, dirName);
    if (!existsSync(dir)) {
      continue;
    }
    for (const file of walkFiles(dir)) {
      const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
      if (!extOk.has(ext)) {
        continue;
      }
      const parsed = parseFrontmatter(readFileSync(file, "utf8"));
      const rel = relative(root, file);
      if (!parsed) {
        fail(`${label} file missing YAML frontmatter: ${rel}`);
        continue;
      }
      for (const key of requiredKeys) {
        if (!parsed[key]) {
          fail(`${label} file missing "${key}" in frontmatter: ${rel}`);
        }
      }
    }
  }
}

function validateNoMarketplaceConfusion() {
  const marketplacePath = join(root, ".cursor-plugin", "marketplace.json");
  if (existsSync(marketplacePath)) {
    fail(
      ".cursor-plugin/marketplace.json must not exist in this single-plugin repo. Cursor discovers .cursor-plugin/plugin.json at the repository root."
    );
  }
}

async function validateWithAjv(manifest) {
  const schemaPath = join(root, "schemas", "plugin.schema.json");
  const schema = readJson(schemaPath, "Cursor plugin schema");
  if (!schema) {
    return;
  }

  try {
    const { default: Ajv } = await import("ajv");
    const { default: addFormats } = await import("ajv-formats");
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);
    if (!validate(manifest)) {
      for (const err of validate.errors ?? []) {
        const extra =
          err.keyword === "additionalProperties" ? `: "${err.params.additionalProperty}"` : "";
        fail(`plugin.json schema: ${(err.instancePath || "/")} ${err.message}${extra}`);
      }
    }
  } catch {
    warn("ajv is not installed; ran the built-in Cursor-schema checks instead. Optional: npm install ajv ajv-formats");
  }
}

const manifest = readJson(join(root, ".cursor-plugin", "plugin.json"), "Plugin manifest");
validateNoMarketplaceConfusion();

if (manifest) {
  validateManifest(manifest);
  await validateWithAjv(manifest);

  const declaredVariables = new Set(Object.keys(manifest.variables?.properties ?? {}));
  const mcpPath = typeof manifest.mcpServers === "string" ? resolve(root, manifest.mcpServers) : join(root, "mcp.json");
  const mcp = readJson(mcpPath, "MCP config");
  if (mcp) {
    validateMcpConfig(mcp, declaredVariables);
  }
}

validateSkills();
validateComponents();

if (!existsSync(join(root, "README.md"))) {
  fail("README.md is missing.");
}
if (!existsSync(join(root, "LICENSE"))) {
  fail("LICENSE is missing.");
}

if (warnings.length > 0) {
  console.log("Warnings:");
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
  console.log("");
}

if (errors.length > 0) {
  console.error("Validation failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Validation passed.");
console.log("- .cursor-plugin/plugin.json matches Cursor's published plugin schema rules");
console.log(`- mcp.json points at ${expectedMcpUrl} over HTTPS with no secrets`);
console.log("- skills/wavemaker/SKILL.md has required frontmatter");
console.log("- logo and other manifest paths resolve");
