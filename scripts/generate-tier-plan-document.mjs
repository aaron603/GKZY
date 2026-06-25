import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const target985Keys = new Set([
  "xjtu", "hit", "hitsz", "seu", "whu", "hust", "uestc", "tju", "nwpu", "hitwh", "dlut",
  "buaa", "bit", "nju", "tongji", "nankai", "scut", "cqu", "xmu", "sdu", "scu", "hnu", "csu",
  "neu", "neuq", "sduwh", "dlutpj", "sysu", "jlu"
]);

const target211Keys = new Set([
  "bupt", "xdu", "nuaa", "njust", "hrbeu", "ncepu", "bjtu", "shu", "ustb", "chd", "nwu"
]);

const focusMajorPattern = /计算机|软件|人工智能|智能|电子|通信|信息|集成电路|微电子|自动化|电气|机器人|仪器|低空|航空|航天|无人|网安|网络安全|数据|生物医学|生物信息|智能制造|光电|测控|具身/;
const trendYears = ["2025", "2024", "2023"];
const nonOrdinaryAdmissionPattern = /中外|合作办学|国家专项|高校专项|专项|强基|卓越优才|预科|高收费|港校|内地与港澳台/;
const coverageKeyAliases = new Map([
  ["吉林大学", "jlu"]
]);

const dlutPlanFallback = [
  {
    school: "大连理工大学",
    year: "2026",
    province: "陕西",
    subject: "物理类",
    category: "普通类",
    campus: "大连校区",
    major: "人工智能(新工科大师班)",
    plan: "",
    length: "4",
    selection: "",
    remark: "一生一策特区式拔尖人才培养：院士及国家级人才担任导师；量身定制培养方案；全校理工类专业任选，按所选专业收学费；在读期间可到行业领军企业实习，并有机会通过“连理全球计划”到世界知名大学联合培养。",
    sourceUrl: "https://zs.dlut.edu.cn/#/recruitmentPlan"
  },
  {
    school: "大连理工大学",
    year: "2026",
    province: "陕西",
    subject: "物理类",
    category: "普通类",
    campus: "大连校区",
    major: "计算机科学与技术(国家基础学科拔尖计划班)",
    plan: "",
    length: "4",
    selection: "",
    remark: "不招全色盲考生（体检受限代码23）。国家拔尖计划2.0基地。入选教育部“101计划”。",
    sourceUrl: "https://zs.dlut.edu.cn/#/recruitmentPlan"
  },
  {
    school: "大连理工大学",
    year: "2026",
    province: "陕西",
    subject: "物理类",
    category: "普通类",
    campus: "盘锦校区",
    major: "经济学类【含电子商务、经济学】",
    plan: "",
    length: "4",
    selection: "",
    remark: "非英语语种考生慎重报考。",
    sourceUrl: "https://zs.dlut.edu.cn/#/recruitmentPlan"
  },
  {
    school: "大连理工大学",
    year: "2026",
    province: "陕西",
    subject: "物理类",
    category: "普通类",
    campus: "盘锦校区",
    major: "能源化学工程",
    plan: "",
    length: "4",
    selection: "",
    remark: "含能源化学工程、化学工程与工业生物工程。非英语语种考生慎重报考。不招色盲、色弱考生。",
    sourceUrl: "https://zs.dlut.edu.cn/#/recruitmentPlan"
  },
  {
    school: "大连理工大学",
    year: "2026",
    province: "陕西",
    subject: "物理类",
    category: "普通类",
    campus: "盘锦校区",
    major: "生物信息学",
    plan: "",
    length: "4",
    selection: "",
    remark: "非英语语种考生慎重报考。不招色盲、色弱考生。",
    sourceUrl: "https://zs.dlut.edu.cn/#/recruitmentPlan"
  },
  {
    school: "大连理工大学",
    year: "2026",
    province: "陕西",
    subject: "物理类",
    category: "普通类",
    campus: "盘锦校区",
    major: "海洋技术",
    plan: "",
    length: "4",
    selection: "",
    remark: "非英语语种考生慎重报考。不招色盲、色弱考生。",
    sourceUrl: "https://zs.dlut.edu.cn/#/recruitmentPlan"
  }
];

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

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  return String(value);
}

function formatRank(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("zh-CN");
}

function numericValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sumKnown(values) {
  const numbers = values.map(numericValue).filter((value) => value !== null);
  return {
    count: numbers.length,
    sum: numbers.reduce((total, value) => total + value, 0)
  };
}

