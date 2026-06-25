import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const ARCHIVE_URL = "https://www.sneac.com/kszx/ptgk/lnsj.htm";
const KNOWN_SOURCES = [
  {
    year: 2025,
    subject: "普通物理",
    comparableSubject: "物理类",
    title: "2025年陕西省普通高考一分段统计表（普通物理、艺术物理、体育物理）",
    url: "https://www.sneac.com/info/1088/18594.htm"
  },
  {
    year: 2024,
    subject: "理工",
    comparableSubject: "理工类",
    title: "2024年陕西省普通高校招生一分段统计表（理工、艺理、体育）",
    url: "https://www.sneac.com/info/1088/18015.htm"
  },
  {
    year: 2023,
    subject: "理工",
    comparableSubject: "理工类",
    title: "2023年陕西省普通高校招生考生成绩统计表（理工、艺理、体育）",
    url: "https://www.sneac.com/info/1088/17489.htm"
  }
];

const ANCHOR_SCORES = [680, 670, 660, 650, 640, 630, 620, 610, 600];
const CHART_SCORES = [600, 610, 620, 630, 640, 650, 660, 670, 680];
const FOCUS_MIN = 580;
const FOCUS_MAX = 700;

async function readJson(relativePath, fallback = null) {
  try {
    const content = await readFile(path.join(rootDir, relativePath), "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function getText(url) {
  if (typeof fetch !== "function") throw new Error("当前 Node 版本不支持 fetch，请使用 Node 18+。");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 GKZY/0.1",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value ?? "").replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function absoluteUrl(href, baseUrl) {
  if (!href || /^javascript:|^mailto:|^tel:|^#/i.test(href)) return "";
  try {
    return new URL(decodeHtml(href), baseUrl).toString();
  } catch {
    return "";
  }
}

function extractVisibleLines(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, "\n")
    .replace(/<style[\s\S]*?<\/style>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h1|h2|h3|td|th)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .split(/\r?\n/)
    .map(decodeHtml)
    .filter(Boolean);
}

function discoverLatestSource(archiveHtml) {
  const links = [];
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkRe.exec(archiveHtml))) {
    const text = stripTags(match[2]);
    const url = absoluteUrl(match[1], ARCHIVE_URL);
    if (!text || !url) continue;
    links.push({ text, url });
  }
  const found2026 = links.find((item) => {
    return /2026年陕西省/.test(item.text)
      && /普通高考|普通高校招生/.test(item.text)
      && /一分段|一分一段|成绩统计表/.test(item.text)
      && /普通物理|物理|理工/.test(item.text);
  });
  if (!found2026) return null;
  return {
    year: 2026,
    subject: /理工/.test(found2026.text) ? "理工" : "普通物理",
    comparableSubject: /理工/.test(found2026.text) ? "理工类" : "物理类",
    title: found2026.text,
    url: found2026.url
  };
}

function parseScoreRows(html, source) {
  const rows = [];
  const trRe = /<tr\b[\s\S]*?<\/tr>/gi;
  let match;
  while ((match = trRe.exec(html))) {
    const tr = match[0];
    const cells = [];
    const cellRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let cellMatch;
    while ((cellMatch = cellRe.exec(tr))) {
      cells.push(stripTags(cellMatch[1]));
    }
    if (!cells.length) continue;
    const joined = cells.join(" ");
    if (/分数\s+人数\s+总人数/.test(joined)) continue;
    const first = cells[0] || "";
    const second = cells[1] || "";
    const third = cells[2] || "";
    const top = first.match(/^(\d{3})(?:分)?(?:及以上|以上)$/);
    if (top && /^\d+$/.test(second)) {
      const score = Number(top[1]);
      const count = Number(second);
      rows.push({
        score,
        count,
        cumulative: Number(third) || count,
        label: first,
        isTopBand: true
      });
      continue;
    }
    if (/^\d{2,3}$/.test(first) && /^\d+$/.test(second) && /^\d+$/.test(third)) {
      rows.push({
        score: Number(first),
        count: Number(second),
        cumulative: Number(third)
      });
      continue;
    }
    const bottom = first.match(/^(\d{2,3})(?:分)?(?:以下|分以下)/);
    if (bottom && /^\d+$/.test(second) && /^\d+$/.test(third)) {
      rows.push({
        score: Number(bottom[1]),
        count: Number(second),
        cumulative: Number(third),
        label: first,
        isBottomBand: true
      });
      break;
    }
  }
  if (!rows.length) {
    const lines = extractVisibleLines(html);
    const startIndex = lines.findIndex((line) => /分数\s+人数\s+总人数/.test(line));
    const usefulLines = startIndex >= 0 ? lines.slice(startIndex + 1) : lines;
    for (const line of usefulLines) {
      if (/友情链接|版权所有|中华人民共和国教育部|上一篇|下一篇/.test(line)) break;
      const top = line.match(/^(\d{3})(?:分)?(?:及以上|以上)\s+(\d+)$/);
      if (top) {
        const score = Number(top[1]);
        const count = Number(top[2]);
        rows.push({ score, count, cumulative: count, label: `${score}及以上`, isTopBand: true });
        continue;
      }
      const regular = line.match(/^(\d{2,3})\s+(\d+)\s+(\d+)$/);
      if (regular) {
        rows.push({
          score: Number(regular[1]),
          count: Number(regular[2]),
          cumulative: Number(regular[3])
        });
        continue;
      }
      const bottom = line.match(/^(\d{2,3})(?:分)?(?:以下|分以下).*?\s+(\d+)\s+(\d+)$/);
      if (bottom) {
        rows.push({
          score: Number(bottom[1]),
          count: Number(bottom[2]),
          cumulative: Number(bottom[3]),
          label: line,
          isBottomBand: true
        });
        break;
      }
    }
  }
  const deduped = [];
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.score)) continue;
    seen.add(row.score);
    deduped.push(row);
  }
  return {
    ...source,
    fetchedAt: new Date().toISOString(),
    status: deduped.length ? "available" : "parse-empty",
    rows: deduped
  };
}

