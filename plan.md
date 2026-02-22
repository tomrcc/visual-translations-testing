# RCC — Rosey CloudCannon Connector

A client-side script that enables visual editing of Rosey locale files in CloudCannon's Visual Editor. Developers add data attributes to their editable elements; the script handles locale switching via clone+replace in the editor.

**Status:** PoC validated. Working end-to-end in CloudCannon Visual Editor. Ready to extract into a standalone npm package.

---

## How It Works

1. Developer adds `data-rosey="{key}"` and `data-rcc` to any `editable-text` element
2. `data-locales="fr,de"` on a parent element declares available locales
3. The script runs in the Visual Editor and:
   - Snapshots all `[data-rcc]` elements on init
   - Injects a floating locale switcher
   - On locale switch: clone+replace each element with `data-prop` rewriting to the locale data file
   - On "Original": clone+replace back from the snapshot

**Key constraint:** CloudCannon does NOT re-bind when attributes are mutated on existing elements. Only clone+replace (remove old node, insert new node) triggers re-binding.

---

## Package Source (`src/scripts/rcc/`)

```
src/scripts/rcc/
  index.ts       — entry point
  injector.ts    — core logic: snapshot, clone+replace, switcher UI
  logger.ts      — verbose-gated logging (controlled by data-rcc-verbose)
```

### Logging

- `warn(...)` always outputs — real issues (missing elements, config problems)
- `log(...)` only outputs when `data-rcc-verbose` is present on `<main>`
- All messages prefixed with `RCC:`

### Data attributes

| Attribute | Where | Purpose |
|---|---|---|
| `data-rcc` | On `editable-text` elements | Marks the element as translatable |
| `data-rosey="{key}"` | On `editable-text` elements | The Rosey translation key (also used by Rosey at build time) |
| `data-locales="fr,de"` | On a parent element (e.g. `<main>`) | Declares available locales |
| `data-rcc-verbose` | On a parent element (e.g. `<main>`) | Enables verbose logging |

### Consumer integration (current PoC)

In the layout file, lazy-load the script:

```html
<script>
  import("../scripts/rcc/index.ts").catch(console.warn);
</script>
```

When this becomes an npm package, consumers will import from the package instead.

---

## PoC Implementation Details

| File | Purpose |
|---|---|
| `src/scripts/rcc/` | Package-ready source (see above) |
| `src/layouts/Layout.astro` | Includes the RCC script |
| `src/shared/astro/page.astro` | `<main>` carries `data-locales` and `data-rcc-verbose` |
| `src/components/shared/Heading.astro` | Forwards `data-rosey` and `data-rcc` to inner `<editable-text>` |
| `src/components/shared/Text.astro` | Same forwarding pattern |
| `src/components/shared/Button.astro` | Same forwarding pattern |
| `src/components/global/hero/hero.astro` | Uses `rosey_prefix` to generate `data-rosey` keys |
| `rosey/locales/*.json` | Locale data files that CC reads/writes |
| `cloudcannon.config.yml` | Maps `data_config.locales_fr` / `locales_de` to locale file paths |

---

## Settled Decisions

- **Clone+replace, not setAttribute** — CC only re-binds on node replacement
- **Client-side locale switching** — no SSG-side conditionals needed
- **`data-rcc` as trigger, `data-rosey` for the key** — separate concerns
- **Rosey key format:** `{pageSlug}_{fieldName}`
- **Verbose logging via data attribute** — `data-rcc-verbose` on a parent element

---

## Open Questions

- Should `data-locales` be driven from CloudCannon config rather than hardcoded?
- Should `rosey_prefix` generation be automated from the page slug?
- Package distribution: npm link for now, publish to npm later?
