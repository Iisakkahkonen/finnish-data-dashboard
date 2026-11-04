import { Chart, registerables, type Plugin, type TooltipItem } from "chart.js";
import en from "./i18n/en.json";
import fi from "./i18n/fi.json";
import type { Dataset, DataRow } from "./types";

Chart.register(...registerables);

type Lang = "en" | "fi";
type View = "chart" | "bars" | "table" | "gap" | "scatter" | "rank";
const VIEWS: View[] = ["chart", "bars", "table", "gap", "scatter", "rank"];
const dictionaries = { en, fi } as const;

const FOCUS = "FI";
const AGGREGATE = "EU27_2020";
// Bars in the gap view that sit below the benchmark (Okabe-Ito vermillion).
const BELOW_COLOR = "#D55E00";

const PRESETS: Record<string, string[]> = {
  default: ["FI", "SE", "DK", "NO", "AT", "EU27_2020"],
  nordics: ["FI", "SE", "DK", "NO", "IS"],
  baltics: ["EE", "LV", "LT"],
  bigEu: ["DE", "FR", "IT", "ES", "NL", "PL"],
  financeOnly: ["FI"],
};

const INDICATOR_KEYS = [
  "unemployment",
  "inflation",
  "gdp_per_capita",
  "government_debt",
  "at_risk_of_poverty",
  "pisa_math",
  "pisa_reading",
  "pisa_science",
  "tertiary_attainment",
  "life_expectancy",
  "gini",
  "median_income_pps",
  "median_income_eur",
];
// Indicators whose values are percentages, so they get a % sign when shown.
const PERCENT_INDICATORS = [
  "unemployment",
  "inflation",
  "at_risk_of_poverty",
  "government_debt",
  "tertiary_attainment",
];

// Okabe-Ito colorblind-safe palette. Finland is always blue; the EU average is grey and dashed.
const FOCUS_COLOR = "#0072B2";
const AGGREGATE_COLOR = "#888888";
const BAR_COLOR = "#9aa5b1";
const PALETTE = ["#E69F00", "#56B4E9", "#009E73", "#D55E00", "#CC79A7", "#B8860B", "#8C564B"];
// Dash patterns so lines stay distinguishable in grayscale, too.
const DASHES: number[][] = [[], [12, 5], [4, 4], [16, 5, 4, 5], [6, 6, 2, 6], [20, 6]];

let lang: Lang = "en";
let dataset: Dataset | null = null;
let chart: Chart | null = null;
let selected: string[] = [...PRESETS.default];
let view: View = "chart";
// Year shown in ranked-bar mode. null means "pick the latest year with data".
let barYear: number | null = null;
// Years available for the current indicator, used by the year controls.
let currentYears: number[] = [];
// Start and end years for the line chart. null means "full range".
let rangeStart: number | null = null;
let rangeEnd: number | null = null;
// Indicator on the vertical axis of the comparison view. null means "pick a sensible default".
let compareKey: string | null = null;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function t(path: string): string {
  let node: unknown = dictionaries[lang];
  for (const key of path.split(".")) {
    if (node && typeof node === "object") {
      node = (node as Record<string, unknown>)[key];
    } else {
      node = undefined;
      break;
    }
  }
  return typeof node === "string" ? node : path;
}

// ---- Data helpers (missing and non-numeric values are skipped everywhere) --

// Rows for one indicator, keeping only finite numeric values.
function rowsFor(indicator: string): DataRow[] {
  if (!dataset) return [];
  return dataset.records.filter(
    (r) => r.indicator === indicator && typeof r.value === "number" && Number.isFinite(r.value),
  );
}

function yearsFor(indicator: string): number[] {
  return [...new Set(rowsFor(indicator).map((r) => r.year))].sort((a, b) => a - b);
}

function seriesFor(indicator: string, geo: string): Map<number, number> {
  const points = new Map<number, number>();
  for (const row of rowsFor(indicator)) {
    if (row.geo === geo) points.set(row.year, row.value);
  }
  return points;
}

function valueAt(indicator: string, geo: string, year: number): number | null {
  return seriesFor(indicator, geo).get(year) ?? null;
}

// Latest year in which at least one selected country has a value.
function defaultYear(indicator: string, geos: string[], years: number[]): number {
  for (let i = years.length - 1; i >= 0; i--) {
    if (geos.some((g) => valueAt(indicator, g, years[i]) !== null)) return years[i];
  }
  return years[years.length - 1];
}

function formatValue(value: number, indicator?: string): string {
  if (!Number.isFinite(value)) return "—";
  const text = value.toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", {
    maximumFractionDigits: 2,
  });
  if (indicator && PERCENT_INDICATORS.includes(indicator)) {
    return lang === "fi" ? `${text} %` : `${text}%`;
  }
  return text;
}

// ---- Colors and dashes ------------------------------------------------------

// Non-focus countries are numbered within the current selection, so every
// selected line gets its own color. Colors can shift when other countries are toggled.
function slotFor(geo: string): number {
  const others = effectiveSelection().filter((g) => g !== FOCUS && g !== AGGREGATE);
  return Math.max(0, others.indexOf(geo));
}

function colorFor(geo: string): string {
  if (geo === FOCUS) return FOCUS_COLOR;
  if (geo === AGGREGATE) return AGGREGATE_COLOR;
  const slot = slotFor(geo);
  if (slot < PALETTE.length) return PALETTE[slot];
  // Beyond the base palette, spread hues evenly (golden angle) and alternate lightness,
  // so neighbouring lines never share a hue family.
  const hue = Math.round((slot * 137.508) % 360);
  return `hsl(${hue}, 70%, ${slot % 2 === 0 ? 42 : 58}%)`;
}

