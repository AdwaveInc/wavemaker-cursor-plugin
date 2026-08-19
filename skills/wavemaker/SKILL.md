---
name: wavemaker
description: Use Wavemaker to generate videos, static ads, and related media through the Wavemaker MCP server. Use when the user wants AI video, static image ads, renders, composition edits, brand scrapes, or other Wavemaker creative work.
---

# Wavemaker

Use the plugin's remote MCP server at `https://api.wavemaker.io/mcp`. Authentication is OAuth 2.1 with PKCE and dynamic client registration — Cursor opens a browser sign-in. Do not ask for, store, or put an API key in config.

## When to use

- Generate or refine videos from a brief or URL
- Generate static image ads or carousels
- Plan, compose, render, or upscale existing work
- Check job status, compositions, usage, or credit balance

## Confirm before spending credits

Ask the user to confirm before every generate or render that spends credits. Do not call a spend tool until they say yes.

Confirm first for all of these:

- `generate_and_render`
- `generate_video`
- `refine_video`
- `render_video`
- `generate_static_ad`
- `edit_static_ad`
- `scrape_and_analyze`
- `plan_video`
- `compose_video`
- `upscale_video`
- `dco_bootstrap_catalog`
- `dco_run_produce`
- `execute_tool` when the catalog tool generates, renders, scrapes, plans, composes, upscales, edits, or otherwise spends credits
- any other connected MCP tool whose description says it charges credits

Read-only / no-spend tools do not need confirmation: `get_account`, `get_usage`, `get_cost_estimate`, `get_status`, `get_render_status`, `get_composition`, `list_compositions`, `get_reviews`, `list_ad_formats`, `list_ad_styles`, `list_image_styles`, `list_brand_kits`, `describe_tool`, `cancel_generation`, `dco_get_status_bundle`, `dco_review_variants`.

When the user wants a cost-aware plan, call `get_cost_estimate` and/or `get_account`, share the estimate, then wait for confirmation before generate or render.

## How to work

1. Confirm destination (video vs static ad), aspect ratio, duration, and platform if the user did not specify them.
2. A product or landing-page URL can be used as the brief; Wavemaker can scrape brand assets from it (that scrape spends credits — confirm first).
3. After starting a job, poll `get_status` (or use `wait` when the tool supports it) instead of starting a second generation.
4. For an existing composition, use `refine_video` or `render_video` rather than regenerating from scratch — still confirm, because both spend credits.
5. Return download URLs and composition or job IDs when the run finishes.
6. If a call fails with insufficient credits (`402`) or rate limits (`429`), report that and stop. Do not retry spend tools without confirmation.

Stay within the connected MCP tools and the public Wavemaker developer docs. Do not invent other product capabilities.