function byScore(table) {
  return new Map((table?.rows || []).map((row) => [row.score, row]));
}

function rowFor(table, score) {
  return byScore(table).get(score) || null;
}

function buildAnchorRows(tables) {
  return ANCHOR_SCORES.map((score) => ({
    score,
    years: Object.fromEntries(tables.map((table) => {
      const row = rowFor(table, score);
      return [table.year, row ? { count: row.count, cumulative: row.cumulative } : null];
    }))
  }));
}

function buildMergedRows(tables) {
  const scoreSet = new Set();
  for (const table of tables) {
    for (const row of table.rows || []) {
      if (row.score >= 100) scoreSet.add(row.score);
    }
  }
  return [...scoreSet].sort((a, b) => b - a).map((score) => ({
    score,
    years: Object.fromEntries(tables.map((table) => {
      const row = rowFor(table, score);
      return [table.year, row ? { count: row.count, cumulative: row.cumulative } : null];
    }))
  }));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("zh-CN");
}

function cellFor(yearData, field) {
  if (!yearData) return "-";
  return formatNumber(yearData[field]);
}

function sourceLink(table) {
  return `<a href="${escapeHtml(table.url)}" target="_blank" rel="noreferrer">${escapeHtml(table.year)} ${escapeHtml(table.comparableSubject)}</a>`;
}

function statusTag(table) {
  if (table.status === "stale") return `<span class="tag warn">使用缓存</span>`;
  return `<span class="tag good">已抓取</span>`;
}

