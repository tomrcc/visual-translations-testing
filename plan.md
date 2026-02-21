# Project Plan: Visual Editor Translations PoC

This is a living plan designed to prep AI agents, read it at the start of all prompts, and update it as needed to help future agents.

## What This Is

A PoC exploring whether CloudCannon's Visual Editor editable regions can be wired directly to Rosey locale files, enabling in-place visual translation editing. The goal is a simple, robust translation workflow that bypasses convoluted middleware — editors see translated content in the Visual Editor, edit it directly, and saving writes back to the locale file.

---

## Core Demo Goal

**Single flow to prove:** `selected_locale: fr` is set on a content block in frontmatter → Astro renders the `editable-text` with `data-prop` pointing to the locale file → CloudCannon's Visual Editor reads/displays the translated value → editor edits the text in-place → save writes back to `rosey/locales/fr.json` → Rosey rebuild produces the multilingual site.

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

#### How re-rendering works internally

The editable regions system uses a **parent-child listener chain** to propagate values:

- Every `[data-editable]` element (text, array, component, etc.) becomes an `Editable` node in a tree
- `data-prop` attributes on a node declare which value path to watch
- **Relative paths** (e.g. `data-prop="title"`) register with the nearest DOM-ancestor editable node and look up that path in the parent's value. This is the standard case for block-level fields.
- **Absolute paths** (`@data[key].path`, `@file[path].field`, `@collections[key]`) bypass the parent chain entirely and attach a listener directly to the CloudCannon JavaScript API's file/dataset/collection object. These fire whenever the referenced file changes, regardless of the DOM hierarchy.
- `editable-array` unwraps `content_blocks[i]` and distributes individual block objects to child `editable-component` nodes — root-level page fields (like `selected_locale`) are **not** included in those distributed block objects.

#### Multiple `data-prop-*` attributes (prop merging) — PARTIALLY INCORRECT

> **Correction (discovered through testing):** The description below was based on reading CloudCannon's source code. In practice, `data-prop-*` attributes on `editable-array-item` do **not** inject resolved values into Astro component props during Visual Editor re-renders. They pass values through CloudCannon's editable regions DOM chain to child `data-prop` references only. The Astro component's frontmatter script cannot access these values via `Astro.props`.

A single element can carry multiple `data-prop-*` attributes. Each creates an independent listener and its resolved value is merged into the editable regions prop chain:

- `data-prop=""` → sets `propsBase` (the block's data object, from the parent array chain)
- `data-prop-foo="somePath"` → adds `props.foo = <resolved value>` — available to child `data-prop` references in the editable regions DOM tree

**Key naming constraint:** HTML data attributes are case-normalised to lowercase. `data-prop-selected-locale` → key `selectedlocale`. There is no way to preserve camelCase.

#### `data-prop-*` limitations (learned through testing)

1. **`data-prop-*` values do NOT become Astro props.** They exist in the editable regions layer only. Astro frontmatter conditionals like `selectedLocale === "fr"` cannot use values injected via `data-prop-locale`.
2. **Page-root fields are not in block data.** `editable-array` distributes block objects to children — page-root fields (like a page-level `selected_locale`) are excluded. Passing them via `data-prop-*` does not bridge this gap into Astro.
3. **Implication:** Any value needed by Astro conditional logic during re-renders must be part of the block data itself. Values outside the block (page root, other files) are only accessible to the editable regions attribute chain, not to component code.

#### How `selected_locale` is connected to re-renders (current approach)

`selected_locale` is defined **directly on each content block** that needs translation support. Because it is part of the block data, it is included in `propsBase` during Visual Editor re-renders and is accessible via `Astro.props`.

Components destructure it from the block spread: `const { selected_locale } = Astro.props;` — no merging or fallback logic needed.

#### `Astro.url` and `window.location` inside Visual Editor re-renders

CloudCannon's editable regions integration re-renders Astro components **client-side in the browser** using a fake `SSRResult`. Its `createAstro` override sets `request: new Request(window.location.href)` but does **not** set `url`. As a result, `Astro.url` is inherited from the prototype chain and is either `undefined` or stale — `Astro.url.pathname` will throw or return a wrong value.

**`window.location.pathname` is also wrong** — it returns CloudCannon's internal editor URL (e.g. `app/assets/e2e/omnipage/editor.html`), not the page being edited. The re-render runs in the editor's JavaScript context, not in the page iframe.

**Solution:** Neither `Astro.url` nor `window.location` can be used to derive `pageSlug` during re-renders. Instead, `page_slug` must be part of the block data (alongside `selected_locale`) so it's included in `propsBase` and available as an Astro prop during re-renders.

### The Connection

When `selected_locale` is set to a non-default locale (e.g. `fr`):
- Switch `data-prop` from the original frontmatter prop (e.g. `title`) to `@data[locales].index_title.value`
- Keep `data-rosey="index_title"` on the element so Rosey still processes it after the build
- CloudCannon reads and saves from `rosey/locales/fr.json` directly — no build step required to see or edit translations

---

## PoC Demo: Step-by-Step

The index page hero title is the demo subject. With `selected_locale: fr` set on the hero content block in `index.md`, the built HTML renders:

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
| [`src/components/translatedText.astro`](src/components/translatedText.astro) | Switches `data-prop` based on `selectedLocale` (truthy check); receives `pageslug` from block data via prop chain |
| [`src/components/shared/TestHeading.astro`](src/components/shared/TestHeading.astro) | Heading component that uses `TranslatedText` when `data-editable` and `data-prop` are present |
| [`src/components/global/hero/hero.astro`](src/components/global/hero/hero.astro) | Destructures `selected_locale` from block data, passes it to `TestHeading` |
| [`src/shared/astro/page.astro`](src/shared/astro/page.astro) | Spreads block data to components via `{...block}` — no explicit locale/slug props |
| [`rosey/locales/fr.json`](rosey/locales/fr.json) | French locale file (the data file CloudCannon edits) |
| [`rosey/base.json`](rosey/base.json) | Rosey's extracted source-of-truth for translation keys |
| [`writeLocales.mjs`](writeLocales.mjs) | Utility to scaffold locale files from `rosey/base.json` |

`selected_locale` and `page_slug` are set **per content block** in frontmatter (e.g. on the hero block in `index.md`). Only blocks that contain translatable `TranslatedText`-wrapped fields need them.

### Key implementation notes

- `pageSlug` comes from the block data (`page_slug`) via the prop chain: `page.astro` spreads block → hero destructures `page_slug` → passes to TestHeading → passes to TranslatedText. Fallback is `'index'`.
- Rosey key format is `{pageSlug}_{fieldName}`, so the index page hero title key is `index_title`.
- `cloudcannon.config.yml` maps `data_config.locales` → `rosey/locales/fr.json` so `@data[locales]` resolves correctly. To edit a different locale, change this single path.
- **`selected_locale` and `page_slug` are per-block.** Because they are part of the block data, they are included in `propsBase` during Visual Editor re-renders and accessible via `Astro.props`. No `data-prop-*` bridging is needed. Both `Astro.url` and `window.location` are unusable during re-renders (see above), so `page_slug` must be in the block data.
- **`page.astro` is minimal.** It just spreads `{...block}` — no explicit props or `data-prop-*` attributes. `selected_locale` and `page_slug` flow through naturally from the block spread.

---

## Settled Decisions

- **Rosey key format:** `{pageSlug}_{fieldName}` — page-prefixed to allow the same field name across different pages (e.g. `index_title` vs `about_title`)
- **Do NOT follow RCC v1 patterns** — the Rosey CloudCannon Connector v1 is mentioned only as background context for the problem being solved; this PoC takes a simpler, more direct approach
- **Stack:** Astro SSG + CloudCannon editable regions (Astro re-rendering is supported)

---

## Open Questions

- Which additional components need `TranslatedText` wrapping beyond headings?
- Is `writeLocales.mjs` / `base.json` generation a manual dev step or should it be automated in the build pipeline?
- Does `editable-text` auto-display the value from an absolute `data-prop` path (e.g. `@data[locales].index_title.value`), or does it only show the SSG-rendered DOM content? This determines whether the French text appears automatically in the Visual Editor.
- Multi-locale support: currently `data_config.locales` points to one file (`fr.json`). To support multiple locales, either change the config path per locale ("active locale" model) or define multiple data configs (`locales_fr`, `locales_de`) and include the locale in the `data-prop` path.

### Resolved

- ~~`translatedText.astro` currently hardcodes `selectedLocale === "fr"`~~ — now uses a truthy check (`selectedLocale`), works for any locale.
- ~~The `filePath` in `data-prop-locale` is hardcoded~~ — `data-prop-locale` removed entirely; `selected_locale` is now per-block.
- ~~`data-prop-*` injects into Astro props during re-renders~~ — it does not. See "data-prop-* limitations" section above.

---

## Debugging Log (Historical — superseded by block-level `selected_locale` approach)

### Visual Editor re-render not visibly changing text

### What was reported
After implementing `data-prop-locale` and `data-prop-page-slug` on `editable-array-item`, changing `selected_locale` to `fr` in the Visual Editor produced no visible text change.

### Current state of the code
`page.astro` has `data-prop-locale` and `data-prop-page-slug` on `editable-array-item` (not wrapped in `editable-component`):

```html
<editable-array-item
  data-id={block._name}
  data-component={block._name}
  data-prop-locale="@file[src/content/pages/index.md].selected_locale"
  data-prop-page-slug="@file[src/content/pages/index.md].page_slug">
  <Component {...block} selectedLocale={selectedLocale} pageslug={pageSlug} />
</editable-array-item>
```

### The rendering logic is correct — but the test data was wrong

Tracing the full prop chain during a Visual Editor re-render shows the logic is sound:

1. `data-prop-locale` injects `locale: "fr"` into hero's props (HTML attribute normalisation: `data-prop-locale` → key `locale`)
2. `hero.astro`: `const selectedLocale = _selectedLocale ?? locale` → `"fr"` ✓
3. `TestHeading` receives and forwards `selectedLocale: "fr"` ✓
4. `translatedText.astro`: `selectedLocale === "fr"` is `true` → renders the `@data[locales].index_title.value` branch ✓

**The likely reason nothing appeared to change:** `rosey/locales/fr.json` had `"index_title": { "value": "Beautiful web campaigns" }` — identical to the English original. There was literally nothing to see. Fixed: `index_title.value` is now `"De belles campagnes web"`.

### Remaining open question: does `editable-text` auto-display from `data-prop`?

The architecture assumes that when CloudCannon's `editable-text` element has `data-prop="@data[locales].index_title.value"`, it:
1. **Reads** `fr.json → index_title.value` and **displays** that value in the editor (overriding the `{text}` prop rendered as children)
2. **Saves** edits back to the same path

If assumption (1) is wrong — i.e. `editable-text` only uses `data-prop` as a save target and the displayed content is always whatever is in `{text}` — then the approach is flawed. In that case the fix would be to fetch the translated value at SSG render time and pass it as the `text` prop, so the visible content is already French when `selected_locale: fr` is set. This requires reading locale files in Astro frontmatter.

### Next step to verify

1. Build and open the index page in CloudCannon with `selected_locale: fr`. Confirm the hero heading shows `"De belles campagnes web"` (from `fr.json`) rather than the English `"Beautiful web campaigns"`.
2. If it still shows English, the `editable-text` web component is NOT auto-displaying from `data-prop`. In that case, the `text` prop passed to `translatedText.astro` must be the translated value — meaning locale file reads need to happen in Astro at build/render time, not be delegated to CloudCannon.
3. If it shows French, the re-render and `data-prop` mechanism is working end-to-end. Next: test that editing the French text in-place and saving writes back to `fr.json`.