function isOrdinaryAdmission(item) {
  const category = [
    item.admissionCategory,
    item.category,
    item.zslb,
    item.sourceType
  ].filter(Boolean).join(" ");
  const major = [
    item.major,
    item.majorName,
    item.zymc,
    item.recruitmentMajorName
  ].filter(Boolean).join(" ");
  const track = [item.track, item.matchedTrack].filter(Boolean).join(" ");
  return !nonOrdinaryAdmissionPattern.test(`${category} ${major} ${track}`);
}

function schoolUrlMap(schools) {
  const urls = new Map((schools.schools || []).map((school) => [school.key, school.manualCheckUrl || ""]));
  urls.set("dlut", "https://zs.dlut.edu.cn/#/recruitmentPlan");
  urls.set("dlutpj", "https://zs.dlut.edu.cn/#/recruitmentPlan");
  urls.set("jlu", "https://zsb.jlu.edu.cn");
  return urls;
}

function schoolLink(item, urlByKey) {
  const url = urlByKey.get(item.schoolKey || item.key) || "";
  const name = escapeHtml(item.school || item.name || item.schoolKey || item.key);
  if (!url) return name;
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${name}</a>`;
}

function scoreOf(item) {
  return Number(item.minScore ?? item.score ?? 0);
}

function bandLabel(score, reference) {
  if (reference === "hitwh") {
    if (score >= 655) return "上浮冲刺：655+";
    if (score >= 646) return "略高于哈威：646-654";
    if (score >= 638) return "同档核心：638-645";
    if (score >= 630) return "略低稳保：630-637";
    return "下探安全：630以下";
  }
  if (score >= 648) return "上浮冲刺：648+";
  if (score >= 640) return "略高于西电：640-647";
  if (score >= 630) return "同档核心：630-639";
  if (score >= 620) return "略低稳保：620-629";
  return "下探安全：620以下";
}

function uniqueBestSchoolRows(items, keySet, reference) {
  const bySchool = new Map();
  for (const item of items) {
    if (!keySet.has(item.schoolKey)) continue;
    if (!isOrdinaryAdmission(item)) continue;
    const major = item.major || item.majorName || "";
    if (!focusMajorPattern.test(major) && !/覆盖审计/.test(major)) continue;
    const current = bySchool.get(item.schoolKey);
    if (!current || scoreOf(item) > scoreOf(current)) bySchool.set(item.schoolKey, item);
  }

  return [...bySchool.values()]
    .map((item) => ({ ...item, tierBand: bandLabel(scoreOf(item), reference) }))
    .sort((a, b) => scoreOf(b) - scoreOf(a));
}

function normalizeCoverageAuditRows(coverageAudit) {
  return (coverageAudit.rows || [])
    .map((row) => {
      const schoolKey = row.key || coverageKeyAliases.get(row.name);
      if (!schoolKey) return null;
      const tracks = row.tracks || "目标专业";
      const score = numericValue(row.minScore2025);
      if (score === null) return null;
      return {
        schoolKey,
        school: row.name,
        major: `覆盖审计：${tracks}方向待核`,
        majorName: `覆盖审计：${tracks}方向待核`,
        score,
        minScore: score,
        rank: null,
        plan: null,
        sourceLevel: "C",
        admissionCategory: "院校最低分覆盖审计",
        suggestion: row.minScore2025 < 610 ? "下探观察" : "补充观察",
        notes: `掌上高考2025陕西物理类院校最低分${row.minScore2025}；${row.status || "按宁多勿漏纳入"}。仅按普通招生口径留作覆盖线索，目标专业通常高于院校最低分，需回官方普通批专业明细和2026普通类计划复核。`,
        sourceUrl: row.site || row.sourceUrl || ""
      };
    })
    .filter(Boolean);
}

function rowsForPlanSchool(latestCheck, schoolKey) {
  const school = (latestCheck.schools || []).find((item) => item.key === schoolKey);
  return school?.rows || [];
}

function latestSchool(latestCheck, schoolKey) {
  return (latestCheck.schools || []).find((item) => item.key === schoolKey) || null;
}

function normalizeOfficialRows(rows, schoolName, sourceUrl) {
  return rows.map((row) => ({
    schoolKey: "",
    school: schoolName,
    year: row.nf || row.recruitmentYear || "2026",
    province: row.sf || row.provinceName || "陕西",
    subject: row.klmc || subjectLabel(row.recruitmentSubjectType),
    category: row.zslb || typeLabel(row.recruitmentType),
    campus: row.xqmc || campusLabel(row.zsCampusType),
    major: row.zymc || row.recruitmentMajorName || "",
    plan: row.jhrs ?? row.recruitmentStudentsNumber ?? "",
    length: row.xzmc || row.schoolingLength || "",
    selection: row.xkkm || "",
    remark: row.zybz || row.recruitmentPlanRemark || "",
    sourceUrl
  }));
}

function buildYearTrend(rows) {
  const ordinaryRows = rows.filter(isOrdinaryAdmission);
  if (!ordinaryRows.length) return null;
  const preferredRows = rows.filter((row) => {
    const major = row.major || row.majorName || "";
    return focusMajorPattern.test(major) || /覆盖审计/.test(major);
  });
  const ordinaryPreferredRows = preferredRows.filter(isOrdinaryAdmission);
  const usedRows = ordinaryPreferredRows.length ? ordinaryPreferredRows : ordinaryRows;
  const scoreRows = usedRows
    .map((row) => ({
      row,
      score: numericValue(row.minScore ?? row.score ?? row.score2025),
      rank: numericValue(row.minRank ?? row.rank ?? row.rank2025),
      admittedCount: numericValue(row.admittedCount ?? row.admitted2025)
    }))
    .filter((item) => item.score !== null);

  if (!scoreRows.length) return null;

  const scores = scoreRows.map((item) => item.score);
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const minScoreRanks = scoreRows
    .filter((item) => item.score === minScore && item.rank !== null)
    .map((item) => item.rank);
  const admitted = sumKnown(scoreRows.map((item) => item.admittedCount));
  const sourceLevels = [...new Set(usedRows.map((row) => row.sourceLevel).filter(Boolean))];

  return {
    rows: usedRows.length,
    focusRows: preferredRows.length,
    minScore,
    maxScore,
    rankAtMinScore: minScoreRanks.length ? Math.max(...minScoreRanks) : null,
    admittedCount: admitted.count ? admitted.sum : null,
    sourceLevels
  };
}

function buildTrendMap({ historical, planAdmit, latestCheck, dlutPlan }) {
  const trends = new Map();

  for (const row of historical.rows || []) {
    const key = row.schoolKey;
    const year = String(row.admissionYear || row.year || "");
    if (!key || !trendYears.includes(year)) continue;
    if (!isOrdinaryAdmission(row)) continue;
    if (!trends.has(key)) trends.set(key, { history: {}, plan2025: null, admitted2025: null, plan2026: null });
    const trend = trends.get(key);
    if (!trend._rowsByYear) trend._rowsByYear = new Map();
    if (!trend._rowsByYear.has(year)) trend._rowsByYear.set(year, []);
    trend._rowsByYear.get(year).push(row);
  }

  for (const trend of trends.values()) {
    for (const year of trendYears) {
      const rows = trend._rowsByYear?.get(year) || [];
      if (rows.length) trend.history[year] = buildYearTrend(rows);
    }
    delete trend._rowsByYear;
  }

  for (const row of planAdmit.rows || []) {
    const key = row.schoolKey;
    if (!key) continue;
    if (!isOrdinaryAdmission(row)) continue;
    if (!trends.has(key)) trends.set(key, { history: {}, plan2025: null, admitted2025: null, plan2026: null });
    const trend = trends.get(key);
    if (!trend._plan2025Values) trend._plan2025Values = [];
    if (!trend._admitted2025Values) trend._admitted2025Values = [];
    trend._plan2025Values.push(row.plan2025);
    trend._admitted2025Values.push(row.admitted2025);
  }

  for (const trend of trends.values()) {
    if (trend._plan2025Values) {
      const plan = sumKnown(trend._plan2025Values);
      trend.plan2025 = plan.count ? { rows: plan.count, total: plan.sum } : null;
    }
    if (trend._admitted2025Values) {
      const admitted = sumKnown(trend._admitted2025Values);
      trend.admitted2025 = admitted.count ? { rows: admitted.count, total: admitted.sum } : null;
    }
    delete trend._plan2025Values;
    delete trend._admitted2025Values;
  }

  for (const school of latestCheck.schools || []) {
    if (!trends.has(school.key)) trends.set(school.key, { history: {}, plan2025: null, admitted2025: null, plan2026: null });
    const plan = sumKnown((school.rows || []).map((row) => row.jhrs ?? row.recruitmentStudentsNumber));
    if ((school.rows || []).length) {
      trends.get(school.key).plan2026 = {
        rows: school.rows.length,
        total: plan.count ? plan.sum : null,
        status: plan.count ? "available" : "rows-only",
        sourceUrl: school.manualCheckUrl
      };
    } else if (school.homepageSignals?.hasTargetYearSignal) {
      trends.get(school.key).plan2026 = {
        rows: 0,
        total: null,
        status: "published-manual",
        sourceUrl: school.manualCheckUrl
      };
    }
  }

  if (!trends.has("dlut")) trends.set("dlut", { history: {}, plan2025: null, admitted2025: null, plan2026: null });
  const dlutPlanSummary = sumKnown((dlutPlan || []).map((row) => row.plan));
  trends.get("dlut").plan2026 = {
    rows: (dlutPlan || []).length,
    total: dlutPlanSummary.count ? dlutPlanSummary.sum : null,
    status: dlutPlanSummary.count ? "available" : "rows-only",
    sourceUrl: "https://zs.dlut.edu.cn/#/recruitmentPlan"
  };

  return trends;
}

function scoreRangeText(summary) {
  if (!summary) return "待补";
  const scoreText = summary.minScore === summary.maxScore ? String(summary.minScore) : `${summary.minScore}-${summary.maxScore}`;
  const rankText = summary.rankAtMinScore ? `，最低分位次约${formatRank(summary.rankAtMinScore)}` : "";
  const countText = summary.admittedCount ? `，录取${summary.admittedCount}人` : "，录取人数未公开";
  const sourceText = summary.sourceLevels.length ? `，${summary.sourceLevels.join("/")}` : "";
  return `${scoreText}分${rankText}${countText}${sourceText}`;
}

function compactScoreTrend(trend) {
  if (!trend) return "近三年待补";
  return trendYears
    .map((year) => {
      const summary = trend.history[year];
      if (!summary) return `${year}：待补`;
      const scoreText = summary.minScore === summary.maxScore ? String(summary.minScore) : `${summary.minScore}-${summary.maxScore}`;
      return `${year}：${scoreText}`;
    })
    .join("；");
}

function planTrendText(trend) {
  if (!trend) return "计划/人数待补";
  const plan2026 = trend.plan2026
    ? trend.plan2026.status === "published-manual"
      ? "2026计划：官网已发布入口，待按陕西物理筛表"
      : `2026计划：${trend.plan2026.rows}条${trend.plan2026.total === null ? "，人数待核" : `，${trend.plan2026.total}人`}`
    : "2026计划：待补";
  const plan2025 = trend.plan2025 ? `2025已入库计划：${trend.plan2025.total}人/${trend.plan2025.rows}条` : "2025计划：待补";
  const admitted2025 = trend.admitted2025 ? `2025实录：${trend.admitted2025.total}人` : "2025实录：未公开";
  return `${plan2026}；${plan2025}；${admitted2025}`;
}

function trendJudgement(trend) {
  if (!trend) return "缺少近三年可比数据，出分后按位次和计划重核。";
  const summaries = trendYears.map((year) => trend.history[year]).filter(Boolean);
  if (summaries.length < 2) return "只有单年或零散线索，不能据此判断升降趋势。";
  const current = trend.history["2025"];
  const previous = trend.history["2024"] || trend.history["2023"];
  if (!current || !previous) return "年份不连续，分数只能作热度参考。";
  const delta = current.minScore - previous.minScore;
  if (Math.abs(delta) <= 3) return "最低分基本横盘，重点看真实位次和2026计划数。";
  if (delta > 3) return `2025较上一可比年抬升${delta}分，冲稳需留余量。`;
  return `2025较上一可比年下降${Math.abs(delta)}分，仍需用位次复核。`;
}

function displayNotes(item) {
  let note = item.notes || (item.riskTags || []).join("、") || "需按2026计划数和真实位次复核";
  if (/覆盖审计/.test(item.admissionCategory || "")) {
    note = note.replace(/需核普通批、中外合作、专项和分专业录取。?/g, "需核普通批分专业录取和2026普通类计划。");
    note = note.replace(/需核北理工2025陕西分专业录取、专项\/中外合作和2026计划。?/g, "需核北理工2025陕西普通批分专业录取和2026普通类计划。");
  }
  note = note.replace(/普通批偏高，国家专项不混排。?/g, "普通批偏高，需按普通招生口径单独复核。");
  return note;
}

function subjectLabel(value) {
  if (String(value) === "20") return "物理类";
  if (String(value) === "10") return "理工";
  if (String(value) === "1") return "普通类";
  return formatValue(value);
}

function typeLabel(value) {
  if (String(value) === "1") return "普通类";
  return formatValue(value);
}

function campusLabel(value) {
  if (String(value) === "1") return "大连校区";
  if (String(value) === "2") return "盘锦校区";
  return formatValue(value);
}

async function getJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "Mozilla/5.0 GKZY/0.1"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchDlutPlan() {
  const base = "https://zs.dlut.edu.cn/apiV2025/portal/recruitmentInfo/recruitmentPlan";
  const params = "recruitmentYear=2026&provinceCode=610000&recruitmentSubjectType=20&recruitmentType=1";
  try {
    const data = await getJson(`${base}/recruitmentPlanList?${params}`);
    return Array.isArray(data?.data) ? normalizeOfficialRows(data.data, "大连理工大学", "https://zs.dlut.edu.cn/#/recruitmentPlan") : [];
  } catch (error) {
    return dlutPlanFallback.map((row) => ({
      ...row,
      remark: `${row.remark}（使用本次已核验的大工官网接口缓存；最终人数以陕西省招生计划目录为准。）`
    }));
  }
}

function renderTierTable(rows, urlByKey, trendByKey) {
  const bandOrder = ["上浮冲刺：655+", "上浮冲刺：648+", "略高于哈威：646-654", "略高于西电：640-647", "同档核心：638-645", "同档核心：630-639", "略低稳保：630-637", "略低稳保：620-629", "下探安全：630以下", "下探安全：620以下"];
  const grouped = new Map();
  for (const row of rows) {
    if (!grouped.has(row.tierBand)) grouped.set(row.tierBand, []);
    grouped.get(row.tierBand).push(row);
  }
  return bandOrder
    .filter((band) => grouped.has(band))
    .map((band) => `
      <h3>${escapeHtml(band)}</h3>
      <table>
        <thead><tr><th>学校</th><th>2025参考专业/方向</th><th>最低分</th><th>位次</th><th>近三年分数趋势</th><th>人数/计划趋势</th><th>判断</th><th>注意点</th></tr></thead>
        <tbody>
          ${grouped.get(band).map((item) => {
            const trend = trendByKey.get(item.schoolKey);
            return `<tr><td>${schoolLink(item, urlByKey)}</td><td>${escapeHtml(item.major || item.majorName)}</td><td>${formatValue(scoreOf(item) || "")}</td><td>${formatRank(item.rank)}</td><td>${escapeHtml(compactScoreTrend(trend))}</td><td>${escapeHtml(planTrendText(trend))}</td><td>${escapeHtml(item.suggestion || item.recommendation || "")}</td><td>${escapeHtml(displayNotes(item))}</td></tr>`;
          }).join("\n")}
        </tbody>
      </table>
    `).join("\n");
}

function renderTrendTable(rows, urlByKey, trendByKey) {
  const seen = new Set();
  const uniqueRows = rows.filter((row) => {
    if (seen.has(row.schoolKey)) return false;
    seen.add(row.schoolKey);
    return true;
  });

  return `
    <table>
      <thead><tr><th>学校</th><th>2025</th><th>2024</th><th>2023</th><th>计划/人数变化</th><th>趋势判断</th></tr></thead>
      <tbody>
        ${uniqueRows.map((row) => {
          const trend = trendByKey.get(row.schoolKey);
          return `<tr>
            <td>${schoolLink(row, urlByKey)}</td>
            ${trendYears.map((year) => `<td>${escapeHtml(scoreRangeText(trend?.history?.[year]))}</td>`).join("")}
            <td>${escapeHtml(planTrendText(trend))}</td>
            <td>${escapeHtml(trendJudgement(trend))}</td>
          </tr>`;
        }).join("\n")}
      </tbody>
    </table>
  `;
}

function renderPlanRows(rows) {
  return rows.map((row) => `<tr>
    <td>${escapeHtml(row.school)}</td>
    <td>${escapeHtml(row.campus)}</td>
    <td>${escapeHtml(row.major)}</td>
    <td>${escapeHtml(row.plan === "" ? "官网人数空" : row.plan)}</td>
    <td>${escapeHtml(row.length)}</td>
    <td>${escapeHtml(row.selection)}</td>
    <td>${escapeHtml(row.remark)}</td>
    <td><a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noreferrer">来源</a></td>
  </tr>`).join("\n");
}

function planBlock(title, rows) {
  return `
    <h3>${escapeHtml(title)} <span class="muted">(${rows.length} 条)</span></h3>
    <table>
      <thead><tr><th>学校</th><th>校区</th><th>专业</th><th>计划人数</th><th>学制</th><th>选科</th><th>备注</th><th>链接</th></tr></thead>
      <tbody>${renderPlanRows(rows)}</tbody>
    </table>
  `;
}

function buildHtml({ profile, schools, latestCheck, evaluation, baseline, coverageAudit, historical, planAdmit, dlutPlan }) {
  const urlByKey = schoolUrlMap(schools);
  const allReference = [...(evaluation.items || []), ...(baseline.items || []), ...normalizeCoverageAuditRows(coverageAudit)];
  const hitwhRows = uniqueBestSchoolRows(allReference, target985Keys, "hitwh");
  const xduRows = uniqueBestSchoolRows(allReference, target211Keys, "xdu");
  const trendByKey = buildTrendMap({ historical, planAdmit, latestCheck, dlutPlan });

  const planGroups = [
    ["西安交通大学", normalizeOfficialRows(rowsForPlanSchool(latestCheck, "xjtu"), "西安交通大学", urlByKey.get("xjtu"))],
    ["西安电子科技大学", normalizeOfficialRows(rowsForPlanSchool(latestCheck, "xdu"), "西安电子科技大学", urlByKey.get("xdu"))],
    ["电子科技大学", normalizeOfficialRows(rowsForPlanSchool(latestCheck, "uestc"), "电子科技大学", urlByKey.get("uestc"))],
    ["长安大学", normalizeOfficialRows(rowsForPlanSchool(latestCheck, "chd"), "长安大学", urlByKey.get("chd"))],
    ["大连理工大学", dlutPlan]
  ].filter(([, rows]) => rows.length);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>985与头部211梯度及2026招生计划核验</title>
  <style>
    :root { --bg:#f6f7f9; --panel:#fff; --ink:#18202a; --muted:#667085; --line:#d9dee7; --blue:#2459a6; --amber:#a85b00; }
    * { box-sizing: border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.55; }
    .wrap { max-width:1280px; margin:0 auto; padding:22px; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:20px; letter-spacing:0; }
    h3 { margin:18px 0 8px; font-size:16px; letter-spacing:0; }
    section { margin:18px 0; padding:18px; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    table { width:100%; border-collapse:collapse; font-size:14px; background:#fff; }
    th, td { padding:9px 8px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { background:#f8fafc; color:#344054; }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .muted { color:var(--muted); }
    .note { padding:12px; border-left:4px solid var(--blue); background:#f1f6ff; border-radius:6px; }
    .warn { padding:12px; border-left:4px solid var(--amber); background:#fff7ed; border-radius:6px; }
    .grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .metric { padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .metric strong { display:block; font-size:22px; color:var(--blue); }
    @media (max-width: 900px) { .wrap{padding:14px;} .grid{grid-template-columns:1fr;} table{font-size:13px;} th,td{padding:7px 6px;} }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>985 与头部 211 梯度及 2026 招生计划核验</h1>
      <p class="muted">陕西物理类｜估分 ${escapeHtml(profile.candidate.estimatedScoreRange)}｜生成时间：${escapeHtml(new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</p>
      <div class="grid">
        <div class="metric"><strong>哈工大威海</strong><span>985 梯度参照：约 638-650 分段</span></div>
        <div class="metric"><strong>西安电子科技大学</strong><span>头部 211 梯度参照：约 630-643 分段</span></div>
        <div class="metric"><strong>${planGroups.reduce((sum, [, rows]) => sum + rows.length, 0)}</strong><span>已自动整理 2026 计划/专业投放条目</span></div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <section>
      <h2>使用口径</h2>
      <p class="note">以下梯度只看普通招生口径：剔除中外合作、合作办学、国家专项、高校专项、专项计划、强基、预科、高收费、港校等特殊类型分数。本版按“宁多勿漏”扩展了 985 和强工科 211 的覆盖审计线索，最终靠家庭按真实位次、专业匹配、城市、费用和计划数人工决策去留。</p>
      <p class="note">明天出成绩后必须切换为真实省位次，再按 2026 普通类计划人数增减、专业组/代码、体检限制、学费和校区重排。覆盖审计项不是目标专业分，只负责提醒“这所学校不要漏看”。</p>
      <p class="note">已补入中山大学。当前库里中山大学只有 2025 院校最低分覆盖审计线索，且校区、专业组和专业分差异很大，所以暂放在略低稳保/下探观察层；不能直接等同于计算机、电子信息或软件等目标专业分。</p>
      <p class="warn">大连理工大学主站已迁移为新版单页应用，正确招生计划入口为 <a href="https://zs.dlut.edu.cn/#/recruitmentPlan" target="_blank" rel="noreferrer">https://zs.dlut.edu.cn/#/recruitmentPlan</a>；盘锦旧站域名 <code>pjzsjy.dlut.edu.cn</code> 本次访问异常，不再作为主要计划核验入口。</p>
    </section>

    <section>
      <h2>和哈工大威海同档及上下浮动的 985</h2>
      ${renderTierTable(hitwhRows, urlByKey, trendByKey)}
    </section>

    <section>
      <h2>和西安电子科技大学同档及上下浮动的头部 211</h2>
      ${renderTierTable(xduRows, urlByKey, trendByKey)}
    </section>

    <section>
      <h2>近三年分数与人数变化趋势</h2>
      <p class="note">分数趋势来自 2023-2025 已入库陕西物理类普通批专业最低分/院校最低分线索，已剔除中外合作和各类专项；人数只统计已公开或已入库字段。若显示“未公开”或“待补”，表示当前数据源没有可靠人数，不从计划数倒推实录人数。</p>
      ${renderTrendTable([...hitwhRows, ...xduRows], urlByKey, trendByKey)}
    </section>

    <section>
      <h2>2026 相关学校陕西物理普通类分专业计划/专业投放</h2>
      <p class="note">已能自动拉取完整行的学校：西安交大、西电、成电、长安大学、大连理工。大工官网目前专业人数为空，文档保留“官网人数空”；其它学校如哈工大威海、北邮、天大、华南理工等虽应已陆续发布，但本仓库还没有稳定自动接口，建议以陕西省 2026 招生计划汇编做最终人数核验。</p>
      ${planGroups.map(([title, rows]) => planBlock(title, rows)).join("\n")}
    </section>

    <section>
      <h2>明天出分后的优先动作</h2>
      <table>
        <thead><tr><th>位次区间</th><th>优先看</th><th>处理方式</th></tr></thead>
        <tbody>
          <tr><td>约 2600 位以内</td><td>成电、西工大高分方向、天大强工科、哈威机器人/AI、武大/华科/东南边缘冲刺</td><td>冲刺栏保留，但必须防目标专业分上移。</td></tr>
          <tr><td>约 2600-4000 位</td><td>哈工大威海、天大、华南理工、厦大、西电拔尖/创新班、北邮普通强类、大工人工智能</td><td>主战场，按专业优先级和计划数排序。</td></tr>
          <tr><td>约 4000-5200 位</td><td>西电通信/集成电路/电子工程、山东/川大/湖大/中南、南航/南理工/哈工程/华电</td><td>稳保层必须铺够，避免全压热门计算机。</td></tr>
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [profile, schools, latestCheck, evaluation, baseline, coverageAudit, historical, planAdmit, dlutPlan] = await Promise.all([
    readJson("data/profile.json"),
    readJson("data/schools.json"),
    readJson("data/generated/latest-plan-check.json"),
    readJson("data/generated/candidate-evaluation.json"),
    readJson("data/admission-baseline-2025.json"),
    readJson("data/generated/coverage-audit-2025.json"),
    readJson("data/generated/historical-admissions.json"),
    readJson("data/generated/plan-admit-reconciliation-2025.json"),
    fetchDlutPlan()
  ]);

  const html = buildHtml({ profile, schools, latestCheck, evaluation, baseline, coverageAudit, historical, planAdmit, dlutPlan });
  const target = path.join(rootDir, PAGE_FILES.tierPlanDocument);
  await writeFile(target, html, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
