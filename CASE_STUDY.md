# Case study: Finland vs. EU dashboard

How this project was built with AI: what the AI did, what I decided, and what broke along the way.

**Live site:** https://iisakkahkonen.github.io/finnish-data-dashboard/

## The short version

A bilingual (English/Finnish) public dashboard comparing Finland with the rest of the EU on 13 indicators: labour market, prices, output, public debt, poverty, income, inequality, health, higher education and PISA results. Six views (line chart, ranked bars, table, Finland's gap to the EU average, rank over time, and a two-indicator scatter with correlation), shareable links, CSV export, and a plain-language explanation for every indicator. All ten Eurostat indicators are fetched from the Eurostat API on every build and refresh weekly; only the PISA scores are bundled files.

Built in roughly one working day of active time (first commit 2 Nov 2026 at 12:57, the core features done by 18:40 the same day), plus a third day on text, docs, two new indicators and data hardening. I set the direction and made the decisions; Claude (Anthropic's AI) wrote the code and did the setup.

## How the work was split

- **Me:** I made the executive decisions on this project on my own, using Claude as the main mechanical worker while I had the vision for what to build and why. I wanted to see how Finland was faring against its peers across different quality-of-life and economic metrics. The indicators were picked to build a whole, comprehensive view of how well things are going in these countries overall, not just GDP growth or some arbitrary metrics.

  I made it bilingual purely to future-proof it: if I ever want to grow this into a bigger project for international audiences, I can. AI makes this easy enough.
- **Claude (AI):** data pipeline, front end, tests, CI, data transcription and checking, README and UI text in both languages.
- **Friends:** tested the live site. One flagged that the Finnish explanations read poorly in places, which led to a full rewrite of all explanations in both languages. Overall feedback was that they liked it.

## Build timeline

1. **Pipeline first.** A Python pipeline pulling four Eurostat indicators through the JSON-stat API, with EU27 ranks per year, and tests from the first commit. The first dataset filter codes were wrong for three of the four indicators and were fixed against the Eurostat Data Browser within half an hour. This became a rule: no indicator counts as done until its dataset code is confirmed at the source.
2. **Front end.** Vite + TypeScript + Chart.js. Country chips and presets, chart and table views, colour-blind-safe colours plus dash patterns, year controls, and graceful handling of missing values (named in a status line, never filled in).
3. **Deploy and docs.** GitHub Actions: tests, then a fresh data pull, then the build and a GitHub Pages deploy, on every push and weekly. READMEs in both languages, licence and NOTICE.
4. **More indicators.** PISA mathematics, reading and science (93 countries, the 60 non-European ones shown only when a PISA indicator is selected), then life expectancy, Gini and median income.
5. **Making it understandable.** A "What does this number mean?" panel for every indicator. Inflation ranked by distance from the 2% target rather than by raw value. PISA subjects start where their scales were fixed (reading 2000, maths 2003, science 2006).
6. **Analysis features.** Shareable link (state in the URL hash), CSV download of whatever is on screen, Finland's gap to the EU average, a mobile and accessibility pass, headless browser tests in CI, a compare-two scatter with correlation, and a rank-over-time view.
7. **Day 3.**
   - Rewrote every explanation for an adult reader after friend feedback, corrected the PISA source notes, and brought both READMEs up to date.
   - Added two indicators: general government debt (% of GDP) and tertiary attainment among 25–34-year-olds. The Human Development Index was considered and dropped, because it mostly repackages life expectancy and income, which the dashboard already shows.
   - Moved life expectancy, Gini and median income from bundled CSV exports to live API fetches, so every Eurostat indicator now updates itself.
   - Added a build check that stops the deploy if any series returns more than one value per country and year. It caught a live bug on its first run (see below).
   - Moved the CI workflow to the current GitHub Actions versions ahead of the Node.js 20 retirement.

## What broke, and how it was fixed

- **Poverty ranks silently wrong since day one.** Eurostat's poverty dataset holds two series: the share of people below 60% of the median income (the official rate) and below 60% of the mean income. The filters never chose between them, so every country and year came back twice (Finland 2024: 12.6% and 18.2%). The page happened to show the right value, but the EU27 ranks were calculated over both series together, so Finland was ranked among 54 entries instead of 27. Tests and human review had both missed it. A one-line check (one value per country and year, or the build stops) caught it on its first run. The filter was fixed and a test added.
- **Wrong Eurostat filter codes.** The first pipeline commit said plainly that its dataset codes were unverified. Three were wrong; they were checked in the Data Browser and fixed.
- **Missing OECD averages.** The PISA reports' tables for 2003–2009 didn't give usable reading and science averages. Rather than leave gaps or guess, the averages were calculated from the OECD countries in the data and checked against the official mathematics averages: within about 0.4 points for most rounds, up to 3 points in the worst cases. The page and the README say which averages are calculated.
- **Controls showing in every view.** A CSS `display: flex` rule overrode the `hidden` attribute, so every view's year controls showed at once. Fixed with a global `[hidden]` rule.
- **Life expectancy had only six years.** The first source was a publication table (1980, 1990, 2000, 2010, 2023, 2024). It was replaced with the full annual series.
- **Too many lines.** Above 8 countries, the line chart originally switched to bars automatically, without the user choosing it. It became an explicit "Ranked bars" view, and the line chart labels each line at its end instead of relying on a legend.
- **Explanations pitched wrong.** The first explanations were written for a 15-year-old reader, then moved to an official register, then rewritten again for a general adult reader in natural Finnish (the first Finnish versions read like translations).

## Quality bar

- 16 pipeline tests (pytest) and a 49-check Playwright browser test against fixture data; both gate every deploy.
- The build refuses to publish if a data series is ambiguous (more than one value per country and year) and logs a warning if the EU27 average is missing.
- Every Eurostat dataset code and filter is confirmed against the Eurostat API before it is added, and locked in by a test.
- English and Finnish UI text kept at full key parity; a test fails if any indicator is missing its label, explanation or unit in either language.
- Every figure quoted in an explanation is checked against the source data.
- Sources section with dataset codes and links; licences (Apache 2.0 code, CC BY 4.0 data) and attribution.