function dashFor(geo: string): number[] {
  if (geo === FOCUS) return [];
  if (geo === AGGREGATE) return [6, 4];
  return DASHES[slotFor(geo) % DASHES.length];
}

// ---- Country lists ----------------------------------------------------------

// All countries in the data, Finland first, EU average last, the rest by name.
// Any indicator whose key starts with "pisa_" uses the PISA data only.
const isPisa = (indicator: string) => indicator.startsWith("pisa_");

function allGeos(): string[] {
  if (!dataset) return [];
  // Countries that only appear in PISA are listed only while PISA is selected.
  const onlyPisa = isPisa(currentIndicator());
  const eurostatGeos = new Set(
    dataset.records.filter((r) => !isPisa(r.indicator)).map((r) => r.geo),
  );
  // Only countries that have at least one value for the chosen indicator.
  const indicator = currentIndicator();
  const withData = new Set(rowsFor(indicator).map((r) => r.geo));
  const geos = [...withData].filter((g) => onlyPisa || eurostatGeos.has(g));
  return geos.sort((a, b) => {
    if (a === FOCUS) return -1;
    if (b === FOCUS) return 1;
    if (a === AGGREGATE) return 1;
    if (b === AGGREGATE) return -1;
    return t(`countries.${a}`).localeCompare(t(`countries.${b}`), lang);
  });
}

// Selected countries in display order.
function effectiveSelection(): string[] {
  return allGeos().filter((g) => selected.includes(g));
}

function currentIndicator(): string {
  return el<HTMLSelectElement>("indicator-select").value;
}

// ---- Controls -------------------------------------------------------------

function applyLanguage(): void {
  document.documentElement.lang = lang;
  document.title = t("title");
  document.querySelectorAll<HTMLElement>("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n ?? "");
  });

  // Re-label the indicator dropdown, keeping the current choice.
  const select = el<HTMLSelectElement>("indicator-select");
  const current = select.value || INDICATOR_KEYS[0];
  select.innerHTML = "";
  for (const key of INDICATOR_KEYS) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = t(`indicators.${key}`);
    select.append(option);
  }
  select.value = current;

  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  });

  el("footer-source").textContent = t("footerSource");
  if (dataset) el("footer-updated").textContent = `${t("footerUpdated")}: ${dataset.updated}`;

  renderPresets();
  renderAll();
}

function renderPresets(): void {
  const box = el("presets");
  box.innerHTML = "";
  for (const key of Object.keys(PRESETS)) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.textContent = t(`presetNames.${key}`);
    button.addEventListener("click", () => {
      const available = new Set(allGeos());
      selected = PRESETS[key].filter((g) => available.has(g));
      renderAll();
    });
    box.append(button);
  }
}

function renderChips(): void {
  const box = el("country-chips");
  box.innerHTML = "";
  for (const geo of allGeos()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chip";
    button.dataset.geo = geo;
    button.textContent = t(`countries.${geo}`);
    button.setAttribute("aria-pressed", String(selected.includes(geo)));
    button.addEventListener("click", () => {
      selected = selected.includes(geo)
        ? selected.filter((g) => g !== geo)
        : [...selected, geo];
      renderAll();
    });
    box.append(button);
  }
}

// Year scrubber for ranked-bar mode: slider, previous and next buttons.
function updateYearControls(years: number[], year: number, visible: boolean): void {
  const controls = el("year-controls");
  controls.hidden = !visible;
  if (!visible) return;

  const index = years.indexOf(year);
  const slider = el<HTMLInputElement>("year-slider");
  slider.min = "0";
  slider.max = String(Math.max(0, years.length - 1));
  slider.value = String(index);
  el<HTMLButtonElement>("year-prev").disabled = index <= 0;
  el<HTMLButtonElement>("year-next").disabled = index >= years.length - 1;
  el("year-value").textContent = String(year);
}

function stepYear(delta: number): void {
  if (currentYears.length === 0 || barYear === null) return;
  const index = Math.min(
    currentYears.length - 1,
    Math.max(0, currentYears.indexOf(barYear) + delta),
  );
  barYear = currentYears[index];
  renderAll();
}

// Start/end range scrubber for the line chart. Both default to the full range.
function updateRangeControls(years: number[], visible: boolean): void {
  const controls = el("range-controls");
  controls.hidden = !visible;
  if (!visible || years.length === 0) return;

  const start = rangeStart ?? years[0];
  const end = rangeEnd ?? years[years.length - 1];
  const from = el<HTMLInputElement>("range-from");
  const to = el<HTMLInputElement>("range-to");
  from.max = to.max = String(years.length - 1);
  from.value = String(years.indexOf(start));
  to.value = String(years.indexOf(end));
  el("range-from-value").textContent = String(start);
  el("range-to-value").textContent = String(end);
}

// Years inside the chosen range, for the line chart.
function selectRange(indicator: string): number[] {
  const years = yearsFor(indicator);
  currentYears = years;
  if (years.length === 0) {
    updateRangeControls([], false);
    return [];
  }
  if (rangeStart === null || !years.includes(rangeStart)) rangeStart = years[0];
  if (rangeEnd === null || !years.includes(rangeEnd)) rangeEnd = years[years.length - 1];
  updateRangeControls(years, true);
  return years.filter((y) => y >= (rangeStart ?? years[0]) && y <= (rangeEnd ?? years[years.length - 1]));
}

