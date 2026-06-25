import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const targetScore = 662;
const targetRank = 1558;
const focusOrder = new Map([
  ["hit", 1],
  ["xjtu", 2],
  ["hitwh", 3],
  ["hitsz", 4]
]);

const nonOrdinaryPattern = /中外合作|中外合作办学|合作办学|国家专项|地方专项|高校专项|专项|强基|强基计划|卓越优才|预科|高收费|港校|香港中文|港中深|内地与港澳台|综合评价/;
const medicalCategoryPattern = /医学|医工|医疗|临床|口腔|基础医学|预防医学|法医学|护理学?|药学|中药学|临床药学|医学影像学|医学影像技术|医学检验技术|麻醉学|儿科学|精神医学|眼视光医学|放射医学|公共卫生|卫生检验|中医学|针灸推拿|中西医临床|康复治疗|助产/;
const goodMajorPattern = /计算机|软件|人工智能|智能|电子|通信|信息|集成电路|微电子|自动化|电气|机器人|仪器|低空|航空|航天|无人|网安|网络安全|数据|智能制造|光电|测控|具身|未来技术|强工科|智慧能源|精仪/;

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function joinedText(item) {
  return [item.school, item.major, item.track, item.matchedTrack, item.admissionCategory, item.notes]
    .filter(Boolean)
    .join(" ");
}

function isMainPlanAllowed(item) {
  const text = joinedText(item);
  return !nonOrdinaryPattern.test(text) && !medicalCategoryPattern.test(text);
}

function is985(item, school) {
  return /985|C9/.test([school?.tier, ...(item.priorityGroups || [])].filter(Boolean).join(" "));
}

function hasGoodMajor(item) {
  return goodMajorPattern.test([item.major, item.track, item.matchedTrack].filter(Boolean).join(" "));
}

function scoreBand(minScore) {
  if (minScore === null) return "2025待核";
  const gap = minScore - targetScore;
  if (gap > 12) return "极高冲刺";
  if (gap > 0) return "冲刺";
  if (gap >= -2) return "贴线核心";
  if (gap >= -10) return "冲稳";
  if (gap >= -24) return "稳妥";
  if (gap >= -35) return "985下探";
  return "低于本轮近分池";
}

function bandOrder(band) {
  return {
    极高冲刺: 1,
    冲刺: 2,
    贴线核心: 3,
    冲稳: 4,
    稳妥: 5,
    "985下探": 6,
    "2025待核": 7,
    低于本轮近分池: 9
  }[band] || 9;
}

function actionFor(row) {
  if (row.schoolKey === "hit") return "只留极高冲刺和招生办咨询，不能当稳项。";
  if (row.schoolKey === "hitsz") return "当前主方案屏蔽卓越优才，只有招生办明确普通批可报后再单独加回。";
  if (row.schoolKey === "xjtu" && row.scoreGap >= -2) return "重点主攻，需确认专业组、软件学费、分流和调剂边界。";
  if (row.schoolKey === "xjtu") return "作为本地C9核心备选，优先问大类二次分流与目标专业名额。";
  if (row.schoolKey === "hitwh") return "强校异地校区重点关注，先核普通批可报专业、校区安排、毕业证和转专业。";
  if (row.isCoverageAudit) return "仅作院校/方向待核线索，必须补官方分专业普通类录取线。";
  if (row.scoreGap >= -2) return "分数贴近，可作冲刺比较项。";
  if (row.scoreGap >= -10) return "分数接近，可作冲稳比较项。";
  return "作为985好专业横向比较项，防止只盯重点校漏掉强专业。";
}

function focusConclusion(schoolKey, rows) {
  if (schoolKey === "hit") {
    return "哈工大本部普通批平台最强，但当前库内2025陕西物理普通类最低线索为未来技术拔尖班679，比662高17分。结论是保留第一优先咨询和极高冲刺，不进入稳妥层。";
  }
  if (schoolKey === "xjtu") {
    return "西交大是当前最值得深入拆解的本地C9。软件工程660、智能感知与仪器660贴线，智慧能源653、智能过程655、智能制造/航天航空649更有缓冲；核心风险在专业组、二次分流、调剂和软件收费。";
  }
  if (schoolKey === "hitwh") {
    return rows.length ? "哈工大威海当前保留非卓越优才的普通类近分方向；带卓越优才字样的项目先按特殊类型风险屏蔽，只有招生办明确普通批可报后再单独加回。" : "哈工大威海原有近分条目多带卓越优才字样，本版先按特殊类型风险屏蔽；需要向招生办确认普通批可报专业后再补入。";
  }
  if (schoolKey === "hitsz") {
    return "哈工大深圳当前近分线索主要来自卓越优才计划，本版先从普通类主方案屏蔽；若招生办确认2026陕西普通批可报，再作为高风险冲刺单独加回。";
  }
  return rows.length ? rows[0].action : "暂无结论。";
}

