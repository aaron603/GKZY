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

function statusLabel(status) {
  if (status === "confirmed") return "已核2026";
  if (status === "confirmed-previous-year") return "已核上年";
  return "待核";
}

function statusClass(status) {
  if (status === "confirmed") return "good";
  if (status === "confirmed-previous-year") return "warn";
  return "muted";
}

function schoolUrl(school) {
  return school.manualCheckUrl || school.queryApi?.listUrl || school.queryApi?.typeUrl || "";
}

function buildRows(schools, audit) {
  const byKey = new Map((audit.items || []).map((item) => [item.schoolKey, item]));
  return schools.schools.map((school) => {
    const item = byKey.get(school.key);
    if (item) return { ...item, school: item.school || school.name, sourceUrl: item.sourceUrl || schoolUrl(school) };
    return {
      schoolKey: school.key,
      school: school.name,
      sourceYear: "",
      sourceTitle: "招生章程待核",
      sourceUrl: schoolUrl(school),
      auditStatus: "pending",
      articleHint: "优先查第十二条附近；也查“招生类型与录取规则/专业安排”章节",
      professionalArrangement: `经验默认：${audit.commonExperience.professionalArrangement} 未逐条核原文前不得作为最终依据。`,
      majorGradeGap: `经验默认：${audit.commonExperience.majorGradeGap}`,
      mainSubjectConstraints: `经验默认：${audit.commonExperience.mainSubjectConstraints}`,
      genderConstraints: `经验默认：${audit.commonExperience.genderConstraints}`,
      notes: "待打开学校本科招生网或阳光高考章程页，核第十二条及相邻录取规则。"
    };
  });
}

function link(url, text) {
  if (!url) return escapeHtml(text || "待补链接");
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(text || url)}</a>`;
}

function html({ schools, audit }) {
  const rows = buildRows(schools, audit);
  const confirmed = rows.filter((row) => row.auditStatus === "confirmed").length;
  const previous = rows.filter((row) => row.auditStatus === "confirmed-previous-year").length;
  const pending = rows.length - confirmed - previous;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>招生章程专业录取规则审计</title>
  <style>
    :root { --bg:#f5f6f8; --panel:#fff; --ink:#172033; --muted:#637083; --line:#d8dee8; --blue:#1f5aa6; --green:#147a4a; --amber:#a85b00; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.45; }
    .wrap { width:100%; padding:22px; }
    header, section { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:16px; margin-bottom:16px; }
    h1 { margin:0 0 8px; font-size:24px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:18px; letter-spacing:0; }
    p { margin:0 0 8px; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .subtle, .small { color:var(--muted); }
    .small { font-size:12px; }
    .metrics { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin-top:12px; }
    .metric { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fff; }
    .metric strong { display:block; font-size:24px; }
    .table-scroll { overflow:auto; border:1px solid var(--line); border-radius:8px; background:#fff; }
    table { width:100%; min-width:1680px; border-collapse:collapse; table-layout:fixed; font-size:13px; }
    th, td { padding:9px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { background:#f8fafc; color:#344054; font-weight:800; }
    tr:last-child td { border-bottom:0; }
    .tag { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:12px; font-weight:800; white-space:nowrap; }
    .tag.good { color:var(--green); background:#ecfdf3; border-color:#abefc6; }
    .tag.warn { color:var(--amber); background:#fff7ed; border-color:#fed7aa; }
    .tag.muted { color:var(--muted); background:#f8fafc; }
    ul { margin:8px 0 0; padding-left:20px; }
    @media (max-width: 900px) { .metrics { grid-template-columns:1fr; } .wrap { padding:12px; } }
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <h1>招生章程专业录取规则审计</h1>
      <p class="subtle">更新时间：${escapeHtml(audit.updatedAt)}。重点核第十二条附近，以及“招生类型与录取规则/专业安排”章节。</p>
      <div class="metrics">
        <div class="metric"><strong>${rows.length}</strong><span class="subtle">学校总数</span></div>
        <div class="metric"><strong>${confirmed}</strong><span class="subtle">已核2026</span></div>
        <div class="metric"><strong>${previous}</strong><span class="subtle">已核上年</span></div>
        <div class="metric"><strong>${pending}</strong><span class="subtle">待逐校复核</span></div>
      </div>
    </header>

    <section>
      <h2>经验判断口径</h2>
      <ul>
        <li>${escapeHtml(audit.commonExperience.professionalArrangement)}</li>
        <li>${escapeHtml(audit.commonExperience.majorGradeGap)}</li>
        <li>${escapeHtml(audit.commonExperience.mainSubjectConstraints)}</li>
        <li>${escapeHtml(audit.commonExperience.genderConstraints)}</li>
      </ul>
    </section>

    <section>
      <h2>逐校规则表</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th style="width:130px">学校</th><th style="width:92px">状态</th><th style="width:160px">章程来源</th><th style="width:160px">重点条款</th><th style="width:210px">专业安排原则</th><th style="width:150px">专业级差</th><th style="width:300px">三大主科/外语约束</th><th style="width:210px">性别约束</th><th>备注</th></tr></thead>
          <tbody>
            ${rows.map((row) => `<tr><td><strong>${escapeHtml(row.school)}</strong></td><td><span class="tag ${statusClass(row.auditStatus)}">${statusLabel(row.auditStatus)}</span></td><td>${link(row.sourceUrl, row.sourceYear ? `${row.sourceYear}章程` : row.sourceTitle)}</td><td>${escapeHtml(row.articleHint)}</td><td>${escapeHtml(row.professionalArrangement)}</td><td>${escapeHtml(row.majorGradeGap)}</td><td>${escapeHtml(row.mainSubjectConstraints)}</td><td>${escapeHtml(row.genderConstraints)}</td><td>${escapeHtml(row.notes)}</td></tr>`).join("\n")}
          </tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [schools, audit] = await Promise.all([
    readJson("data/schools.json"),
    readJson("data/admission-charter-rules.json")
  ]);
  const target = path.join(rootDir, PAGE_FILES.admissionCharterAudit);
  await writeFile(target, html({ schools, audit }), "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
