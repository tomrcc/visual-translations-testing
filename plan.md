# Project Plan: Visual Editor Translations PoC

This is a living plan designed to prep AI agents, read it at the start of all prompts, and update it as needed to help future agents.

## What This Is

A PoC exploring whether CloudCannon's Visual Editor editable regions can be wired directly to Rosey locale files, enabling in-place visual translation editing. The goal is a simple, robust translation workflow that bypasses convoluted middleware — editors see translated content in the Visual Editor, edit it directly, and saving writes back to the locale file.

---

## Architecture: Client-Side Locale Injection

Instead of Astro-side conditional rendering (the original approach), translations are handled entirely client-side via `src/scripts/locale-injector.ts`. Developers just add data attributes to their elements.

### How It Works

1. Developer adds `data-rosey="{key}"` and `data-rcc` to any editable element that should be translatable
2. `data-locales="fr,de"` on `<main>` declares available locales
3. A client-side script runs in the Visual Editor:
   - Snapshots all `[data-rcc]` elements' outerHTML on init
   - Injects a floating locale switcher UI
   - On locale switch: clone+replace each element with a modified `data-prop` pointing to the locale data file
   - On "Original": clone+replace back from the snapshot

**Key constraint (discovered in Phase 1 testing):** CloudCannon's editable regions do NOT respond to `setAttribute` changes on existing elements. Only clone+replace (remove old node, insert new node) triggers CC to re-bind. This applies in both directions — switching to a locale AND reverting to original both require clone+replace.

### Developer Experience

```html
<!-- Just add data-rosey and data-rcc to mark an element as translatable -->
<Heading text={title} data-prop="title" data-editable="text"
  data-rosey="index_title" data-rcc />
```

No special translation components, no locale prop threading, no conditional rendering.

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
- `data-prop` can reference data files: `@data[locales_fr].index_title.value` points into `rosey/locales/fr.json`
- When an editor saves, CloudCannon writes the new value back to the data file at the path specified by `data-prop`
- CC does NOT re-bind when attributes are mutated on existing elements — only clone+replace triggers re-binding

### The Connection

The locale injector rewrites `data-prop` via clone+replace:
- **Original mode:** `data-prop="title"` → reads/saves from the content block's `title` field
- **Locale mode (e.g. fr):** `data-prop="@data[locales_fr].index_title.value"` → reads/saves from `rosey/locales/fr.json`

The `data-rosey` attribute serves double duty:
1. Rosey uses it at build time to extract original text into `base.json`
2. The locale injector reads it at runtime to construct the locale data path

---

## Current Implementation

| File | Purpose |
|---|---|
| [`src/scripts/locale-injector.ts`](src/scripts/locale-injector.ts) | Client-side script: snapshots `[data-rcc]` elements, injects locale switcher, clone+replaces on switch |
| [`src/layouts/Layout.astro`](src/layouts/Layout.astro) | Includes the locale-injector script (lazy-loaded) |
| [`src/shared/astro/page.astro`](src/shared/astro/page.astro) | `<main>` carries `data-locales="fr,de"` for the injector to read |
| [`src/components/shared/Heading.astro`](src/components/shared/Heading.astro) | Forwards `data-rosey` and `data-rcc` to inner `<editable-text>` |
| [`src/components/shared/Text.astro`](src/components/shared/Text.astro) | Same — wraps text in `<editable-text>` with forwarded attributes |
| [`src/components/shared/Button.astro`](src/components/shared/Button.astro) | Same forwarding pattern |
| [`src/components/global/hero/hero.astro`](src/components/global/hero/hero.astro) | Uses `rosey_prefix` prop to generate `data-rosey` keys (e.g. `index_title`) |
| [`rosey/locales/fr.json`](rosey/locales/fr.json) | French locale file (the data file CloudCannon edits) |
| [`rosey/locales/de.json`](rosey/locales/de.json) | German locale file |
| [`rosey/base.json`](rosey/base.json) | Rosey's extracted source-of-truth for translation keys |
| [`writeLocales.mjs`](writeLocales.mjs) | Utility to scaffold locale files from `rosey/base.json` |
| [`cloudcannon.config.yml`](cloudcannon.config.yml) | Maps `data_config.locales_fr` → `rosey/locales/fr.json`, `locales_de` → `de.json` |

### How `rosey_prefix` works

Components that contain translatable fields accept a `rosey_prefix` prop (e.g. `"index"` or `"about"`). This is used to construct `data-rosey` keys:
- `rosey_prefix="index"` + field `title` → `data-rosey="index_title"`
- If `rosey_prefix` is not set, no `data-rosey` or `data-rcc` attributes are added (the element is not translatable)

---

## PoC Demo: Step-by-Step

1. **[Dev]** Run `npm run build` to produce the `dist/` output.
2. **[Dev]** Commit and push to the repo connected to CloudCannon.
3. **[You — CloudCannon]** Open the **Index** page in the **Visual Editor**.
4. **[You — CloudCannon]** See the floating locale switcher in the bottom-right corner.
5. **[You — CloudCannon]** Click **FR** — the hero heading and description switch to show French translations from `fr.json`.
6. **[You — CloudCannon]** Edit the French text in-place and save — CloudCannon writes back to `rosey/locales/fr.json`.
7. **[You — CloudCannon]** Click **Original** to switch back to the default English content.
8. **[Dev]** Pull the updated `fr.json`, run `npm run build` + Rosey to produce the translated multilingual site.

---

## Settled Decisions

- **Rosey key format:** `{pageSlug}_{fieldName}` — page-prefixed to allow the same field name across different pages
- **Clone+replace, not setAttribute** — CC only re-binds when DOM nodes are replaced, not when attributes are mutated
- **Client-side locale switching** — no Astro-side conditional rendering; the JS handles everything in the Visual Editor
- **`data-rcc` as the trigger attribute** — separate from `data-rosey` (which serves Rosey extraction)
- **Do NOT follow RCC v1 patterns** — this PoC takes a simpler, more direct approach
- **Stack:** Astro SSG + CloudCannon editable regions + client-side locale injector

---

## Open Questions

- Is `writeLocales.mjs` / `base.json` generation a manual dev step or should it be automated in the build pipeline?
- Multi-locale support: `data-locales` currently hardcoded on `<main>`. Should it be driven from config/frontmatter?
- Should `rosey_prefix` be automated (derived from the page slug) rather than manually set per block?