function decorateItem(item, school) {
  const minScore = number(item.minScore ?? item.score);
  const rank = number(item.rank);
  const scoreGap = minScore === null ? null : minScore - targetScore;
  const rankGap = rank === null ? null : rank - targetRank;
  const isCoverageAudit = item.admissionCategory === "院校最低分覆盖审计";
  const band = minScore === null ? "待核" : scoreBand(minScore);
  const row = {
    schoolKey: item.schoolKey,
    school: item.school,
    shortName: school?.shortName || item.school,
    city: school?.city || "",
    tier: school?.tier || "",
    major: item.major,
    minScore,
    maxScore: number(item.maxScore),
    avgScore: number(item.avgScore),
    rank,
    plan: number(item.plan),
    planYear: item.planYear || 2026,
    scoreGap,
    rankGap,
    band,
    track: item.matchedTrack || item.track || "",
    recommendation: item.recommendation || item.suggestion || "",
    expertScore: number(item.expertScore) ?? 0,
    sourceLevel: item.sourceLevel || "",
    admissionCategory: item.admissionCategory || "",
    isCoverageAudit,
    notes: item.notes || item.matchReason || "",
    planMatchType: item.planMatchType || "2025候选基线",
    matched2025Major: item.matched2025Major || item.major,
    riskTags: item.riskTags || [],
    priorityGroups: item.priorityGroups || [],
    focusOrder: focusOrder.get(item.schoolKey) || 99
  };
  return { ...row, action: actionFor(row) };
}

function normalizeMajor(value) {
  return String(value || "")
    .replace(/[（）()【】\[\]\s·,，、/\\-]/g, "")
    .replace(/专业预选|领军班|国卓班|钱学森班|国家拔尖计划|新工科卓越计划|卓越计划|英才领军班|类/g, "")
    .toLowerCase();
}

function planMajor(row) {
  return row.zymc || row.recruitmentMajorName || row.major || "";
}

function planCount(row) {
  return number(row.jhrs ?? row.recruitmentStudentsNumber ?? row.plan);
}

function historyRowsFor(historical, schoolKey) {
  return (historical?.rows || [])
    .filter((row) => row.schoolKey === schoolKey)
    .filter((row) => String(row.admissionYear) === "2025")
    .filter((row) => row.admissionProvince === "陕西")
    .filter((row) => /物理/.test(row.admissionSubject || ""))
    .filter((row) => row.admissionCategory === "普通类")
    .filter(isMainPlanAllowed);
}

function manualNearCandidates(schoolKey, major) {
  if (schoolKey !== "xjtu") return [];
  const rules = [
    [/^具身智能$/, ["人工智能（新工科卓越计划）", "自动化", "工科试验班（智能制造类）"]],
    [/智慧能源领军班|智慧能源国卓班|新能源英才领军班/, ["工科试验班（智慧能源类）", "储能科学与工程（新工科卓越计划）"]],
    [/智能制造领军班|智造重器国卓班/, ["工科试验班（智能制造类）", "智能制造工程（钱学森班）"]],
    [/航天航空领军班/, ["工科试验班（航天航空类）", "工科试验班（空天科技国卓班）"]],
    [/越杰电类领军班/, ["工科试验班（越杰计划电类专业预选）", "工科试验班（电气类）"]],
    [/越杰机类领军班/, ["工科试验班（越杰计划机类专业预选）", "工科试验班（智能制造类）"]],
    [/数智电网国卓班|智能电气领军班/, ["工科试验班（电气类）", "电气工程及其自动化（钱学森班）"]],
    [/网络空间安全/, ["工科试验班（计算机科学技术类）"]]
  ];
  return rules.find(([pattern]) => pattern.test(major))?.[1] || [];
}

function tokenScore(a, b) {
  const tokens = ["计算机", "软件", "人工智能", "智能", "电子", "信息", "通信", "微电子", "电气", "自动化", "制造", "感知", "仪器", "能源", "储能", "航空", "航天", "空天", "材料", "网", "安全", "力学"];
  const textA = String(a || "");
  const textB = String(b || "");
  return tokens.reduce((score, token) => score + (textA.includes(token) && textB.includes(token) ? 1 : 0), 0);
}