// ---- Rendering ------------------------------------------------------------

// Draws the page and keeps the address bar in step with the current choices.
function renderAll(): void {
  renderContent();
  writeHash();
}

// Table and ranked bars show one year at a time; lines show a range of years.
function usesSingleYear(): boolean {
  return view === "table" || view === "bars";
}

function renderContent(): void {
  if (!dataset) return;

  renderChips();
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });

  const statusEl = el("status");
  const noteEl = el("note");
  const geos = effectiveSelection();
  const indicator = currentIndicator();

  el("explain-text").textContent = t(`explain.${indicator}`);
  const note = t(`notes.${indicator}`);
  noteEl.hidden = note.startsWith("notes.");
  noteEl.textContent = noteEl.hidden ? "" : note;

  statusEl.textContent = "";
  updateYearControls([], 0, false);
  updateRangeControls([], false);
  el("compare-control").hidden = view !== "scatter";

  if (view === "scatter") {
    renderScatter(indicator, geos);
    return;
  }

  if (view === "rank") {
    renderRank(indicator, geos);
    return;
  }

  if (view === "gap") {
    renderGap(indicator);
    return;
  }

  if (geos.length === 0) {
    statusEl.textContent = t("noCountries");
    destroyChart();
    el("table-wrap").hidden = true;
    el("chart-wrap").hidden = true;
    return;
  }

  // Table and ranked bars both show one year at a time, so they get the year scrubber.
  // Lines show a range of years; ranked bars are an option for comparing one year.
  const yearMode = usesSingleYear();
  const year = yearMode ? selectYear(indicator, geos) : null;

  if (view === "table") {
    destroyChart();
    el("chart-wrap").hidden = true;
    el("table-wrap").hidden = false;
    renderTable(indicator, geos, year);
    return;
  }

  el("table-wrap").hidden = true;
  el("chart-wrap").hidden = false;

  if (yearMode) {
    renderBars(indicator, geos, year);
  } else {
    renderChart(indicator, geos);
  }
}


// Country names at the right end of each line, nudged apart so they do not overlap.
function endLabelsPlugin(items: Array<{ dataset: number; geo: string; last: number }>): Plugin<"line"> {
  return {
    id: "endLabels",
    afterDatasetsDraw(c: Chart<"line">) {
      const ctx = c.ctx;
      ctx.save();
      ctx.font = "600 12px system-ui, -apple-system, sans-serif";
      ctx.textBaseline = "middle";
      const labels = items
        .filter((item) => item.last >= 0)
        .map((item) => {
          const point = c.getDatasetMeta(item.dataset).data[item.last];
          return { geo: item.geo, x: point.x + 8, y: point.y };
        })
        .sort((a, b) => a.y - b.y);
      const gap = 13;
      for (let i = 1; i < labels.length; i++) {
        if (labels[i].y - labels[i - 1].y < gap) labels[i].y = labels[i - 1].y + gap;
      }
      for (const label of labels) {
        ctx.fillStyle = colorFor(label.geo);
        ctx.fillText(t(`countries.${label.geo}`), label.x, label.y);
      }
      ctx.restore();
    },
  };
}

// Index of the last year with a value, or -1.
function lastIndexWith(years: number[], has: (year: number) => boolean): number {
  let last = -1;
  years.forEach((y, i) => {
    if (has(y)) last = i;
  });
  return last;
}

function destroyChart(): void {
  chart?.destroy();
  chart = null;
}

function renderChart(indicator: string, geos: string[]): void {
  el("chart-wrap").style.height = geos.length > 8 ? "620px" : "420px";
  const years = selectRange(indicator);
  if (years.length === 0) {
    el("status").textContent = t("noData");
    destroyChart();
    return;
  }

  const datasets = geos.map((geo) => {
    const points = seriesFor(indicator, geo);
    const isFocus = geo === FOCUS;
    return {
      label: t(`countries.${geo}`),
      // Missing years become gaps; spanGaps draws a line across short ones.
      data: years.map((y) => points.get(y) ?? null),
      borderColor: colorFor(geo),
      backgroundColor: colorFor(geo),
      borderWidth: isFocus ? 3.5 : 2.5,
      borderDash: dashFor(geo),
      // A country with a single data point has no line, so it needs a visible marker.
      pointRadius: isFocus || points.size < 2 ? 4 : 0,
      spanGaps: true,
      tension: 0.2,
    };
  });

  const endLabels = endLabelsPlugin(
    geos.map((geo, dataset) => {
      const points = seriesFor(indicator, geo);
      return { dataset, geo, last: lastIndexWith(years, (y) => points.has(y)) };
    }),
  );

  destroyChart();
  chart = new Chart(el<HTMLCanvasElement>("chart"), {
    type: "line",
    plugins: [endLabels],
    data: { labels: years.map(String), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: window.innerWidth < 480 ? 72 : 96 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        title: { display: true, text: t(`indicators.${indicator}`) },
      },
    },
  });
}

// Year shown by ranked bars and the table. Also sets up the year scrubber for this indicator.
function selectYear(indicator: string, geos: string[]): number | null {
  const years = yearsFor(indicator);
  currentYears = years;
  if (years.length === 0) {
    updateYearControls([], 0, false);
    return null;
  }
  if (barYear === null || !years.includes(barYear)) {
    barYear = defaultYear(indicator, geos, years);
  }
  updateYearControls(years, barYear, true);
  return barYear;
}