function chartSvg(tables) {
  const width = 920;
  const height = 320;
  const pad = { left: 72, right: 24, top: 24, bottom: 48 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const series = tables.map((table) => ({
    table,
    points: CHART_SCORES.map((score) => {
      const row = rowFor(table, score);
      return row ? { score, rank: row.cumulative } : null;
    }).filter(Boolean)
  })).filter((item) => item.points.length >= 2);
  const ranks = series.flatMap((item) => item.points.map((point) => point.rank));
  const minRank = Math.min(...ranks);
  const maxRank = Math.max(...ranks);
  const minScore = Math.min(...CHART_SCORES);
  const maxScore = Math.max(...CHART_SCORES);
  const x = (score) => pad.left + ((score - minScore) / (maxScore - minScore)) * plotW;
  const y = (rank) => pad.top + ((rank - minRank) / (maxRank - minRank || 1)) * plotH;
  const colors = new Map([
    [2026, "#7c3aed"],
    [2025, "#1f5aa6"],
    [2024, "#147a4a"],
    [2023, "#a85b00"]
  ]);
  const gridY = [minRank, Math.round((minRank + maxRank) / 2), maxRank];
  return `<svg class="rank-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="陕西一分一段位次对比图">
    <rect x="0" y="0" width="${width}" height="${height}" rx="8" fill="#fff"/>
    ${gridY.map((rank) => `<line x1="${pad.left}" y1="${y(rank).toFixed(1)}" x2="${width - pad.right}" y2="${y(rank).toFixed(1)}" stroke="#e5e7eb"/><text x="12" y="${(y(rank) + 4).toFixed(1)}" font-size="12" fill="#637083">${formatNumber(rank)}</text>`).join("")}
    ${CHART_SCORES.map((score) => `<line x1="${x(score).toFixed(1)}" y1="${pad.top}" x2="${x(score).toFixed(1)}" y2="${height - pad.bottom}" stroke="#f1f5f9"/><text x="${(x(score) - 12).toFixed(1)}" y="${height - 18}" font-size="12" fill="#637083">${score}</text>`).join("")}
    <text x="${pad.left}" y="${height - 4}" font-size="12" fill="#637083">分数</text>
    <text x="12" y="18" font-size="12" fill="#637083">累计位次</text>
    ${series.map((item) => {
      const color = colors.get(item.table.year) || "#334155";
      const points = item.points.map((point) => `${x(point.score).toFixed(1)},${y(point.rank).toFixed(1)}`).join(" ");
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="3"/>${item.points.map((point) => `<circle cx="${x(point.score).toFixed(1)}" cy="${y(point.rank).toFixed(1)}" r="4" fill="${color}"><title>${item.table.year} ${point.score}分：${formatNumber(point.rank)}位</title></circle>`).join("")}`;
    }).join("")}
  </svg>`;
}

function tableRows(rows, years) {
  return rows.map((row) => `<tr>
    <td class="num">${escapeHtml(row.score)}</td>
    ${years.map((year) => `<td class="num">${cellFor(row.years[year], "count")}</td><td class="num">${cellFor(row.years[year], "cumulative")}</td>`).join("")}
  </tr>`).join("\n");
}

function html(data) {
  const tables = data.tables.filter((table) => table.rows?.length).sort((a, b) => Number(b.year) - Number(a.year));
  const years = tables.map((table) => table.year);
  const anchorRows = data.anchorRows;
  const focusRows = data.mergedRows.filter((row) => row.score >= FOCUS_MIN && row.score <= FOCUS_MAX);
  const latest = tables[0];
  const pending2026 = data.pendingYears.includes(2026);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>陕西一分一段与位次对照</title>
  <style>
    :root { --bg:#f5f6f8; --panel:#fff; --ink:#172033; --muted:#637083; --line:#d8dee8; --blue:#1f5aa6; --green:#147a4a; --amber:#a85b00; --purple:#7c3aed; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.45; }
    .wrap { width:100%; padding:22px; }
    header, section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:16px; }
    h1 { margin:0 0 8px; font-size:24px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:18px; letter-spacing:0; }
    h3 { margin:0 0 8px; font-size:15px; letter-spacing:0; }
    p { margin:0 0 8px; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .subtle, .small { color:var(--muted); }
    .small { font-size:12px; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:12px; }
    .metric { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fff; min-height:82px; }
    .metric strong { display:block; font-size:24px; }
    .notice { border-left:4px solid var(--amber); background:#fff7ed; padding:10px 12px; border-radius:6px; color:#7a3d00; }
    .source-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px; }
    .source-card { border:1px solid var(--line); border-radius:8px; padding:12px; }
    .chart-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .rank-chart { min-width:760px; width:100%; height:auto; display:block; }
    .legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:10px; }
    .legend span { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--muted); }
    .swatch { width:12px; height:12px; border-radius:3px; display:inline-block; }
    .table-scroll { overflow:auto; border:1px solid var(--line); border-radius:8px; background:#fff; }
    table { width:100%; min-width:${Math.max(980, 150 + years.length * 180)}px; border-collapse:collapse; table-layout:fixed; font-size:13px; }
    th, td { padding:8px 7px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }
    th { background:#f8fafc; color:#344054; font-weight:800; }
    tr:last-child td { border-bottom:0; }
    .num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
    .tag { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:12px; font-weight:800; white-space:nowrap; }
    .tag.good { color:var(--green); background:#ecfdf3; border-color:#abefc6; }
    .tag.warn { color:var(--amber); background:#fff7ed; border-color:#fed7aa; }
    @media (max-width: 900px) { .wrap { padding:12px; } .metrics { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <h1>陕西一分一段与位次对照</h1>
      <p class="subtle">普通物理/理工口径｜数据来源：陕西招生考试信息网历年数据。生成时间：${escapeHtml(data.generatedAt)}</p>
      <div class="metrics">
        <div class="metric"><strong>${escapeHtml(tables.length)}</strong><span class="subtle">已入库年份</span></div>
        <div class="metric"><strong>${escapeHtml(latest?.year || "-")}</strong><span class="subtle">最新可用年份</span></div>
        <div class="metric"><strong>${formatNumber(latest?.rows?.length || 0)}</strong><span class="subtle">最新年份分数行</span></div>
        <div class="metric"><strong>${pending2026 ? "待发布" : "已纳入"}</strong><span class="subtle">2026一分段</span></div>
      </div>
    </header>

    <section>
      <h2>使用口径</h2>
      <p class="notice">2025 是新高考“普通物理”口径；2024、2023 是旧高考“理工”口径。出分后正式决策必须优先使用 2026 陕西普通物理类一分一段和真实省位次，往年表只用于估分和大小年对照。</p>
    </section>

    <section>
      <h2>来源状态</h2>
      <div class="source-grid">
        ${tables.map((table) => `<div class="source-card"><h3>${sourceLink(table)}</h3><p>${statusTag(table)} <span class="tag">${escapeHtml(table.comparableSubject)}</span></p><p class="small">${escapeHtml(table.title)}</p></div>`).join("\n")}
        ${pending2026 ? `<div class="source-card"><h3>2026 陕西普通物理</h3><p><span class="tag warn">待发布</span></p><p class="small">每次运行更新脚本会检查陕西招生考试信息网历年数据页；发现 2026 一分段后自动纳入。</p></div>` : ""}
      </div>
    </section>

    <section>
      <h2>核心分数位次图</h2>
      <div class="chart-wrap">${chartSvg(tables)}</div>
      <div class="legend">
        ${tables.map((table) => {
          const color = table.year === 2026 ? "#7c3aed" : table.year === 2025 ? "#1f5aa6" : table.year === 2024 ? "#147a4a" : "#a85b00";
          return `<span><i class="swatch" style="background:${color}"></i>${escapeHtml(table.year)} ${escapeHtml(table.comparableSubject)}</span>`;
        }).join("")}
      </div>
    </section>

    <section>
      <h2>关键锚点位次表</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th class="num" style="width:90px">分数</th>${years.map((year) => `<th class="num">${year}人数</th><th class="num">${year}累计位次</th>`).join("")}</tr></thead>
          <tbody>${tableRows(anchorRows, years)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>580-700 分段详表</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th class="num" style="width:90px">分数</th>${years.map((year) => `<th class="num">${year}人数</th><th class="num">${year}累计位次</th>`).join("")}</tr></thead>
          <tbody>${tableRows(focusRows, years)}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  await mkdir(generatedDir, { recursive: true });
  let archiveHtml = "";
  try {
    archiveHtml = await getText(ARCHIVE_URL);
  } catch {
    archiveHtml = "";
  }
  const discovered = archiveHtml ? discoverLatestSource(archiveHtml) : null;
  const sources = [...KNOWN_SOURCES];
  if (discovered && !sources.some((source) => source.year === discovered.year)) {
    sources.unshift(discovered);
  }

  const previous = await readJson("data/generated/score-rank-tables.json", { tables: [] });
  const previousByYear = new Map((previous.tables || []).map((table) => [Number(table.year), table]));
  const tables = [];
  for (const source of sources) {
    try {
      const htmlText = await getText(source.url);
      tables.push(parseScoreRows(htmlText, source));
    } catch (error) {
      const fallback = previousByYear.get(Number(source.year));
      if (fallback?.rows?.length) {
        tables.push({ ...fallback, status: "stale", fetchError: error.message });
      } else {
        tables.push({ ...source, status: "fetch-error", fetchError: error.message, rows: [] });
      }
    }
  }

  const availableTables = tables.filter((table) => table.rows?.length);
  const output = {
    generatedAt: new Date().toISOString(),
    province: "陕西",
    archiveUrl: ARCHIVE_URL,
    pendingYears: availableTables.some((table) => Number(table.year) === 2026) ? [] : [2026],
    notes: [
      "2025为普通物理口径；2024、2023为理工口径，横向比较时应注意新旧高考口径差异。",
      "累计人数可近似作为该分数及以上位次；最终填报以2026官方一分一段和成绩查询位次为准。"
    ],
    tables: availableTables.sort((a, b) => Number(b.year) - Number(a.year))
  };
  output.anchorRows = buildAnchorRows(output.tables);
  output.mergedRows = buildMergedRows(output.tables);

  const jsonTarget = path.join(generatedDir, "score-rank-tables.json");
  await writeFile(jsonTarget, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  const htmlTarget = path.join(rootDir, PAGE_FILES.scoreRankReference);
  await writeFile(htmlTarget, html(output), "utf8");
  console.log(`Wrote ${path.relative(rootDir, jsonTarget)}`);
  console.log(`Wrote ${path.relative(rootDir, htmlTarget)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
