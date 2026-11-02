import { chromium } from "playwright";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist-e2e");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
const server = http.createServer((req, res) => {
  const url = req.url.split("?")[0];
  const file = path.join(root, url === "/" ? "index.html" : url);
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream" });
    res.end(buf);
  });
});
await new Promise((r) => server.listen(0, r));
const PORT = server.address().port;

const results = [];
const check = (name, ok, detail = "") => { results.push([ok, name, detail]); };

{
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, permissions: ["clipboard-read", "clipboard-write"], locale: "en-GB" });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text()); });
  const base = `http://localhost:${PORT}/index.html`;

  // 1. Load, default view
  await page.goto(base);
  await page.waitForSelector("#country-chips .chip");
  check("loads with default indicator", await page.inputValue("#indicator-select") === "unemployment");
  check("hash written on load", (await page.evaluate(() => location.hash)).includes("i=unemployment"));
  check("footer source filled", (await page.textContent("#footer-source")).includes("Eurostat"));
  check("explain panel closed by default", await page.evaluate(() => !document.getElementById("explain").open));

  // 2. Gap view on life expectancy
  await page.selectOption("#indicator-select", "life_expectancy");
  await page.click('[data-view="gap"]');
  const gap = await page.evaluate(() => { const c = window.__charts.at(-1); return { type: c.type, n: c.data.labels.length, first: c.data.datasets[0].data[0], colors: [...new Set(c.data.datasets[0].backgroundColor)] }; });
  check("gap chart is a bar chart with points", gap.type === "bar" && gap.n === 23, JSON.stringify(gap));
  const status = await page.textContent("#status");
  check("gap summary sentence", /Finland was .* (above|below) the EU27 average/.test(status), status);
  const rows = await page.$$eval("#table-wrap tbody tr", (r) => r.map((x) => [...x.cells].map((c) => c.textContent)));
  check("gap table newest year first, has rank", rows.length === gap.n && Number(rows[0][0]) > Number(rows.at(-1)[0]) && /^\d+$/.test(rows[0][4]), JSON.stringify(rows[0]));
  check("range controls visible in gap view", await page.isVisible("#range-controls"));
  check("year controls hidden in gap view", !(await page.isVisible("#year-controls")));
  const hashGap = await page.evaluate(() => location.hash);
  check("hash holds indicator and view", hashGap.includes("i=life_expectancy") && hashGap.includes("v=gap"), hashGap);

  // 3. PISA gap uses OECD
  await page.selectOption("#indicator-select", "pisa_math");
  const pisaStatus = await page.textContent("#status");
  check("PISA gap compares with OECD average", pisaStatus.includes("OECD average"), pisaStatus);

  // 4. CSV in gap view
  let [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
  let text = fs.readFileSync(await dl.path(), "utf8");
  check("gap CSV has BOM and header", text.startsWith("﻿indicator,year,finland,benchmark"), text.slice(0, 80));
  check("gap CSV filename", dl.suggestedFilename().startsWith("finland-vs-eu_pisa_math_"), dl.suggestedFilename());

  // 5. Round trip a shared link (Finnish, table, year)
  await page.goto(base + "#i=gini&c=FI,SE,DK&v=table&y=2022&l=fi");
  await page.waitForSelector("#country-chips .chip");
  check("link restores indicator", await page.inputValue("#indicator-select") === "gini");
  check("link restores language", await page.evaluate(() => document.documentElement.lang) === "fi");
  check("link restores table view + year", (await page.textContent("#table-wrap caption")).includes("2022"));
  check("link restores countries", (await page.$$eval("#table-wrap tbody tr", (r) => r.length)) === 3);
  check("footer follows language", (await page.textContent("#footer-source")).startsWith("Lähteet"));
  check("explain text is Finnish", (await page.textContent("#explain-text")).includes("Gini-kerroin"));

  // 6. CSV in table view = one year
  [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
  text = fs.readFileSync(await dl.path(), "utf8");
  const lines = text.replace("﻿", "").trim().split("\r\n");
  check("table CSV: one year, three countries", lines.length === 4 && lines.slice(1).every((l) => l.split(",")[3] === "2022"), lines.join(" | "));
  check("CSV uses Finnish country names", lines[1].includes("Suomi") || lines[2].includes("Suomi") || lines[3].includes("Suomi"));

  // 7. Copy link
  await page.click("#copy-link");
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  check("copy link puts the address on the clipboard", clip === (await page.evaluate(() => location.href)) && clip.includes("i=gini"), clip);
  check("copy link shows feedback", (await page.textContent("#action-feedback")).length > 0);

  // 8. Language switch updates footer
  await page.click('[data-lang="en"]');
  check("footer switches back to English", (await page.textContent("#footer-source")).startsWith("Sources"));
  check("hash language follows switch", (await page.evaluate(() => location.hash)).includes("l=en"));

  // 9. PISA-only countries gating
  await page.selectOption("#indicator-select", "pisa_math");
  const pisaChips = await page.$$eval("#country-chips .chip", (c) => c.map((x) => x.textContent));
  check("PISA lists Japan and OECD average", pisaChips.includes("Japan") && pisaChips.includes("OECD average"));
  await page.selectOption("#indicator-select", "gini");
  const giniChips = await page.$$eval("#country-chips .chip", (c) => c.map((x) => x.textContent));
  check("Gini hides PISA-only countries", !giniChips.includes("Japan") && !giniChips.includes("OECD average") && giniChips.includes("Finland"));

  // 10. Bad hashes do not break the page (fresh page load for each)
  for (const bad of ["#i=nonsense&c=XX,YY&v=sideways&y=abc&from=1.5&l=de", "#", "#garbage%%%"]) {
    const fresh = await ctx.newPage();
    const errs = [];
    fresh.on("pageerror", (e) => errs.push(e.message));
    await fresh.goto(base + bad);
    await fresh.waitForSelector("#country-chips .chip");
    const sel = await fresh.inputValue("#indicator-select");
    const pressed = await fresh.$eval('[data-view][aria-pressed="true"]', (b) => b.dataset.view);
    check("bad hash " + bad.slice(0, 24) + " falls back to defaults", sel === "unemployment" && pressed === "chart" && errs.length === 0, sel + " " + pressed + " " + errs.join());
    await fresh.close();
  }

  // 11. Gap view on indicator with no EU data in selection is fine; CSV for line chart range
  await page.goto(base + "#i=gini&c=FI,SE&v=chart&from=2018&to=2022&l=en");
  await page.waitForSelector("#country-chips .chip");
  [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
  text = fs.readFileSync(await dl.path(), "utf8");
  const l2 = text.replace("﻿", "").trim().split("\r\n");
  check("line CSV respects range (2018-2022, 2 countries)", l2.length === 11 && dl.suggestedFilename().endsWith("2018-2022.csv"), `${l2.length} lines, ${dl.suggestedFilename()}`);

  // 12. Compare-two (scatter) view
  await page.goto(base + "#i=life_expectancy&c=FI,SE&v=scatter&vs=gini&l=en");
  await page.waitForSelector("#country-chips .chip");
  const sc = await page.evaluate(() => {
    const c = window.__charts.at(-1);
    return { type: c.type, labels: c.data.datasets.map((d) => d.label), n: c.data.datasets.reduce((a, d) => a + d.data.length, 0) };
  });
  check("scatter chart with Finland and other groups", sc.type === "scatter" && sc.labels.includes("Finland") && sc.labels.includes("Selected countries") && sc.n >= 7, JSON.stringify(sc));
  const scStatus = await page.textContent("#status");
  check("scatter summary gives r and a caution", /correlation r = -?\d,?\.?\d+/i.test(scStatus.replace("Correlation", "correlation")) && scStatus.includes("does not show that one causes"), scStatus);
  check("compare select excludes the x indicator", !(await page.$$eval("#compare-select option", (o) => o.map((x) => x.value))).includes("life_expectancy"));
  check("compare control visible, year scrubber visible", (await page.isVisible("#compare-control")) && (await page.isVisible("#year-controls")));
  await page.selectOption("#compare-select", "median_income_eur");
  check("hash holds compared indicator", (await page.evaluate(() => location.hash)).includes("vs=median_income_eur"));
  [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
  text = fs.readFileSync(await dl.path(), "utf8");
  check("scatter CSV has both indicators", text.replace("\ufeff", "").startsWith("indicator_x,indicator_y,geo,country,year,x,y") && dl.suggestedFilename().includes("life_expectancy-vs-median_income_eur"), dl.suggestedFilename());
  await page.goto(base + "#i=life_expectancy&v=scatter&vs=gini&l=fi");
  await page.waitForSelector("#country-chips .chip");
  check("scatter summary in Finnish", (await page.textContent("#status")).includes("Korrelaatio r ="), await page.textContent("#status"));
  await page.click('[data-view="chart"]');
  check("compare control hides again in chart view", !(await page.isVisible("#compare-control")));

  // 13. Rank over time
  await page.goto(base + "#i=gini&c=FI,SE,DK,EU27_2020&v=rank&l=en");
  await page.waitForSelector("#country-chips .chip");
  const rk = await page.evaluate(() => { const c = window.__charts.at(-1); return { type: c.type, rev: c.options.scales.y.reverse, labels: c.data.datasets.map((d) => d.label) }; });
  check("rank chart is a reversed line chart without the EU average", rk.type === "line" && rk.rev === true && rk.labels.includes("Finland") && !rk.labels.includes("EU27 average") && rk.labels.length === 3, JSON.stringify(rk));
  check("rank summary names Finland's position", /Finland ranked \d+ among the EU27/.test(await page.textContent("#status")), await page.textContent("#status"));
  check("range controls visible in rank view", await page.isVisible("#range-controls"));
  [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download-csv")]);
  text = fs.readFileSync(await dl.path(), "utf8");
  check("rank CSV includes the rank column", text.includes("eu27_rank") && dl.suggestedFilename().startsWith("finland-vs-eu_gini_"), dl.suggestedFilename());
  await page.goto(base + "#i=pisa_math&c=JP,MN&v=rank&l=en");
  await page.waitForSelector("#country-chips .chip");
  check("rank view explains missing ranks for non-EU countries", (await page.textContent("#status")).includes("Ranks exist only for EU member states"), await page.textContent("#status"));

  // 14. Lines stay lines above eight countries; ranked bars are an explicit option
  const many = "FI,SE,DK,EE,DE,AT,NO,JP,MN,OECD";
  await page.goto(base + `#i=pisa_math&c=${many}&v=chart&l=en`);
  await page.waitForSelector("#country-chips .chip");
  const manyLines = await page.evaluate(() => { const c = window.__charts.at(-1); return { type: c.type, n: c.data.datasets.length, plugin: c.plugins.map((x) => x.id) }; });
  check("ten countries still draw as manyLines, with end labels", manyLines.type === "line" && manyLines.n === 10 && manyLines.plugin.includes("endLabels"), JSON.stringify(manyLines));
  await page.click('[data-view="bars"]');
  const barsType = await page.evaluate(() => window.__charts.at(-1).type);
  check("ranked bars view draws bars", barsType === "bar", barsType);
  check("year scrubber visible in bars view", await page.isVisible("#year-controls"));
  check("hash holds bars view", (await page.evaluate(() => location.hash)).includes("v=bars"));

  check("no page or console errors", errors.length === 0, errors.join(" || "));
  await browser.close();

  let failed = 0;
  for (const [ok, name, detail] of results) { if (!ok) failed++; console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  -> " + detail}`); }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  server.close();
  process.exit(failed ? 1 : 0);
}