// Ranked horizontal bars for one year. Countries without a value that year are
// left out of the chart and named in the status line instead.
function renderBars(indicator: string, geos: string[], year: number | null): void {
  destroyChart();
  if (year === null) {
    el("status").textContent = t("noData");
    return;
  }

  const entries = geos.map((geo) => ({ geo, value: valueAt(indicator, geo, year) }));
  const bars = entries
    .filter((e): e is { geo: string; value: number } => e.value !== null)
    .sort((a, b) => b.value - a.value);
  const missing = entries.filter((e) => e.value === null).map((e) => t(`countries.${e.geo}`));

  const messages: string[] = [];
  if (missing.length > 0) {
    messages.push(
      t("missingYear").replace("{year}", String(year)).replace("{names}", missing.join(", ")),
    );
  }
  el("status").textContent = messages.join(" ");

  if (bars.length === 0) return;

  // Draws each bar's exact value just past its end.
  const valueLabels: Plugin<"bar"> = {
    id: "valueLabels",
    afterDatasetsDraw(c: Chart<"bar">) {
      const ctx = c.ctx;
      const meta = c.getDatasetMeta(0);
      ctx.save();
      ctx.font = "600 13px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = getComputedStyle(document.body).color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      meta.data.forEach((element, index) => {
        ctx.fillText(formatValue(bars[index].value, indicator), element.x + 6, element.y);
      });
      ctx.restore();
    },
  };

  el("chart-wrap").style.height = `${Math.max(420, bars.length * 26 + 80)}px`;
  chart = new Chart(el<HTMLCanvasElement>("chart"), {
    type: "bar",
    plugins: [valueLabels],
    data: {
      labels: bars.map((bar) => t(`countries.${bar.geo}`)),
      datasets: [
        {
          label: t(`indicators.${indicator}`),
          data: bars.map((bar) => bar.value),
          backgroundColor: bars.map((bar) =>
            bar.geo === FOCUS ? FOCUS_COLOR : bar.geo === AGGREGATE ? AGGREGATE_COLOR : BAR_COLOR,
          ),
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      // Room on the right so the value labels fit inside the chart.
      layout: { padding: { right: 72 } },
      plugins: {
        legend: { display: false },
        title: { display: true, text: `${t(`indicators.${indicator}`)} · ${year}` },
      },
    },
  });
}

// One row per selected country for the chosen year. Countries without a value
// that year show a dash and are named in the status line.
function renderTable(indicator: string, geos: string[], year: number | null): void {
  const wrap = el("table-wrap");
  wrap.innerHTML = "";
  if (year === null) {
    el("status").textContent = t("noData");
    return;
  }

  const table = document.createElement("table");
  table.createCaption().textContent = `${t(`indicators.${indicator}`)} · ${year}`;
  const headRow = table.createTHead().insertRow();
  for (const key of ["country", "value", "rank"]) {
    const th = document.createElement("th");
    th.textContent = t(`columns.${key}`);
    headRow.append(th);
  }

  const missing: string[] = [];
  const body = table.createTBody();
  for (const geo of geos) {
    const value = valueAt(indicator, geo, year);
    const rank = value !== null ? dataset?.ranks[indicator]?.[geo]?.[String(year)] : undefined;
    if (value === null) missing.push(t(`countries.${geo}`));

    const row = body.insertRow();
    const cells = [
      t(`countries.${geo}`),
      value !== null ? formatValue(value, indicator) : "—",
      rank ? String(rank) : "—",
    ];
    for (const text of cells) {
      row.insertCell().textContent = text;
    }
  }

  if (missing.length > 0) {
    el("status").textContent = t("missingYear")
      .replace("{year}", String(year))
      .replace("{names}", missing.join(", "));
  }
  wrap.append(table);
}

// ---- Gap to the EU average --------------------------------------------------

interface GapPoint {
  year: number;
  focus: number;
  bench: number;
  gap: number;
  rank: number | undefined;
}

// Reference series for the gap view: the EU27 average, or the OECD average for PISA.
function benchmarkFor(indicator: string): string | null {
  const geos = new Set(rowsFor(indicator).map((r) => r.geo));
  if (geos.has(AGGREGATE)) return AGGREGATE;
  if (geos.has("OECD")) return "OECD";
  return null;
}

// Years where both Finland and the benchmark have a value, with Finland's EU27 rank.
function gapPoints(indicator: string, bench: string, years: number[]): GapPoint[] {
  const focus = seriesFor(indicator, FOCUS);
  const reference = seriesFor(indicator, bench);
  const points: GapPoint[] = [];
  for (const year of years) {
    const f = focus.get(year);
    const b = reference.get(year);
    if (f === undefined || b === undefined) continue;
    points.push({
      year,
      focus: f,
      bench: b,
      gap: Math.round((f - b) * 100) / 100,
      rank: dataset?.ranks[indicator]?.[FOCUS]?.[String(year)],
    });
  }
  return points;
}

function currentGap(indicator: string): { bench: string; points: GapPoint[] } | null {
  const bench = benchmarkFor(indicator);
  if (bench === null) return null;
  const years = selectRange(indicator);
  return { bench, points: gapPoints(indicator, bench, years) };
}

function plainNumber(value: number): string {
  return value.toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 2 });
}

// Number with an explicit sign: +2.1, −0.3, 0.
function signed(value: number): string {
  if (value === 0) return plainNumber(0);
  return `${value > 0 ? "+" : "−"}${plainNumber(Math.abs(value))}`;
}