function matchHistory({ schoolKey, major, historyRows }) {
  const literal = historyRows.find((row) => row.major === major);
  if (literal) return { type: "同名匹配", row: literal };

  for (const name of manualNearCandidates(schoolKey, major)) {
    const matched = historyRows.find((row) => row.major === name);
    if (matched) return { type: "近似匹配", row: matched };
  }

  const normalized = historyRows.find((row) => normalizeMajor(row.major) === normalizeMajor(major));
  if (normalized) return { type: "近似匹配", row: normalized };

  const scored = historyRows
    .map((row) => ({ row, score: tokenScore(major, row.major) }))
    .filter((item) => item.score >= 2)
    .sort((a, b) => b.score - a.score || Math.abs((a.row.minScore ?? targetScore) - targetScore) - Math.abs((b.row.minScore ?? targetScore) - targetScore));
  if (scored[0]) return { type: "近似匹配", row: scored[0].row };

  return { type: "2025无同名或近似专业", row: null };
}

function majorTrackOf(major) {
  if (/计算机|软件|人工智能|具身|网络空间|网安|数据/.test(major)) return "计算机/软件/AI/数据/网安";
  if (/电子|通信|信息|微电子|电气|电网/.test(major)) return "电子信息/通信/集成电路/电气";
  if (/自动化|机器人|智能制造|智造|仪器|感知|测控/.test(major)) return "自动化/机器人/智能制造/测控";
  if (/能源|储能|新能源/.test(major)) return "能源/电气";
  if (/航空|航天|空天|飞行器/.test(major)) return "低空/航空航天/无人系统";
  return "工科方向待核";
}

function recommendationByBand(band, matchType) {
  if (matchType === "2025无同名或近似专业") return "待核";
  if (band === "极高冲刺") return "极高冲刺";
  if (band === "冲刺") return "冲刺";
  if (["贴线核心", "冲稳", "稳妥"].includes(band)) return "高优先";
  return "优先";
}

function buildPlanBasedRows({ latestCheck, historical, schools, evaluation }) {
  const schoolByKey = new Map((schools.schools || []).map((school) => [school.key, school]));
  const expertBySchoolMajor = new Map((evaluation.items || []).map((item) => [`${item.schoolKey}\u0001${item.major}`, item]));
  const rows = [];
  for (const latest of latestCheck?.schools || []) {
    const school = schoolByKey.get(latest.key);
    if (!school || !/985|C9/.test(school.tier || "")) continue;
    if (latest.status !== "available" || !Array.isArray(latest.rows) || !latest.rows.length) continue;
    const histRows = historyRowsFor(historical, latest.key);
    for (const plan of latest.rows) {
      const major = planMajor(plan);
      const text = [latest.school, major, plan.zslb, plan.klmc, plan.xkkm].filter(Boolean).join(" ");
      if (!major || nonOrdinaryPattern.test(text) || medicalCategoryPattern.test(text) || !goodMajorPattern.test(major)) continue;
      const matched = matchHistory({ schoolKey: latest.key, major, historyRows: histRows });
      const hist = matched.row;
      const minScore = number(hist?.minScore);
      const band = scoreBand(minScore);
      const expertSource = expertBySchoolMajor.get(`${latest.key}\u0001${hist?.major || major}`);
      rows.push({
        schoolKey: latest.key,
        school: latest.school,
        shortName: school.shortName || latest.school,
        city: school.city || "",
        tier: school.tier || "",
        major,
        minScore,
        avgScore: number(hist?.avgScore),
        maxScore: number(hist?.maxScore),
        rank: number(hist?.minRank),
        maxRank: number(hist?.maxRank),
        plan: planCount(plan),
        planYear: number(plan.nf) || 2026,
        scoreGap: minScore === null ? null : minScore - targetScore,
        rankGap: hist?.minRank === null || hist?.minRank === undefined ? null : number(hist.minRank) - targetRank,
        band,
        track: majorTrackOf(major),
        recommendation: recommendationByBand(band, matched.type),
        expertScore: number(expertSource?.expertScore) ?? 0,
        sourceLevel: hist?.sourceLevel || latest.sourceLevel || school.sourceLevel || "",
        admissionCategory: plan.zslb || "普通类",
        isCoverageAudit: false,
        notes: hist
          ? `2026计划专业；2025${matched.type}：${hist.major}，最低${hist.minScore ?? "-"}、平均${hist.avgScore ?? "-"}、最高${hist.maxScore ?? "-"}。`
          : "2026计划专业；2025未找到同名或足够近似的普通类专业录取数据，需向招生办确认参考口径。",
        planMatchType: matched.type,
        matched2025Major: hist?.major || "",
        riskTags: matched.type === "近似匹配" ? ["2025近似专业"] : matched.type === "2025无同名或近似专业" ? ["2025无匹配"] : [],
        priorityGroups: /C9/.test(school.tier || "") ? ["C9"] : /985/.test(school.tier || "") ? ["985重点"] : [],
        focusOrder: focusOrder.get(latest.key) || 99
      });
    }
  }
  return rows;
}

