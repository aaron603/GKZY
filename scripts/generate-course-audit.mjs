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

function formatRank(rank) {
  if (!rank) return "-";
  return Number(rank).toLocaleString("zh-CN");
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

function levelTag(level) {
  if (level === "A") return "good";
  if (level === "B") return "blue";
  return "warn";
}

function strength(value) {
  const n = Number(value || 0);
  return `<span class="meter" title="${n}/5"><span style="width:${n * 20}%"></span></span><strong>${n}</strong>`;
}

function findCourseProfile(courseAudit, candidate) {
  const text = `${candidate.major} ${candidate.track || ""}`;
  const matched = courseAudit.items.find((item) => item.matchKeywords.some((keyword) => text.includes(keyword)));
  return matched || null;
}

function compact(value) {
  return String(value ?? "").replace(/[（）()【】\[\]\s·,，/、-]/g, "").toLowerCase();
}

function findPlanRow(latestCheck, candidate) {
  const school = (latestCheck?.schools || []).find((item) => item.key === candidate.schoolKey);
  if (!school?.rows?.length) return null;
  const major = compact(candidate.major);
  return school.rows.find((row) => {
    const planMajor = compact(row.zymc || row.recruitmentMajorName || "");
    return planMajor && (major.includes(planMajor) || planMajor.includes(major.slice(0, Math.min(major.length, 8))));
  }) || null;
}

function groupCandidatesByCourse(courseAudit, baseline) {
  return courseAudit.items.map((profile) => ({
    profile,
    candidates: baseline.items.filter((candidate) => {
      const text = `${candidate.major} ${candidate.track || ""}`;
      return profile.matchKeywords.some((keyword) => text.includes(keyword));
    })
  }));
}

function candidateCourseRows(courseAudit, baseline, schools, latestCheck) {
  const schoolByKey = new Map((schools?.schools || []).map((school) => [school.key, school]));
  return (baseline.items || []).map((candidate) => {
    const profile = findCourseProfile(courseAudit, candidate);
    const plan = findPlanRow(latestCheck, candidate);
    const school = schoolByKey.get(candidate.schoolKey);
    return {
      candidate,
      profile,
      plan,
      school,
      courses: profile?.coreCourses || []
    };
  });
}

function html({ courseAudit, baseline, schools, latestCheck }) {
  const grouped = groupCandidatesByCourse(courseAudit, baseline);
  const matchedCount = baseline.items.filter((item) => findCourseProfile(courseAudit, item)).length;
  const sourceSummary = courseAudit.sourcePolicy.map((item) => `<tr><td><span class="tag ${levelTag(item.level)}">${escapeHtml(item.level)}</span></td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.usage)}</td></tr>`).join("\n");
  const schoolLink = createSchoolLinker(schools);
  const candidateRows = candidateCourseRows(courseAudit, baseline, schools, latestCheck);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>候选专业课程审计</title>
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
      --red: #b42318;
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
    h1 {
      margin: 0 0 8px;
      font-size: 30px;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 14px;
      font-size: 20px;
      letter-spacing: 0;
    }
    h3 {
      margin: 18px 0 10px;
      font-size: 16px;
      letter-spacing: 0;
    }
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
    }
    th {
      background: #f8fafc;
      color: #344054;
      font-weight: 800;
    }
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
    .metric strong {
      display: block;
      font-size: 24px;
      margin-bottom: 4px;
    }
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
      white-space: nowrap;
    }
    .tag.good { background: #e8f5ee; color: var(--green); }
    .tag.warn { background: #fff4e5; color: var(--amber); }
    .tag.blue { background: #eaf1fb; color: var(--blue); }
    .meter {
      display: inline-flex;
      width: 72px;
      height: 9px;
      margin-right: 6px;
      border-radius: 999px;
      background: #e5e7eb;
      overflow: hidden;
      vertical-align: middle;
    }
    .meter span {
      display: block;
      height: 100%;
      background: var(--teal);
    }
    .course-list {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
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
      <h1>候选专业课程审计</h1>
      <p class="subtle">按正式出分 662 分、1558 位次筛出的普通类候选专业，逐项审计课程强度、专业课列表和2026计划匹配。生成时间：${escapeHtml(new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</p>
      <div class="grid">
        <div class="metric"><strong>${escapeHtml(courseAudit.items.length)}</strong><span class="subtle">课程画像方向</span></div>
        <div class="metric"><strong>${escapeHtml(matchedCount)}</strong><span class="subtle">已匹配候选专业</span></div>
        <div class="metric"><strong>${escapeHtml(baseline.items.length - matchedCount)}</strong><span class="subtle">暂未匹配项</span></div>
        <div class="metric"><strong>C</strong><span class="subtle">当前主要来源等级</span></div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section>
      <h2>使用边界</h2>
      <p class="note">${escapeHtml(courseAudit.dataBoundary[0])}</p>
      <ul>
        ${courseAudit.dataBoundary.slice(1).map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
      </ul>
    </section>

    <section>
      <h2>候选学校/专业逐项课程清单</h2>
      <p class="note">以下为主填报池普通类候选项。若“专业组/2026计划”为空，表示当前自动接口未能稳定返回该校陕西物理普通类分专业计划，应以陕西省招生计划目录和院校招生网为最终依据。专业课先按方向画像列出，待取得学校培养方案后再替换为官方课程表。</p>
      <table>
        <thead><tr><th style="width:140px">学校</th><th>专业/专业类</th><th style="width:110px">专业组/选科</th><th style="width:90px">2026计划</th><th style="width:90px">2025最低分</th><th>专业课列表</th><th>课程待核</th></tr></thead>
        <tbody>
          ${candidateRows.map(({ candidate, profile, plan }) => `<tr>
            <td><strong>${schoolLink(candidate.schoolKey, candidate.school)}</strong></td>
            <td>${escapeHtml(candidate.major)}<div class="subtle">${escapeHtml(candidate.suggestion || candidate.recommendation || "")}｜${escapeHtml(candidate.track || candidate.matchedTrack || "")}</div></td>
            <td>${escapeHtml(plan?.zygroup || plan?.xkkm || plan?.xkyq || candidate.subjectRequirement || "待核")}</td>
            <td>${escapeHtml(plan?.jhrs ?? plan?.recruitmentStudentsNumber ?? candidate.plan ?? "待核")}</td>
            <td>${escapeHtml(candidate.minScore ?? candidate.score ?? "-")}</td>
            <td>${profile ? profile.coreCourses.map((course) => `<span class="tag">${escapeHtml(course)}</span>`).join("") : "待补充"}</td>
            <td>${escapeHtml(profile ? profile.admissionsQuestions.join("；") : "补学校培养方案、主干课程和学院归属")}</td>
          </tr>`).join("\n")}
        </tbody>
      </table>
    </section>

    <section>
      <h2>来源等级</h2>
      <table>
        <thead><tr><th style="width:80px">等级</th><th>来源</th><th>用途</th></tr></thead>
        <tbody>${sourceSummary}</tbody>
      </table>
      <h3>常用入口</h3>
      <ul>
        ${courseAudit.sourceLinks.map((item) => `<li><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.title)}</a></li>`).join("\n")}
      </ul>
    </section>

    ${grouped.map(({ profile, candidates }) => `<section>
      <h2>${escapeHtml(profile.label)} <span class="tag ${levelTag(profile.sourceLevel)}">${escapeHtml(profile.sourceLevel)}源</span></h2>
      <p class="note">${escapeHtml(profile.fitJudgement)}</p>
      <h3>课程强度</h3>
      <table>
        <thead><tr><th>数学</th><th>编程</th><th>电路信号</th><th>物理/力学</th><th>生化医学</th><th>工程实践</th><th>生物医药衔接</th></tr></thead>
        <tbody><tr>
          <td>${strength(profile.courseProfile.math)}</td>
          <td>${strength(profile.courseProfile.coding)}</td>
          <td>${strength(profile.courseProfile.electronicsSignal)}</td>
          <td>${strength(profile.courseProfile.physicsMechanics)}</td>
          <td>${strength(profile.courseProfile.bioChemMedicine)}</td>
          <td>${strength(profile.courseProfile.engineeringPractice)}</td>
          <td>${strength(profile.courseProfile.biomedBridge)}</td>
        </tr></tbody>
      </table>
      <h3>典型核心课程</h3>
      <div class="course-list">${profile.coreCourses.map((course) => `<span class="tag">${escapeHtml(course)}</span>`).join("")}</div>
      <h3>主要风险</h3>
      <ul>${profile.risks.map((risk) => `<li>${escapeHtml(risk)}</li>`).join("\n")}</ul>
      <h3>招生办/学院要问</h3>
      <ul>${profile.admissionsQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("\n")}</ul>
      <h3>候选池匹配项</h3>
      ${candidates.length ? `<table>
        <thead><tr><th style="width:140px">学校</th><th>专业名称</th><th style="width:80px">2025分</th><th style="width:90px">位次</th><th style="width:80px">分段</th><th style="width:80px">来源</th></tr></thead>
        <tbody>
          ${candidates.map((candidate) => `<tr><td><strong>${schoolLink(candidate.schoolKey, candidate.school)}</strong></td><td>${escapeHtml(candidate.major)}</td><td>${escapeHtml(candidate.minScore ?? candidate.score ?? "-")}</td><td>${formatRank(candidate.rank)}</td><td>${escapeHtml(candidate.band)}</td><td>${escapeHtml(candidate.sourceLevel)}</td></tr>`).join("\n")}
        </tbody>
      </table>` : `<p class="subtle">当前候选池暂无直接匹配项。</p>`}
    </section>`).join("\n")}
  </main>
</body>
</html>`;
}

async function main() {
  const [courseAudit, baseline, schools, latestCheck] = await Promise.all([
    readJson("data/course-audit.json"),
    readJson("data/generated/candidate-evaluation.json"),
    readJson("data/schools.json"),
    readJson("data/generated/latest-plan-check.json")
  ]);

  const target = path.join(rootDir, PAGE_FILES.courseAudit);
  await writeFile(target, html({ courseAudit, baseline, schools, latestCheck }), "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
