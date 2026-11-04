# Finland vs. EU: key indicators

A bilingual dashboard comparing Finland with its Nordic and Baltic neighbours, the rest of the EU and the EU27 average on key economic, social and education indicators.

**Live site:** https://iisakkahkonen.github.io/finnish-data-dashboard/
**Suomeksi:** [README.fi.md](README.fi.md)

## What it shows

- **11 indicators:** unemployment rate (15–74), HICP inflation, GDP per capita in PPS (EU27 = 100), the at-risk-of-poverty rate (60% of the national median), median equivalised net income in PPS and in euro, life expectancy at birth, the Gini coefficient of equivalised income, and PISA scores for 15-year-olds in mathematics (from 2003), reading (from 2000) and science (from 2006), up to 2022.
- **Countries:** all EU27 members, Norway and Iceland, and the EU27 average. Pick any combination, or use a preset such as "Nordics" or "Baltics". When a PISA indicator is selected, 60 more countries that take part in PISA (Japan, Singapore, Canada and others) and the OECD average become available.
- **Six views:**
  - **Chart:** a line chart over time, with a start and end year you can set and country names at the end of each line.
  - **Ranked bars:** all selected countries for one year, sorted, with the exact value on each bar.
  - **Table:** one year, with values and each country's rank among the EU27.
  - **Finland's gap:** Finland minus the EU27 average (or the OECD average for PISA) over time.
  - **Rank over time:** how each selected country's EU27 rank has moved.
  - **Compare two:** a scatter plot of two indicators for one year, with the correlation and a reminder that correlation is not causation.
- **Plain-language explanations:** each indicator has a short "What does this number mean?" text, written for a general adult reader, in both languages.
- **Share and export:** the current view (indicator, countries, years, view and language) is kept in the address, so a copied link opens the same view. Any view can be downloaded as CSV.
- **Languages:** English and Finnish.

## Data sources

Most figures come from [Eurostat](https://ec.europa.eu/eurostat):

| Indicator | Eurostat dataset | How it gets here |
|---|---|---|
| Unemployment rate | `une_rt_a` | Fetched from the Eurostat API on every build |
| HICP inflation, annual rate | `prc_hicp_aind` | Fetched from the Eurostat API on every build |
| GDP per capita in PPS | `tec00114` | Fetched from the Eurostat API on every build |
| At-risk-of-poverty rate | `ilc_li02` | Fetched from the Eurostat API on every build |
| Median equivalised net income (PPS and EUR) | `ilc_di03` | Exported CSV in `data-pipeline/raw/` |
| Gini coefficient | `ilc_di12` | Exported CSV in `data-pipeline/raw/` |
| Life expectancy at birth | `demo_mlexpec` | Exported CSV in `data-pipeline/raw/` |

PISA scores come from the OECD PISA results and are stored as CSV in `data-pipeline/raw/`:

- `pisa-scores.csv`: 2000 to 2018, from the DataHub mirror of World Bank EdStats (CC BY 4.0).
- `pisa-2022-and-oecd-averages.csv`: the 2022 country means and the OECD averages, typed from the OECD PISA reports. The OECD averages for reading in 2003–2009 and science in 2006–2009 are not in the reports' tables in a usable form, so they are calculated from the OECD member countries in the data. Where they can be checked against an official figure, they are within about 3 points.
- Luxembourg has no 2022 value because it is not in the extracted 2022 tables.

The site is rebuilt every Monday and on every push to `main`. Each build pulls the latest values for the four API indicators.

## How to read it

- **Rank** is calculated among the 27 EU members only. Norway, Iceland and the non-European PISA countries are shown for comparison but are not ranked.
- **Inflation** is ranked by distance from 2%, the ECB's target, so the country closest to 2% ranks first.
- **Gini** is ranked so that the most equal country is first.
- **GDP per capita** is meant for comparing countries with each other, not for tracking one country over time (Eurostat's advice). The dashboard shows a note with it.
- **Missing values** are skipped, not filled in. Where a country has no value for the chosen year, the status line names it.
- **PISA** has no EU27 average, so the OECD average is the benchmark. Differences of a few points are usually within the margin of error.

## Tests

- `data-pipeline/tests`: pytest tests for parsing, rankings and each data source.
- `web/e2e/smoke.mjs`: a Playwright browser test that runs against a fixture dataset and checks every view, the language switch, the shareable link, CSV downloads and the PISA-only countries.

Both run in GitHub Actions before every deploy. A failing test stops the deploy.

## Run it locally

Data pipeline (from the repository root):

```
pip install -r data-pipeline/requirements.txt
python -m pytest data-pipeline/tests
python data-pipeline/build.py
```

This writes `data/indicators.json`.

Website (from the `web` folder):

```
npm install
npm run dev          # development server
npm run test:e2e     # browser tests
```

Open the address that Vite prints, usually `http://localhost:5173`.

## Project layout

```
data-pipeline/       Python: Eurostat fetch, CSV and PISA loaders, rankings, tests
data-pipeline/raw/   Bundled source CSVs (PISA and the Eurostat exports)
data/                Generated indicators.json
web/                 Vite + TypeScript site, Chart.js, English and Finnish text
web/e2e/             Playwright browser test and fixture data
.github/workflows/   Tests, data refresh and GitHub Pages deployment
```

## Licence

- **Code:** [Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
- **Data:** © European Union (Eurostat), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Please credit Eurostat if you reuse the figures.
- **PISA data:** OECD PISA results, via DataHub and World Bank EdStats, licensed under CC BY 4.0.