function buildRows(evaluation, schools, latestCheck, historical) {
  const schoolByKey = new Map((schools.schools || []).map((school) => [school.key, school]));
  const planBasedRows = buildPlanBasedRows({ latestCheck, historical, schools, evaluation });
  const planAvailableKeys = new Set(planBasedRows.map((row) => row.schoolKey));
  const fallbackRows = (evaluation.items || [])
    .filter(isMainPlanAllowed)
    .filter((item) => !planAvailableKeys.has(item.schoolKey))
    .filter((item) => {
      const school = schoolByKey.get(item.schoolKey);
      return is985(item, school) && hasGoodMajor(item);
    })
    .map((item) => decorateItem(item, schoolByKey.get(item.schoolKey)));
  return [...planBasedRows, ...fallbackRows]
    .filter((row) => row.minScore === null || (row.minScore >= 630 && row.minScore <= 679))
    .sort((a, b) =>
      a.focusOrder - b.focusOrder ||
      bandOrder(a.band) - bandOrder(b.band) ||
      Math.abs(a.scoreGap) - Math.abs(b.scoreGap) ||
      b.expertScore - a.expertScore ||
      (b.minScore || 0) - (a.minScore || 0)
    );
}

function focusRows(rows) {
  return [...focusOrder.keys()].map((schoolKey) => {
    const items = rows.filter((row) => row.schoolKey === schoolKey);
    return {
      schoolKey,
      school: items[0]?.school || {
        hit: "哈尔滨工业大学",
        xjtu: "西安交通大学",
        hitwh: "哈尔滨工业大学（威海）",
        hitsz: "哈尔滨工业大学（深圳）"
      }[schoolKey],
      priority: focusOrder.get(schoolKey),
      conclusion: focusConclusion(schoolKey, items),
      items
    };
  });
}

function summaryOf(rows) {
  return {
    total: rows.length,
    focusItems: rows.filter((row) => row.focusOrder < 99).length,
    ordinaryMajorItems: rows.filter((row) => !row.isCoverageAudit).length,
    coverageAuditItems: rows.filter((row) => row.isCoverageAudit).length,
    closeItems: rows.filter((row) => row.scoreGap >= -10 && row.scoreGap <= 0).length,
    sprintItems: rows.filter((row) => row.scoreGap > 0).length,
    stableItems: rows.filter((row) => row.scoreGap < -10).length
  };
}

function renderTags(values) {
  return (values || []).filter(Boolean).map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join("");
}

function scoreGapText(row) {
  if (row.scoreGap === null) return "-";
  return row.scoreGap > 0 ? `+${row.scoreGap}` : String(row.scoreGap);
}

function rankGapText(row) {
  if (row.rankGap === null) return "-";
  return row.rankGap > 0 ? `目标位次优${row.rankGap}` : `目标位次差${Math.abs(row.rankGap)}`;
}

function planText(row) {
  return row.plan ?? "-";
}