function renderGap(indicator: string): void {
  const statusEl = el("status");
  const gap = currentGap(indicator);
  if (gap === null || gap.points.length === 0) {
    statusEl.textContent = gap === null ? t("gapNoBenchmark") : t("noData");
    destroyChart();
    el("chart-wrap").hidden = true;
    el("table-wrap").hidden = true;
    return;
  }

  const { bench, points } = gap;
  const unit = t(`gapUnits.${indicator}`);
  const country = t(`countries.${FOCUS}`);
  const benchName = t(`countries.${bench}`);
  const title = t("gapTitle").replace("{country}", country).replace("{benchmark}", benchName);

  el("chart-wrap").hidden = false;
  el("table-wrap").hidden = false;
  el("chart-wrap").style.height = "380px";

  destroyChart();
  chart = new Chart(el<HTMLCanvasElement>("chart"), {
    type: "bar",
    data: {
      labels: points.map((p) => String(p.year)),
      datasets: [
        {
          label: `${title} (${unit})`,
          data: points.map((p) => p.gap),
          backgroundColor: points.map((p) => (p.gap >= 0 ? FOCUS_COLOR : BELOW_COLOR)),
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: `${t(`indicators.${indicator}`)} · ${title} (${unit})` },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<"bar">) => {
              const p = points[item.dataIndex];
              return `${country} ${plainNumber(p.focus)} · ${benchName} ${plainNumber(p.bench)} · ${signed(p.gap)} ${unit}`;
            },
          },
        },
      },
    },
  });

  const last = points[points.length - 1];
  const template = last.gap === 0 ? t("gapEqual") : last.gap > 0 ? t("gapAbove") : t("gapBelow");
  const sentence = template
    .replace("{year}", String(last.year))
    .replace("{country}", country)
    .replace("{amount}", `${plainNumber(Math.abs(last.gap))} ${unit}`)
    .replace("{name}", benchName)
    .replace("{genitive}", t(`benchmarkGenitive.${bench}`));
  statusEl.textContent = `${sentence} ${t("gapScopeNote").replace("{name}", benchName)}`;

  renderGapTable(indicator, bench, points, unit);
}

// Newest year first: Finland, the benchmark, the difference and Finland's EU27 rank.
function renderGapTable(indicator: string, bench: string, points: GapPoint[], unit: string): void {
  const wrap = el("table-wrap");
  wrap.innerHTML = "";

  const table = document.createElement("table");
  table.createCaption().textContent = t(`indicators.${indicator}`);
  const headRow = table.createTHead().insertRow();
  const heads = [
    t("columns.year"),
    t(`countries.${FOCUS}`),
    t(`countries.${bench}`),
    `${t("columns.difference")} (${unit})`,
    t("columns.rank"),
  ];
  for (const text of heads) {
    const th = document.createElement("th");
    th.textContent = text;
    headRow.append(th);
  }

  const body = table.createTBody();
  for (const p of [...points].reverse()) {
    const row = body.insertRow();
    const cells = [
      String(p.year),
      formatValue(p.focus, indicator),
      formatValue(p.bench, indicator),
      signed(p.gap),
      p.rank ? String(p.rank) : "—",
    ];
    for (const text of cells) row.insertCell().textContent = text;
  }
  wrap.append(table);
}

// ---- Shareable link ----------------------------------------------------------


// ---- Comparison of two indicators (scatter) ------------------------------------

interface ScatterPoint {
  geo: string;
  x: number;
  y: number;
}

interface ScatterGroup {
  label: string;
  color: string;
  radius: number;
  style: "circle" | "rectRot";
  points: ScatterPoint[];
}

// Countries with a value for both indicators in one year, split from the aggregates.
function scatterPointsFor(xKey: string, yKey: string, year: number): ScatterPoint[] {
  const xs = new Map<string, number>();
  for (const row of rowsFor(xKey)) if (row.year === year) xs.set(row.geo, row.value);
  const points: ScatterPoint[] = [];
  for (const row of rowsFor(yKey)) {
    const x = xs.get(row.geo);
    if (row.year === year && x !== undefined) points.push({ geo: row.geo, x, y: row.value });
  }
  return points;
}

// Years in which the two indicators share at least one country.
function scatterYears(xKey: string, yKey: string): number[] {
  const common = yearsFor(xKey).filter((y) => yearsFor(yKey).includes(y));
  return common.filter((y) => scatterPointsFor(xKey, yKey, y).length > 0);
}

function defaultCompareKey(xKey: string): string {
  const preferred = xKey === "gdp_per_capita" ? "life_expectancy" : "gdp_per_capita";
  return preferred;
}

// Pearson correlation coefficient, or null when it cannot be computed.
function pearson(points: ScatterPoint[]): number | null {
  const n = points.length;
  if (n < 3) return null;
  const mx = points.reduce((sum, p) => sum + p.x, 0) / n;
  const my = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my);
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

function describeCorrelation(r: number, year: number, n: number): string {
  const size = Math.abs(r);
  const rText = r.toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const base = (text: string) =>
    text.replace("{year}", String(year)).replace("{n}", String(n)).replace("{r}", rText);
  if (size < 0.2) return `${base(t("scatterSummaryNone"))} ${t("scatterCaution")}`;
  const strength = t(size >= 0.7 ? "scatterStrong" : size >= 0.4 ? "scatterModerate" : "scatterWeak");
  const direction = t(r > 0 ? "scatterPositive" : "scatterNegative");
  return `${base(t("scatterSummary")).replace("{strength}", strength).replace("{direction}", direction)} ${t("scatterCaution")}`;
}

