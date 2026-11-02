import { Chart, registerables, type Plugin, type TooltipItem } from "chart.js";
import en from "./i18n/en.json";
import fi from "./i18n/fi.json";
import type { Dataset, DataRow } from "./types";

Chart.register(...registerables);

type Lang = "en" | "fi";
type View = "chart" | "table" | "gap";
const VIEWS: View[] = ["chart", "table", "gap"];
const dictionaries = { en, fi } as const;

// Above this many countries the line chart gets unreadable, so ranked bars are shown.
const CHART_MAX = 8;
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
  "at_risk_of_poverty",
  "pisa_math",
  "pisa_reading",
  "pisa_science",
  "life_expectancy",
  "gini",
  "median_income_pps",
  "median_income_eur",
];
// Indicators whose values are percentages, so they get a % sign when shown.
const PERCENT_INDICATORS = ["unemployment", "inflation", "at_risk_of_poverty"];

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
  return PALETTE[slotFor(geo) % PALETTE.length];
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
  const geos = [...new Set(dataset.records.map((r) => r.geo))].filter(
    (g) => onlyPisa || eurostatGeos.has(g),
  );
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
function usesSingleYear(geos: string[]): boolean {
  return view === "table" || geos.length > CHART_MAX;
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
  // Lines are used for up to CHART_MAX countries; above that, ranked bars.
  const yearMode = usesSingleYear(geos);
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

function destroyChart(): void {
  chart?.destroy();
  chart = null;
}

function renderChart(indicator: string, geos: string[]): void {
  el("chart-wrap").style.height = "420px";
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
      pointRadius: isFocus ? 3 : 0,
      spanGaps: true,
      tension: 0.2,
    };
  });

  destroyChart();
  chart = new Chart(el<HTMLCanvasElement>("chart"), {
    type: "line",
    data: { labels: years.map(String), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
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

  const messages = [t("barNotice")];
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

// Puts the current choices into the address, so copying the address reproduces the view.
function writeHash(): void {
  if (!dataset) return;
  const parts = [
    `i=${currentIndicator()}`,
    `c=${effectiveSelection().join(",")}`,
    `v=${view}`,
    `l=${lang}`,
  ];
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
    if (usesSingleYear(geos)) {
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
