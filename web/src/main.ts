import { Chart, registerables, type Plugin } from "chart.js";
import en from "./i18n/en.json";
import fi from "./i18n/fi.json";
import type { Dataset, DataRow } from "./types";

Chart.register(...registerables);

type Lang = "en" | "fi";
type View = "chart" | "table";
const dictionaries = { en, fi } as const;

// Above this many countries the line chart gets unreadable, so ranked bars are shown.
const CHART_MAX = 8;
const FOCUS = "FI";
const AGGREGATE = "EU27_2020";

const PRESETS: Record<string, string[]> = {
  default: ["FI", "SE", "DK", "NO", "AT", "EU27_2020"],
  nordics: ["FI", "SE", "DK", "NO", "IS"],
  baltics: ["EE", "LV", "LT"],
  bigEu: ["DE", "FR", "IT", "ES", "NL", "PL"],
  financeOnly: ["FI"],
};

const INDICATOR_KEYS = ["unemployment", "inflation", "gdp_per_capita", "at_risk_of_poverty"];
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

function latestPoint(indicator: string, geo: string): { year: number; value: number } | null {
  let latest: { year: number; value: number } | null = null;
  for (const row of rowsFor(indicator)) {
    if (row.geo === geo && (!latest || row.year > latest.year)) {
      latest = { year: row.year, value: row.value };
    }
  }
  return latest;
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
function allGeos(): string[] {
  if (!dataset) return [];
  const geos = [...new Set(dataset.records.map((r) => r.geo))];
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

// ---- Rendering ------------------------------------------------------------

function renderAll(): void {
  if (!dataset) return;

  renderChips();
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === view));
  });

  const statusEl = el("status");
  const noteEl = el("note");
  const geos = effectiveSelection();
  const indicator = currentIndicator();

  const note = t(`notes.${indicator}`);
  noteEl.hidden = note.startsWith("notes.");
  noteEl.textContent = noteEl.hidden ? "" : note;

  statusEl.textContent = "";
  updateYearControls([], 0, false);

  if (geos.length === 0) {
    statusEl.textContent = t("noCountries");
    destroyChart();
    el("table-wrap").hidden = true;
    el("chart-wrap").hidden = true;
    return;
  }

  if (view === "table") {
    destroyChart();
    el("chart-wrap").hidden = true;
    el("table-wrap").hidden = false;
    renderTable(indicator, geos);
    return;
  }

  el("table-wrap").hidden = true;
  el("chart-wrap").hidden = false;

  // Too many lines for a readable line chart: switch to ranked bars for one year.
  if (geos.length > CHART_MAX) {
    renderBars(indicator, geos);
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
  const years = yearsFor(indicator);
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

// Ranked horizontal bars for one year. Countries without a value that year are
// left out of the chart and named in the status line instead.
function renderBars(indicator: string, geos: string[]): void {
  const years = yearsFor(indicator);
  currentYears = years;
  destroyChart();

  if (years.length === 0) {
    el("status").textContent = t("noData");
    updateYearControls([], 0, false);
    return;
  }

  if (barYear === null || !years.includes(barYear)) {
    barYear = defaultYear(indicator, geos, years);
  }
  const year = barYear;
  updateYearControls(years, year, true);

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

function renderTable(indicator: string, geos: string[]): void {
  const wrap = el("table-wrap");
  wrap.innerHTML = "";

  const table = document.createElement("table");
  const headRow = table.createTHead().insertRow();
  for (const key of ["country", "year", "value", "rank"]) {
    const th = document.createElement("th");
    th.textContent = t(`columns.${key}`);
    headRow.append(th);
  }

  const body = table.createTBody();
  for (const geo of geos) {
    const latest = latestPoint(indicator, geo);
    const rank = latest ? dataset?.ranks[indicator]?.[geo]?.[String(latest.year)] : undefined;
    const row = body.insertRow();
    const cells = [
      t(`countries.${geo}`),
      latest ? String(latest.year) : "—",
      latest ? formatValue(latest.value, indicator) : "—",
      rank ? String(rank) : "—",
    ];
    for (const text of cells) {
      row.insertCell().textContent = text;
    }
  }
  wrap.append(table);
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

  el("footer-updated").textContent = `${t("footerUpdated")}: ${dataset.updated}`;
  renderAll();
}

init();
