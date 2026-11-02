import { Chart, registerables } from "chart.js";
import en from "./i18n/en.json";
import fi from "./i18n/fi.json";
import type { Dataset, DataRow } from "./types";

Chart.register(...registerables);

type Lang = "en" | "fi";
const dictionaries = { en, fi } as const;

// Countries shown on every chart. Finland is drawn thicker.
const COUNTRIES = ["FI", "SE", "DK", "NO", "AT", "EU27_2020"] as const;
const COLORS: Record<string, string> = {
  FI: "#1f4e9c",
  SE: "#7a9cc6",
  DK: "#c0504d",
  NO: "#9bbb59",
  AT: "#8064a2",
  EU27_2020: "#555555",
};
const INDICATOR_KEYS = ["unemployment", "inflation", "gdp_per_capita", "at_risk_of_poverty"];

let lang: Lang = "en";
let dataset: Dataset | null = null;
let chart: Chart | null = null;

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function t(path: string): string {
  // Look up a dotted key such as "indicators.unemployment" in the current language.
  const value = path.split(".").reduce<unknown>(
    (obj, key) => (obj as Record<string, unknown>)?.[key],
    dictionaries[lang],
  );
  return typeof value === "string" ? value : path;
}

function applyLanguage(): void {
  document.documentElement.lang = lang;
  el("title").textContent = t("title");
  el("indicator-label").textContent = t("indicator");
  el("footer-source").textContent = t("footerSource");
  document.title = t("title");

  // Re-label dropdown options and keep the current selection.
  const select = el<HTMLSelectElement>("indicator-select");
  const current = select.value;
  select.innerHTML = "";
  for (const key of INDICATOR_KEYS) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = t(`indicators.${key}`);
    select.append(option);
  }
  select.value = current || INDICATOR_KEYS[0];

  document.querySelectorAll<HTMLButtonElement>(".lang-switch button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  });

  renderChart();
}

function seriesFor(indicator: string, geo: string, rows: DataRow[]): Map<number, number> {
  const points = new Map<number, number>();
  for (const row of rows) {
    if (row.indicator === indicator && row.geo === geo) {
      points.set(row.year, row.value);
    }
  }
  return points;
}

function renderChart(): void {
  if (!dataset) return;

  const indicator = el<HTMLSelectElement>("indicator-select").value;
  const rows = dataset.records;
  const statusEl = el("status");
  const noteEl = el("note");

  // Union of years across the countries we show, sorted ascending.
  const years = [
    ...new Set(
      rows.filter((r) => r.indicator === indicator).map((r) => r.year),
    ),
  ].sort((a, b) => a - b);

  if (years.length === 0) {
    statusEl.textContent = t("noData");
    chart?.destroy();
    chart = null;
    return;
  }
  statusEl.textContent = "";

  const note = t(`notes.${indicator}`);
  noteEl.hidden = note.startsWith("notes.");
  noteEl.textContent = noteEl.hidden ? "" : note;

  const datasets = COUNTRIES.map((geo) => {
    const points = seriesFor(indicator, geo, rows);
    const isFocus = geo === "FI";
    return {
      label: t(`countries.${geo}`),
      data: years.map((y) => points.get(y) ?? null),
      borderColor: COLORS[geo],
      backgroundColor: COLORS[geo],
      borderWidth: isFocus ? 3.5 : 1.5,
      borderDash: geo === "EU27_2020" ? [6, 4] : [],
      pointRadius: isFocus ? 3 : 0,
      spanGaps: true,
      tension: 0.2,
    };
  });

  chart?.destroy();
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

async function init(): Promise<void> {
  const statusEl = el("status");
  const select = el<HTMLSelectElement>("indicator-select");

  // Default language: the saved choice, else Finnish if the browser prefers it.
  const saved = localStorage.getItem("lang");
  lang = saved === "fi" || saved === "en" ? saved : navigator.language.startsWith("fi") ? "fi" : "en";

  select.addEventListener("change", renderChart);
  document.querySelectorAll<HTMLButtonElement>(".lang-switch button").forEach((button) => {
    button.addEventListener("click", () => {
      lang = button.dataset.lang as Lang;
      localStorage.setItem("lang", lang);
      applyLanguage();
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
  renderChart();
}

init();
