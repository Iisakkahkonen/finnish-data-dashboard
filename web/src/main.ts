import { Chart, registerables } from "chart.js";
import en from "./i18n/en.json";
import fi from "./i18n/fi.json";
import type { Dataset, DataRow } from "./types";

Chart.register(...registerables);

type Lang = "en" | "fi";
type View = "chart" | "table";
const dictionaries = { en, fi } as const;

// Above this many countries the chart gets unreadable, so the table is shown instead.
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

// Okabe-Ito colorblind-safe palette. Finland is always blue; the EU average is grey and dashed.
const FOCUS_COLOR = "#0072B2";
const AGGREGATE_COLOR = "#888888";
const PALETTE = ["#E69F00", "#56B4E9", "#009E73", "#D55E00", "#CC79A7", "#B8860B", "#8C564B"];
// Dash patterns so lines stay distinguishable in grayscale, too.
const DASHES: number[][] = [[], [12, 5], [4, 4], [16, 5, 4, 5], [6, 6, 2, 6], [20, 6]];

let lang: Lang = "en";
let dataset: Dataset | null = null;
let chart: Chart | null = null;
let selected: string[] = [...PRESETS.default];
let view: View = "chart";

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

function rowsFor(indicator: string): DataRow[] {
  return dataset ? dataset.records.filter((r) => r.indicator === indicator) : [];
}

function seriesFor(indicator: string, geo: string): Map<number, number> {
  const points = new Map<number, number>();
  for (const row of rowsFor(indicator)) {
    if (row.geo === geo) points.set(row.year, row.value);
  }
  return points;
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

function formatValue(value: number): string {
  return value.toLocaleString(lang === "fi" ? "fi-FI" : "en-GB", { maximumFractionDigits: 1 });
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
    statusEl.textContent = "";
    return;
  }

  // Too many lines for a readable line chart: switch to ranked bars.
  const useBars = geos.length > CHART_MAX;
  statusEl.textContent = useBars ? t("barNotice") : "";
  el("table-wrap").hidden = true;
  el("chart-wrap").hidden = false;
  if (useBars) {
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
  const years = [...new Set(rowsFor(indicator).map((r) => r.year))].sort((a, b) => a - b);
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

// Ranked horizontal bars of the latest value per country. Used when there are
// too many countries for readable lines. Each bar shows the year it refers to.
function renderBars(indicator: string, geos: string[]): void {
  const bars = geos
    .map((geo) => ({ geo, point: latestPoint(indicator, geo) }))
    .filter((bar): bar is { geo: string; point: { year: number; value: number } } => bar.point !== null)
    .sort((a, b) => b.point.value - a.point.value);

  destroyChart();
  if (bars.length === 0) {
    el("status").textContent = t("noData");
    return;
  }

  el("chart-wrap").style.height = `${Math.max(420, bars.length * 26 + 80)}px`;
  chart = new Chart(el<HTMLCanvasElement>("chart"), {
    type: "bar",
    data: {
      labels: bars.map((bar) => `${t(`countries.${bar.geo}`)} (${bar.point.year})`),
      datasets: [
        {
          label: t(`indicators.${indicator}`),
          data: bars.map((bar) => bar.point.value),
          backgroundColor: bars.map((bar) =>
            bar.geo === FOCUS ? FOCUS_COLOR : bar.geo === AGGREGATE ? AGGREGATE_COLOR : "#9aa5b1",
          ),
        },
      ],
    },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: { display: true, text: t(`indicators.${indicator}`) },
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
      latest ? formatValue(latest.value) : "—",
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

  select.addEventListener("change", renderAll);
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
