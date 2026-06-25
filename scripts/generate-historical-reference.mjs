import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const noFallback = Symbol("noFallback");

async function readJson(relativePath, fallback = noFallback) {
  try {
    return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
  } catch (error) {
    if (fallback !== noFallback) return fallback;
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function format(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function scoreBand(score) {
  if (score >= 660) return "660冲刺";
  if (score >= 650) return "650冲稳";
  if (score >= 640) return "640稳";
  if (score >= 630) return "630稳保";
  return "下探观察";
}

function schoolEntryUrl(school) {
  return school?.manualCheckUrl || school?.queryApi?.listUrl || school?.queryApi?.typeUrl || "";
}

function schoolLink(school, name) {
  const url = schoolEntryUrl(school);
  if (!url) return escapeHtml(name || school?.name || "");
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(name || school?.name || "")}</a>`;
}

function sourceBadge(level) {
  if (level === "A") return "官方/A";
  if (level === "B") return "第三方/B";
  if (level === "C") return "覆盖审计/C";
  return level || "-";
}

function riskNotes(item) {
  const notes = [];
  if (item.sourceLevel === "C" || item.admissionCategory === "院校最低分覆盖审计") {
    notes.push("当前为院校最低分线索，需补专业分");
  }
  if (!item.plan) notes.push("2025计划数待核");
  if (/中外合作|合作办学/.test(`${item.major} ${item.track || ""}`)) notes.push("核费用/证书/校区");
  if (/大类|试验班|卓越|拔尖|未来技术/.test(item.major)) notes.push("核大类分流/专业确认");
  if (/软件/.test(item.major)) notes.push("核后两年学费");
  return notes.join("；") || "按2026计划和真实位次复核";
}

function groupedItems(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.schoolKey || item.school;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([key, rows]) => ({
    key,
    school: rows[0]?.school || key,
    rows: rows.sort((a, b) => {
      const yearDelta = Number(b.admissionYear || 0) - Number(a.admissionYear || 0);
      if (yearDelta) return yearDelta;
      return (b.minScore ?? b.score ?? 0) - (a.minScore ?? a.score ?? 0);
    })
  }));
}

function planStatusText(latest) {
  if (!latest) return "2026待人工复核";
  if (latest.status === "available") return `2026计划已查到：${latest.planRows ?? 0}条`;
  return latest.statusText || latest.status || "2026待复核";
}

function historyRows(historical, baseline) {
  if (historical?.rows?.length) return historical.rows;
  return baseline.items || [];
}

const nonOrdinaryAdmissionPattern = /中外合作|合作办学|国家专项|高校专项|专项|强基|卓越优才|预科|高收费|港校|香港中文|港中深|内地与港澳台|综合评价/;

function isOrdinaryAdmission(item) {
  const text = [
    item.school,
    item.major,
    item.track,
    item.admissionCategory,
    item.notes
  ].filter(Boolean).join(" ");
  return !nonOrdinaryAdmissionPattern.test(text);
}

function compact(value) {
  return String(value ?? "").replace(/[（）()【】\[\]\s·,，/、-]/g, "").toLowerCase();
}

function plan2026Cell(latest, item) {
  if (!latest) return "2026待核";
  if (!latest.rows?.length) return latest.status === "manual-required" ? "官网/计划目录人工核对" : (latest.statusText || "待核");
  const major = compact(item.major);
  const row = latest.rows.find((plan) => {
    const planMajor = compact(plan.zymc || plan.recruitmentMajorName || "");
    return planMajor && (major.includes(planMajor) || planMajor.includes(major.slice(0, Math.min(major.length, 8))));
  });
  if (!row) return `已取${latest.rows.length}条，专业待匹配`;
  const pieces = [
    row.jhrs ?? row.recruitmentStudentsNumber ? `${row.jhrs ?? row.recruitmentStudentsNumber}人` : "人数待核",
    row.xkkm || row.xkyq || "",
    row.zygroup ? `组：${row.zygroup}` : ""
  ].filter(Boolean);
  return pieces.join("｜");
}

const HISTORY_YEARS = ["2025", "2024", "2023"];

function normalizeCompareKey(value) {
  return String(value ?? "")
    .replace(/\s+/g, "")
    .replace(/本研一体/g, "")
    .replace(/[（(]新工科卓越计划[）)]/g, "（新工科卓越计划）")
    .replace(/[（(]钱学森班[）)]/g, "（钱学森班）")
    .trim();
}

function normalizeCategoryKey(value) {
  return normalizeCompareKey(value)
    .replace(/中外合作办学/g, "中外合作")
    .replace(/普通本科批|本科普通批/g, "普通类");
}

function normalizeCampusKey(value) {
  const campus = normalizeCompareKey(value);
  if (!campus || /^(主校区|校本部|本部|兴庆校区)$/.test(campus)) return "主校区";
  return campus;
}

function compareRows(rows) {
  const map = new Map();
  for (const row of rows) {
    const year = String(row.admissionYear || "");
    const key = [
      normalizeCompareKey(row.major),
      normalizeCategoryKey(row.admissionCategory || "未标类别"),
      normalizeCampusKey(row.campus || "")
    ].join("\u0001");
    if (!map.has(key)) {
      map.set(key, {
        major: row.major,
        admissionCategory: row.admissionCategory || "",
        campus: row.campus || "",
        track: row.track || "",
        sourceLevel: row.sourceLevel || "",
        campuses: new Set(),
        rowsByYear: {}
      });
    }
    const item = map.get(key);
    if (row.campus) item.campuses.add(row.campus);
    item.track ||= row.track || "";
    item.sourceLevel = [item.sourceLevel, row.sourceLevel].filter(Boolean).sort()[0] || "";
    if (!item.admissionCategory && row.admissionCategory) item.admissionCategory = row.admissionCategory;
    if (!item.campus && row.campus) item.campus = row.campus;
    if (!item.rowsByYear[year] || Number(row.minScore || 0) > Number(item.rowsByYear[year].minScore || 0)) {
      item.rowsByYear[year] = row;
      if (year === "2025") {
        item.major = row.major;
        item.admissionCategory = row.admissionCategory || item.admissionCategory;
        item.campus = row.campus || item.campus;
      }
    }
  }

  return [...map.values()].map((item) => ({
    ...item,
    campus: item.campus || [...item.campuses][0] || ""
  })).sort((a, b) => {
    const aLatest = HISTORY_YEARS.map((year) => a.rowsByYear[year]).find(Boolean);
    const bLatest = HISTORY_YEARS.map((year) => b.rowsByYear[year]).find(Boolean);
    return Number(bLatest?.minScore || 0) - Number(aLatest?.minScore || 0);
  });
}

function yearCell(row) {
  if (!row) return `<span class="subtle">-</span>`;
  const pieces = [
    `低 ${format(row.minScore)}`,
    row.avgScore ? `均 ${format(row.avgScore)}` : "",
    row.maxScore ? `高 ${format(row.maxScore)}` : "",
    row.minRank ? `位 ${format(row.minRank)}` : "",
    row.admittedCount || row.plan ? `人/计划 ${format(row.admittedCount ?? row.plan)}` : ""
  ].filter(Boolean);
  return pieces.map((piece, index) => index === 0 ? `<strong>${escapeHtml(piece)}</strong>` : `<span>${escapeHtml(piece)}</span>`).join("<br>");
}

function trendText(item) {
  const current = item.rowsByYear["2025"];
  const previous = item.rowsByYear["2024"];
  const older = item.rowsByYear["2023"];
  if (!current || !previous) return older ? "缺2024或2025，先看区间" : "仅单年数据";
  const scoreDelta = Number(current.minScore ?? 0) - Number(previous.minScore ?? 0);
  const rankDelta = current.minRank && previous.minRank ? Number(current.minRank) - Number(previous.minRank) : null;
  const scoreText = scoreDelta > 0 ? `最低分+${scoreDelta}` : scoreDelta < 0 ? `最低分${scoreDelta}` : "最低分持平";
  const rankText = rankDelta === null ? "" : rankDelta < 0 ? `位次前移${Math.abs(rankDelta)}` : rankDelta > 0 ? `位次后移${rankDelta}` : "位次持平";
  return [scoreText, rankText].filter(Boolean).join("；");
}

function trendGraph(item) {
  const orderedYears = ["2023", "2024", "2025"];
  const values = orderedYears.map((year) => {
    const row = item.rowsByYear[year];
    const score = Number(row?.minScore ?? row?.score);
    return Number.isFinite(score) ? { year, score } : null;
  });
  const present = values.filter(Boolean);
  if (present.length < 2) {
    return `<div class="trend trend-missing"><span class="trend-empty">数据不足</span><span class="trend-caption">${escapeHtml(trendText(item))}</span></div>`;
  }

  const min = Math.min(...present.map((point) => point.score));
  const max = Math.max(...present.map((point) => point.score));
  const range = Math.max(1, max - min);
  const xByYear = { "2023": 14, "2024": 76, "2025": 138 };
  const yOf = (score) => 34 - ((score - min) / range) * 24;
  const points = values
    .filter(Boolean)
    .map((point) => `${xByYear[point.year]},${yOf(point.score).toFixed(1)}`)
    .join(" ");
  const last = item.rowsByYear["2025"];
  const previous = item.rowsByYear["2024"];
  const delta = last && previous ? Number(last.minScore ?? last.score ?? 0) - Number(previous.minScore ?? previous.score ?? 0) : 0;
  const trendClass = delta > 0 ? "hot" : delta < 0 ? "cool" : "flat";
  const dots = values.map((point) => {
    if (!point) return "";
    const x = xByYear[point.year];
    const y = yOf(point.score).toFixed(1);
    return `<circle cx="${x}" cy="${y}" r="3.5"></circle><text x="${x}" y="${Math.max(9, Number(y) - 6).toFixed(1)}">${escapeHtml(point.score)}</text>`;
  }).join("");
  const yearLabels = orderedYears.map((year) => `<text class="year" x="${xByYear[year]}" y="48">${year.slice(2)}</text>`).join("");
  const popupPoints = orderedYears.map((year) => {
    const row = item.rowsByYear[year];
    const rank = Number(row?.minRank ?? row?.rank);
    const count = Number(row?.admittedCount ?? row?.plan);
    return {
      year,
      minScore: row?.minScore ?? row?.score ?? null,
      avgScore: row?.avgScore ?? null,
      maxScore: row?.maxScore ?? null,
      rank: Number.isFinite(rank) && rank > 0 ? rank : null,
      count: Number.isFinite(count) && count > 0 ? count : null
    };
  });
  return `<button class="trend-button" type="button" data-major="${escapeHtml(item.major)}" data-category="${escapeHtml(item.admissionCategory || "")}" data-campus="${escapeHtml(item.campus || "")}" data-trend="${escapeHtml(trendText(item))}" data-points="${escapeHtml(JSON.stringify(popupPoints))}" aria-label="查看${escapeHtml(item.major)}三年趋势图">
  <span class="trend ${trendClass}">
    <svg viewBox="0 0 152 52" role="img" aria-label="${escapeHtml(trendText(item))}">
      <line class="axis" x1="14" y1="40" x2="138" y2="40"></line>
      <polyline points="${points}"></polyline>
      ${dots}
      ${yearLabels}
    </svg>
    <span class="trend-caption">${escapeHtml(trendText(item))}</span>
  </span>
  </button>`;
}

function latestRow(item) {
  return HISTORY_YEARS.map((year) => item.rowsByYear[year]).find(Boolean);
}

function buildPage({ schools, baseline, latestCheck, coverageAudit, historical }) {
  const schoolMap = new Map((schools.schools || []).map((school) => [school.key, school]));
  const latestByKey = new Map((latestCheck?.schools || []).map((item) => [item.key, item]));
  const rows = historyRows(historical, baseline).filter(isOrdinaryAdmission);
  const groups = groupedItems(rows);
  const total = rows.length;
  const sourceC = rows.filter((item) => item.sourceLevel === "C").length;
  const withPlan = rows.filter((item) => item.plan || item.admittedCount).length;
  const officialRows = historical?.summary?.officialRows || 0;
  const availableSchools = historical?.summary?.availableSchools || 0;

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>历年专业分数与招生参考</title>
  <style>
    :root { --bg:#f5f6f8; --panel:#fff; --ink:#172033; --muted:#637083; --line:#d8dee8; --blue:#1f5aa6; --green:#147a4a; --amber:#a85b00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.45; }
    header { position:sticky; top:0; z-index:20; background:rgba(255,255,255,.96); border-bottom:1px solid var(--line); backdrop-filter:blur(10px); }
    .wrap { width:100%; padding:16px 22px; }
    h1 { margin:0; font-size:24px; }
    h2 { margin:0 0 10px; font-size:18px; }
    h3 { margin:0 0 8px; font-size:15px; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .subtle,.small { color:var(--muted); }
    .small { font-size:12px; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:16px 0; }
    .metric, section, .school { background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    .metric { padding:12px; }
    .metric strong { display:block; font-size:24px; }
    section { padding:16px; margin-bottom:16px; }
    .toolbar { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:10px; margin:12px 0; }
    input, select { min-height:38px; border:1px solid var(--line); border-radius:6px; padding:7px 9px; font:inherit; background:#fff; }
    .school { margin-bottom:12px; overflow:hidden; }
    .school-head { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:10px; align-items:start; padding:12px; border-bottom:1px solid var(--line); background:#fff; }
    .tag { display:inline-flex; align-items:center; min-height:22px; padding:2px 7px; margin:1px 3px 1px 0; border-radius:999px; background:#eef2f7; color:#344054; font-size:12px; font-weight:800; white-space:nowrap; }
    .tag.good { background:#e8f5ee; color:var(--green); }
    .tag.warn { background:#fff4e5; color:var(--amber); }
    .tag.bad { background:#fee4e2; color:var(--red); }
    .tag.blue { background:#eaf1fb; color:var(--blue); }
    .table-scroll { overflow:auto; border-top:1px solid var(--line); }
    table { width:100%; min-width:1540px; border-collapse:separate; border-spacing:0; font-size:13px; }
    th,td { padding:8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { position:static; background:#f8fafc; color:#344054; font-weight:800; box-shadow:0 1px 0 var(--line); }
    tbody td { background:#fff; }
    .sticky-col { position:sticky; z-index:10; background:#fff; box-shadow:1px 0 0 var(--line); }
    th.sticky-col { z-index:30; background:#f8fafc; }
    .sticky-col-1 { left:0; }
    .num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .note { padding:10px; background:#f8fafc; border:1px solid var(--line); border-radius:8px; }
    .trend { display:grid; gap:4px; min-width:150px; }
    .trend-button { display:block; width:100%; min-height:0; padding:0; border:0; background:transparent; color:inherit; text-align:left; cursor:pointer; }
    .trend-button:hover .trend-caption { color:var(--blue); text-decoration:underline; }
    .trend svg { width:152px; height:52px; display:block; overflow:visible; }
    .trend .axis { stroke:#d8dee8; stroke-width:1; }
    .trend polyline { fill:none; stroke:#637083; stroke-width:2.4; stroke-linecap:round; stroke-linejoin:round; }
    .trend circle { fill:#fff; stroke:#637083; stroke-width:2; }
    .trend text { fill:#344054; font-size:9px; font-weight:800; text-anchor:middle; }
    .trend text.year { fill:#637083; font-size:9px; font-weight:700; }
    .trend.hot polyline, .trend.hot circle { stroke:#b42318; }
    .trend.cool polyline, .trend.cool circle { stroke:#147a4a; }
    .trend.flat polyline, .trend.flat circle { stroke:#1f5aa6; }
    .trend-caption { color:#344054; font-size:12px; font-weight:700; }
    .trend-empty { display:inline-flex; align-items:center; min-height:34px; color:var(--muted); font-size:12px; }
    .modal-backdrop { position:fixed; inset:0; z-index:60; display:none; align-items:center; justify-content:center; padding:22px; background:rgba(15,23,42,.42); }
    .modal-backdrop.open { display:flex; }
    .modal { width:min(720px,100%); max-height:90vh; overflow:auto; background:#fff; border:1px solid var(--line); border-radius:8px; box-shadow:0 18px 50px rgba(15,23,42,.22); }
    .modal-head { display:flex; align-items:start; justify-content:space-between; gap:12px; padding:14px 16px; border-bottom:1px solid var(--line); }
    .modal-head h2 { margin:0 0 4px; }
    .modal-close { min-width:34px; min-height:34px; border:1px solid var(--line); border-radius:6px; background:#fff; font-size:20px; line-height:1; cursor:pointer; }
    .modal-body { padding:16px; }
    .trend-large { width:100%; height:260px; display:block; border:1px solid var(--line); border-radius:8px; background:#fbfcfe; }
    .trend-large .grid { stroke:#e4e9f1; stroke-width:1; }
    .trend-large .axis { stroke:#98a2b3; stroke-width:1.2; }
    .trend-large .line { fill:none; stroke:#1f5aa6; stroke-width:4; stroke-linecap:round; stroke-linejoin:round; }
    .trend-large .point { fill:#fff; stroke:#1f5aa6; stroke-width:3; }
    .trend-large text { fill:#344054; font-size:13px; font-weight:800; text-anchor:middle; }
    .trend-large text.muted { fill:#637083; font-size:12px; font-weight:700; }
    .modal-summary { margin-top:10px; color:#344054; font-weight:800; }
    .modal-table { width:100%; min-width:0; margin-top:12px; border:1px solid var(--line); border-radius:8px; overflow:hidden; }
    .modal-table table { min-width:0; }
    .modal-table th, .modal-table td { padding:8px; }
    @media (max-width:900px){ .metrics,.toolbar{grid-template-columns:1fr;} th{position:static;} .school-head{grid-template-columns:1fr;} }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>历年专业分数与招生参考</h1>
      <p class="subtle">陕西物理类｜已叠加可自动获取的2023-2025官方历年分数；2026计划发布后继续叠加。</p>
    </div>
  </header>
  <main class="wrap">
    <div class="metrics">
      <div class="metric"><strong>${total}</strong><span class="subtle">候选专业/线索</span></div>
      <div class="metric"><strong>${groups.length}</strong><span class="subtle">覆盖学校</span></div>
      <div class="metric"><strong>${withPlan}</strong><span class="subtle">有计划/录取人数</span></div>
      <div class="metric"><strong>${officialRows}</strong><span class="subtle">官方历年行</span></div>
    </div>
    <section>
      <h2>使用口径</h2>
      <p class="note">合理年份建议：至少看近3年，最好看2023-2025三年专业最低分、位次、计划数/录取人数，再叠加2026计划数。当前已自动拉取 ${escapeHtml(availableSchools)} 所有标准官方接口学校的历年分数；无自动接口学校保留2025候选基线并标注待官方复核。</p>
      <p class="small">大小年和冷热博弈不能只看上一年最低分：应同时看三年位次波动、计划增减、专业改名/大类调整、校区变化、招生章程规则、同类院校替代项和当年舆论热度。</p>
    </section>
    <section>
      <h2>筛选</h2>
      <div class="toolbar">
        <input id="q" type="search" placeholder="搜索学校/专业/方向">
        <select id="band"><option value="">全部分段</option><option>660冲刺</option><option>650冲稳</option><option>640稳</option><option>630稳保</option><option>下探观察</option></select>
        <select id="source"><option value="">全部来源</option><option value="A">官方/A</option><option value="B">第三方/B</option><option value="C">覆盖审计/C</option></select>
      </div>
    </section>
    <div id="schools">
      ${groups.map((group) => {
        const school = schoolMap.get(group.key) || (schools.schools || []).find((item) => item.name === group.school);
        const latest = latestByKey.get(group.key);
        const scores = group.rows.map((item) => item.minScore ?? item.score).filter((score) => Number.isFinite(Number(score))).map(Number);
        const max = scores.length ? Math.max(...scores) : null;
        const min = scores.length ? Math.min(...scores) : null;
        const sourceLevels = [...new Set(group.rows.map((item) => item.sourceLevel).filter(Boolean))].join("/");
        return `<div class="school" data-school="${escapeHtml(group.school)}" data-text="${escapeHtml(`${group.school} ${group.rows.map((item) => `${item.major} ${item.track || ""}`).join(" ")}`)}">
          <div class="school-head">
            <div>
              <h3>${schoolLink(school, group.school)}</h3>
              <p class="small">${escapeHtml(school?.city || "")}｜${escapeHtml(school?.tier || "")}｜${escapeHtml(school?.role || "")}</p>
              <p class="small">${escapeHtml(planStatusText(latest))}｜默认按同一专业横向对比三年最低分、位次和录取人数</p>
            </div>
            <div>
              <span class="tag blue">2025范围 ${format(min)}-${format(max)}</span>
              <span class="tag">来源 ${escapeHtml(sourceLevels || "-")}</span>
            </div>
          </div>
          <div class="table-scroll">
            <table>
              <thead><tr><th class="sticky-col sticky-col-1" style="width:300px">专业/线索</th><th style="width:105px">类别</th><th style="width:105px">校区</th><th style="width:110px">方向</th><th style="width:170px">2026计划</th><th style="width:170px">2025</th><th style="width:170px">2024</th><th style="width:170px">2023</th><th style="width:190px">三年变化</th><th style="width:100px">来源</th><th style="width:240px">风险与下一步</th></tr></thead>
              <tbody>
                ${compareRows(group.rows).map((item) => {
                  const current = latestRow(item);
                  const score = current?.minScore ?? current?.score;
                  return `<tr data-band="${scoreBand(Number(score) || 0)}" data-source="${escapeHtml(item.sourceLevel || "")}">
                    <td class="sticky-col sticky-col-1">${escapeHtml(item.major)}${current?.notes ? `<div class="small">${escapeHtml(current.notes)}</div>` : ""}</td>
                    <td>${escapeHtml(item.admissionCategory || "-")}</td>
                    <td>${escapeHtml(item.campus || "-")}</td>
                    <td>${escapeHtml(item.track || current?.track || "-")}</td>
                    <td>${escapeHtml(plan2026Cell(latest, item))}</td>
                    <td>${yearCell(item.rowsByYear["2025"])}</td>
                    <td>${yearCell(item.rowsByYear["2024"])}</td>
                    <td>${yearCell(item.rowsByYear["2023"])}</td>
                    <td>${trendGraph(item)}<div><span class="tag">${escapeHtml(scoreBand(Number(score) || 0))}</span></div></td>
                    <td><span class="tag ${item.sourceLevel === "A" ? "good" : item.sourceLevel === "C" ? "warn" : ""}">${escapeHtml(sourceBadge(item.sourceLevel))}</span></td>
                    <td>${escapeHtml(riskNotes(current || item))}</td>
                  </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </div>`;
      }).join("")}
    </div>
  </main>
  <div class="modal-backdrop" id="trendModal" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="trendModalTitle">
      <div class="modal-head">
        <div>
          <h2 id="trendModalTitle">三年趋势</h2>
          <p class="small" id="trendModalMeta"></p>
        </div>
        <button class="modal-close" type="button" id="trendModalClose" aria-label="关闭">×</button>
      </div>
      <div class="modal-body">
        <div id="trendModalChart"></div>
        <p class="modal-summary" id="trendModalSummary"></p>
        <div class="modal-table" id="trendModalTable"></div>
      </div>
    </div>
  </div>
  <script>
    const q = document.getElementById('q');
    const band = document.getElementById('band');
    const source = document.getElementById('source');
    const schools = [...document.querySelectorAll('.school')];
    const trendModal = document.getElementById('trendModal');
    const trendModalTitle = document.getElementById('trendModalTitle');
    const trendModalMeta = document.getElementById('trendModalMeta');
    const trendModalChart = document.getElementById('trendModalChart');
    const trendModalSummary = document.getElementById('trendModalSummary');
    const trendModalTable = document.getElementById('trendModalTable');
    const trendModalClose = document.getElementById('trendModalClose');
    function applyFilters() {
      const query = q.value.trim();
      const bandValue = band.value;
      const sourceValue = source.value;
      schools.forEach((school) => {
        let visibleRows = 0;
        school.querySelectorAll('tbody tr').forEach((row) => {
          const rowVisible = (!bandValue || row.dataset.band === bandValue) && (!sourceValue || row.dataset.source === sourceValue);
          row.style.display = rowVisible ? '' : 'none';
          if (rowVisible) visibleRows += 1;
        });
        const textMatch = !query || school.dataset.text.includes(query);
        school.style.display = textMatch && visibleRows ? '' : 'none';
      });
    }
    [q, band, source].forEach((el) => el.addEventListener('input', applyFilters));
    function escapeText(value) {
      return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
    }
    function openTrendModal(button) {
      const points = JSON.parse(button.dataset.points || '[]');
      const valid = points.filter((point) => Number.isFinite(Number(point.minScore)));
      const min = valid.length ? Math.min(...valid.map((point) => Number(point.minScore))) : 0;
      const max = valid.length ? Math.max(...valid.map((point) => Number(point.minScore))) : 1;
      const range = Math.max(1, max - min);
      const xByYear = { '2023': 90, '2024': 330, '2025': 570 };
      const yOf = (score) => 190 - ((Number(score) - min) / range) * 120;
      const polyline = valid.map((point) => xByYear[point.year] + ',' + yOf(point.minScore).toFixed(1)).join(' ');
      const circles = valid.map((point) => {
        const x = xByYear[point.year];
        const y = yOf(point.minScore);
        return '<circle class="point" cx="' + x + '" cy="' + y.toFixed(1) + '" r="6"></circle>' +
          '<text x="' + x + '" y="' + Math.max(26, y - 14).toFixed(1) + '">' + escapeText(point.minScore) + '</text>';
      }).join('');
      const yearLabels = points.map((point) => '<text class="muted" x="' + xByYear[point.year] + '" y="226">' + point.year + '</text>').join('');
      trendModalTitle.textContent = button.dataset.major || '三年趋势';
      trendModalMeta.textContent = [button.dataset.category, button.dataset.campus].filter(Boolean).join('｜');
      trendModalSummary.textContent = button.dataset.trend || '';
      trendModalChart.innerHTML =
        '<svg class="trend-large" viewBox="0 0 660 260" role="img">' +
        '<line class="grid" x1="56" y1="70" x2="616" y2="70"></line>' +
        '<line class="grid" x1="56" y1="130" x2="616" y2="130"></line>' +
        '<line class="grid" x1="56" y1="190" x2="616" y2="190"></line>' +
        '<line class="axis" x1="56" y1="210" x2="616" y2="210"></line>' +
        '<polyline class="line" points="' + polyline + '"></polyline>' +
        circles + yearLabels +
        '<text class="muted" x="74" y="34">最低分趋势</text>' +
        '<text class="muted" x="584" y="34">高 ' + escapeText(max) + ' / 低 ' + escapeText(min) + '</text>' +
        '</svg>';
      trendModalTable.innerHTML =
        '<table><thead><tr><th>年份</th><th class="num">最低分</th><th class="num">平均分</th><th class="num">最高分</th><th class="num">位次</th><th class="num">人数/计划</th></tr></thead><tbody>' +
        points.map((point) => '<tr><td>' + escapeText(point.year) + '</td><td class="num">' + escapeText(point.minScore ?? '-') + '</td><td class="num">' + escapeText(point.avgScore ?? '-') + '</td><td class="num">' + escapeText(point.maxScore ?? '-') + '</td><td class="num">' + escapeText(point.rank ?? '-') + '</td><td class="num">' + escapeText(point.count ?? '-') + '</td></tr>').join('') +
        '</tbody></table>';
      trendModal.classList.add('open');
      trendModal.setAttribute('aria-hidden', 'false');
    }
    function closeTrendModal() {
      trendModal.classList.remove('open');
      trendModal.setAttribute('aria-hidden', 'true');
    }
    document.addEventListener('click', (event) => {
      const button = event.target.closest('.trend-button');
      if (button) openTrendModal(button);
      if (event.target === trendModal) closeTrendModal();
    });
    trendModalClose.addEventListener('click', closeTrendModal);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeTrendModal();
    });
  </script>
</body>
</html>`;
}

async function main() {
  const [schools, baseline, latestCheck, coverageAudit, historical] = await Promise.all([
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json"),
    readJson("data/generated/latest-plan-check.json", null),
    readJson("data/generated/coverage-audit-2025.json", null),
    readJson("data/generated/historical-admissions.json", null)
  ]);
  const html = buildPage({ schools, baseline, latestCheck, coverageAudit, historical });
  const target = path.join(rootDir, PAGE_FILES.historicalReference);
  await writeFile(target, html, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
