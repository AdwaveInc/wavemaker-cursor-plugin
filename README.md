# Wavemaker for Cursor

Cursor Marketplace plugin for [Wavemaker](https://wavemaker.adwave.com) — Adwave's AI tool for videos, static ads, and related media.

This repository **is** the plugin. Submit `https://github.com/AdwaveInc/wavemaker-cursor-plugin` at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish). No extra packaging is required.

## What it does

The plugin connects Cursor (and Cloud Agents / Grok Bot) to Wavemaker's public HTTPS MCP server:

```json
{
  "mcpServers": {
    "wavemaker": {
      "url": "https://api.wavemaker.io/mcp"
    }
  }
}
```

Auth is **OAuth 2.1 + PKCE + dynamic client registration**. There is no API key, client secret, header, or other credential in this repo or in the plugin config. The MCP URL is `https://api.wavemaker.io/mcp` only — `wavemaker.adwave.com/mcp` 404s.

## Install

### From the Cursor Marketplace (after listing)

1. Open **Cursor Settings → Plugins** (or **Customize**).
2. Search for **Wavemaker**.
3. Click **Install**.
4. Complete the OAuth connect flow below.

Or run `/add-plugin wavemaker` in chat.

### From this repository (local review)

1. Clone the repo.
2. Symlink it into Cursor's local plugin folder:

   ```bash
   ln -s /path/to/wavemaker-cursor-plugin ~/.cursor/plugins/local/wavemaker
   ```

3. Restart Cursor, or run **Developer: Reload Window**.
4. Complete the OAuth connect flow below.

## OAuth connect flow

Wavemaker MCP uses OAuth 2.1 + PKCE (`S256` only) and dynamic client registration. Cursor handles discovery, DCR, and token storage. You do not paste a key.

1. After install, enable the **wavemaker** MCP server if it is not already on.
2. The first tool call (or first connect) opens a browser tab at Wavemaker's authorize endpoint.
3. Sign in with your Wavemaker account at [wavemaker.adwave.com](https://wavemaker.adwave.com) or [wavemaker.io](https://wavemaker.io) — same account on both.
4. Approve access. Cursor stores the issued tokens locally.
5. Later calls reuse the access token (1 hour) and refresh token (30 days).

If the browser prompt does not appear, toggle the server off and on in **Settings → MCP**, then retry a Wavemaker action in chat.

Cloud Agents and Grok Bot can use this plugin because the MCP URL is public HTTPS. They cannot use localhost or stdio-only servers. You still need to complete OAuth for the agent environment.

## Using it

Ask Cursor to generate a video, a static ad, or related media. Examples:

- "Create a 30-second 9:16 ad for https://example.com"
- "Estimate credits for a 15-second YouTube spot, then generate it if I confirm"
- "Check my Wavemaker credit balance"

The bundled skill tells the agent to confirm with the user before every credit-spending generate or render (`generate_and_render`, `generate_video`, `refine_video`, `render_video`, `generate_static_ad`, `edit_static_ad`, `scrape_and_analyze`, `plan_video`, `compose_video`, `upscale_video`, DCO produce tools, and credit-spending `execute_tool` runs). Prefer `get_cost_estimate` / `get_account` when planning.

Generation spends credits. A Wavemaker account with available credits is required. API and MCP access are included on Pro plans and above; see [pricing](https://wavemaker.adwave.com).

## Validate the manifest

```bash
node scripts/validate-plugin.mjs
```

The script checks this repo against Cursor's published plugin rules: kebab-case `name`, closed manifest schema, relative paths, skill frontmatter, HTTPS MCP URL, and no secrets.

## Docs

- Wavemaker: https://wavemaker.adwave.com / https://wavemaker.io
- Developer docs (REST + MCP): https://wavemaker.adwave.com/developers
- Cursor plugins: https://cursor.com/docs/reference/plugins
- Marketplace publish: https://cursor.com/marketplace/publish

Logo is the official Wavemaker mark from https://wavemaker.io/favicon.svg, placed on a padded white tile so it reads well in the Cursor UI.

## License

MIT. Author: Adwave.