function renderScatter(xKey: string, selectedGeos: string[]): void {
  const statusEl = el("status");
  el("table-wrap").hidden = true;

  // The vertical-axis list leaves out the indicator already on the horizontal axis.
  const compare = el<HTMLSelectElement>("compare-select");
  if (compareKey === null || compareKey === xKey || !INDICATOR_KEYS.includes(compareKey)) {
    compareKey = defaultCompareKey(xKey);
  }
  compare.innerHTML = "";
  for (const key of INDICATOR_KEYS.filter((k) => k !== xKey)) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = t(`indicators.${key}`);
    compare.append(option);
  }
  compare.value = compareKey;
  const yKey = compareKey;

  const years = scatterYears(xKey, yKey);
  currentYears = years;
  if (years.length === 0) {
    statusEl.textContent = t("scatterNoOverlap");
    destroyChart();
    el("chart-wrap").hidden = true;
    return;
  }
  if (barYear === null || !years.includes(barYear)) {
    let pick = years[years.length - 1];
    for (let i = years.length - 1; i >= 0; i--) {
      if (scatterPointsFor(xKey, yKey, years[i]).filter((p) => p.geo !== AGGREGATE && p.geo !== "OECD").length >= 10) {
        pick = years[i];
        break;
      }
    }
    barYear = pick;
  }
  const year = barYear;
  updateYearControls(years, year, true);

  const all = scatterPointsFor(xKey, yKey, year);
  const countries = all.filter((p) => p.geo !== AGGREGATE && p.geo !== "OECD");
  const candidates: ScatterGroup[] = [
    {
      label: t("scatterOthers"),
      color: BAR_COLOR,
      radius: 4,
      style: "circle",
      points: countries.filter((p) => p.geo !== FOCUS && !selectedGeos.includes(p.geo)),
    },
    {
      label: t("scatterSelected"),
      color: PALETTE[0],
      radius: 6,
      style: "circle",
      points: countries.filter((p) => p.geo !== FOCUS && selectedGeos.includes(p.geo)),
    },
    {
      label: t(`countries.${AGGREGATE}`),
      color: AGGREGATE_COLOR,
      radius: 7,
      style: "rectRot",
      points: all.filter((p) => p.geo === AGGREGATE || p.geo === "OECD"),
    },
    {
      label: t(`countries.${FOCUS}`),
      color: FOCUS_COLOR,
      radius: 8,
      style: "circle",
      points: countries.filter((p) => p.geo === FOCUS),
    },
  ];
  const groups = candidates.filter((g) => g.points.length > 0);

  // Names next to the points the reader is most likely looking for.
  const nameLabels: Plugin<"scatter"> = {
    id: "nameLabels",
    afterDatasetsDraw(c: Chart<"scatter">) {
      const ctx = c.ctx;
      ctx.save();
      ctx.font = "600 12px system-ui, -apple-system, sans-serif";
      ctx.fillStyle = getComputedStyle(document.body).color;
      ctx.textBaseline = "middle";
      groups.forEach((group, di) => {
        if (group.label === t("scatterOthers")) return;
        c.getDatasetMeta(di).data.forEach((element, index) => {
          ctx.fillText(t(`countries.${group.points[index].geo}`), element.x + 10, element.y);
        });
      });
      ctx.restore();
    },
  };

  el("chart-wrap").hidden = false;
  el("chart-wrap").style.height = "460px";
  destroyChart();
  chart = new Chart(el<HTMLCanvasElement>("chart"), {
    type: "scatter",
    plugins: [nameLabels],
    data: {
      datasets: groups.map((g) => ({
        label: g.label,
        data: g.points.map((p) => ({ x: p.x, y: p.y })),
        backgroundColor: g.color,
        borderColor: g.color,
        pointRadius: g.radius,
        pointHoverRadius: g.radius + 2,
        pointStyle: g.style,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 60 } },
      plugins: {
        legend: { position: "bottom" },
        title: {
          display: true,
          text: t("scatterTitle")
            .replace("{y}", t(`indicators.${yKey}`))
            .replace("{x}", t(`indicators.${xKey}`))
            .replace("{year}", String(year)),
        },
        tooltip: {
          callbacks: {
            label: (item: TooltipItem<"scatter">) => {
              const p = groups[item.datasetIndex].points[item.dataIndex];
              return `${t(`countries.${p.geo}`)}: ${formatValue(p.x, xKey)} / ${formatValue(p.y, yKey)}`;
            },
          },
        },
      },
      scales: {
        x: { title: { display: true, text: t(`indicators.${xKey}`) } },
        y: { title: { display: true, text: t(`indicators.${yKey}`) } },
      },
    },
  });

  const r = pearson(countries);
  statusEl.textContent =
    r === null
      ? t("scatterTooFew").replace("{year}", String(year))
      : describeCorrelation(r, year, countries.length);
}


// ---- Rank over time ---------------------------------------------------------

