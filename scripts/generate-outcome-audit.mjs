import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

async function readJson(relativePath) {
  const content = await readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(content);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderRows(items, mapper) {
  return items.map(mapper).join("\n");
}

function tagClass(value) {
  if (value === "高") return "good";
  if (value === "中高") return "blue";
  if (value === "中") return "";
  return "warn";
}

function schoolEntryUrl(school) {
  return school?.manualCheckUrl || school?.queryApi?.listUrl || school?.queryApi?.typeUrl || "";
}

function createSchoolLinker(schools) {
  const schoolByKey = new Map((schools?.schools || []).map((school) => [school.key, school]));
  return (schoolKey, fallbackName) => {
    const school = schoolByKey.get(schoolKey);
    const name = escapeHtml(fallbackName || school?.name || "");
    const url = schoolEntryUrl(school);
    if (!url) return name;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${name}</a>`;
  };
}

function html({ outcomeAudit, schools }) {
  const schoolLink = createSchoolLinker(schools);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>保研与就业审计</title>
  <style>
    :root {
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #18202a;
      --muted: #667085;
      --line: #d9dee7;
      --blue: #2459a6;
      --teal: #0f766e;
      --amber: #b45309;
      --green: #16803c;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      line-height: 1.55;
    }
    header {
      background: #fff;
      border-bottom: 1px solid var(--line);
    }
    .wrap {
      max-width: 1220px;
      margin: 0 auto;
      padding: 24px;
    }
    h1 { margin: 0 0 8px; font-size: 30px; letter-spacing: 0; }
    h2 { margin: 0 0 14px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 18px 0 10px; font-size: 16px; letter-spacing: 0; }
    p { margin: 0 0 10px; }
    section {
      margin: 18px 0;
      padding: 20px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      font-size: 14px;
      table-layout: fixed;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 9px 8px;
      vertical-align: top;
      text-align: left;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
    }
    th { background: #f8fafc; color: #344054; font-weight: 800; }
    tr:last-child td { border-bottom: 0; }
    ul { margin: 8px 0 0; padding-left: 20px; }
    .subtle { color: var(--muted); }
    .note {
      padding: 12px;
      border-left: 4px solid var(--blue);
      background: #f1f6ff;
      border-radius: 6px;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
    }
    .metric {
      min-height: 86px;
      padding: 14px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .metric strong { display: block; font-size: 24px; margin-bottom: 4px; }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 7px;
      margin: 1px 3px 1px 0;
      border-radius: 999px;
      background: #eef2f7;
      color: #344054;
      font-size: 12px;
      font-weight: 800;
      white-space: normal;
      max-width: 100%;
    }
    .tag.compact {
      display: inline;
      line-height: 1.8;
      border-radius: 6px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
    .tag.good { background: #e8f5ee; color: var(--green); }
    .tag.warn { background: #fff4e5; color: var(--amber); }
    .tag.blue { background: #eaf1fb; color: var(--blue); }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .wrap { padding: 16px; }
      table { font-size: 13px; }
      th, td { padding: 7px 5px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>保研与就业审计</h1>
      <p class="subtle">用于补充学校/专业选择中的升学质量、就业质量和未来5-10年趋势。生成时间：${escapeHtml(new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</p>
      <div class="grid">
        <div class="metric"><strong>${escapeHtml(outcomeAudit.schoolDataPlan.length)}</strong><span class="subtle">重点学校待核</span></div>
        <div class="metric"><strong>${escapeHtml(outcomeAudit.trackOutlooks.length)}</strong><span class="subtle">专业方向趋势</span></div>
        <div class="metric"><strong>A/B/C</strong><span class="subtle">来源等级</span></div>
        <div class="metric"><strong>保研+就业</strong><span class="subtle">新增评估维度</span></div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section>
      <h2>先说结论</h2>
      <p class="note">保研和就业都能查，但精度不同：规则、名单、就业报告通常能查；具体专业保研比例和专业就业质量很多时候要靠官方名单、本科人数、学院答复和就业报告交叉推算。</p>
      <ul>
        ${outcomeAudit.dataBoundary.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
      </ul>
    </section>

    <section>
      <h2>官方入口和来源等级</h2>
      <table>
        <thead><tr><th style="width:80px">等级</th><th>来源</th><th>用途</th></tr></thead>
        <tbody>
          ${renderRows(outcomeAudit.sourcePolicy, (item) => `<tr><td><span class="tag">${escapeHtml(item.level)}</span></td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.usage)}</td></tr>`)}
        </tbody>
      </table>
      <h3>常用入口</h3>
      <ul>
        ${outcomeAudit.officialLinks.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a>：${escapeHtml(item.usage)}</li>`).join("\n")}
      </ul>
    </section>

    <section>
      <h2>重点学校升学就业待核表</h2>
      <table>
        <thead><tr><th style="width:140px">学校</th><th style="width:84px">保研友好</th><th style="width:84px">就业平台</th><th>当前判断</th><th>重点问题</th></tr></thead>
        <tbody>
          ${renderRows(outcomeAudit.schoolDataPlan, (item) => `<tr><td><strong>${schoolLink(item.schoolKey, item.school)}</strong></td><td><span class="tag ${tagClass(item.postgradFriendliness)}">${escapeHtml(item.postgradFriendliness)}</span></td><td><span class="tag ${tagClass(item.employmentPlatform)}">${escapeHtml(item.employmentPlatform)}</span></td><td>${escapeHtml(item.currentStatus)}</td><td><ul>${item.priorityQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>未来5-10年就业趋势</h2>
      <table>
        <thead><tr><th style="width:150px">方向</th><th>趋势判断</th><th>就业质量</th><th style="width:150px">读研价值</th><th>主要风险</th><th>志愿策略</th></tr></thead>
        <tbody>
          ${renderRows(outcomeAudit.trackOutlooks, (item) => `<tr><td><strong>${escapeHtml(item.track)}</strong></td><td>${escapeHtml(item.fiveToTenYearOutlook)}</td><td>${escapeHtml(item.employmentQuality)}</td><td><span class="tag compact">${escapeHtml(item.postgradValue)}</span></td><td>${escapeHtml(item.risk)}</td><td>${escapeHtml(item.strategy)}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>招生办问询题库</h2>
      <ul>
        ${outcomeAudit.admissionsQuestionBank.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
      </ul>
    </section>

    <section>
      <h2>家长操作流程</h2>
      <ol>
        ${outcomeAudit.parentWorkflow.map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
      </ol>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [outcomeAudit, schools] = await Promise.all([
    readJson("data/outcome-audit.json"),
    readJson("data/schools.json")
  ]);
  const target = path.join(rootDir, PAGE_FILES.outcomeAudit);
  await writeFile(target, html({ outcomeAudit, schools }), "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