function renderRows(rows, options = {}) {
  const limit = options.limit || rows.length;
  return rows.slice(0, limit).map((row) => `<tr>
    <td><strong>${escapeHtml(row.school)}</strong><div class="muted">${escapeHtml([row.shortName, row.city, row.tier].filter(Boolean).join("｜"))}</div></td>
    <td>${escapeHtml(row.major)}<div>${renderTags([row.recommendation, row.sourceLevel ? `${row.sourceLevel}源` : "", row.isCoverageAudit ? "待核线索" : "普通类专业"])}</div></td>
    <td class="num">${escapeHtml(row.minScore)}</td>
    <td class="num">${escapeHtml(row.avgScore ?? "-")}</td>
    <td class="num">${escapeHtml(row.maxScore ?? "-")}</td>
    <td class="num">${escapeHtml(scoreGapText(row))}</td>
    <td class="num">${escapeHtml(row.rank ?? "-")}<div class="muted">${escapeHtml(rankGapText(row))}</div></td>
    <td class="num">${escapeHtml(planText(row))}</td>
    <td>${escapeHtml(row.track || "-")}</td>
    <td><strong>${escapeHtml(row.band)}</strong><div class="muted">${escapeHtml(row.planMatchType || row.action)}</div></td>
    <td>${escapeHtml(row.notes || "核2026计划、专业组和录取规则。")}</td>
  </tr>`).join("\n");
}

