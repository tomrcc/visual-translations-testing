# Project Plan: Visual Editor Translations PoC

This is a living plan designed to prep AI agents, read it at the start of all prompts, and update it as needed to help future agents.

## What This Is

A PoC exploring whether CloudCannon's Visual Editor editable regions can be wired directly to Rosey locale files, enabling in-place visual translation editing. The goal is a simple, robust translation workflow that bypasses convoluted middleware — editors see translated content in the Visual Editor, edit it directly, and saving writes back to the locale file.

---

## Core Demo Goal

**Single flow to prove:** editor sets `selected_locale: fr` on a content block → Astro renders the translated value from `rosey/locales/fr.json` in the Visual Editor → editor edits the text in-place → save writes back to `rosey/locales/fr.json` → Rosey rebuild produces the multilingual site.

---

## Key Technical Concepts

### Rosey

- Runs **after** the Astro build, operating on static HTML output
- Scans HTML for `data-rosey="{key}"` attributes and extracts originals into `rosey/base.json`
- Reads `rosey/locales/{locale}.json` to produce translated copies of the site
- Key format used in this project: `{pageSlug}_{fieldName}` (e.g. `index_title`, `about_description`)
- Locale file structure: `{ "index_title": { "original": "Beautiful web campaigns", "value": "De belles campagnes web" } }`

### CloudCannon Visual Editor / Editable Regions

- `data-editable="text"` + `data-prop="fieldName"` makes an element in-place editable in the Visual Editor
- `data-prop` can reference data files: `@data[locales].index_title.value` points into `rosey/locales/*.json`
- When an editor saves, CloudCannon writes the new value back to the data file at the path specified by `data-prop`
- Astro component re-rendering is supported by the editable regions Astro integration (components re-render client-side to preview changes)

### The Connection

When `selected_locale` is set to a non-default locale (e.g. `fr`):
- Switch `data-prop` from the original frontmatter prop (e.g. `title`) to `@data[locales].index_title.value`
- Keep `data-rosey="index_title"` on the element so Rosey still processes it after the build
- CloudCannon reads and saves from `rosey/locales/fr.json` directly — no build step required to see or edit translations

---

## PoC Demo: Step-by-Step

The index page hero title is the demo subject. With `selected_locale: fr` set in `index.md`, the built HTML renders:

```html
<editable-text
  data-editable="text"
  data-prop="@data[locales].index_title.value"
  data-rosey="index_title">
  Beautiful web campaigns
</editable-text>
```

CloudCannon resolves `@data[locales]` → `rosey/locales/fr.json`, reads `index_title.value` = `"De belles campagnes web"`, and displays the French text in the Visual Editor.

### Steps to run the demo (some require you — the human — in CloudCannon):

1. **[Dev]** Run `npm run build` to produce the `dist/` output.
2. **[Dev]** Commit and push to the repo connected to CloudCannon.
3. **[You — CloudCannon]** Open the **Index** page in the **Visual Editor**.
4. **[You — CloudCannon]** Confirm the hero heading displays the French text from `rosey/locales/fr.json` (`"De belles campagnes web"`).
5. **[You — CloudCannon]** Click on the heading and type a new French translation.
6. **[You — CloudCannon]** Save — CloudCannon writes the new value back to `rosey/locales/fr.json` at `index_title.value`.
7. **[Dev]** Pull the updated `fr.json`, run `npm run build` + Rosey to produce the translated multilingual site.

> **Note:** CloudCannon's Visual Editor cannot be launched by the AI agent — steps 3–6 always require a human in the CloudCannon UI.

---

## Current Implementation (Exploratory — all code may be rewritten)

| File | Purpose |
|---|---|
| [`src/components/translatedText.astro`](src/components/translatedText.astro) | Switches `data-prop` based on `selectedLocale`; currently hardcoded to check `fr` |
| [`src/components/shared/TestHeading.astro`](src/components/shared/TestHeading.astro) | Heading component that uses `TranslatedText` |
| [`src/components/global/hero/hero.astro`](src/components/global/hero/hero.astro) | Uses `TestHeading` with `selected_locale` and `pageSlug` passed as props |
| [`src/shared/astro/page.astro`](src/shared/astro/page.astro) | Derives `pageSlug` from route params and passes it to all content block components |
| [`rosey/locales/fr.json`](rosey/locales/fr.json) | French locale file (the data file CloudCannon edits) |
| [`rosey/base.json`](rosey/base.json) | Rosey's extracted source-of-truth for translation keys |
| [`writeLocales.mjs`](writeLocales.mjs) | Utility to scaffold locale files from `rosey/base.json` |

`selected_locale` is currently set **per content block** in page frontmatter (e.g. `index.md` hero block has `selected_locale: fr`).

### Key implementation notes

- `pageSlug` is derived in `page.astro` as `Astro.params.slug || "index"` — the fallback `"index"` is critical for the index page where `slug` is `undefined`.
- Rosey key format is `{pageSlug}_{fieldName}`, so the index page hero title key is `index_title`.
- `cloudcannon.config.yml` maps `data_config.locales` → `rosey/locales/fr.json` so `@data[locales]` resolves correctly.
- **`page_slug` must be in the block's frontmatter** for Visual Editor re-rendering to work. During re-render, CloudCannon calls the component in isolation (not through `page.astro`), so the route-derived `pageSlug` is unavailable. The component resolves `pageSlug = page_slug ?? _pageSlug` — `page_slug` (from frontmatter) wins, with the runtime prop as a fallback for static builds of blocks that predate this pattern. `page_slug` is marked `hidden: true` in `cloudcannon.config.yml` so it is never visible to editors.

> **PoC limitation:** Every content block that uses `TranslatedText` must carry a `page_slug` field in its frontmatter. A production implementation would derive this automatically.

---

## Settled Decisions

- **Rosey key format:** `{pageSlug}_{fieldName}` — page-prefixed to allow the same field name across different pages (e.g. `index_title` vs `about_title`)
- **Do NOT follow RCC v1 patterns** — the Rosey CloudCannon Connector v1 is mentioned only as background context for the problem being solved; this PoC takes a simpler, more direct approach
- **Stack:** Astro SSG + CloudCannon editable regions (Astro re-rendering is supported)

---

## Open Questions

- Should `selected_locale` be **page-level** or **per-block** frontmatter? Block-level was simplest to start (editable regions handles re-rendering per component), but page-level may be cleaner UX
- Which additional components need `TranslatedText` wrapping beyond headings?
- Is `writeLocales.mjs` / `base.json` generation a manual dev step or should it be automated in the build pipeline?
- `translatedText.astro` currently hardcodes `selectedLocale === "fr"` — needs to be generalised to support any locale