// EU27 rank per year for the selected countries (1 = best). Only EU27 members have ranks.
function renderRank(indicator: string, selectedGeos: string[]): void {
  const statusEl = el("status");
  el("table-wrap").hidden = true;
  const table = dataset?.ranks[indicator] ?? {};
  const geos = [FOCUS, ...selectedGeos.filter((g) => g !== FOCUS)].filter(
    (g) => selectedGeos.includes(g) && table[g] !== undefined,
  );
  const years = selectRange(indicator);
  const rankOf = (geo: string, y: number): number | null => table[geo]?.[String(y)] ?? null;
  const shown = years.filter((y) => geos.some((g) => rankOf(g, y) !== null));

  if (geos.length === 0 || shown.length === 0) {
    statusEl.textContent = t("rankNoData");
    destroyChart();
    el("chart-wrap").hidden = true;
    updateRangeControls([], false);
    return;
  }

  let worst = 1;
  for (const g of geos) for (const y of shown) worst = Math.max(worst, rankOf(g, y) ?? 1);
  worst = Math.max(worst, 27);

  const endLabels = endLabelsPlugin(
    geos.map((geo, dataset) => ({ dataset, geo, last: lastIndexWith(shown, (y) => rankOf(geo, y) !== null) })),
  );

  el("chart-wrap").hidden = false;
  el("chart-wrap").style.height = geos.length > 8 ? "620px" : "460px";
  destroyChart();
  chart = new Chart(el<HTMLCanvasElement>("chart"), {
    type: "line",
    plugins: [endLabels],
    data: {
      labels: shown.map(String),
      datasets: geos.map((geo) => ({
        label: t(`countries.${geo}`),
        data: shown.map((y) => rankOf(geo, y)),
        borderColor: colorFor(geo),
        backgroundColor: colorFor(geo),
        borderWidth: geo === FOCUS ? 3.5 : 2.5,
        borderDash: dashFor(geo),
        pointRadius: geo === FOCUS ? 3 : 0,
        spanGaps: true,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: window.innerWidth < 480 ? 72 : 96 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "bottom" },
        title: { display: true, text: `${t(`indicators.${indicator}`)} · ${t("rankAxis")}` },
      },
      scales: {
        y: {
          reverse: true,
          min: 1,
          max: worst,
          ticks: { precision: 0 },
          title: { display: true, text: t("rankAxis") },
        },
      },
    },
  });

  const finland = shown.filter((y) => rankOf(FOCUS, y) !== null);
  if (finland.length === 0) {
    statusEl.textContent = t("rankNoFinland");
    return;
  }
  const ranks = finland.map((y) => ({ year: y, rank: rankOf(FOCUS, y) as number }));
  const latest = ranks[ranks.length - 1];
  const best = ranks.reduce((a, b) => (b.rank < a.rank ? b : a));
  const low = ranks.reduce((a, b) => (b.rank > a.rank ? b : a));
  statusEl.textContent = t("rankSummary")
    .replace("{year}", String(latest.year))
    .replace("{rank}", String(latest.rank))
    .replace("{best}", String(best.rank))
    .replace("{bestYear}", String(best.year))
    .replace("{worst}", String(low.rank))
    .replace("{worstYear}", String(low.year));
}

// Puts the current choices into the address, so copying the address reproduces the view.
function writeHash(): void {
  if (!dataset) return;
  const parts = [
    `i=${currentIndicator()}`,
    `c=${effectiveSelection().join(",")}`,
    `v=${view}`,
    `l=${lang}`,
  ];
  if (view === "scatter" && compareKey !== null) parts.push(`vs=${compareKey}`);
  if (barYear !== null) parts.push(`y=${barYear}`);
  if (rangeStart !== null) parts.push(`from=${rangeStart}`);
  if (rangeEnd !== null) parts.push(`to=${rangeEnd}`);
  history.replaceState(null, "", `#${parts.join("&")}`);
}

// Restores choices from the address. Anything unknown or invalid is ignored.
function readHash(): void {
  if (!dataset) return;
  const params = new URLSearchParams(location.hash.replace(/^#/, ""));

  const indicator = params.get("i");
  if (indicator && INDICATOR_KEYS.includes(indicator)) {
    el<HTMLSelectElement>("indicator-select").value = indicator;
  }

  const wantedCompare = params.get("vs");
  compareKey = wantedCompare && INDICATOR_KEYS.includes(wantedCompare) ? wantedCompare : null;

  const wantedView = params.get("v");
  if (wantedView && VIEWS.includes(wantedView as View)) view = wantedView as View;

  const known = new Set(dataset.records.map((r) => r.geo));
  const countries = params.get("c");
  if (countries !== null) {
    const list = countries.split(",").filter((g) => known.has(g));
    if (list.length > 0) selected = list;
  }

  const whole = (key: string): number | null => {
    const raw = params.get(key);
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) ? n : null;
  };
  barYear = whole("y");
  rangeStart = whole("from");
  rangeEnd = whole("to");

  const wantedLang = params.get("l");
  if (wantedLang === "en" || wantedLang === "fi") lang = wantedLang;
}

let feedbackTimer: number | undefined;

function showFeedback(text: string): void {
  const box = el("action-feedback");
  box.textContent = text;
  window.clearTimeout(feedbackTimer);
  feedbackTimer = window.setTimeout(() => {
    box.textContent = "";
  }, 4000);
}

async function copyLink(): Promise<void> {
  writeHash();
  const address = location.href;
  try {
    await navigator.clipboard.writeText(address);
    showFeedback(t("linkCopied"));
  } catch {
    // Older browsers and insecure pages: fall back to a hidden text box.
    const box = document.createElement("textarea");
    box.value = address;
    box.style.position = "fixed";
    box.style.opacity = "0";
    document.body.append(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    showFeedback(t(ok ? "linkCopied" : "linkCopyFailed"));
  }
}

// ---- CSV download ------------------------------------------------------------

function csvLine(cells: Array<string | number | undefined>): string {
  return cells
    .map((cell) => {
      const text = cell === undefined ? "" : String(cell);
      return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    })
    .join(",");
}

// The data behind what is on screen: one year for the table and ranked bars,
// the chosen range for lines, or the gap table in the gap view.
function buildCsv(): { filename: string; text: string } | null {
  if (!dataset) return null;
  const indicator = currentIndicator();
  const lines: string[] = [];
  let span: string;

  if (view === "scatter") {
    if (compareKey === null || barYear === null) return null;
    const points = scatterPointsFor(indicator, compareKey, barYear);
    if (points.length === 0) return null;
    lines.push(csvLine(["indicator_x", "indicator_y", "geo", "country", "year", "x", "y"]));
    for (const p of points) {
      lines.push(csvLine([indicator, compareKey, p.geo, t(`countries.${p.geo}`), barYear, p.x, p.y]));
    }
    return {
      filename: `finland-vs-eu_${indicator}-vs-${compareKey}_${barYear}.csv`,
      text: `\ufeff${lines.join("\r\n")}\r\n`,
    };
  }

  if (view === "gap") {
    const gap = currentGap(indicator);
    if (gap === null || gap.points.length === 0) return null;
    lines.push(
      csvLine(["indicator", "year", "finland", "benchmark", "benchmark_value", "difference", "finland_eu27_rank"]),
    );
    for (const p of gap.points) {
      lines.push(csvLine([indicator, p.year, p.focus, gap.bench, p.bench, p.gap, p.rank]));
    }
    span = `${gap.points[0].year}-${gap.points[gap.points.length - 1].year}`;
  } else {
    const geos = effectiveSelection();
    const all = yearsFor(indicator);
    if (geos.length === 0 || all.length === 0) return null;

    let years: number[];
    if (usesSingleYear()) {
      const year = barYear !== null && all.includes(barYear) ? barYear : defaultYear(indicator, geos, all);
      years = [year];
    } else {
      const from = rangeStart ?? all[0];
      const to = rangeEnd ?? all[all.length - 1];
      years = all.filter((y) => y >= from && y <= to);
    }

    lines.push(csvLine(["indicator", "geo", "country", "year", "value", "eu27_rank"]));
    let rows = 0;
    for (const geo of geos) {
      const series = seriesFor(indicator, geo);
      for (const year of years) {
        const value = series.get(year);
        if (value === undefined) continue;
        const rank = dataset.ranks[indicator]?.[geo]?.[String(year)];
        lines.push(csvLine([indicator, geo, t(`countries.${geo}`), year, value, rank]));
        rows += 1;
      }
    }
    if (rows === 0) return null;
    span = years.length === 1 ? String(years[0]) : `${years[0]}-${years[years.length - 1]}`;
  }

  // The byte order mark lets Excel read the accented letters correctly.
  return {
    filename: `finland-vs-eu_${indicator}_${span}.csv`,
    text: `﻿${lines.join("\r\n")}\r\n`,
  };
}

function downloadCsv(): void {
  const csv = buildCsv();
  if (csv === null) {
    showFeedback(t("nothingToExport"));
    return;
  }
  const url = URL.createObjectURL(new Blob([csv.text], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = csv.filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  showFeedback(t("csvDownloaded").replace("{file}", csv.filename));
}

// ---- Startup --------------------------------------------------------------

async function init(): Promise<void> {
  const statusEl = el("status");
  const select = el<HTMLSelectElement>("indicator-select");

  // Saved language, else Finnish if the browser prefers it, else English.
  const saved = localStorage.getItem("lang");
  lang =
    saved === "fi" || saved === "en"
      ? saved
      : navigator.language.startsWith("fi")
        ? "fi"
        : "en";

  // Changing indicator resets the year so the new indicator starts at its latest year.
  select.addEventListener("change", () => {
    barYear = null;
    rangeStart = null;
    rangeEnd = null;
    renderAll();
  });
  el<HTMLSelectElement>("compare-select").addEventListener("change", (event) => {
    compareKey = (event.target as HTMLSelectElement).value;
    barYear = null;
    renderAll();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      lang = button.dataset.lang as Lang;
      localStorage.setItem("lang", lang);
      applyLanguage();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view as View;
      renderAll();
    });
  });

  el<HTMLInputElement>("year-slider").addEventListener("input", (event) => {
    const index = Number((event.target as HTMLInputElement).value);
    barYear = currentYears[index] ?? barYear;
    renderAll();
  });
  el<HTMLButtonElement>("year-prev").addEventListener("click", () => stepYear(-1));
  el<HTMLButtonElement>("year-next").addEventListener("click", () => stepYear(1));

  el<HTMLInputElement>("range-from").addEventListener("input", (event) => {
    const year = currentYears[Number((event.target as HTMLInputElement).value)];
    if (year === undefined) return;
    rangeStart = year;
    if (rangeEnd !== null && year > rangeEnd) rangeEnd = year;
    renderAll();
  });
  el<HTMLInputElement>("range-to").addEventListener("input", (event) => {
    const year = currentYears[Number((event.target as HTMLInputElement).value)];
    if (year === undefined) return;
    rangeEnd = year;
    if (rangeStart !== null && year < rangeStart) rangeStart = year;
    renderAll();
  });

  el<HTMLButtonElement>("copy-link").addEventListener("click", () => {
    void copyLink();
  });
  el<HTMLButtonElement>("download-csv").addEventListener("click", downloadCsv);
  window.addEventListener("hashchange", () => {
    readHash();
    applyLanguage();
  });

  statusEl.textContent = t("loading");
  applyLanguage();

  try {
    const response = await fetch("indicators.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    dataset = (await response.json()) as Dataset;
  } catch (error) {
    console.error(error);
    statusEl.textContent = t("loadError");
    return;
  }

  readHash();
  applyLanguage();
}

init();
