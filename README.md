# The Reflex Hub

**[thereflexhub.com](https://thereflexhub.com)** — free browser games that measure human performance: reaction time, clicking speed, typing speed, memory, and aim. Instant scores, real published benchmarks, and score history saved privately in the visitor's own browser. No accounts, no backend, no signup.

## Tests 
 
| Category | Tests |
|---|---|
| Reaction | Reaction Time Test, F1 Reaction Test |
| Clicking | CPS Test, Spacebar Counter, Tap Speed Test, Right Click Test |
| Typing | Typing Test, 1 Minute Typing Test |
| Brain | Memory Test, Sequence Memory, Stroop Test |
| Aim & Arcade | Aim Trainer, 2048 |

## Tech Stack

- [Astro 5](https://astro.build) — fully static output, zero client frameworks
- [Tailwind CSS 4](https://tailwindcss.com) via the Vite plugin, themed with CSS custom properties (dark default + light mode)
- TypeScript (strict) — every game engine is dependency-free vanilla TS
- Self-hosted Space Grotesk font, `@astrojs/sitemap` for SEO

## Architecture 

The codebase separates game logic from presentation:

- `src/games/` — framework-free engine classes, one per mechanic (`ReactionEngine`, `ClickEngine`, `TypingEngine`, `AimEngine`, `GridMemoryEngine`, `SequenceMemoryEngine`, `StroopEngine`, `Game2048`, …) plus shared services: localStorage persistence (`storage.ts`), the result modal (`resultCard.ts`), history charts (`statsPanel.ts`), confetti, and scroll locking.
- `src/pages/` — one Astro page per test, each following the same template: game UI, shared result card, stats panel, long-form SEO copy, FAQ with JSON-LD schema, and related tests.
- `src/data/tests.ts` — the single registry of all tests, driving the homepage, nav, footer, and related-test cards.
- `src/layouts/BaseLayout.astro` — centralizes all SEO meta, Open Graph tags, JSON-LD injection, header/footer, and theming.

All scores persist in `localStorage` under namespaced `trh:*` keys. Nothing is ever uploaded.

## Development

```bash
npm install
npm run dev      # local dev server at localhost:4321
npm run build    # static build to dist/
npm run preview  # preview the production build
npm run check    # astro check (type checking)
```

## Deployment

The site builds to plain static HTML/CSS/JS in `dist/` — deployable on any static host. For Cloudflare Pages: framework preset **Astro**, build command `npm run build`, output directory `dist`.

## License

All rights reserved. The code and content of this repository are proprietary to The Reflex Hub.
