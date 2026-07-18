# The Reflex Hub: Page Building Spec

Shared conventions for every game page. READ THE TWO EXEMPLARS FIRST and copy their structure exactly:
- `src/pages/cps-test.astro` (click-style game, duration modes)
- `src/pages/reaction-time-test.astro` (state-machine game, lower-is-better score)

## Hard rules

1. NO em dashes and NO en dashes anywhere: not in content, code comments, FAQ answers, or copy. Use periods, commas, colons, or parentheses.
2. US English spelling.
3. No placeholder/lorem text anywhere. All content fully written.
4. Game must be visible above the fold: h1 + one-line sub + game card immediately, no hero section.
5. AdSlot NEVER above or inside the game area. Exactly two per page: one `<AdSlot size="box" />` after the ResultCard, one at the very bottom (see exemplars).
6. Keep page JS islands minimal. Vanilla TS only, no frameworks.
7. Long-form article: minimum 1,200 words, keyword-rich H2s, genuinely useful. FAQ answers 60 to 120 words each.

## Page skeleton (follow exemplar order exactly)

1. Frontmatter: imports, `title` (under 60 chars, pattern `{Keyword} - {Benefit} | The Reflex Hub`), `description` (140 to 155 chars, primary keyword + call to action), `path`, `schema` array via `webAppSchema(...)` and `breadcrumbSchema([Home, ThisPage])` from `../data/seo`, `faqs: Faq[]` (exactly 10).
2. `<BaseLayout title={title} description={description} path={path} schema={schema}>`
3. `<section class="mx-auto max-w-3xl px-4 pt-6">` with `<h1 class="font-display text-2xl font-bold sm:text-3xl">` (exact target keyword + benefit tail), one-line `<p>` sub, the game inside `<div class="card mt-4 p-4 sm:p-6">`, then `<ResultCard unit="..." />`.
4. `<div class="mt-10 px-4"><AdSlot size="box" /></div>`
5. `<article class="copy mx-auto mt-12 px-4">` long-form content with H2/H3 hierarchy. Benchmark tables use `<div class="table-wrap"><table>...</table></div>`.
6. `<FaqSection faqs={faqs} />`
7. `<RelatedTests ids={[four sibling ids]} />` (ids from `src/data/tests.ts`: reaction, cps, typing, aim, memory, sequence, f1, spacebar, tap, rightclick, typing1m, stroop, 2048)
8. Bottom `<div class="mt-12 px-4"><AdSlot size="box" /></div>`
9. `<script>` island at the end wiring the engine + ResultCard controller.

## Design tokens (Tailwind v4, already configured in src/styles/global.css)

- Colors: `bg-bg`, `bg-surface`, `bg-surface2`, `text-ink`, `text-muted`, `text-accent` (cyan), `text-accent2` (violet), `bg-ok` (green), `bg-bad` (red), `border-line`
- Fonts: `font-display` (Space Grotesk) for headings/buttons, body font is default. Big scores: `score-nums` utility (tabular-nums monospace)
- Components: `card`, `btn`, `btn-primary`, `btn-ghost`, `copy` (long-form article styling), `table-wrap`
- Utilities: `press` (scale on tap), `tap-target` (44px min), `shadow-glow`
- Touch targets minimum 44px. Games fully playable on a 360px screen with thumbs.
- Tailwind only detects full class names present as plain text in the file. Never build class names dynamically by concatenation.

## Result handling (see exemplars)

```ts
import { ResultCard, type PercentilePoint } from '../games/resultCard';
const card = new ResultCard(document.getElementById('result-card') as HTMLElement, {
  game: 'cps',            // storage namespace -> trh:cps:best, trh:cps:history
  higherIsBetter: true,   // false for ms times
  format: (v) => `${v} X`,
  onRestart: () => engine.reset(),
});
card.show({ score, display, detail, compare, percentileTable, shareText });
```
- `percentileTable`: ordered `{value, beats}` points. For higher-is-better games, beats = share of people below that score. For lower-is-better (ms) games, beats = share of people FASTER than the value (the controller flips it).
- `shareText` ends with the canonical URL, e.g. `https://thereflexhub.com/typing-test`.
- Storage keys: `trh:<game>:best` and `trh:<game>:history` handled automatically by the controller. Namespace per mode where scores are not comparable (e.g. `typing-30` vs `typing-60`).
- Confetti on new personal best is automatic.

## Published benchmark figures to use in content and `compare` lines

- Average visual reaction time 273 ms, audio about 170 ms. F1 drivers react to start lights in roughly 200 to 250 ms.
- Average typing speed 40 WPM, professionals 65 to 75 WPM. WPM = (correct chars / 5) / minutes.
- Average CPS about 6.5; top clickers 10 to 14 with jitter/butterfly techniques.
- Always include one line: this is not a medical or psychological diagnostic tool (where health-adjacent topics appear).

## Engines

Shared engines live in `src/games/`. Reuse existing ones (`clickEngine.ts`, `reactionEngine.ts`, plus `storage.ts`, `confetti.ts`, `resultCard.ts`). If your assignment includes building a new engine, put it in `src/games/<name>.ts`, keep it dependency-free vanilla TS, strict-TypeScript clean (`strict` tsconfig: no implicit any, handle nulls), and expose an options-object constructor with callbacks like the existing engines.

## TypeScript strictness gotchas

- tsconfig extends `astro/tsconfigs/strict`. Array index access returns `T | undefined`: use non-null `!` where logically safe.
- Cast `document.getElementById(...) as HTMLElement` like the exemplars.
- Do NOT run `astro build` or `astro check` (other agents work in parallel; the orchestrator builds at the end).

## SEO reference

- Canonical, OG, Twitter tags: handled by BaseLayout automatically from title/description/path.
- WebApplication + BreadcrumbList schema: pass via `schema` prop (see exemplars). FAQPage schema: automatic from `<FaqSection faqs={faqs} />`.
- One H1 only. Logical H2/H3 below.
