import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const noFallback = Symbol("noFallback");

async function readJson(relativePath, fallback = noFallback) {
  try {
    const content = await readFile(path.join(rootDir, relativePath), "utf8");
    return JSON.parse(content);
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

function ordinaryOnlyText(value) {
  return String(value ?? "")
    .replace(/国家专项\/高校专项和?/g, "当前主方案只按普通批口径判断")
    .replace(/国家专项不和普通批混排。?/g, "当前主方案只按普通批口径判断。")
    .replace(/高校专项、少数民族预科、内高班等分省分专业计划/g, "特殊类型分省分专业计划")
    .replace(/国家专项|地方专项|高校专项|强基计划|强基|综合评价|中外合作办学|中外合作/g, "特殊类型");
}

function formatRank(rank) {
  if (rank === null || rank === undefined || rank === "") return "-";
  return Number(rank).toLocaleString("zh-CN");
}

function formatPlan(plan) {
  if (plan === null || plan === undefined || plan === "") return "-";
  return `${plan}`;
}

function schoolEntryUrl(school) {
  return school?.manualCheckUrl || school?.queryApi?.listUrl || school?.queryApi?.typeUrl || "";
}

function createSchoolLinker(schools) {
  const schoolByKey = new Map((schools?.schools || []).map((school) => [school.key, school]));
  const schoolByName = new Map((schools?.schools || []).map((school) => [school.name, school]));
  return (schoolKeyOrName, fallbackName) => {
    const school = schoolByKey.get(schoolKeyOrName) || schoolByName.get(fallbackName) || schoolByName.get(schoolKeyOrName);
    const name = escapeHtml(fallbackName || school?.name || schoolKeyOrName || "");
    const url = schoolEntryUrl(school);
    if (!url) return name;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${name}</a>`;
  };
}

function groupBy(items, key) {
  const grouped = new Map();
  for (const item of items) {
    const value = item[key] ?? "未分组";
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(item);
  }
  return grouped;
}

function statusClass(status) {
  if (status === "available") return "good";
  if (status === "error") return "bad";
  if (status === "manual-required") return "warn";
  if (status === "info-published-plan-api-not-ready") return "warn";
  if (status === "year-present-empty") return "warn";
  return "muted";
}

function statusText(status) {
  if (status === "available") return "已上线";
  if (status === "error") return "检查失败";
  if (status === "manual-required") return "需人工复核";
  if (status === "info-published-plan-api-not-ready") return "有2026招生信息，计划接口未出";
  if (status === "not-published") return "未上线";
  if (status === "year-present-empty") return "年份存在但无结果";
  return status || "待核";
}

function renderRows(items, mapper) {
  return items.map(mapper).join("\n");
}

function findCourseProfile(courseAudit, candidate) {
  if (!courseAudit) return null;
  const text = `${candidate.major} ${candidate.track || ""}`;
  return courseAudit.items.find((item) => item.matchKeywords.some((keyword) => text.includes(keyword))) || null;
}

function strengthText(value) {
  return `${value || 0}/5`;
}

function inferAdmissionCategory(item) {
  const text = `${item.major} ${item.track || ""}`;
  if (/中外合作|合作办学/.test(text)) return "中外合作";
  if (/专项/.test(text)) return "特殊类型";
  if (/预科/.test(text)) return "预科";
  return "普通类";
}

function minScoreOf(item) {
  return item.minScore ?? item.score;
}

function renderSignalLinks(links, limit = 3) {
  return (links || []).slice(0, limit).map((item) => {
    const text = typeof item === "string" ? item : item.text;
    const url = typeof item === "string" ? "" : item.url;
    if (!url) return escapeHtml(text);
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(text)}</a>`;
  }).join(" / ");
}

function renderHomepageSignals(signals) {
  if (!signals) return "";
  if (signals.activityLinks?.length) {
    return `<br><span class="subtle">招生活动：${renderSignalLinks(signals.activityLinks, 3)}</span>`;
  }
  if (signals.links?.length) {
    return `<br><span class="subtle">官网重要信息：${renderSignalLinks(signals.links, 3)}</span>`;
  }
  if (signals.activityMatches?.length) {
    return `<br><span class="subtle">招生活动：${renderSignalLinks(signals.activityMatches, 2)}</span>`;
  }
  if (signals.matches?.length) {
    return `<br><span class="subtle">官网线索：${renderSignalLinks(signals.matches, 2)}</span>`;
  }
  return "";
}

function buildReport({ profile, anchors, schools, baseline, planStatus, latestCheck, expertRules, candidateEvaluation, riskFactors, parentActionPlan, biomedTransition, courseAudit, outcomeAudit, planAdmit }) {
  const schoolLink = createSchoolLinker(schools);
  const checkByKey = new Map((latestCheck?.schools || []).map((item) => [item.key, item]));
  const statusRows = planStatus.statuses.map((item) => {
    const auto = checkByKey.get(item.schoolKey);
    const autoStatus = auto
      ? `${statusText(auto.status)}；年份：${(auto.years || []).slice(0, 4).join("、") || "-"}；2026条目：${auto.planRows ?? "-"}`
      : "未自动检查";
    const autoStatusHtml = auto ? `${escapeHtml(autoStatus)}${renderHomepageSignals(auto.homepageSignals)}` : escapeHtml(autoStatus);
    const displayStatus = auto ? statusText(auto.status) : item.status;
    const displayPlan = ordinaryOnlyText(auto?.statusText || item.shaanxiPhysicsPlan);
    return { ...item, autoStatus, autoStatusHtml, autoRawStatus: auto?.status || "manual", displayStatus, displayPlan };
  });

  const nonOrdinaryAdmissionPattern = /中外合作|中外合作办学|合作办学|国家专项|地方专项|高校专项|专项|强基|强基计划|预科|高收费|港校|香港中文|港中深|内地与港澳台|综合评价/;
  const medicalCategoryPattern = /医学|医工|医疗|临床|口腔|基础医学|预防医学|法医学|护理学?|药学|中药学|临床药学|医学影像学|医学影像技术|医学检验技术|麻醉学|儿科学|精神医学|眼视光医学|放射医学|公共卫生|卫生检验|中医学|针灸推拿|中西医临床|康复治疗|助产/;
  const isMainPlanExcluded = (item) => {
    const text = [item.school, item.major, item.track, item.admissionCategory, item.suggestion, item.notes, item.matchedTrack].filter(Boolean).join(" ");
    return nonOrdinaryAdmissionPattern.test(text) || medicalCategoryPattern.test(text);
  };

  const baselineByBand = groupBy(
    [...baseline.items].filter((item) => !isMainPlanExcluded(item)).sort((a, b) => (minScoreOf(b) || 0) - (minScoreOf(a) || 0)),
    "band"
  );
  const bandOrder = ["660", "650", "640", "630", "safety"];
  const bandLabels = {
    "660": "660分位段：高冲",
    "650": "650分位段：核心冲稳",
    "640": "640分位段：稳中选强专业",
    "630": "630分位段：稳保",
    "safety": "下探安全池"
  };

  const majorTracks = profile.majorTrackWeights;
  const maxWeight = Math.max(...majorTracks.map((item) => item.weight));
  const evaluatedItems = candidateEvaluation?.items || [];
  const courseMatchedItems = evaluatedItems
    .map((item) => ({ candidate: item, course: findCourseProfile(courseAudit, item) }))
    .filter((item) => item.course)
    .slice(0, 16);
  const planAdmitSummary = planAdmit?.summary || {};
  const focusSchools = profile.familyPreferences?.focusSchools || [];
  const focusJudgement = new Map([
    ["hit", "哈工大本部是本轮最高优先级，但2025陕西物理普通类本部最低约679，较662高约17分。结论是深入问、重点盯、可冲刺，但不把它当稳项，且只按普通批口径判断。"],
    ["xjtu", "西交大是第二优先级，也是662分位次下更现实的C9主战场。软件工程、智能感知与仪器、智慧能源、智能制造、自动化和电气信息类等方向要逐一核2026计划数、大类分流、调剂和体检限制；医学及医工相关方向不进入本轮主表。"],
    ["hitwh", "哈工大威海是第三优先级，2025普通类638-650覆盖当前核心区间。它承担强校异地校区冲稳功能，重点查卓越优才计划、校区安排、毕业证、转专业、保研就业和学费。"],
    ["hitsz", "哈工大深圳作为补充重点观察。2025陕西物理普通类卓越优才计划最低662、均分665.5，正贴当前分数；平台和深圳城市资源强，但录取安全边际很薄，只能作为高风险冲刺。"]
  ]);
  const focusRows = focusSchools.map((focus) => ({
    focus,
    rows: evaluatedItems.filter((item) => item.schoolKey === focus.schoolKey).slice(0, 6)
  }));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>2026高考志愿预选报告</title>
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
      max-width: 1180px;
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
    .subtle { color: var(--muted); }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      margin-top: 18px;
    }
    .metric, section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .metric {
      padding: 14px;
      min-height: 92px;
    }
    .metric strong {
      display: block;
      font-size: 22px;
      margin-bottom: 4px;
    }
    section {
      margin: 18px 0;
      padding: 20px;
    }
    .two {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 16px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      font-size: 14px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 10px 9px;
      vertical-align: top;
      text-align: left;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
    }
    th {
      color: #344054;
      background: #f8fafc;
      font-weight: 700;
    }
    tr:last-child td { border-bottom: 0; }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 24px;
      padding: 2px 8px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      white-space: normal;
      max-width: 100%;
      background: #eef2f7;
      color: #344054;
    }
    .tag.good { background: #e8f5ee; color: var(--green); }
    .tag.warn { background: #fff4e5; color: var(--amber); }
    .tag.bad { background: #fee4e2; color: var(--red); }
    .tag.muted { background: #eef2f7; color: var(--muted); }
    .track {
      display: grid;
      grid-template-columns: 210px 1fr 42px;
      gap: 10px;
      align-items: center;
      margin: 10px 0;
    }
    .bar {
      height: 12px;
      border-radius: 999px;
      background: #e5e7eb;
      overflow: hidden;
    }
    .bar span {
      display: block;
      height: 100%;
      background: var(--teal);
    }
    .anchor-list {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .anchor {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }
    .anchor strong {
      display: block;
      font-size: 24px;
      color: var(--blue);
    }
    .cmd {
      display: block;
      padding: 10px 12px;
      margin: 8px 0;
      border-radius: 6px;
      background: #111827;
      color: #f9fafb;
      font-family: Consolas, "SFMono-Regular", monospace;
      overflow-x: auto;
    }
    .course-mini {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .course-mini div {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
    }
    ul {
      margin: 8px 0 0;
      padding-left: 20px;
    }
    .note {
      padding: 12px;
      border-left: 4px solid var(--blue);
      background: #f1f6ff;
      border-radius: 6px;
    }
    @media (max-width: 900px) {
      .grid, .two, .anchor-list, .course-mini { grid-template-columns: 1fr; }
      .track { grid-template-columns: 1fr; }
      .wrap { padding: 16px; }
      table { font-size: 13px; }
      th, td { padding: 8px 6px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>2026 高考志愿预选报告</h1>
      <p class="subtle">陕西物理类｜估分 640-660，向下预留至 630｜生成时间：${escapeHtml(new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</p>
      <div class="grid">
        <div class="metric"><strong>${escapeHtml(profile.candidate.estimatedScoreRange)}</strong><span class="subtle">当前估分区间</span></div>
        <div class="metric"><strong>${escapeHtml(profile.candidate.lowerBoundForRiskControl)}+</strong><span class="subtle">下探风险控制线</span></div>
        <div class="metric"><strong>${escapeHtml(baseline.items.length)}</strong><span class="subtle">已固化2025专业基线</span></div>
        <div class="metric"><strong>${escapeHtml(latestCheck?.summary?.available ?? 0)}</strong><span class="subtle">自动查到2026计划上线数</span></div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section>
      <h2>家庭偏好已固化</h2>
      <div class="two">
        <div>
          <h3>已确认的判断</h3>
          <table>
            <thead><tr><th>问题</th><th>结论</th><th>对志愿的影响</th></tr></thead>
            <tbody>
              ${renderRows(profile.answeredQuestions, (item) => `<tr><td>${escapeHtml(item.topic)}</td><td>${escapeHtml(item.answer)}</td><td>${escapeHtml(item.impact)}</td></tr>`)}
            </tbody>
          </table>
        </div>
        <div>
          <h3>专业方向权重</h3>
          ${renderRows(majorTracks, (item) => `<div class="track"><strong>${escapeHtml(item.track)}</strong><div><div class="bar"><span style="width:${Math.round((item.weight / maxWeight) * 100)}%"></span></div><div class="subtle">${escapeHtml(item.reason)}</div></div><span class="tag">${item.weight}/5</span></div>`)}
        </div>
      </div>
    </section>

    <section>
      <h2>重点校区/院校优先分析</h2>
      <p class="note">本版选择策略已调整为：先深入分析哈工大本部，其次西安交通大学，再次哈工大威海；哈工大深圳作为补充重点观察。偏好会进入评分和排序，但不会覆盖分差、位次、普通批口径、校区和调剂风险；医学类、国家专项、地方专项、强基计划、综合评价和中外合作办学不进入本轮主表。</p>
      <table>
        <thead><tr><th>优先级</th><th>学校</th><th>核心判断</th><th>当前普通类候选</th><th>下一步核验</th></tr></thead>
        <tbody>
          ${renderRows(focusRows, ({ focus, rows }) => `<tr>
            <td><strong>第${escapeHtml(focus.priority)}优先</strong></td>
            <td>${schoolLink(focus.schoolKey, focus.name)}<br><span class="subtle">${escapeHtml(focus.shortName || "")}</span></td>
            <td>${escapeHtml(focus.strategy || focusJudgement.get(focus.schoolKey) || "")}<br><span class="subtle">${escapeHtml(focusJudgement.get(focus.schoolKey) || "")}</span></td>
            <td>${rows.length ? rows.map((item) => `<div><span class="tag">${escapeHtml(item.recommendation)}</span>${escapeHtml(item.major)}｜${escapeHtml(minScoreOf(item) ?? "-")}分｜专家${escapeHtml(item.expertScore ?? "-")}</div>`).join("") : "当前普通类主池暂无可用专业行，需人工补2026计划和2025分专业录取。"}</td>
            <td>${escapeHtml(rows[0]?.notes || rows[0]?.matchReason || focusJudgement.get(focus.schoolKey) || "核2026计划、专业组、章程、分流和调剂。")}</td>
          </tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>2026 招生计划发布状态</h2>
      <p class="note">当前最关键的数据是“陕西物理类普通批分专业计划数”。章程和专业目录有参考价值，但不能替代名额测算。</p>
      <table>
        <thead><tr><th>学校</th><th>官网状态</th><th>自动接口检查</th><th>当前处理</th></tr></thead>
        <tbody>
          ${renderRows(statusRows, (item) => `<tr><td><strong>${schoolLink(item.schoolKey, item.school)}</strong></td><td>${escapeHtml(item.displayStatus)}<br><span class="subtle">${escapeHtml(item.displayPlan)}</span></td><td><span class="tag ${statusClass(item.autoRawStatus)}">${item.autoStatusHtml}</span></td><td>${escapeHtml(item.impact)}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>2025 分数位次锚点</h2>
      <div class="anchor-list">
        ${renderRows(anchors.anchors, (item) => `<div class="anchor"><strong>${item.score}</strong><div>${escapeHtml(item.label)}</div><div class="subtle">约 ${formatRank(item.rank)} 位</div><p>${escapeHtml(item.usage)}</p></div>`)}
      </div>
    </section>

    <section>
      <h2>考试难度、个人发挥和大小年</h2>
      <p class="note">${escapeHtml((riskFactors?.coreConclusion || [])[0] || "正式填报以真实位次为核心。")}</p>
      <div class="two">
        <div>
          <h3>今年这类考试反馈的影响</h3>
          <table>
            <thead><tr><th>因素</th><th>可能影响</th><th>填报处理</th></tr></thead>
            <tbody>
              ${renderRows(riskFactors?.examDifficultyModel || [], (item) => `<tr><td>${escapeHtml(item.factor)}</td><td>${escapeHtml(item.effect)}</td><td>${escapeHtml(item.volunteerImpact)}</td></tr>`)}
            </tbody>
          </table>
        </div>
        <div>
          <h3>大小年和冷热博弈</h3>
          <table>
            <thead><tr><th>场景</th><th>经验判断</th><th>动作</th></tr></thead>
            <tbody>
              ${renderRows(riskFactors?.majorHotColdModel?.heuristics || [], (item) => `<tr><td>${escapeHtml(item.scenario)}</td><td>${escapeHtml(item.possibleDistribution)}</td><td>${escapeHtml(item.action)}</td></tr>`)}
            </tbody>
          </table>
        </div>
      </div>
      <h3>还要纳入的其他变量</h3>
      <table>
        <thead><tr><th>变量</th><th>重要性</th><th>说明</th></tr></thead>
        <tbody>
          ${renderRows(riskFactors?.additionalFactors || [], (item) => `<tr><td>${escapeHtml(item.factor)}</td><td><span class="tag">${escapeHtml(item.importance)}</span></td><td>${escapeHtml(item.note)}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>家长出分前后工作清单</h2>
      <div class="two">
        <div>
          <h3>成绩出来前</h3>
          <table>
            <thead><tr><th>任务</th><th>要点</th></tr></thead>
            <tbody>
              ${renderRows(parentActionPlan?.beforeScore || [], (item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.details)}</td></tr>`)}
            </tbody>
          </table>
        </div>
        <div>
          <h3>成绩出来后</h3>
          <table>
            <thead><tr><th>任务</th><th>要点</th></tr></thead>
            <tbody>
              ${renderRows(parentActionPlan?.afterScore || [], (item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.details)}</td></tr>`)}
            </tbody>
          </table>
        </div>
      </div>
      <h3>招生办问询题库</h3>
      <ul>
        ${(parentActionPlan?.questionBank || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("\n")}
      </ul>
      <h3>出分后24小时内操作步骤</h3>
      <table>
        <thead><tr><th>步骤</th><th>动作</th><th>产出</th></tr></thead>
        <tbody>
          ${renderRows(parentActionPlan?.first24HoursWorkflow || [], (item) => `<tr><td><strong>${escapeHtml(item.step)}</strong></td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.output)}</td></tr>`)}
        </tbody>
      </table>
      <p class="subtle">2026可填报表字段模板见 <code>${PAGE_FILES.parentHandbook}</code>，正式填报必须以陕西2026招生计划目录中的院校专业组代码、专业代码和计划数为准。</p>
    </section>

    <section>
      <h2>本地专家经验规则库</h2>
      <p class="note">经验库只吸收公开方法论和官方规则，不复制任何付费课程。它用于提示风险和排序候选，不替代官方计划、招生章程和招生办答复。</p>
      <div class="two">
        <div>
          <h3>核心原则</h3>
          <table>
            <thead><tr><th>原则</th><th>落地规则</th></tr></thead>
            <tbody>
              ${renderRows((expertRules?.corePrinciples || []).slice(0, 7), (item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.rule)}<br><span class="subtle">${escapeHtml(item.impact)}</span></td></tr>`)}
            </tbody>
          </table>
        </div>
        <div>
          <h3>来源优先级</h3>
          <table>
            <thead><tr><th>等级</th><th>来源</th><th>用途</th></tr></thead>
            <tbody>
              ${renderRows(expertRules?.sourcePolicy || [], (item) => `<tr><td><span class="tag">${escapeHtml(item.level)}</span></td><td>${escapeHtml(item.name)}<br><span class="subtle">${escapeHtml((item.examples || []).join("、"))}</span></td><td>${escapeHtml(item.usage)}</td></tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <h2>生物兴趣处理口径</h2>
      <p class="note">生物相关兴趣本轮只作为背景信息保留，不进入本科志愿主方案。医学类、医工、医疗、药学、护理等相关方向已从候选排序、自动志愿和草表中剔除。</p>
      <p>本科主线继续收敛到计算机、软件、电子信息、通信、集成电路、自动化、智能制造、机器人、测控、低空和航空航天等工科底座。</p>
    </section>

    <section>
      <h2>专业课程审计摘要</h2>
      <p class="note">课程画像来自 <code>data/course-audit.json</code>，当前主要用于出分前快速筛查课程强度。最终填报前要把重点院校专业升级为学校培养方案或学院专业介绍来源。</p>
      <div class="course-mini">
        <div><strong>${escapeHtml(courseAudit?.items?.length || 0)}</strong><br><span class="subtle">已建课程画像方向</span></div>
        <div><strong>${escapeHtml(courseMatchedItems.length)}</strong><br><span class="subtle">报告前列候选已匹配</span></div>
        <div><strong>C源为主</strong><br><span class="subtle">需逐校培养方案复核</span></div>
        <div><strong>另见</strong><br><span class="subtle">${PAGE_FILES.courseAudit} 完整版</span></div>
      </div>
      <table>
        <thead><tr><th>学校</th><th>专业名称</th><th>课程画像</th><th>强度提示</th><th>跨学科衔接</th><th>要问招生办</th></tr></thead>
        <tbody>
          ${renderRows(courseMatchedItems, ({ candidate, course }) => `<tr><td>${schoolLink(candidate.schoolKey, candidate.school)}</td><td>${escapeHtml(candidate.major)}</td><td><strong>${escapeHtml(course.label)}</strong><br><span class="subtle">${escapeHtml(course.fitJudgement)}</span></td><td>数学${strengthText(course.courseProfile.math)}；编程${strengthText(course.courseProfile.coding)}；电路信号${strengthText(course.courseProfile.electronicsSignal)}；力学/物理${strengthText(course.courseProfile.physicsMechanics)}</td><td>${strengthText(course.courseProfile.biomedBridge)}<br><span class="subtle">${escapeHtml((course.coreCourses || []).slice(0, 5).join("、"))}</span></td><td>${escapeHtml((course.admissionsQuestions || []).slice(0, 2).join("；"))}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>保研与就业审计摘要</h2>
      <p class="note">保研和就业数据已单独放入 <code>data/outcome-audit.json</code>，完整版见 <code>${PAGE_FILES.outcomeAudit}</code>。当前先采用“可查规则 + 待推算比例 + 趋势判断”的方式，避免把第三方保研率当官方数据。</p>
      <div class="two">
        <div>
          <h3>重点学校待核</h3>
          <table>
            <thead><tr><th>学校</th><th>保研友好</th><th>就业平台</th><th>当前处理</th></tr></thead>
            <tbody>
              ${renderRows((outcomeAudit?.schoolDataPlan || []).slice(0, 8), (item) => `<tr><td>${schoolLink(item.schoolKey, item.school)}</td><td><span class="tag">${escapeHtml(item.postgradFriendliness)}</span></td><td><span class="tag">${escapeHtml(item.employmentPlatform)}</span></td><td>${escapeHtml(item.currentStatus)}</td></tr>`)}
            </tbody>
          </table>
        </div>
        <div>
          <h3>专业方向就业趋势</h3>
          <table>
            <thead><tr><th>方向</th><th>未来5-10年判断</th><th>读研价值</th></tr></thead>
            <tbody>
              ${renderRows((outcomeAudit?.trackOutlooks || []).slice(0, 7), (item) => `<tr><td>${escapeHtml(item.track)}</td><td>${escapeHtml(item.fiveToTenYearOutlook)}</td><td><span class="tag">${escapeHtml(item.postgradValue)}</span></td></tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <h2>专家规则初评分</h2>
      <p class="subtle">当前按估分中位数 650 做临时评分。出分后要换成真实省位次，并加入 2026 计划增减后重算。</p>
      <table>
        <thead><tr><th>排序</th><th>录取年</th><th>省份</th><th>科类</th><th>类别</th><th>学校</th><th>专业名称</th><th>最低分</th><th>平均分</th><th>最高分</th><th>专家分</th><th>结论</th><th>匹配方向</th><th>风险标签</th></tr></thead>
        <tbody>
          ${renderRows(evaluatedItems.slice(0, 18), (item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.admissionYear || baseline.year)}</td><td>${escapeHtml(item.admissionProvince || baseline.province)}</td><td>${escapeHtml(item.admissionSubject || baseline.subject)}</td><td>${escapeHtml(item.admissionCategory || inferAdmissionCategory(item))}</td><td>${schoolLink(item.schoolKey, item.school)}</td><td>${escapeHtml(item.major)}</td><td>${escapeHtml(minScoreOf(item))}</td><td>${escapeHtml(item.avgScore ?? "-")}</td><td>${escapeHtml(item.maxScore ?? "-")}</td><td><strong>${escapeHtml(item.expertScore)}</strong></td><td><span class="tag">${escapeHtml(item.recommendation)}</span></td><td>${escapeHtml(item.matchedTrack)}</td><td>${escapeHtml((item.riskTags || []).join("、") || "-")}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>2025 计划数与实际录取人数口径</h2>
      <p class="note">计划招生人数和最后实际录取人数不能混用。计划数多数可从分省分专业计划或学校查询系统获得；实际录取人数只有部分学校会按省份、科类、专业公开，本项目不把计划数默认当作实录人数。</p>
      <div class="grid">
        <div class="metric"><strong>${escapeHtml(planAdmitSummary.total ?? 0)}</strong><span class="subtle">审计候选项</span></div>
        <div class="metric"><strong>${escapeHtml(planAdmitSummary.planKnown ?? 0)}</strong><span class="subtle">已有2025计划数</span></div>
        <div class="metric"><strong>${escapeHtml(planAdmitSummary.admittedKnown ?? 0)}</strong><span class="subtle">已有2025实录人数</span></div>
        <div class="metric"><strong>${escapeHtml(planAdmitSummary.admittedMissing ?? 0)}</strong><span class="subtle">实录待核</span></div>
      </div>
      <p class="subtle">详表见 <code>${PAGE_FILES.planAdmitAudit}</code> 和 <code>data/generated/plan-admit-reconciliation-2025.json</code>。后续若学校公开“录取人数/实际录取人数”，再录入并计算与计划数的差额。</p>
    </section>

    <section>
      <h2>2025 专业录取基线</h2>
      ${bandOrder.map((band) => {
        const rows = baselineByBand.get(band) || [];
        if (!rows.length) return "";
        return `<h3>${escapeHtml(bandLabels[band] || band)}</h3>
        <table>
          <thead><tr><th>录取年</th><th>省份</th><th>科类</th><th>类别</th><th>学校</th><th>专业名称</th><th>最低分</th><th>平均分</th><th>最高分</th><th>位次</th><th>计划</th><th>方向</th><th>建议</th><th>源</th></tr></thead>
          <tbody>
            ${renderRows(rows, (item) => `<tr><td>${escapeHtml(item.admissionYear || baseline.year)}</td><td>${escapeHtml(item.admissionProvince || baseline.province)}</td><td>${escapeHtml(item.admissionSubject || baseline.subject)}</td><td>${escapeHtml(item.admissionCategory || inferAdmissionCategory(item))}</td><td>${schoolLink(item.schoolKey, item.school)}</td><td>${escapeHtml(item.major)}</td><td>${escapeHtml(minScoreOf(item))}</td><td>${escapeHtml(item.avgScore ?? "-")}</td><td>${escapeHtml(item.maxScore ?? "-")}</td><td>${formatRank(item.rank)}</td><td>${formatPlan(item.plan)}</td><td>${escapeHtml(item.track)}</td><td><span class="tag">${escapeHtml(item.suggestion)}</span></td><td>${escapeHtml(item.sourceLevel)}</td></tr>`)}
          </tbody>
        </table>`;
      }).join("\n")}
    </section>

    <section>
      <h2>${schoolLink("uestc", "电子科技大学")} 2026 专业目录关注点</h2>
      <table>
        <thead><tr><th>专业名称</th><th>初步判断</th></tr></thead>
        <tbody>
          ${renderRows(planStatus.uestc2026DirectoryHighlights, (item) => `<tr><td>${escapeHtml(item.major)}</td><td>${escapeHtml(item.judgement)}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>当前建议</h2>
      <ul>
        <li>第一优先：哈工大本部。普通批本部2025最低约679，当前662分按极高冲刺处理；主要任务是问清2026陕西普通类计划、是否有可接受专业组、是否存在新增/扩招机会。</li>
        <li>第二优先：西交大。662分位次下重点冲软件工程、智能感知与仪器；智慧能源、航天航空、智能制造、自动化和电气信息类可作为冲稳比较池；医学及医工相关方向剔除。</li>
        <li>第三优先：哈工大威海。638-650分段与当前位次更匹配，优先比较机器人与智能装备、AI加先进技术、智能制造、软件工程等普通类方向。</li>
        <li>补充观察：哈工大深圳。2025卓越优才计划最低662，正好贴线；若2026陕西计划数不小、专业组可接受，可作为高风险冲刺项，但不能替代西交大和哈工大威海的更现实方案。</li>
        <li>三校之外：西工大、电子科大、北邮、西电和其它985工科作为对照组，作用是检验三校方案是否牺牲了过多专业质量或录取安全。</li>
        <li>630 左右：外地985中段专业、头部211强专业、本地西电普通强类承担稳保功能。</li>
        <li>画画兴趣作为科技艺术、交互、产品审美、可视化能力的辅助项，不单独作为本科主线。</li>
        <li>生物兴趣本轮只作为背景保留，不进入本科志愿主方案；本科主线收敛到计算机、电子信息、自动化、软件、智能制造等工科底座。</li>
      </ul>
    </section>

    <section>
      <h2>以后如何更新</h2>
      <p>联网检查目标学校 2026 陕西物理普通类计划是否上线：</p>
      <code class="cmd">node scripts/update-data.mjs</code>
      <p>重新生成本 HTML 报告：</p>
      <code class="cmd">node scripts/generate-report.mjs</code>
      <p>两步一起执行：</p>
      <code class="cmd">npm run build</code>
      <p class="subtle">如果某些官网有反爬或只在省考试院计划汇编发布，脚本会标记为需人工复核；这类数据不应自动覆盖最终判断。</p>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [profile, anchors, schools, baseline, planStatus, latestCheck, expertRules, candidateEvaluation, riskFactors, parentActionPlan, biomedTransition, courseAudit, outcomeAudit, planAdmit] = await Promise.all([
    readJson("data/profile.json"),
    readJson("data/score-anchors-2025.json"),
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json"),
    readJson("data/plan-status-2026.json"),
    readJson("data/generated/latest-plan-check.json", null),
    readJson("data/expert-rules.json"),
    readJson("data/generated/candidate-evaluation.json", { items: [] }),
    readJson("data/admission-risk-factors.json"),
    readJson("data/parent-action-plan.json"),
    readJson("data/biomed-transition-routes.json", null),
    readJson("data/course-audit.json", null),
    readJson("data/outcome-audit.json", null),
    readJson("data/generated/plan-admit-reconciliation-2025.json", null)
  ]);

  const html = buildReport({ profile, anchors, schools, baseline, planStatus, latestCheck, expertRules, candidateEvaluation, riskFactors, parentActionPlan, biomedTransition, courseAudit, outcomeAudit, planAdmit });
  const target = path.join(rootDir, PAGE_FILES.report);
  await writeFile(target, html, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
