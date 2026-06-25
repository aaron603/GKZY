import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const provinceId = "61";
const targetScore = 662;
const targetRank = 1558;

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "accept": "application/json,text/plain,*/*",
      "user-agent": "Mozilla/5.0 GKZY/0.1"
    }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeName(name) {
  return String(name || "")
    .replace(/[()]/g, (char) => char === "(" ? "（" : "）")
    .replace(/\s+/g, "");
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function minScoreOf(info) {
  return numberOrNull(info?.province_score_min?.[provinceId]?.min);
}

function likelyUsefulForProfile(name, info) {
  const text = [
    name,
    info?.type_name,
    info?.belong,
    info?.school_nature_name,
    info?.level_name
  ].filter(Boolean).join(" ");
  if (/医学部|协和|医学院|药科|中医/.test(text)) return "医学主线谨慎";
  if (/农业|林业|海洋/.test(text)) return "行业属性谨慎";
  if (/人民大学|师范|民族|外国语|政法|财经|体育|美术|音乐|戏剧/.test(text)) return "非工科主线";
  if (/电子|科技|工业|交通|航空|航天|理工|工程|邮电|电力|大学/.test(text)) return "可继续查工科/信息类";
  return "需人工判断";
}

function scoreBand(score) {
  if (score === null) return "无可比院校最低分";
  const delta = targetScore - score;
  if (delta <= -12) return "超高冲刺";
  if (delta < 0) return "冲刺";
  if (delta <= 5) return "核心匹配";
  if (delta <= 20) return "稳妥匹配";
  if (delta <= 45) return "下探保底";
  return "低于本轮985主池";
}

function actionOf({ score, covered, profileFit, hasCandidate }) {
  if (/医学主线|非工科主线|行业属性谨慎/.test(profileFit) && !hasCandidate) return "只留审计";
  if (covered) return "已覆盖，核专业组/计划";
  if (score === null) return "补官方普通批数据";
  const delta = targetScore - score;
  if (delta < -12) return "高冲，少量留名校冲刺";
  if (delta < 0) return "冲刺补查专业分";
  if (delta <= 20) return "应补入985主观察";
  if (delta <= 45) return "可作985保底/下探";
  return "通常不主推，保留备查";
}

function buildSourceCoverage(schools, baseline, evaluation) {
  const names = new Set();
  const keyByName = new Map();
  for (const school of schools.schools || []) {
    names.add(normalizeName(school.name));
    keyByName.set(normalizeName(school.name), school.key);
  }
  for (const item of baseline.items || []) {
    names.add(normalizeName(item.school));
    if (item.schoolKey) keyByName.set(normalizeName(item.school), item.schoolKey);
  }
  const candidateNames = new Set((evaluation.items || []).map((item) => normalizeName(item.school)));
  return { names, candidateNames, keyByName };
}

function candidateSignals(evaluation, name) {
  const normalized = normalizeName(name);
  return (evaluation.items || [])
    .filter((item) => normalizeName(item.school) === normalized)
    .slice(0, 5)
    .map((item) => ({
      major: item.major,
      minScore: item.minScore ?? item.score ?? null,
      rank: item.rank ?? null,
      recommendation: item.recommendation || item.suggestion || ""
    }));
}

async function fetchAll985({ schools, baseline, evaluation }) {
  const nameData = await fetchJson("https://static-data.gaokao.cn/www/2.0/school/name.json");
  const coverage = buildSourceCoverage(schools, baseline, evaluation);
  const sourceSchools = (nameData.data || []).filter((school) => school?.school_id && school?.name);
  const rows = await mapLimit(sourceSchools, 16, async (school) => {
    try {
      const infoData = await fetchJson(`https://static-data.gaokao.cn/www/2.0/school/${school.school_id}/info.json`);
      const info = infoData.data || {};
      if (info.f985 !== "1") return null;
      const name = normalizeName(info.name || school.name);
      const score = minScoreOf(info);
      const profileFit = likelyUsefulForProfile(name, info);
      const covered = coverage.names.has(name);
      const hasCandidate = coverage.candidateNames.has(name);
      const candidates = candidateSignals(evaluation, name);
      return {
        name,
        schoolId: String(school.school_id),
        province: info.province_name || "",
        city: info.city_name || "",
        type: info.type_name || "",
        belong: info.belong || "",
        tier: "985/211/双一流",
        minScore2025: score,
        scoreDeltaTo662: score === null ? null : targetScore - score,
        band: scoreBand(score),
        profileFit,
        covered,
        hasCandidate,
        schoolKey: coverage.keyByName.get(name) || "",
        action: actionOf({ score, covered, profileFit, hasCandidate }),
        sourceUrl: `https://www.gaokao.cn/school/${school.school_id}`,
        site: info.site || "",
        phone: info.phone || "",
        candidateSignals: candidates
      };
    } catch (error) {
      return {
        name: normalizeName(school.name),
        schoolId: String(school.school_id),
        error: error.message,
        minScore2025: null,
        scoreDeltaTo662: null,
        band: "抓取失败",
        profileFit: "需人工判断",
        covered: false,
        hasCandidate: false,
        action: "补官方普通批数据",
        sourceUrl: `https://www.gaokao.cn/school/${school.school_id}`
      };
    }
  });

  return rows.filter(Boolean).sort((a, b) => {
    const bandOrder = ["超高冲刺", "冲刺", "核心匹配", "稳妥匹配", "下探保底", "低于本轮985主池", "无可比院校最低分", "抓取失败"];
    const bandDelta = bandOrder.indexOf(a.band) - bandOrder.indexOf(b.band);
    if (bandDelta) return bandDelta;
    return (b.minScore2025 ?? -1) - (a.minScore2025 ?? -1);
  });
}

function summaryOf(rows) {
  return {
    total985Entries: rows.length,
    covered: rows.filter((row) => row.covered).length,
    hasCandidate: rows.filter((row) => row.hasCandidate).length,
    coreOrStable: rows.filter((row) => ["核心匹配", "稳妥匹配"].includes(row.band)).length,
    sprint: rows.filter((row) => ["超高冲刺", "冲刺"].includes(row.band)).length,
    fallback: rows.filter((row) => row.band === "下探保底").length,
    missingWorthChecking: rows.filter((row) => !row.covered && /补查|补入|补官方/.test(row.action)).length
  };
}

function rowClass(row) {
  if (row.hasCandidate) return "good";
  if (row.covered) return "ok";
  if (/应补入|冲刺补查/.test(row.action)) return "warn";
  if (/只留审计|不主推/.test(row.action)) return "muted";
  return "";
}

function buildHtml(output) {
  const bandGroups = ["超高冲刺", "冲刺", "核心匹配", "稳妥匹配", "下探保底", "低于本轮985主池", "无可比院校最低分", "抓取失败"]
    .map((band) => ({ band, rows: output.rows.filter((row) => row.band === band) }))
    .filter((group) => group.rows.length);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>985院校全量遍历审计</title>
  <style>
    :root { --bg:#f6f7f9; --panel:#fff; --ink:#18202a; --muted:#667085; --line:#d9dee7; --blue:#2459a6; --green:#147a4a; --amber:#a85b00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.55; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    .wrap { max-width:1320px; margin:0 auto; padding:22px; }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:20px; letter-spacing:0; }
    h3 { margin:18px 0 8px; font-size:16px; letter-spacing:0; }
    section { margin:18px 0; padding:18px; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    table { width:100%; border-collapse:collapse; font-size:14px; background:#fff; }
    th, td { padding:9px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { background:#f8fafc; color:#344054; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:12px; }
    .metric { padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .metric strong { display:block; font-size:22px; color:var(--blue); }
    .note { padding:12px; border-left:4px solid var(--blue); background:#f1f6ff; border-radius:6px; }
    .tag { display:inline-flex; align-items:center; min-height:24px; margin:0 4px 4px 0; padding:2px 7px; border:1px solid var(--line); border-radius:6px; background:#fff; font-size:12px; font-weight:800; }
    .good .tag.status { color:var(--green); border-color:#b8e3cc; background:#f0fff6; }
    .ok .tag.status { color:var(--blue); border-color:#bfd3f4; background:#f1f6ff; }
    .warn .tag.status { color:var(--amber); border-color:#f4d2a3; background:#fff7ed; }
    .muted, .muted td { color:var(--muted); }
    .num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    @media (max-width: 1000px) { .wrap{padding:14px;} .grid{grid-template-columns:1fr 1fr;} table{font-size:13px;} }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>985 院校全量遍历审计</h1>
      <p>陕西物理类参考｜目标分位：${targetScore} 分 / ${targetRank} 位｜生成时间：${escapeHtml(new Date(output.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</p>
      <div class="grid">
        <div class="metric"><strong>${output.summary.total985Entries}</strong><span>985院校/校区条目</span></div>
        <div class="metric"><strong>${output.summary.covered}</strong><span>已入学校池/基线</span></div>
        <div class="metric"><strong>${output.summary.hasCandidate}</strong><span>已有普通类候选专业</span></div>
        <div class="metric"><strong>${output.summary.sprint}</strong><span>冲刺/超高冲刺</span></div>
        <div class="metric"><strong>${output.summary.coreOrStable}</strong><span>核心/稳妥匹配</span></div>
        <div class="metric"><strong>${output.summary.fallback}</strong><span>下探保底</span></div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <section>
      <h2>审计口径</h2>
      <p class="note">本页只做 985 全量遍历，来源为掌上高考 school/name + school/info 静态数据中的 <code>f985=1</code> 条目。这里的 2025 分数是院校层面陕西物理最低分线索，不能替代普通批分专业录取线；正式填报仍以学校官方/陕西省招生计划目录中的普通类专业组和分专业计划为准。</p>
      <p class="note">主方案继续剔除中外合作、专项、强基、预科、高收费和港校项目。医学部、农林海洋和非工科主线院校不直接删除，但默认只留审计，除非存在明确计算机/电子/AI/自动化/医工交叉普通类专业机会。</p>
    </section>
    ${bandGroups.map((group) => `<section>
      <h2>${escapeHtml(group.band)} <span class="tag">${group.rows.length}所/校区</span></h2>
      <table>
        <thead><tr><th style="width:170px">院校/校区</th><th style="width:70px">2025最低</th><th style="width:80px">差值</th><th style="width:100px">城市</th><th style="width:120px">属性判断</th><th style="width:120px">覆盖状态</th><th>已有候选/下一步</th><th style="width:160px">入口</th></tr></thead>
        <tbody>
          ${group.rows.map((row) => `<tr class="${rowClass(row)}">
            <td><strong>${escapeHtml(row.name)}</strong><div class="tag status">${escapeHtml(row.action)}</div></td>
            <td class="num">${escapeHtml(row.minScore2025 ?? "-")}</td>
            <td class="num">${escapeHtml(row.scoreDeltaTo662 === null ? "-" : row.scoreDeltaTo662)}</td>
            <td>${escapeHtml(row.city || row.province || "-")}</td>
            <td>${escapeHtml(row.profileFit)}</td>
            <td>${row.hasCandidate ? "已入普通类候选" : row.covered ? "已覆盖线索" : "未入当前池"}</td>
            <td>${row.candidateSignals?.length ? row.candidateSignals.map((item) => `${escapeHtml(item.major)}（${escapeHtml(item.minScore ?? "-")}分）`).join("<br>") : escapeHtml(row.action)}</td>
            <td>${row.site ? `<a href="${escapeHtml(row.site)}" target="_blank" rel="noreferrer">招生网</a><br>` : ""}<a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noreferrer">数据源</a>${row.phone ? `<div>${escapeHtml(row.phone)}</div>` : ""}</td>
          </tr>`).join("\n")}
        </tbody>
      </table>
    </section>`).join("\n")}
  </main>
</body>
</html>`;
}

async function main() {
  const [schools, baseline, evaluation] = await Promise.all([
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json"),
    readJson("data/generated/candidate-evaluation.json")
  ]);

  const rows = await fetchAll985({ schools, baseline, evaluation });
  const output = {
    generatedAt: new Date().toISOString(),
    target: {
      province: "陕西",
      subject: "物理类",
      score: targetScore,
      rank: targetRank
    },
    source: "掌上高考 static-data school/name.json + school/{id}/info.json；985按 f985=1 识别。",
    summary: summaryOf(rows),
    rows
  };

  await mkdir(generatedDir, { recursive: true });
  await writeFile(path.join(generatedDir, "all-985-coverage-audit-2026.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await writeFile(path.join(rootDir, PAGE_FILES.all985Audit), buildHtml(output), "utf8");
  console.log(`Wrote data/generated/all-985-coverage-audit-2026.json`);
  console.log(`Wrote ${PAGE_FILES.all985Audit}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
