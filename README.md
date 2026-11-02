# Finland vs. EU: key indicators

A small dashboard comparing Finland with its Nordic and Baltic neighbours, Austria, and the EU27 average on four key economic and social indicators.

**Live site:** https://iisakkahkonen.github.io/finnish-data-dashboard/
**Suomeksi:** [README.fi.md](README.fi.md)

## What it shows

- **Indicators:** unemployment rate (15–74), HICP inflation, GDP per capita in purchasing power standard (EU27 = 100), and the at-risk-of-poverty rate (60% of the national median).
- **Countries:** Finland, Sweden, Denmark, Norway, Austria, Iceland, the other EU27 members, and the EU27 average. Pick any combination, or use a preset such as "Nordics" or "Baltics".
- **Three views:**
  - A line chart over time for up to 8 countries, with a start and end year you can set.
  - Ranked bars for one year when more than 8 countries are selected, with the exact value on each bar.
  - A table for one year, with values and each country's rank among the EU27.
- **Languages:** English and Finnish.

## Data sources

All figures come from [Eurostat](https://ec.europa.eu/eurostat), using these datasets:

| Indicator | Eurostat dataset |
|---|---|
| Unemployment rate | `une_rt_a` |
| HICP inflation, annual rate | `prc_hicp_aind` |
| GDP per capita in PPS | `tec00114` |
| At-risk-of-poverty rate | `ilc_li02` |

The data is refreshed every Monday and on every push to `main`. The pipeline pulls the latest values and rebuilds the site.

## How to read it

- **Rank** is calculated among the 27 EU members only. Norway and Iceland are shown for comparison but are not ranked.
- **GDP per capita** is a volume index with the EU27 average set to 100. Eurostat says this series is mainly meant for comparing countries with each other, not for tracking one country over time. The dashboard shows a note with each GDP chart.
- **Missing values** are skipped, not filled in. Where a country has no value for the chosen year, the status line names it.
- **Poverty rate** is the share of people with income below 60% of the national median income.

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
npm run dev
```

Open the address that Vite prints, usually `http://localhost:5173`.

## Project layout

```
data-pipeline/       Python: Eurostat fetch, parsing, rankings, tests
data/                Generated indicators.json
web/                 Vite + TypeScript site, Chart.js, English and Finnish text
.github/workflows/   Tests, data refresh and GitHub Pages deployment
```

## Licence

- **Code:** [Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
- **Data:** © Eurostat, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Please credit Eurostat if you reuse the figures.