function buildHtml(output) {
  const bandGroups = ["极高冲刺", "冲刺", "贴线核心", "冲稳", "稳妥", "985下探"]
    .map((band) => ({ band, rows: output.rows.filter((row) => row.band === band) }))
    .filter((group) => group.rows.length);

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>662分1558位985近分好专业筛选</title>
  <style>
    :root { --bg:#f6f7f9; --panel:#fff; --ink:#172033; --muted:#667085; --line:#d9dee7; --blue:#2459a6; --green:#147a4a; --amber:#a85b00; --red:#b42318; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.55; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    .wrap { max-width:none; margin:0 auto; padding:16px 18px; }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:20px; letter-spacing:0; }
    h3 { margin:0 0 8px; font-size:16px; letter-spacing:0; }
    section { margin:18px 0; padding:18px; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    table { width:100%; min-width:1120px; border-collapse:collapse; font-size:13px; background:#fff; }
    th, td { padding:7px 6px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { background:#f8fafc; color:#344054; }
    .table-wrap { overflow-x:auto; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .grid { display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:10px; }
    .metric { padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; min-height:78px; }
    .metric strong { display:block; font-size:22px; color:var(--blue); }
    .focus-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .focus-card { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fff; }
    .focus-card strong { display:block; margin-bottom:6px; font-size:17px; }
    .focus-card ol { margin:8px 0 0; padding-left:20px; }
    .focus-card li { margin:4px 0; }
    .note { padding:12px; border-left:4px solid var(--blue); background:#f1f6ff; border-radius:6px; }
    .tag { display:inline-flex; align-items:center; min-height:22px; margin:2px 4px 2px 0; padding:2px 7px; border:1px solid var(--line); border-radius:6px; background:#fff; font-size:12px; font-weight:800; white-space:nowrap; }
    .muted { color:var(--muted); }
    .num { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
    .good { color:var(--green); font-weight:800; }
    .warn { color:var(--amber); font-weight:800; }
    @media (max-width:1100px) { .wrap{padding:14px;} .grid{grid-template-columns:repeat(2,minmax(0,1fr));} .focus-grid{grid-template-columns:1fr;} table{font-size:13px;} }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>662分 / 1558位：985近分好专业筛选</h1>
      <p class="muted">陕西物理类｜生成时间：${escapeHtml(new Date(output.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}｜重点顺序：哈工大本部、西交大、哈工大威海，补充看哈工大深圳</p>
      <div class="grid">
        <div class="metric"><strong>${output.summary.total}</strong><span>985近分好专业线索</span></div>
        <div class="metric"><strong>${output.summary.focusItems}</strong><span>四个重点校条目</span></div>
        <div class="metric"><strong>${output.summary.ordinaryMajorItems}</strong><span>明确普通类专业</span></div>
        <div class="metric"><strong>${output.summary.coverageAuditItems}</strong><span>待核覆盖线索</span></div>
        <div class="metric"><strong>${output.summary.closeItems}</strong><span>贴线/冲稳</span></div>
        <div class="metric"><strong>${output.summary.sprintItems}</strong><span>冲刺</span></div>
        <div class="metric"><strong>${output.summary.stableItems}</strong><span>稳妥/下探</span></div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <section>
      <h2>硬规则</h2>
      <p class="note">本页只纳入 2025 分数在 630-679 区间、且方向匹配计算机/软件/AI/电子信息/通信/自动化/电气/集成电路/智能制造/航空航天等工科主线的 985/C9 条目。已硬剔除医学类、医工/医疗、国家专项、地方专项、高校专项、强基计划、综合评价、中外合作办学、合作办学、卓越优才、高收费、预科和港校/港澳台合作项目。</p>
      <p class="note">专家分是综合优先级，不是录取概率。它用于排序“是否值得优先研究”，不代表分越高越容易录取；录取风险仍以最低分、平均分、最高分、位次、2026计划和专业组规则为准。本页对已抓到2026计划的学校，先按2026计划专业建表，再反查2025同名或近似专业录取数据。</p>
    </section>

    <section>
      <h2>四个重点校结论</h2>
      <div class="focus-grid">
        ${output.focus.map((group) => `<div class="focus-card">
          <strong>第${escapeHtml(group.priority)}优先：${escapeHtml(group.school)}</strong>
          <p>${escapeHtml(group.conclusion)}</p>
          <ol>
            ${group.items.length ? group.items.slice(0, 5).map((row) => `<li>${escapeHtml(row.major)}｜${escapeHtml(row.minScore)}分｜${escapeHtml(row.band)}</li>`).join("") : "<li>当前主池无明确普通类近分专业，需人工补官方分专业线。</li>"}
          </ol>
        </div>`).join("\n")}
      </div>
    </section>

    <section>
      <h2>主推近分 985 好专业横向表</h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:132px">学校</th><th style="width:220px">2026专业/专业类</th><th style="width:60px">最低</th><th style="width:60px">平均</th><th style="width:60px">最高</th><th style="width:56px">分差</th><th style="width:96px">位次</th><th style="width:84px">2026计划</th><th style="width:126px">方向</th><th style="width:144px">匹配/梯度</th><th>2025反查备注</th></tr></thead>
          <tbody>${renderRows(output.rows.filter((row) => !row.isCoverageAudit), { limit: 70 })}</tbody>
        </table>
      </div>
    </section>

    ${bandGroups.map((group) => `<section>
      <h2>${escapeHtml(group.band)} <span class="tag">${group.rows.length}条</span></h2>
      <div class="table-wrap">
        <table>
          <thead><tr><th style="width:132px">学校</th><th style="width:220px">2026专业/专业类</th><th style="width:60px">最低</th><th style="width:60px">平均</th><th style="width:60px">最高</th><th style="width:56px">分差</th><th style="width:96px">位次</th><th style="width:84px">2026计划</th><th style="width:126px">方向</th><th style="width:144px">匹配/梯度</th><th>2025反查备注</th></tr></thead>
          <tbody>${renderRows(group.rows)}</tbody>
        </table>
      </div>
    </section>`).join("\n")}

    <section>
      <h2>执行建议</h2>
      <p class="note"><span class="good">优先深挖：</span>西交大软件/智能感知/智慧能源/智能制造/智能过程，以及非卓越优才的985近分工科方向。<br><span class="warn">先屏蔽：</span>所有卓越优才字样条目。若招生办明确属于2026陕西普通批可报，再作为单独冲刺项加回。<br>下一步咨询时，统一问：2026陕西普通批计划数、专业组内不可接受专业、调剂范围、二次分流规则、转专业比例、软件学费和校区安排。</p>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [evaluation, schools, latestCheck, historical] = await Promise.all([
    readJson("data/generated/candidate-evaluation.json"),
    readJson("data/schools.json"),
    readJson("data/generated/latest-plan-check.json"),
    readJson("data/generated/historical-admissions.json")
  ]);
  const rows = buildRows(evaluation, schools, latestCheck, historical);
  const output = {
    generatedAt: new Date().toISOString(),
    target: {
      province: "陕西",
      subject: "物理类",
      score: targetScore,
      rank: targetRank
    },
    rules: {
      scoreRange: "630-679",
      include: "985/C9 且匹配计算机、软件、AI、电子信息、通信、自动化、电气、集成电路、智能制造、航空航天等工科主线",
      exclude: "医学/医工/医疗、专项、强基、综评、中外合作/合作办学、卓越优才、高收费、预科、港校/港澳台合作",
      matching: "优先以2026招生计划专业为主键反查2025同名专业；无同名时标注近似专业；仍无匹配则提示2025待核。"
    },
    summary: summaryOf(rows),
    focus: focusRows(rows),
    rows
  };

  await mkdir(generatedDir, { recursive: true });
  await writeFile(path.join(generatedDir, "near-score-985-selection-2026.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");
  await writeFile(path.join(rootDir, PAGE_FILES.nearScore985Selection), buildHtml(output), "utf8");
  console.log(`Wrote data/generated/near-score-985-selection-2026.json`);
  console.log(`Wrote ${PAGE_FILES.nearScore985Selection}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
