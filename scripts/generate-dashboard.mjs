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

function escapeScriptJson(value) {
  return JSON.stringify(value)
    .replace(/国家专项\/高校专项和?/g, "当前主方案只按普通批口径判断")
    .replace(/国家专项不和普通批混排。?/g, "当前主方案只按普通批口径判断。")
    .replace(/高校专项、少数民族预科、内高班等分省分专业计划/g, "特殊类型分省分专业计划")
    .replace(/国家专项|高校专项/g, "特殊类型")
    .replaceAll("</", "<\\/");
}

function dashboardHtml(data) {
  const planAdmitSummary = data.planAdmit?.summary || {};
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>2026志愿决策面板</title>
  <style>
    :root {
      --bg: #f5f6f8;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #637083;
      --line: #d8dee8;
      --blue: #1f5aa6;
      --green: #147a4a;
      --amber: #a85b00;
      --red: #b42318;
      --teal: #0f766e;
      --shadow: 0 1px 2px rgba(15, 23, 42, .06);
      --table-scroll-top: 82px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      line-height: 1.45;
    }
    header {
      position: sticky;
      top: 0;
      z-index: 20;
      background: rgba(255,255,255,.96);
      border-bottom: 1px solid var(--line);
      backdrop-filter: blur(10px);
    }
    .wrap {
      width: 100%;
      max-width: none;
      margin: 0 auto;
      padding: 16px 22px;
    }
    .topbar {
      display: grid;
      grid-template-columns: minmax(260px, 1fr) auto;
      gap: 18px;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      letter-spacing: 0;
    }
    h2 {
      margin: 0 0 12px;
      font-size: 18px;
      letter-spacing: 0;
    }
    .section-title {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      flex-wrap: wrap;
    }
    .section-title h2 {
      margin: 0;
    }
    .resource-links {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 8px;
      min-width: min(100%, 520px);
      flex: 1;
    }
    .link-button {
      display: inline-flex;
      align-items: center;
      min-height: 32px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 5px 9px;
      background: #fff;
      color: var(--blue);
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
      white-space: nowrap;
    }
    .link-button:hover {
      border-color: var(--blue);
      text-decoration: none;
    }
    h3 {
      margin: 0 0 8px;
      font-size: 15px;
      letter-spacing: 0;
    }
    p { margin: 0; }
    button, input, select {
      font: inherit;
    }
    button {
      min-height: 36px;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      color: var(--ink);
      cursor: pointer;
      padding: 6px 10px;
    }
    button.primary {
      border-color: var(--blue);
      background: var(--blue);
      color: #fff;
    }
    button:hover {
      border-color: var(--blue);
    }
    .subtle { color: var(--muted); }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 16px;
      align-items: start;
    }
    .layout.filters-open {
      grid-template-columns: 320px minmax(0, 1fr);
    }
    aside, section {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .filter-panel[hidden] {
      display: none;
    }
    aside {
      position: sticky;
      top: 82px;
      padding: 16px;
      max-height: calc(100vh - 104px);
      overflow-y: auto;
      scrollbar-gutter: stable;
    }
    section {
      padding: 16px;
      margin-bottom: 16px;
      min-width: 0;
    }
    .layout > div {
      min-width: 0;
    }
    .filter-head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: center;
      margin-bottom: 12px;
    }
    .filter-head h2 {
      margin: 0;
    }
    .control {
      margin-bottom: 12px;
    }
    .control label {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: #344054;
      font-weight: 700;
    }
    .control input,
    .control select {
      width: 100%;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 7px 9px;
      background: #fff;
      color: var(--ink);
    }
    .checks {
      display: grid;
      gap: 8px;
    }
    .check {
      display: grid;
      grid-template-columns: 18px 1fr;
      gap: 7px;
      align-items: start;
      font-size: 14px;
    }
    .check input { margin-top: 3px; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 16px;
    }
    .metric {
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      min-height: 82px;
    }
    .metric strong {
      display: block;
      font-size: 24px;
      margin-bottom: 4px;
    }
    .tabs {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin: 0 0 12px;
    }
    .tab.active {
      color: #fff;
      border-color: var(--teal);
      background: var(--teal);
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 14px;
      table-layout: fixed;
    }
    .table-scroll {
      width: 100%;
      overflow-x: auto;
      overflow-y: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      scrollbar-gutter: stable;
    }
    .table-scroll table {
      border: 0;
    }
    .wide-table {
      min-width: 1120px;
    }
    .volunteer-table {
      min-width: 1240px;
    }
    .table-pair {
      position: relative;
      width: 100%;
      min-width: 0;
    }
    .scroll-x-top {
      width: 100%;
      height: 18px;
      margin-bottom: 8px;
      overflow-x: auto;
      overflow-y: hidden;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: #fff;
      scrollbar-gutter: stable;
    }
    .scroll-x-spacer {
      height: 1px;
    }
    .scroll-hint {
      margin: -2px 0 8px;
      font-size: 12px;
      color: var(--muted);
    }
    .floating-scrollbar {
      position: fixed;
      left: 16px;
      right: 16px;
      bottom: 10px;
      z-index: 80;
      height: 24px;
      overflow-x: auto;
      overflow-y: hidden;
      border: 1px solid var(--blue);
      border-radius: 6px;
      background: #fff;
      box-shadow: 0 8px 24px rgba(15, 23, 42, .16);
      scrollbar-gutter: stable;
      display: none;
    }
    .floating-scrollbar.active {
      display: block;
    }
    .floating-scroll-spacer {
      height: 1px;
    }
    th, td {
      padding: 9px 8px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
      overflow-wrap: anywhere;
    }
    tbody td {
      background: #fff;
    }
    .nowrap {
      white-space: nowrap;
      overflow-wrap: normal;
    }
    .num {
      text-align: right;
      white-space: nowrap;
      overflow-wrap: normal;
      font-variant-numeric: tabular-nums;
    }
    .sticky-col {
      position: sticky;
      z-index: 20;
      background: #fff;
      box-shadow: 1px 0 0 var(--line);
    }
    th.sticky-col {
      z-index: 40;
      background: #f8fafc;
    }
    .sticky-col-1 {
      left: 0;
    }
    .candidate-table .sticky-col-2 {
      left: 48px;
    }
    .candidate-table .sticky-col-3 {
      left: 112px;
    }
    .candidate-table .sticky-col-4 {
      left: 168px;
    }
    .candidate-table .sticky-col-5 {
      left: 232px;
    }
    .volunteer-table .sticky-col-2 {
      left: 64px;
    }
    .volunteer-table .sticky-col-3 {
      left: 144px;
    }
    .volunteer-table .sticky-col-4 {
      left: 234px;
    }
    .volunteer-table .sticky-col-5 {
      left: 304px;
    }
    .volunteer-table .sticky-col-6 {
      left: 380px;
    }
    th {
      position: static;
      background: #f8fafc;
      color: #344054;
      font-weight: 800;
      box-shadow: 0 1px 0 var(--line);
    }
    .category-cell {
      white-space: normal;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    tr:last-child td { border-bottom: 0; }
    .score {
      font-weight: 800;
      font-variant-numeric: tabular-nums;
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
    .tag.bad { background: #fee4e2; color: var(--red); }
    .tag.blue { background: #eaf1fb; color: var(--blue); }
    .row-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .small {
      font-size: 12px;
      color: var(--muted);
    }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .sync-panel {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      margin-bottom: 12px;
    }
    .sync-log {
      margin-top: 8px;
      padding: 9px;
      border-radius: 6px;
      background: #f8fafc;
      color: #344054;
      font-size: 12px;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .sync-progress {
      height: 8px;
      margin-top: 10px;
      border-radius: 999px;
      background: #e5e7eb;
      overflow: hidden;
    }
    .sync-progress span {
      display: block;
      height: 100%;
      width: 0;
      background: var(--teal);
      transition: width .25s ease;
    }
    .sync-steps {
      display: grid;
      gap: 6px;
      margin-top: 10px;
    }
    .sync-step {
      display: grid;
      grid-template-columns: 22px 1fr;
      gap: 7px;
      align-items: start;
      font-size: 12px;
      color: var(--muted);
    }
    .sync-step.current {
      color: var(--blue);
      font-weight: 800;
    }
    .sync-step.done {
      color: var(--green);
    }
    .sync-dot {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: #eef2f7;
      color: #344054;
      font-size: 11px;
      font-weight: 800;
    }
    .sync-step.current .sync-dot {
      background: #eaf1fb;
      color: var(--blue);
    }
    .sync-step.done .sync-dot {
      background: #e8f5ee;
      color: var(--green);
    }
    .status {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: #fff;
    }
    .note-list {
      display: grid;
      gap: 8px;
    }
    .note {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: #fff;
    }
    .detail {
      display: none;
      margin-top: 7px;
      padding: 8px;
      border-radius: 6px;
      background: #f8fafc;
      color: #344054;
    }
    tr.open .detail {
      display: block;
    }
    .empty {
      padding: 28px;
      text-align: center;
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .volunteer-toolbar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 12px;
    }
    .volunteer-summary {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-bottom: 12px;
    }
    .volunteer-card {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 10px;
      min-height: 72px;
    }
    .volunteer-card strong {
      display: block;
      font-size: 20px;
    }
    @media (max-width: 1100px) {
      .layout,
      .layout.filters-open { grid-template-columns: 1fr; }
      aside {
        position: static;
        max-height: none;
        overflow: visible;
      }
      .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .volunteer-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .status-grid { grid-template-columns: 1fr; }
      .sync-panel { grid-template-columns: 1fr; }
      th { position: static; }
    }
    @media (max-width: 720px) {
      :root { --table-scroll-top: 142px; }
      .wrap { padding: 14px; }
      .topbar { grid-template-columns: 1fr; }
      .metrics { grid-template-columns: 1fr; }
      .volunteer-summary { grid-template-columns: 1fr; }
      table { font-size: 13px; }
      th, td { padding: 7px 5px; }
      .floating-scrollbar {
        left: 14px;
        right: 14px;
      }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap topbar">
      <div>
        <h1>2026 志愿决策面板</h1>
        <p class="subtle">陕西物理类｜本地数据 + 官方接口检查 + 专家规则初评分</p>
      </div>
      <div class="row-actions">
        <button class="primary" id="autoFillVolunteers">自动预填志愿</button>
        <button id="toggleFilters" aria-expanded="false" aria-controls="filterPanel">显示筛选</button>
        <button id="syncLatestData">同步最新数据</button>
        <button id="exportVolunteerCsv">导出志愿CSV</button>
        <button id="exportCsv">导出CSV</button>
        <button id="copySummary">复制摘要</button>
        <button class="primary" id="resetFilters">重置筛选</button>
      </div>
    </div>
  </header>

  <main class="wrap layout filters-collapsed" id="dashboardLayout">
    <aside id="filterPanel" class="filter-panel" hidden>
      <div class="filter-head">
        <h2>筛选和重算</h2>
        <button id="closeFilters" type="button">收起</button>
      </div>
      <div class="control">
        <label for="scoreInput">实际分数</label>
        <input id="scoreInput" type="number" min="0" max="750" value="${data.profile?.candidate?.actualScore || 662}">
      </div>
      <div class="control">
        <label for="rankInput">实际省位次</label>
        <input id="rankInput" type="number" min="1" value="${data.profile?.candidate?.actualRank || ""}" placeholder="实际省位次">
      </div>
      <div class="control">
        <label for="trackFilter">专业方向</label>
        <select id="trackFilter">
          <option value="">全部方向</option>
        </select>
      </div>
      <div class="control">
        <label for="bandFilter">分段</label>
        <select id="bandFilter">
          <option value="">全部分段</option>
          <option value="660">660 高冲</option>
          <option value="650">650 冲稳</option>
          <option value="640">640 稳</option>
          <option value="630">630 稳保</option>
          <option value="safety">安全池</option>
        </select>
      </div>
      <div class="control">
        <label for="sourceFilter">来源</label>
        <select id="sourceFilter">
          <option value="">全部来源</option>
          <option value="A">仅官方/A源</option>
          <option value="B">第三方/B源</option>
        </select>
      </div>
      <div class="control">
        <label for="queryInput">搜索学校/专业</label>
        <input id="queryInput" type="search" placeholder="例如 西电 计算机 集成电路">
      </div>
      <div class="control">
        <label>风险和排序</label>
        <div class="checks">
          <label class="check"><input id="hideExcluded" type="checkbox" checked><span>普通类主方案：剔除医学类、国家/地方专项、强基、综合评价、中外合作办学、高收费和港校项目</span></label>
          <label class="check"><input id="officialBoost" type="checkbox" checked><span>优先显示官方来源</span></label>
          <label class="check"><input id="showSafety" type="checkbox" checked><span>显示本地211安全池</span></label>
        </div>
      </div>
      <p class="small">当前评分按正式出分 662 分、1558 位次重算；最终仍要按陕西省2026招生计划目录、院校专业组和招生章程复核。</p>
    </aside>

    <div>
      <div class="metrics">
        <div class="metric"><strong id="metricTotal">0</strong><span class="subtle">当前候选</span></div>
        <div class="metric"><strong id="metricHigh">0</strong><span class="subtle">高优先/优先</span></div>
        <div class="metric"><strong id="metricOfficial">0</strong><span class="subtle">官方/A源</span></div>
        <div class="metric"><strong id="metricPlan">0</strong><span class="subtle">已有计划数</span></div>
        <div class="metric"><strong id="metricNeedVerify">0</strong><span class="subtle">含待核风险</span></div>
      </div>

      <section>
        <div class="section-title">
          <h2>候选专业排序</h2>
          <div class="resource-links">
            <a class="link-button" href="${PAGE_FILES.historicalReference}" target="_blank" rel="noreferrer">历年分数与招生参考</a>
            <a class="link-button" href="${PAGE_FILES.parentHandbook}" target="_blank" rel="noreferrer">家长出分前后行动手册</a>
            <a class="link-button" href="${PAGE_FILES.courseAudit}" target="_blank" rel="noreferrer">候选专业课程审计</a>
            <a class="link-button" href="${PAGE_FILES.outcomeAudit}" target="_blank" rel="noreferrer">保研与就业审计</a>
            <a class="link-button" href="${PAGE_FILES.planAdmitAudit}" target="_blank" rel="noreferrer">2025计划与实际录取人数审计</a>
            <a class="link-button" href="${PAGE_FILES.report}" target="_blank" rel="noreferrer">2026高考志愿预选报告</a>
            <a class="link-button" href="${PAGE_FILES.scoreRankReference}" target="_blank" rel="noreferrer">陕西一分一段与位次对照</a>
            <a class="link-button" href="${PAGE_FILES.binheItineraryAudit}" target="_blank" rel="noreferrer">滨河招生行程</a>
            <a class="link-button" href="${PAGE_FILES.admissionCharterAudit}" target="_blank" rel="noreferrer">招生章程规则审计</a>
            <a class="link-button" href="${PAGE_FILES.tierPlanDocument}" target="_blank" rel="noreferrer">985/头部211梯度核验</a>
            <a class="link-button" href="${PAGE_FILES.all985Audit}" target="_blank" rel="noreferrer">985全量遍历审计</a>
            <a class="link-button" href="${PAGE_FILES.nearScore985Selection}" target="_blank" rel="noreferrer">662位次985近分筛选</a>
            <a class="link-button" href="${PAGE_FILES.ordinaryVolunteerDraft}" target="_blank" rel="noreferrer">普通类志愿草表</a>
            <a class="link-button" href="${PAGE_FILES.linkValidation}" target="_blank" rel="noreferrer">链接验证报告</a>
          </div>
        </div>
        <p class="small">专家分是综合优先级，不是录取概率；它由学校层级、C9/985族群、专业匹配、分数安全、来源质量、计划可靠性、城市资源、风险控制和家庭重点校偏好加总。分数越高表示越值得优先研究，录取难度仍要看最低分、平均分、最高分、位次、计划数和专业组规则。</p>
        <div class="tabs" id="recommendTabs"></div>
        <div id="candidateTableWrap"></div>
      </section>

      <section>
        <h2>模拟志愿表</h2>
        <div class="volunteer-toolbar">
          <button class="primary" id="autoFillVolunteersInline">自动预填志愿</button>
          <button id="copyVolunteerSummary">复制志愿草表</button>
          <button id="clearVolunteers">清空草表</button>
        </div>
        <p class="small">这是“院校专业组/专业志愿单元”的模拟草表，用于理解冲稳保结构和家庭讨论。正式填报数量、字段、批次和专业组代码必须以陕西省教育考试院系统为准。</p>
        <div class="volunteer-summary" id="volunteerSummary"></div>
        <div id="volunteerTableWrap"></div>
      </section>

      <section>
        <h2>特殊类型剔除复核</h2>
        <p class="small">本轮正式填报主方案剔除医学类、国家专项、地方专项、强基计划、综合评价、中外合作办学、预科、高收费、港校和内地与港澳台合作办学项目；此处用于检查是否仍有误入库项目。</p>
        <div class="status-grid" id="paidOpportunityList"></div>
      </section>

      <section>
        <h2>630-660 覆盖审计</h2>
        <p class="small">按2025陕西物理类院校最低分做查漏补缺。这里用于防漏校，不等同于目标专业已确认可录；信息类、计算机、电气、自动化等专业分通常高于院校最低分。</p>
        <div class="status-grid" id="coverageAudit"></div>
      </section>

      <section>
        <h2>2026 计划状态</h2>
        <div class="sync-panel">
          <div>
            <h3>2026 数据更新控制台</h3>
            <p class="small">通过本地服务打开时，点击“同步最新数据”会联网检查目标院校2026陕西物理普通类计划、重算候选、重新生成 report/dashboard/handbook。2025录取基线会保留用于对比。</p>
            <div class="sync-log" id="syncStatus">当前页面内嵌的是上次生成时的数据。若直接双击打开HTML，请先运行 npm run dashboard:serve。</div>
            <div class="sync-progress"><span id="syncProgressBar"></span></div>
            <div class="sync-steps" id="syncSteps"></div>
          </div>
          <button class="primary" id="syncLatestDataInline">同步最新数据</button>
        </div>
        <div class="status-grid" id="planStatus"></div>
      </section>

      <section>
        <h2>2025 计划与实录人数</h2>
        <p class="small">计划招生人数和最后实际录取人数分开审计。当前不能默认“实录=计划”；已公开实录人数的学校后续会单独入库。</p>
        <div class="status-grid">
          <div class="status"><h3>${planAdmitSummary.total ?? 0}</h3><p class="small">候选专业项</p></div>
          <div class="status"><h3>${planAdmitSummary.planKnown ?? 0}</h3><p class="small">已有2025计划数</p></div>
          <div class="status"><h3>${planAdmitSummary.admittedKnown ?? 0}</h3><p class="small">已有2025实录人数</p></div>
        </div>
        <p class="small"><a href="${PAGE_FILES.planAdmitAudit}" target="_blank" rel="noreferrer">打开计划/实录审计表</a>，用于逐校补齐来源链接、计划数、实录人数和差额。</p>
      </section>

      <section>
        <h2>保研与就业趋势</h2>
        <div class="note-list" id="outcomeList"></div>
      </section>

      <section>
        <h2>待问招生办清单</h2>
        <div class="note-list" id="questionList"></div>
      </section>
    </div>
  </main>
  <div class="floating-scrollbar" id="floatingScroll" aria-label="当前表格横向滚动条">
    <div class="floating-scroll-spacer" id="floatingScrollSpacer"></div>
  </div>

  <script id="app-data" type="application/json">${escapeScriptJson(data)}</script>
  <script>
    const DATA = JSON.parse(document.getElementById('app-data').textContent);
    const state = {
      tab: 'all',
      score: Number(DATA.profile?.candidate?.actualScore || 662),
      rank: DATA.profile?.candidate?.actualRank || '',
      track: '',
      band: '',
      source: '',
      query: '',
      hideExcluded: true,
      officialBoost: true,
      showSafety: true,
      filtersOpen: false
    };
    const volunteerState = {
      items: [],
      targetCount: 45
    };
    const syncState = {
      running: false,
      pollTimer: null,
      startedAt: null,
      steps: [
        '联网检查2026招生计划',
        '更新一分一段位次表',
        '更新滨河招生行程',
        '审计630-660学校覆盖',
        '重算候选专业评分',
        '生成计划实录审计',
        '生成历年分数参考',
        '生成家庭报告',
        '生成dashboard',
        '生成课程审计',
        '生成保研就业审计',
        '生成家长行动手册'
      ]
    };
    const floatingScrollState = {
      activePair: null,
      syncing: false
    };

    const $ = (id) => document.getElementById(id);
    const schoolMap = new Map(DATA.schools.schools.map((school) => [school.key, school]));
    const schoolNameMap = new Map(DATA.schools.schools.map((school) => [school.name, school]));

    function includesAny(text, keywords) {
      return keywords.some((keyword) => text.includes(keyword));
    }

    function escapeHtml(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function formatRank(rank) {
      if (!rank) return '-';
      return Number(rank).toLocaleString('zh-CN');
    }

    function shortCategory(value) {
      const text = String(value || '-');
      if (text === '院校最低分覆盖审计') return '覆盖审计';
      return text;
    }

    function schoolEntryUrl(school) {
      return school?.manualCheckUrl || school?.queryApi?.listUrl || school?.queryApi?.typeUrl || '';
    }

    function schoolNameLink(item) {
      const name = escapeHtml(item.school);
      if (!item.schoolUrl) return '<strong>' + name + '</strong>';
      return '<strong><a href="' + escapeHtml(item.schoolUrl) + '" target="_blank" rel="noreferrer" onclick="event.stopPropagation()">' + name + '</a></strong>';
    }

    function schoolLinkByKey(schoolKey, fallbackName) {
      const school = schoolMap.get(schoolKey);
      const name = escapeHtml(fallbackName || school?.name || '');
      const url = schoolEntryUrl(school);
      if (!url) return name;
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + name + '</a>';
    }

    function schoolPlatformScore(school) {
      const tier = school?.tier || '';
      if (tier.includes('985')) return 18;
      if (tier.includes('211')) return 14;
      if (tier.includes('双一流')) return 12;
      return 8;
    }

    function cityScore(school) {
      const city = school?.city || '';
      if (city.includes('西安')) return 8;
      if (/(北京|上海|深圳|广州|杭州|南京|成都|武汉)/.test(city)) return 7;
      if (/(长沙|重庆|大连|济南|青岛|威海)/.test(city)) return 6;
      return 4;
    }

    function focusSchoolRank(itemOrKey) {
      const key = typeof itemOrKey === 'string' ? itemOrKey : itemOrKey?.schoolKey;
      const focusSchools = DATA.profile?.familyPreferences?.focusSchools || [];
      const index = focusSchools.findIndex((school) => school.schoolKey === key);
      return index === -1 ? 999 : index;
    }

    function focusSchoolPriority(item) {
      const rank = focusSchoolRank(item);
      if (rank === 999) return 0;
      return Math.max(0, 18 - rank * 2);
    }

    function majorFit(item) {
      const text = item.major + ' ' + (item.track || '');
      const matched = DATA.expertRules.majorTrackRules.find((rule) => includesAny(text, rule.keywords));
      return {
        score: matched?.fitScore ?? 12,
        matchedTrack: matched?.track ?? item.track ?? '待判断',
        reason: matched?.reason ?? '未匹配到明确专业规则，需要人工判断。'
      };
    }

    function matchCourseProfile(item) {
      if (!DATA.courseAudit?.items) return null;
      const text = item.major + ' ' + (item.track || '');
      return DATA.courseAudit.items.find((profile) => {
        return profile.matchKeywords.some((keyword) => text.includes(keyword));
      }) || null;
    }

    function courseStrengthSummary(profile) {
      if (!profile?.courseProfile) return '课程画像待补充';
      return '数学' + profile.courseProfile.math + '/5，编程' + profile.courseProfile.coding + '/5，电路信号' + profile.courseProfile.electronicsSignal + '/5，物理/力学' + profile.courseProfile.physicsMechanics + '/5，生医衔接' + profile.courseProfile.biomedBridge + '/5';
    }

    function minScoreOf(item) {
      return item.minScore ?? item.score;
    }

    function scoreSafety(item) {
      const minScore = minScoreOf(item);
      if (!minScore) return 8;
      const delta = Number(state.score || 650) - Number(minScore);
      if (delta >= 15) return 22;
      if (delta >= 8) return 20;
      if (delta >= 3) return 17;
      if (delta >= 0) return 14;
      if (delta >= -5) return 10;
      if (delta >= -10) return 6;
      return 3;
    }

    function graduateFlexibility(item) {
      const text = item.major + ' ' + (item.track || '');
      if (/(计算机|软件|人工智能|数据|电子|通信|集成电路|自动化|机器人|测控|医学电子|生物医学)/.test(text)) return 8;
      if (/(航空|航天|低空|能源|电气)/.test(text)) return 6;
      return 4;
    }

    function paidOpportunityBoost(item, school) {
      const text = [item.school, item.major, item.track, item.admissionCategory, item.notes].filter(Boolean).join(' ');
      const isPaidOpportunity = /中外合作|合作办学|高收费|香港中文|港中深|港校|内地与港澳台合作办学/.test(text);
      if (!isPaidOpportunity) return 0;
      if (/中外合作|合作办学/.test(text)) return -28;
      const strongPlatform = /(985|C9|双一流|香港中文|港中深|深圳)/.test([school?.tier, school?.name, school?.city].filter(Boolean).join(' '));
      const strongMajor = /(电气|计算机|软件|人工智能|数据|电子|通信|集成电路|自动化|机器人|生物医学|医工)/.test(text);
      if (/香港中文大学（深圳）|港中深|香港中文大学/.test(text) && strongMajor) return -8;
      if (strongPlatform && strongMajor) return -10;
      if (strongPlatform) return /工业设计|建筑学|产品设计/.test(text) ? -18 : -12;
      return -12;
    }

    function riskScore(item) {
      const text = item.major + ' ' + (item.track || '');
      const hits = [];
      let penalty = 0;
      for (const rule of DATA.expertRules.riskPenalties) {
        if (includesAny(text, rule.keywords)) {
          hits.push(rule.name);
          penalty += Math.abs(rule.penalty);
        }
      }
      return {
        score: Math.max(0, 6 - Math.min(6, penalty)),
        hits
      };
    }

    const nonOrdinaryAdmissionPattern = /中外合作|中外合作办学|合作办学|国家专项|地方专项|高校专项|专项|强基|强基计划|卓越优才|预科|高收费|港校|香港中文|港中深|内地与港澳台|综合评价/;
    const medicalCategoryPattern = /医学|医工|医疗|临床|口腔|基础医学|预防医学|法医学|护理学?|药学|中药学|临床药学|医学影像学|医学影像技术|医学检验技术|麻醉学|儿科学|精神医学|眼视光医学|放射医学|公共卫生|卫生检验|中医学|针灸推拿|中西医临床|康复治疗|助产/;

    function isMainPlanExcluded(item) {
      const text = [item.school, item.major, item.track, item.admissionCategory, item.suggestion, item.notes, item.matchedTrack].filter(Boolean).join(' ');
      return nonOrdinaryAdmissionPattern.test(text) || medicalCategoryPattern.test(text);
    }

    function inferAdmissionCategory(item) {
      const text = item.major + ' ' + (item.track || '');
      if (/中外合作|合作办学/.test(text)) return '中外合作';
      if (/地方专项/.test(text)) return '地方专项';
      if (/国家专项/.test(text)) return '国家专项';
      if (/专项/.test(text)) return '特殊类型';
      if (/强基/.test(text)) return '强基计划';
      if (/综合评价/.test(text)) return '综合评价';
      if (/预科/.test(text)) return '预科';
      return '普通类';
    }

    function recommendation(score, riskHits = [], item = null) {
      const minScore = Number(minScoreOf(item || {}));
      const currentScore = Number(state.score || DATA.profile?.candidate?.actualScore || 662);
      if (Number.isFinite(minScore) && Number.isFinite(currentScore)) {
        const gap = minScore - currentScore;
        if (gap >= 12) return '极高冲刺';
        if (gap >= 6) return '冲刺';
        if (gap >= 0 && Number(item?.avgScore) > currentScore + 2) return '高风险冲刺';
      }
      if (riskHits.includes('中外合作')) return '最低优先';
      if (riskHits.includes('设计建筑非主线')) {
        if (score >= 62) return '备选';
        return '谨慎';
      }
      if (score >= 82) return '高优先';
      if (score >= 72) return '优先';
      if (score >= 62) return '备选';
      if (score >= 52) return '安全/待核';
      return '谨慎';
    }

    function evaluate(item) {
      const school = schoolMap.get(item.schoolKey);
      const major = majorFit(item);
      const risk = riskScore(item);
      const sourceQuality = item.sourceLevel === 'A' ? 8 : 4;
      const planReliability = item.plan ? 6 : 2;
      const parts = {
        schoolPlatform: schoolPlatformScore(school),
        majorFit: major.score,
        scoreSafety: scoreSafety(item),
        sourceQuality,
        planReliability,
        cityAndResource: cityScore(school),
        graduateFlexibility: graduateFlexibility(item),
        riskControl: risk.score,
        paidOpportunity: paidOpportunityBoost(item, school),
        focusSchoolPriority: focusSchoolPriority(item)
      };
      let total = Object.values(parts).reduce((sum, value) => sum + value, 0);
      if (state.officialBoost && item.sourceLevel === 'A') total += 2;
      return {
        ...item,
        minScore: minScoreOf(item) ?? null,
        admissionYear: item.admissionYear || DATA.baseline.year,
        admissionProvince: item.admissionProvince || DATA.baseline.province,
        admissionSubject: item.admissionSubject || DATA.baseline.subject,
        admissionCategory: item.admissionCategory || inferAdmissionCategory(item),
        schoolUrl: schoolEntryUrl(school),
        city: school?.city || '',
        tier: school?.tier || '',
        planYear: item.planYear || DATA.schools.defaultQuery?.year || '2026',
        expertScore: total,
        recommendation: recommendation(total, risk.hits, item),
        matchedTrack: major.matchedTrack,
        matchReason: major.reason,
        riskTags: risk.hits,
        scoreParts: parts
      };
    }

    function filteredItems() {
      const query = state.query.trim().toLowerCase();
      return DATA.baseline.items
        .map(evaluate)
        .filter((item) => {
          if (!state.showSafety && item.band === 'safety') return false;
          if (state.track && item.matchedTrack !== state.track) return false;
          if (state.band && item.band !== state.band) return false;
          if (state.source && item.sourceLevel !== state.source) return false;
          if (state.tab !== 'all' && item.recommendation !== state.tab) return false;
          if (state.hideExcluded && (isMainPlanExcluded(item) || item.riskTags.some((tag) => ['临床医学/护理', '纯文科财经法学'].includes(tag)))) return false;
          if (query) {
            const haystack = [item.school, item.major, item.track, item.matchedTrack, item.city, item.tier].join(' ').toLowerCase();
            if (!haystack.includes(query)) return false;
          }
          return true;
        })
        .sort((a, b) => focusSchoolRank(a) - focusSchoolRank(b) || b.expertScore - a.expertScore || (b.minScore || 0) - (a.minScore || 0));
    }

    function allUsableItems() {
      return DATA.baseline.items
        .map(evaluate)
        .filter((item) => !isMainPlanExcluded(item))
        .filter((item) => !item.riskTags.some((tag) => ['临床医学/护理', '纯文科财经法学'].includes(tag)))
        .sort((a, b) => focusSchoolRank(a) - focusSchoolRank(b) || b.expertScore - a.expertScore || (b.minScore || 0) - (a.minScore || 0));
    }

    function volunteerBucket(item) {
      const score = Number(state.score || 650);
      const itemScore = Number(item.minScore || 0);
      const delta = score - itemScore;
      if (item.band === 'safety' || delta >= 18) return '保';
      if (delta >= 8) return '稳';
      if (delta >= -2) return '冲稳';
      return '冲';
    }

    function volunteerPriority(item) {
      const bucket = volunteerBucket(item);
      const bucketWeight = { '冲': 4, '冲稳': 3, '稳': 2, '保': 1 }[bucket] || 0;
      const focusWeight = focusSchoolRank(item) === 999 ? 0 : 40 - focusSchoolRank(item) * 8;
      return bucketWeight * 1000 + item.expertScore * 10 + focusWeight + (item.minScore || 0) / 10;
    }

    function dedupeVolunteerItems(items) {
      const seen = new Set();
      const output = [];
      for (const item of items) {
        const key = item.school + '|' + item.major;
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(item);
      }
      return output;
    }

    function buildVolunteerPlan() {
      const usable = allUsableItems();
      const buckets = {
        '冲': [],
        '冲稳': [],
        '稳': [],
        '保': []
      };
      for (const item of usable) {
        buckets[volunteerBucket(item)].push(item);
      }
      Object.keys(buckets).forEach((key) => {
        buckets[key].sort((a, b) => volunteerPriority(b) - volunteerPriority(a));
      });
      const quota = {
        '冲': 10,
        '冲稳': 10,
        '稳': 15,
        '保': 10
      };
      let selected = [
        ...buckets['冲'].slice(0, quota['冲']),
        ...buckets['冲稳'].slice(0, quota['冲稳']),
        ...buckets['稳'].slice(0, quota['稳']),
        ...buckets['保'].slice(0, quota['保'])
      ];
      selected = dedupeVolunteerItems(selected);
      if (selected.length < volunteerState.targetCount) {
        const supplement = usable.filter((item) => !selected.some((chosen) => chosen.school === item.school && chosen.major === item.major));
        selected.push(...supplement.slice(0, volunteerState.targetCount - selected.length));
      }
      selected = selected.slice(0, volunteerState.targetCount);
      const orderWeight = { '冲': 1, '冲稳': 2, '稳': 3, '保': 4 };
      return selected
        .sort((a, b) => orderWeight[volunteerBucket(a)] - orderWeight[volunteerBucket(b)] || focusSchoolRank(a) - focusSchoolRank(b) || (b.minScore || 0) - (a.minScore || 0) || b.expertScore - a.expertScore)
        .map((item, index) => ({
          order: index + 1,
          bucket: volunteerBucket(item),
          item
        }));
    }

    function autoFillVolunteers() {
      volunteerState.items = buildVolunteerPlan();
      renderVolunteers();
      document.getElementById('volunteerTableWrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    function tagClass(label) {
      if (['高优先', '优先'].includes(label)) return 'good';
      if (['极高冲刺', '冲刺', '高风险冲刺'].includes(label)) return 'warn';
      if (['备选', '安全/待核'].includes(label)) return 'blue';
      if (['谨慎', '最低优先'].includes(label)) return 'warn';
      if (['临床医学/护理', '纯文科财经法学'].includes(label)) return 'bad';
      if (label === '中外合作') return 'warn';
      if (label.includes('待核')) return 'warn';
      return '';
    }

    function planStatusText(status) {
      if (status === 'available') return '分专业计划已上线';
      if (status === 'info-published-plan-api-not-ready') return '有2026招生信息，计划接口未出';
      if (status === 'year-present-empty') return '年份存在但无结果';
      if (status === 'manual-required') return '需人工复核';
      if (status === 'error') return '检查失败';
      if (status === 'not-published') return '计划接口未上线';
      return status || '待核';
    }

    function planStatusClass(status) {
      if (status === 'available') return 'good';
      if (status === 'error') return 'bad';
      if (['manual-required', 'info-published-plan-api-not-ready', 'year-present-empty'].includes(status)) return 'warn';
      return '';
    }

    function renderTabs(items) {
      const labels = ['all', '高优先', '优先', '备选', '安全/待核', '谨慎'];
      const counts = new Map(labels.map((label) => [label, 0]));
      for (const item of DATA.baseline.items.map(evaluate).filter((entry) => !isMainPlanExcluded(entry))) {
        counts.set(item.recommendation, (counts.get(item.recommendation) || 0) + 1);
        counts.set('all', (counts.get('all') || 0) + 1);
      }
      $('recommendTabs').innerHTML = labels.map((label) => {
        const text = label === 'all' ? '全部' : label;
        return '<button class="tab ' + (state.tab === label ? 'active' : '') + '" data-tab="' + label + '">' + text + ' ' + (counts.get(label) || 0) + '</button>';
      }).join('');
      document.querySelectorAll('[data-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          state.tab = button.dataset.tab;
          render();
        });
      });
    }

    function renderMetrics(items) {
      $('metricTotal').textContent = items.length;
      $('metricHigh').textContent = items.filter((item) => ['高优先', '优先'].includes(item.recommendation)).length;
      $('metricOfficial').textContent = items.filter((item) => item.sourceLevel === 'A').length;
      $('metricPlan').textContent = items.filter((item) => item.plan).length;
      $('metricNeedVerify').textContent = items.filter((item) => item.riskTags.length || item.sourceLevel !== 'A' || !item.plan).length;
    }

    function setFiltersOpen(open) {
      state.filtersOpen = Boolean(open);
      const layout = $('dashboardLayout');
      const panel = $('filterPanel');
      const toggle = $('toggleFilters');
      if (layout) {
        layout.classList.toggle('filters-open', state.filtersOpen);
        layout.classList.toggle('filters-collapsed', !state.filtersOpen);
      }
      if (panel) panel.hidden = !state.filtersOpen;
      if (toggle) {
        toggle.textContent = state.filtersOpen ? '隐藏筛选' : '显示筛选';
        toggle.setAttribute('aria-expanded', state.filtersOpen ? 'true' : 'false');
      }
      updateFloatingScrollbar();
    }

    function pairScrollElements(pair) {
      return [
        pair?.querySelector('[data-scroll-top]'),
        pair?.querySelector('[data-scroll-body]')
      ].filter(Boolean);
    }

    function syncPairScroll(pair, from) {
      if (!pair || floatingScrollState.syncing) return;
      floatingScrollState.syncing = true;
      for (const element of pairScrollElements(pair)) {
        if (element !== from) element.scrollLeft = from.scrollLeft;
      }
      if (floatingScrollState.activePair === pair) {
        const floating = $('floatingScroll');
        if (floating && floating !== from) floating.scrollLeft = from.scrollLeft;
      }
      floatingScrollState.syncing = false;
    }

    function updateFloatingScrollbar() {
      const floating = $('floatingScroll');
      const spacer = $('floatingScrollSpacer');
      if (!floating || !spacer) return;
      const viewportTop = 72;
      const viewportBottom = window.innerHeight - 34;
      let best = null;
      let bestVisible = 0;
      document.querySelectorAll('[data-scroll-pair]').forEach((pair) => {
        const body = pair.querySelector('[data-scroll-body]');
        if (!body || body.scrollWidth <= body.clientWidth + 2) return;
        const rect = pair.getBoundingClientRect();
        const visible = Math.min(rect.bottom, viewportBottom) - Math.max(rect.top, viewportTop);
        if (visible > bestVisible) {
          best = pair;
          bestVisible = visible;
        }
      });
      floatingScrollState.activePair = bestVisible > 48 ? best : null;
      if (!floatingScrollState.activePair) {
        floating.classList.remove('active');
        return;
      }
      const body = floatingScrollState.activePair.querySelector('[data-scroll-body]');
      spacer.style.width = body.scrollWidth + 'px';
      floating.classList.add('active');
      if (!floatingScrollState.syncing) floating.scrollLeft = body.scrollLeft;
    }

    function syncTableScrollbars(containerId) {
      const root = $(containerId);
      if (!root) return;
      root.querySelectorAll('[data-scroll-pair]').forEach((pair) => {
        const top = pair.querySelector('[data-scroll-top]');
        const body = pair.querySelector('[data-scroll-body]');
        if (!top || !body) return;
        top.addEventListener('scroll', () => syncPairScroll(pair, top));
        body.addEventListener('scroll', () => syncPairScroll(pair, body));
      });
      updateFloatingScrollbar();
    }

    function renderTable(items) {
      if (!items.length) {
        $('candidateTableWrap').innerHTML = '<div class="empty">当前筛选条件下没有候选项</div>';
        return;
      }
      $('candidateTableWrap').innerHTML = '<div class="scroll-hint">表格字段较多，可拖动上方或下方横向滚动条查看全部列；已隐藏序号、录取年、省份、科类和类别，优先展示学校、专业和分数信息。</div><div class="table-pair" data-scroll-pair><div class="scroll-x-top" data-scroll-top><div class="scroll-x-spacer" style="width:1120px"></div></div><div class="table-scroll" data-scroll-body><table class="wide-table candidate-table"><thead><tr>' +
        '<th style="width:136px">学校</th><th style="width:230px">专业名称</th><th class="num" style="width:66px">最低</th><th class="num" style="width:66px">平均</th><th class="num" style="width:66px">最高</th><th class="num" style="width:82px">位次</th><th class="num" style="width:88px">2026计划</th><th class="num" style="width:72px">专家分</th><th class="nowrap" style="width:94px">结论</th><th style="width:190px">标签</th><th style="width:120px">城市/层次</th>' +
        '</tr></thead><tbody>' +
        items.map((item, index) => {
          const courseProfile = matchCourseProfile(item);
          const tags = [
            item.sourceLevel,
            item.matchedTrack,
            courseProfile?.label,
            ...(item.riskTags || [])
          ].filter(Boolean).map((tag) => '<span class="tag ' + tagClass(tag) + '">' + escapeHtml(tag) + '</span>').join('');
          const detail = [
            '城市/层次：' + item.city + ' / ' + item.tier,
            '匹配理由：' + item.matchReason,
            '课程画像：' + (courseProfile ? courseProfile.label + '；' + courseStrengthSummary(courseProfile) : '待补充'),
            '典型课程：' + (courseProfile ? courseProfile.coreCourses.slice(0, 8).join('、') : '待补充'),
            '评分拆解：学校' + item.scoreParts.schoolPlatform + '，专业' + item.scoreParts.majorFit + '，安全' + item.scoreParts.scoreSafety + '，来源' + item.scoreParts.sourceQuality + '，计划' + item.scoreParts.planReliability + '，重点三校' + item.scoreParts.focusSchoolPriority + '，中外/高费优先级调整' + item.scoreParts.paidOpportunity,
            '待核实：' + buildQuestions(item).join('；')
          ].join('<br>');
          const planText = item.plan ?? '-';
          return '<tr data-row="' + index + '"><td>' + schoolNameLink(item) + '</td><td>' + escapeHtml(item.major) + '<div class="detail">' + detail + '</div></td><td class="num">' + escapeHtml(item.minScore ?? '-') + '</td><td class="num">' + escapeHtml(item.avgScore ?? '-') + '</td><td class="num">' + escapeHtml(item.maxScore ?? '-') + '</td><td class="num">' + formatRank(item.rank) + '</td><td class="num">' + escapeHtml(planText) + '</td><td class="num score">' + item.expertScore + '</td><td><span class="tag ' + tagClass(item.recommendation) + '">' + escapeHtml(item.recommendation) + '</span></td><td>' + tags + '</td><td>' + escapeHtml(item.city) + '<div class="small">' + escapeHtml(item.tier || '') + '</div></td></tr>';
        }).join('') +
        '</tbody></table></div></div>';
      syncTableScrollbars('candidateTableWrap');
      document.querySelectorAll('[data-row]').forEach((row) => {
        row.addEventListener('click', () => row.classList.toggle('open'));
      });
    }

    function renderVolunteers() {
      const items = volunteerState.items;
      const counts = items.reduce((acc, row) => {
        acc[row.bucket] = (acc[row.bucket] || 0) + 1;
        return acc;
      }, {});
      $('volunteerSummary').innerHTML = ['冲', '冲稳', '稳', '保'].map((bucket) => {
        return '<div class="volunteer-card"><strong>' + (counts[bucket] || 0) + '</strong><span class="subtle">' + bucket + ' 志愿</span></div>';
      }).join('');
      if (!items.length) {
        $('volunteerTableWrap').innerHTML = '<div class="empty">点击“自动预填志愿”生成模拟草表。当前只用于理解模板，正式填报前必须用2026计划和真实位次重算。</div>';
        return;
      }
      $('volunteerTableWrap').innerHTML = '<div class="scroll-hint">表格字段较多，可拖动上方或下方横向滚动条查看全部列；已隐藏序号、录取年、省份、科类和类别，保留梯度和核心专业信息。</div><div class="table-pair" data-scroll-pair><div class="scroll-x-top" data-scroll-top><div class="scroll-x-spacer" style="width:1240px"></div></div><div class="table-scroll" data-scroll-body><table class="wide-table volunteer-table"><thead><tr>' +
        '<th class="nowrap" style="width:62px">梯度</th><th style="width:136px">院校</th><th style="width:230px">专业名称</th><th style="width:130px">课程画像</th><th class="num" style="width:66px">最低</th><th class="num" style="width:66px">平均</th><th class="num" style="width:66px">最高</th><th class="num" style="width:82px">位次</th><th class="nowrap" style="width:58px">来源</th><th style="width:210px">待核事项</th><th style="width:134px">备注</th>' +
        '</tr></thead><tbody>' +
        items.map(({ order, bucket, item }) => {
          const questions = buildQuestions(item);
          const courseProfile = matchCourseProfile(item);
          const bucketClass = bucket === '保' ? 'good' : bucket === '稳' ? 'blue' : 'warn';
          return '<tr><td><span class="tag ' + bucketClass + '">' + bucket + '</span></td><td>' + schoolNameLink(item) + '<div class="small">' + escapeHtml(item.city || '') + '</div></td><td>' + escapeHtml(item.major) + '<div class="small">' + escapeHtml(item.matchedTrack) + '</div></td><td>' + escapeHtml(courseProfile?.label || '待补') + '<div class="small">' + escapeHtml(courseProfile ? courseStrengthSummary(courseProfile) : '') + '</div></td><td class="num">' + escapeHtml(item.minScore ?? '-') + '</td><td class="num">' + escapeHtml(item.avgScore ?? '-') + '</td><td class="num">' + escapeHtml(item.maxScore ?? '-') + '</td><td class="num">' + formatRank(item.rank) + '</td><td class="nowrap">' + escapeHtml(item.sourceLevel) + '</td><td>' + questions.map((q) => '<div class="small">' + escapeHtml(q) + '</div>').join('') + '</td><td>' + escapeHtml(item.notes || item.matchReason || '') + '</td></tr>';
        }).join('') +
        '</tbody></table></div></div>';
      syncTableScrollbars('volunteerTableWrap');
    }

    function isPaidOpportunityItem(item) {
      const text = [item.school, item.major, item.track, item.admissionCategory, item.notes].filter(Boolean).join(' ');
      return /中外合作|合作办学|高收费|香港中文|港中深|港校|内地与港澳台合作办学/.test(text);
    }

    function paidOpportunityVerdict(item) {
      const boost = item.scoreParts?.paidOpportunity || 0;
      if (/中外合作|合作办学/.test([item.major, item.track, item.admissionCategory, item.notes].filter(Boolean).join(' '))) return '最低优先';
      if (boost <= -18) return '低优先观察';
      if (boost <= -8) return '单独比较';
      return '谨慎核验';
    }

    function renderPaidOpportunityList(items) {
      const rows = items
        .filter(isPaidOpportunityItem)
        .sort((a, b) => b.expertScore - a.expertScore || (b.minScore || 0) - (a.minScore || 0));
      if (!rows.length) {
        $('paidOpportunityList').innerHTML = '<div class="status"><h3>暂无入库项</h3><p class="small">当前候选池没有中外合作/高收费/港校备选项；后续如补充也只做单独比较。</p></div>';
        return;
      }
      $('paidOpportunityList').innerHTML = rows.map((item) => {
        const questions = buildQuestions(item).filter((question) => /中外合作|高收费|毕业证|学位证|培养地点|费用|英文|保研|就业|转专业|调剂|计划数|招生章程/.test(question)).slice(0, 5);
        const scoreLine = '最低' + escapeHtml(item.minScore ?? '-') + '｜平均' + escapeHtml(item.avgScore ?? '-') + '｜最高' + escapeHtml(item.maxScore ?? '-') + '｜计划' + escapeHtml(item.plan ?? '-');
        return '<div class="status"><h3>' + schoolNameLink(item) + '</h3><p><span class="tag warn">' + escapeHtml(paidOpportunityVerdict(item)) + '</span> <span class="tag">' + escapeHtml(item.admissionCategory || '高费备选') + '</span></p><p class="small"><strong>' + escapeHtml(item.major) + '</strong></p><p class="small">' + escapeHtml(item.admissionYear || DATA.baseline.year || '-') + ' ' + escapeHtml(item.admissionProvince || DATA.baseline.province || '-') + ' ' + escapeHtml(item.admissionSubject || DATA.baseline.subject || '-') + '：' + scoreLine + '</p><p class="small">专家分：' + escapeHtml(item.expertScore) + '；中外/高费优先级调整：' + escapeHtml(item.scoreParts?.paidOpportunity || 0) + '；方向：' + escapeHtml(item.matchedTrack || item.track || '-') + '</p><p class="small">' + escapeHtml(item.notes || item.matchReason || '') + '</p><p class="small"><strong>必须核验：</strong>' + escapeHtml(questions.join('；') || '费用、证书、培养地点、英文要求、保研就业、转专业和同批次影响') + '</p></div>';
      }).join('');
    }

    function schoolPlanPriority(school, manualStatus, latest) {
      const candidates = DATA.baseline.items
        .filter((item) => item.schoolKey === school.key)
        .map(evaluate)
        .sort((a, b) => b.expertScore - a.expertScore || (b.minScore || 0) - (a.minScore || 0));
      const topScore = candidates[0]?.expertScore || 0;
      const topMinScore = candidates[0]?.minScore || 0;
      const candidateCount = candidates.length;
      const platform = schoolPlatformScore(school);
      const priorityScore = topScore * 10 + Math.min(candidateCount, 8) * 12 + platform + focusSchoolPriority({ schoolKey: school.key }) * 20 + (latest?.status === 'available' ? 18 : 0);
      let group = '信息跟踪';
      if (topScore >= 86 || ['hit', 'xjtu', 'hitwh', 'nwpu', 'xdu', 'uestc'].includes(school.key)) group = '核心候选';
      else if (topScore >= 78 || candidateCount >= 3 || /985/.test(school.tier || '')) group = '重点备选';
      else if (candidateCount > 0 || latest?.homepageSignals?.hasTargetYearSignal) group = '扩展了解';
      return {
        school,
        manualStatus,
        latest,
        candidates,
        topScore,
        topMinScore,
        candidateCount,
        priorityScore,
        group
      };
    }

    function planStatusSummary(row) {
      if (row.latest) return row.latest.statusText || planStatusText(row.latest.status);
      if (row.manualStatus) return row.manualStatus.shaanxiPhysicsPlan || row.manualStatus.status;
      return row.school.notes || '暂无自动接口，需人工关注学校招生网和陕西招生计划目录。';
    }

    function renderSignalLinks(links, limit) {
      return (links || []).slice(0, limit).map((item) => {
        const text = typeof item === 'string' ? item : item.text;
        const url = typeof item === 'string' ? '' : item.url;
        if (url) {
          return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + escapeHtml(text) + '</a>';
        }
        return escapeHtml(text);
      }).join(' / ');
    }

    function renderAdmissionSignals(latest) {
      const signals = latest?.homepageSignals;
      if (signals?.activityLinks?.length) {
        return '<p class="small"><strong>招生活动/官网动态：</strong>' + renderSignalLinks(signals.activityLinks, 4) + '</p>';
      }
      if (signals?.links?.length) {
        return '<p class="small"><strong>招生重要信息：</strong>' + renderSignalLinks(signals.links, 4) + '</p>';
      }
      if (signals?.activityMatches?.length) {
        return '<p class="small"><strong>招生活动/官网动态：</strong>' + renderSignalLinks(signals.activityMatches, 3) + '</p>';
      }
      if (signals?.matches?.length) {
        return '<p class="small"><strong>招生重要信息：</strong>' + renderSignalLinks(signals.matches, 3) + '</p>';
      }
      if (signals?.checked === false) {
        return '<p class="small"><strong>招生活动/官网动态：</strong>本轮未抓到首页线索，需人工打开招生入口查看咨询会、直播、校园开放日和招生组行程。</p>';
      }
      return '<p class="small"><strong>招生活动/官网动态：</strong>本轮未识别到2026招生活动关键词，建议人工复核招生入口。</p>';
    }

    function phoneLink(phone) {
      if (!phone) return '';
      const tel = String(phone).replace(/[^0-9+\\-]/g, '');
      return tel ? '<a href="tel:' + escapeHtml(tel) + '">' + escapeHtml(phone) + '</a>' : escapeHtml(phone);
    }

    function sourceLink(url, text) {
      if (!url) return escapeHtml(text || '');
      return '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + escapeHtml(text || url) + '</a>';
    }

    function contactSummary(contact) {
      const phone = contact.phone ? ' ' + phoneLink(contact.phone) : '';
      const area = contact.area ? '（' + escapeHtml(contact.area) + '）' : '';
      return escapeHtml(contact.name || '招生老师') + phone + area;
    }

    function groupSummary(group) {
      const label = group.label ? escapeHtml(group.label) + '：' : '';
      return label + 'QQ群 ' + escapeHtml(group.groupNo || '-');
    }

    function teamSummary(team) {
      const area = team.area ? '（' + escapeHtml(team.area) + '）' : '';
      const qrcode = team.qrcodeUrl ? ' ' + sourceLink(team.qrcodeUrl, '二维码') : '';
      return escapeHtml(team.name || '招生组') + area + qrcode;
    }

    function teamGroupSummary(group) {
      const qrcode = group.qrcodeUrl ? ' ' + sourceLink(group.qrcodeUrl, '群二维码') : '';
      const description = group.description ? '：' + escapeHtml(group.description) : '';
      return escapeHtml(group.team || '咨询群') + description + qrcode;
    }

    function eventSummary(event) {
      const date = [event.startDate, event.startTime].filter(Boolean).join(' ');
      const end = event.endDate && event.endDate !== event.startDate ? ' 至 ' + event.endDate : '';
      const place = event.place ? '｜' + escapeHtml(event.place) : '';
      const contacts = event.contacts?.length ? '｜' + event.contacts.map(contactSummary).join('、') : '';
      return sourceLink(event.sourceUrl, event.title || '咨询行程') + '｜' + escapeHtml(date + end) + place + contacts;
    }

    function renderConsultationSignals(latest) {
      const signals = latest?.consultationSignals;
      if (!signals) return '';
      if (signals.checked === false) {
        return '<p class="small"><strong>本校/陕西咨询：</strong>' + sourceLink(signals.pageUrl, '打开咨询行程') + '；本轮自动抓取失败，需人工复核。' + escapeHtml(signals.error ? '错误：' + signals.error : '') + '</p>';
      }

      const rows = [];
      if (signals.targetContacts?.length || signals.targetGroups?.length || signals.targetTeams?.length || signals.targetTeamGroups?.length || signals.targetEvents?.length) {
        const pieces = [
          ...(signals.targetContacts || []).slice(0, 3).map(contactSummary),
          ...(signals.targetGroups || []).slice(0, 3).map(groupSummary),
          ...(signals.targetTeams || []).slice(0, 2).map(teamSummary),
          ...(signals.targetTeamGroups || []).slice(0, 2).map(teamGroupSummary),
          ...(signals.targetEvents || []).slice(0, 2).map(eventSummary)
        ];
        rows.push('<p class="small"><strong>本校对口咨询：</strong>' + pieces.join(' / ') + '</p>');
      }
      if (signals.cityEvents?.length) {
        rows.push('<p class="small"><strong>西安近期行程：</strong>' + signals.cityEvents.slice(0, 3).map(eventSummary).join(' / ') + '</p>');
      }
      if (signals.cityContacts?.length || signals.cityGroups?.length) {
        const pieces = [
          ...(signals.cityContacts || []).slice(0, 3).map(contactSummary),
          ...(signals.cityGroups || []).slice(0, 4).map(groupSummary)
        ];
        rows.push('<p class="small"><strong>西安/片区咨询：</strong>' + pieces.join(' / ') + '</p>');
      }
      if (signals.provinceContacts?.length || signals.provinceGroups?.length || signals.provinceEvents?.length) {
        const pieces = [
          ...(signals.provinceContacts || []).slice(0, 3).map(contactSummary),
          ...(signals.provinceGroups || []).slice(0, 3).map(groupSummary),
          ...(signals.provinceEvents || []).slice(0, 2).map(eventSummary)
        ];
        rows.push('<p class="small"><strong>陕西省公共咨询：</strong>' + pieces.join(' / ') + '</p>');
      }
      if (signals.subjectTeams?.length) {
        rows.push('<p class="small"><strong>学院/专业招生组：</strong>' + signals.subjectTeams.slice(0, 4).map(teamSummary).join(' / ') + '</p>');
      }
      if (signals.scopeScenarios?.length) {
        rows.push('<p class="small"><strong>已按场景识别：</strong>' + escapeHtml(signals.scopeScenarios.join('、')) + '</p>');
      }
      if (!rows.length) {
        rows.push('<p class="small"><strong>本校/陕西咨询：</strong>' + sourceLink(signals.pageUrl, '打开咨询行程') + '；本轮未识别到本校或西安专属条目，需人工复核咨询群和热线。</p>');
      } else {
        rows.push('<p class="small"><strong>咨询入口：</strong>' + sourceLink(signals.pageUrl, '打开官方咨询行程') + '；已识别行程 ' + escapeHtml(signals.totalEvents ?? '-') + ' 条。</p>');
      }
      return rows.join('');
    }

    function coverageStatusClass(status) {
      if (status === '覆盖审计已补入') return 'good';
      if (status === '建议补入主观察池') return 'warn';
      if (status === '低于630，补入安全观察池') return 'blue';
      if (status === '已在当前候选池') return 'good';
      return '';
    }

    function renderCoverageAudit() {
      const audit = DATA.coverageAudit;
      if (!audit?.rows?.length) {
        $('coverageAudit').innerHTML = '<div class="status"><h3>待生成</h3><p class="small">运行 npm run coverage:audit 后可生成覆盖审计。</p></div>';
        return;
      }
      const visible = audit.rows
        .filter((row) => ['覆盖审计已补入', '建议补入主观察池', '低于630，补入安全观察池'].includes(row.status))
        .sort((a, b) => b.priority - a.priority || (b.minScore2025 || 0) - (a.minScore2025 || 0));
      if (!visible.length) {
        $('coverageAudit').innerHTML = '<div class="status"><h3>暂无新增</h3><p class="small">本轮审计未发现需要补入的学校。</p></div>';
        return;
      }
      const latestByKey = new Map((DATA.latestCheck?.schools || []).map((item) => [item.key, item]));
      $('coverageAudit').innerHTML = visible.map((row) => {
        const school = schoolMap.get(row.key) || schoolNameMap.get(row.name);
        const latest = latestByKey.get(row.key || school?.key);
        const entryUrl = schoolEntryUrl(school);
        const url = entryUrl || row.site || row.sourceUrl || '';
        const name = url ? '<a href="' + escapeHtml(url) + '" target="_blank" rel="noreferrer">' + escapeHtml(row.name) + '</a>' : escapeHtml(row.name);
        const signals = latest
          ? renderAdmissionSignals(latest) + renderConsultationSignals(latest)
          : '<p class="small"><strong>招生活动/官网动态：</strong>' + (url ? sourceLink(url, '打开招生入口') : '待补招生入口') + '；需人工查看招生章程、咨询会、直播、校园开放日和招生组行程。</p>';
        const source = row.sourceUrl ? '<p class="small"><strong>分数来源：</strong>' + sourceLink(row.sourceUrl, '打开2025院校分数来源') + '</p>' : '';
        return '<div class="status"><h3>' + name + '</h3><p><span class="tag ' + coverageStatusClass(row.status) + '">' + escapeHtml(row.status) + '</span> <span class="tag">' + escapeHtml(row.tierHint || school?.tier || '-') + '</span></p><p class="small">' + escapeHtml(row.city || row.province || school?.city || '') + '｜2025院校最低分：' + escapeHtml(row.minScore2025 ?? '-') + '</p><p class="small"><strong>可查方向：</strong>' + escapeHtml(row.tracks || '-') + '</p><p class="small">' + escapeHtml(row.reason || '目标专业分需继续复核。') + '</p>' + signals + source + '</div>';
      }).join('');
    }

    function renderPlanStatus() {
      const latestByKey = new Map((DATA.latestCheck?.schools || []).map((item) => [item.key, item]));
      const manualByKey = new Map(DATA.planStatus.statuses.map((item) => [item.schoolKey, item]));
      const rows = DATA.schools.schools
        .map((school) => schoolPlanPriority(school, manualByKey.get(school.key), latestByKey.get(school.key)))
        .sort((a, b) => b.priorityScore - a.priorityScore || a.school.name.localeCompare(b.school.name, 'zh-CN'));
      const groupOrder = ['核心候选', '重点备选', '扩展了解', '信息跟踪'];
      $('planStatus').innerHTML = groupOrder.map((group) => {
        const groupRows = rows.filter((row) => row.group === group);
        if (!groupRows.length) return '';
        return '<div class="status" style="grid-column:1/-1"><h3>' + group + '</h3><p class="small">按候选专业专家分、候选数量、学校层级和2026计划接口状态综合排序。</p></div>' + groupRows.map((row) => {
          const latest = row.latest;
          const years = latest?.years?.join('、') || '-';
          const displayStatus = latest ? planStatusText(latest.status) : (row.manualStatus?.status || '需人工复核');
          const cls = planStatusClass(latest?.status || row.manualStatus?.status);
          const candidateText = row.candidates.length
            ? row.candidates.slice(0, 3).map((item) => item.major + ' ' + (item.minScore ?? '-') + '分/专家' + item.expertScore).join('；')
            : '当前候选池暂无具体专业行，先作为学校信息跟踪。';
          const samples = latest?.sampleRows?.length ? '<p class="small"><strong>2026样例：</strong>' + escapeHtml(latest.sampleRows.slice(0, 2).map((item) => item.zymc || item.name || JSON.stringify(item)).join('；')) + '</p>' : '';
          const attempts = latest?.attemptedQueries?.length ? '<p class="small">已尝试查询组合：' + escapeHtml(latest.attemptedQueries.length) + ' 组</p>' : '';
          return '<div class="status"><h3>' + schoolLinkByKey(row.school.key, row.school.name) + '</h3><p><span class="tag ' + cls + '">' + escapeHtml(displayStatus) + '</span> <span class="tag">' + escapeHtml(row.school.tier || '-') + '</span></p><p class="small">' + escapeHtml(row.school.city || '') + '｜' + escapeHtml(row.school.role || '') + '</p><p class="small">' + escapeHtml(planStatusSummary(row)) + '</p><p class="small">接口年份：' + escapeHtml(years) + '；2026条目：' + escapeHtml(latest?.planRows ?? '-') + '；候选专业：' + escapeHtml(row.candidateCount) + '；最高专家分：' + escapeHtml(row.topScore || '-') + '</p><p class="small"><strong>候选参考：</strong>' + escapeHtml(candidateText) + '</p>' + renderAdmissionSignals(latest) + renderConsultationSignals(latest) + attempts + samples + '</div>';
        }).join('');
      }).join('');
    }

    function renderSyncStatus(message) {
      const latest = DATA.latestCheck;
      const generatedAt = latest?.generatedAt ? new Date(latest.generatedAt).toLocaleString('zh-CN') : '未知';
      const summary = latest?.summary ? '总数' + latest.summary.total + '，自动检查' + latest.summary.autoChecked + '，计划已上线' + latest.summary.available + '，官网有2026信息但计划接口未出' + (latest.summary.infoPublishedPlanApiNotReady || 0) + '，年份存在但空' + (latest.summary.yearPresentEmpty || 0) + '，计划未上线' + latest.summary.notPublished + '，需人工' + latest.summary.manualRequired + '，错误' + latest.summary.errors : '暂无摘要';
      const mode = location.protocol === 'file:' ? '当前是静态文件模式，按钮不能写回本地数据。' : '当前是本地服务模式，可点击按钮同步。';
      $('syncStatus').textContent = (message ? message + '\\n' : '') + mode + '\\n上次检查：' + generatedAt + '\\n检查摘要：' + summary + '\\n对比口径：2025专业录取基线保留，2026计划只作为计划状态和风险调整依据。';
      renderSyncSteps();
    }

    function elapsedText(startedAt) {
      if (!startedAt) return '';
      const seconds = Math.max(0, Math.round((Date.now() - new Date(startedAt).getTime()) / 1000));
      return seconds + '秒';
    }

    function renderSyncSteps(update) {
      const stepTotal = update?.stepTotal || syncState.steps.length;
      const stepIndex = update?.stepIndex || 0;
      const progress = stepTotal ? Math.round((stepIndex / stepTotal) * 100) : 0;
      $('syncProgressBar').style.width = progress + '%';
      $('syncSteps').innerHTML = syncState.steps.map((label, index) => {
        const number = index + 1;
        const cls = number < stepIndex || update?.completedSteps?.includes(label) ? 'done' : number === stepIndex ? 'current' : '';
        const dot = cls === 'done' ? '✓' : number;
        return '<div class="sync-step ' + cls + '"><span class="sync-dot">' + dot + '</span><span>' + escapeHtml(label) + '</span></div>';
      }).join('');
    }

    function setSyncButtons(running) {
      $('syncLatestData').disabled = running;
      $('syncLatestDataInline').disabled = running;
      $('syncLatestData').textContent = running ? '同步中...' : '同步最新数据';
      $('syncLatestDataInline').textContent = running ? '同步中...' : '同步最新数据';
    }

    async function pollSyncStatus() {
      try {
        const response = await fetch('/api/status');
        const status = await response.json();
        const update = status.currentUpdate;
        if (!update) {
          renderSyncStatus('更新状态暂未返回，请稍候。');
          return;
        }
        renderSyncSteps(update);
        const elapsed = elapsedText(update.startedAt);
        const completed = update.completedSteps?.length ? '\\n已完成：' + update.completedSteps.join('、') : '';
        $('syncStatus').textContent = '同步进度：' + (update.stepIndex || 0) + '/' + (update.stepTotal || syncState.steps.length) + '\\n当前步骤：' + (update.currentStep || '-') + '\\n状态：' + (update.message || '-') + '\\n已用时：' + elapsed + completed;
        if (status.updateInProgress) return;
        clearInterval(syncState.pollTimer);
        syncState.pollTimer = null;
        syncState.running = false;
        setSyncButtons(false);
        if (update.ok) {
          $('syncStatus').textContent += '\\n同步完成，1秒后自动刷新页面。';
          setTimeout(() => location.reload(), 1000);
        } else {
          $('syncStatus').textContent += '\\n同步失败：' + (update.message || '未知错误') + '\\n可改用命令行 npm run build 查看详细错误。';
        }
      } catch (error) {
        clearInterval(syncState.pollTimer);
        syncState.pollTimer = null;
        syncState.running = false;
        setSyncButtons(false);
        renderSyncStatus('无法读取更新进度：' + error.message);
      }
    }

    async function syncLatestData() {
      if (syncState.running) return;
      if (location.protocol === 'file:') {
        renderSyncStatus('无法在静态文件模式执行更新。请在命令行运行 npm run dashboard:serve，然后打开 http://127.0.0.1:4173/。');
        return;
      }
      syncState.running = true;
      syncState.startedAt = new Date().toISOString();
      setSyncButtons(true);
      renderSyncSteps({ stepIndex: 0, stepTotal: syncState.steps.length, completedSteps: [] });
      $('syncStatus').textContent = '同步任务已提交，正在等待本地服务启动更新...\\n已用时：0秒';
      try {
        const response = await fetch('/api/update', { method: 'POST' });
        const result = await response.json();
        if (!response.ok || !result.ok) {
          throw new Error(result?.lastUpdate?.message || result?.message || '同步启动失败');
        }
        $('syncStatus').textContent = '同步任务已启动，正在检查进度...';
        await pollSyncStatus();
        syncState.pollTimer = setInterval(pollSyncStatus, 1000);
      } catch (error) {
        renderSyncStatus('同步失败：' + error.message + '。可改用命令行 npm run build 查看详细错误。');
        syncState.running = false;
        setSyncButtons(false);
      }
    }

    function buildQuestions(item) {
      const questions = [];
      if (item.sourceLevel !== 'A') questions.push('把第三方分数替换为校方/考试院数据');
      if (!item.plan) questions.push('确认2026陕西物理类' + (item.admissionCategory || DATA.schools.defaultQuery?.category || '普通类') + '计划数');
      const courseProfile = matchCourseProfile(item);
      if (courseProfile?.sourceLevel !== 'A') questions.push('补学校培养方案/主干课程官方来源');
      questions.push('核招生章程：专业清/分数清/专业级差/调剂规则');
      const text = item.major + ' ' + (item.track || '');
      if ((item.riskTags || []).some((tag) => tag.includes('大类分流')) || /类|试验班|卓越|拔尖|未来技术|长空/.test(text)) {
        questions.push('确认入校后二次分流规则、目标专业名额和不可接受方向');
      }
      if (/测控|智能仪器|智能感知|生物医学|医学电子|飞行器制造|飞行技术|航海|轮机|消防|刑事|侦查/.test(text)) {
        questions.push('孩子近视约475/500度但矫正视力可接近1.5，核裸眼/矫正视力、镜片度数、色觉和不宜就读提示');
      }
      if (/中外合作|合作办学|高收费/.test(text)) {
        questions.push('中外合作/高收费：核分数优惠、总费用、毕业证/学位证、培养地点、保研就业和转专业限制');
      }
      if (/软件/.test(item.major)) questions.push('确认学费和校区');
      if (/医学电子|生物医学|医工/.test(item.major + item.track)) questions.push('确认培养是否偏工程及读研出口');
      if (/航空|航天|低空|飞行器/.test(item.major + item.track)) questions.push('确认课程强度、校区和行业出口');
      if (courseProfile?.admissionsQuestions?.length) questions.push(courseProfile.admissionsQuestions[0]);
      if (!questions.length) questions.push('核对招生章程中的校区、学费、体检、专业备注');
      return Array.from(new Set(questions)).slice(0, 8);
    }

    function renderQuestions(items) {
      const selected = items.slice(0, 10);
      $('questionList').innerHTML = selected.map((item) => {
        return '<div class="note"><strong>' + schoolLinkByKey(item.schoolKey, item.school) + '｜' + escapeHtml(item.major) + '</strong><ul>' + buildQuestions(item).map((q) => '<li>' + escapeHtml(q) + '</li>').join('') + '</ul></div>';
      }).join('');
    }

    function renderOutcomes() {
      const schoolKeys = new Set(filteredItems().slice(0, 20).map((item) => item.schoolKey));
      const schoolRows = (DATA.outcomeAudit?.schoolDataPlan || []).filter((item) => schoolKeys.has(item.schoolKey)).slice(0, 6);
      const trackRows = (DATA.outcomeAudit?.trackOutlooks || []).slice(0, 5);
      const schoolHtml = schoolRows.map((item) => {
        return '<div class="note"><strong>' + schoolLinkByKey(item.schoolKey, item.school) + '</strong><p class="small">保研友好：' + escapeHtml(item.postgradFriendliness) + '；就业平台：' + escapeHtml(item.employmentPlatform) + '</p><p class="small">' + escapeHtml(item.currentStatus) + '</p></div>';
      }).join('');
      const trackHtml = trackRows.map((item) => {
        return '<div class="note"><strong>' + escapeHtml(item.track) + '</strong><p class="small">' + escapeHtml(item.fiveToTenYearOutlook) + '</p><p class="small">读研价值：' + escapeHtml(item.postgradValue) + '；策略：' + escapeHtml(item.strategy) + '</p></div>';
      }).join('');
      $('outcomeList').innerHTML = (schoolHtml || '<div class="note">当前筛选项暂无学校升学就业审计。</div>') + trackHtml;
    }

    function setupTrackOptions() {
      const tracks = Array.from(new Set(DATA.baseline.items.map(evaluate).map((item) => item.matchedTrack))).sort();
      $('trackFilter').innerHTML = '<option value="">全部方向</option>' + tracks.map((track) => '<option value="' + escapeHtml(track) + '">' + escapeHtml(track) + '</option>').join('');
    }

    function bindControls() {
      $('toggleFilters').addEventListener('click', () => setFiltersOpen(!state.filtersOpen));
      $('closeFilters').addEventListener('click', () => setFiltersOpen(false));
      $('scoreInput').addEventListener('input', (event) => { state.score = Number(event.target.value || DATA.profile?.candidate?.actualScore || 662); render(); });
      $('rankInput').addEventListener('input', (event) => { state.rank = event.target.value; render(); });
      $('trackFilter').addEventListener('change', (event) => { state.track = event.target.value; render(); });
      $('bandFilter').addEventListener('change', (event) => { state.band = event.target.value; render(); });
      $('sourceFilter').addEventListener('change', (event) => { state.source = event.target.value; render(); });
      $('queryInput').addEventListener('input', (event) => { state.query = event.target.value; render(); });
      $('hideExcluded').addEventListener('change', (event) => { state.hideExcluded = event.target.checked; render(); });
      $('officialBoost').addEventListener('change', (event) => { state.officialBoost = event.target.checked; render(); });
      $('showSafety').addEventListener('change', (event) => { state.showSafety = event.target.checked; render(); });
      $('resetFilters').addEventListener('click', () => {
        state.tab = 'all';
        state.score = Number(DATA.profile?.candidate?.actualScore || 662);
        state.rank = '';
        state.track = '';
        state.band = '';
        state.source = '';
        state.query = '';
        state.hideExcluded = true;
        state.officialBoost = true;
        state.showSafety = true;
        $('scoreInput').value = DATA.profile?.candidate?.actualScore || 662;
        $('rankInput').value = DATA.profile?.candidate?.actualRank || '';
        $('trackFilter').value = '';
        $('bandFilter').value = '';
        $('sourceFilter').value = '';
        $('queryInput').value = '';
        $('hideExcluded').checked = true;
        $('officialBoost').checked = true;
        $('showSafety').checked = true;
        render();
      });
      $('syncLatestData').addEventListener('click', syncLatestData);
      $('syncLatestDataInline').addEventListener('click', syncLatestData);
      $('autoFillVolunteers').addEventListener('click', autoFillVolunteers);
      $('autoFillVolunteersInline').addEventListener('click', autoFillVolunteers);
      $('clearVolunteers').addEventListener('click', () => {
        volunteerState.items = [];
        renderVolunteers();
      });
      $('exportCsv').addEventListener('click', exportCsv);
      $('exportVolunteerCsv').addEventListener('click', exportVolunteerCsv);
      $('copySummary').addEventListener('click', copySummary);
      $('copyVolunteerSummary').addEventListener('click', copyVolunteerSummary);
      $('floatingScroll').addEventListener('scroll', (event) => {
        const pair = floatingScrollState.activePair;
        if (!pair || floatingScrollState.syncing) return;
        syncPairScroll(pair, event.target);
      });
      window.addEventListener('scroll', updateFloatingScrollbar, { passive: true });
      window.addEventListener('resize', updateFloatingScrollbar);
    }

    function exportCsv() {
      const items = filteredItems();
      const header = ['录取参考年份','录取参考省份','录取参考科类','录取参考类别','计划核验年份','计划核验省份','计划核验科类','计划核验类别','学校','城市','层次','专业名称','最低分','平均分','最高分','位次','2026计划','专家分','结论','方向','风险标签','来源'];
      const rows = items.map((item) => [item.admissionYear || DATA.baseline.year || '',item.admissionProvince || DATA.baseline.province || '',item.admissionSubject || DATA.baseline.subject || '',item.admissionCategory || inferAdmissionCategory(item),DATA.schools.defaultQuery?.year || '2026',DATA.schools.defaultQuery?.province || DATA.baseline.province || '',DATA.schools.defaultQuery?.branch || DATA.baseline.subject || '',item.admissionCategory || DATA.schools.defaultQuery?.category || '普通类',item.school,item.city,item.tier,item.major,item.minScore ?? '',item.avgScore ?? '',item.maxScore ?? '',item.rank ?? '',item.plan ?? '',item.expertScore,item.recommendation,item.matchedTrack,(item.riskTags || []).join('|'),item.sourceLevel]);
      const csv = [header, ...rows].map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(',')).join('\\n');
      const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'gkzy-candidates.csv';
      link.click();
      URL.revokeObjectURL(url);
    }

    function exportVolunteerCsv() {
      if (!volunteerState.items.length) autoFillVolunteers();
      const header = ['序号','梯度','录取参考年份','录取参考省份','录取参考科类','录取参考类别','计划核验年份','计划核验省份','计划核验科类','计划核验类别','院校','城市','层次','专业名称','最低分','平均分','最高分','位次','来源','匹配方向','待核事项','备注'];
      const rows = volunteerState.items.map(({ order, bucket, item }) => [
        order,
        bucket,
        item.admissionYear || DATA.baseline.year || '',
        item.admissionProvince || DATA.baseline.province || '',
        item.admissionSubject || DATA.baseline.subject || '',
        item.admissionCategory || inferAdmissionCategory(item),
        DATA.schools.defaultQuery?.year || '2026',
        DATA.schools.defaultQuery?.province || DATA.baseline.province || '',
        DATA.schools.defaultQuery?.branch || DATA.baseline.subject || '',
        item.admissionCategory || DATA.schools.defaultQuery?.category || '普通类',
        item.school,
        item.city,
        item.tier,
        item.major,
        item.minScore ?? '',
        item.avgScore ?? '',
        item.maxScore ?? '',
        item.rank ?? '',
        item.sourceLevel,
        item.matchedTrack,
        buildQuestions(item).join('|'),
        item.notes || item.matchReason || ''
      ]);
      const csv = [header, ...rows].map((row) => row.map((cell) => '"' + String(cell).replaceAll('"', '""') + '"').join(',')).join('\\n');
      const blob = new Blob(['\\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'gkzy-volunteer-draft.csv';
      link.click();
      URL.revokeObjectURL(url);
    }

    async function copySummary() {
      const items = filteredItems().slice(0, 8);
      const text = items.map((item, index) => (index + 1) + '. ' + item.school + '｜' + item.major + '｜' + item.minScore + '分｜专家分' + item.expertScore + '｜' + item.recommendation).join('\\n');
      try {
        await navigator.clipboard.writeText(text);
        alert('已复制当前前8项摘要');
      } catch {
        alert(text);
      }
    }

    async function copyVolunteerSummary() {
      if (!volunteerState.items.length) autoFillVolunteers();
      const text = volunteerState.items.map(({ order, bucket, item }) => {
        return order + '. [' + bucket + '] ' + item.school + '｜' + item.major + '｜' + (item.admissionProvince || DATA.baseline.province || '-') + (item.admissionYear || DATA.baseline.year || '-') + ' ' + (item.admissionSubject || DATA.baseline.subject || '-') + ' ' + (item.admissionCategory || '-') + ' ' + (item.minScore ?? '-') + '分｜' + item.sourceLevel + '源';
      }).join('\\n');
      try {
        await navigator.clipboard.writeText(text);
        alert('已复制模拟志愿草表');
      } catch {
        alert(text);
      }
    }

    function render() {
      const items = filteredItems();
      renderTabs(items);
      renderMetrics(items);
      renderTable(items);
      renderPaidOpportunityList(items);
      renderCoverageAudit();
      renderPlanStatus();
      renderSyncStatus();
      renderOutcomes();
      renderQuestions(items);
      renderVolunteers();
    }

    setupTrackOptions();
    bindControls();
    setFiltersOpen(false);
    render();
  </script>
</body>
</html>`;
}

async function main() {
  const [profile, schools, baseline, planStatus, latestCheck, expertRules, evaluation, courseAudit, outcomeAudit, planAdmit, coverageAudit] = await Promise.all([
    readJson("data/profile.json"),
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json"),
    readJson("data/plan-status-2026.json"),
    readJson("data/generated/latest-plan-check.json", null),
    readJson("data/expert-rules.json"),
    readJson("data/generated/candidate-evaluation.json", null),
    readJson("data/course-audit.json", null),
    readJson("data/outcome-audit.json", null),
    readJson("data/generated/plan-admit-reconciliation-2025.json", null),
    readJson("data/generated/coverage-audit-2025.json", null)
  ]);

  const target = path.join(rootDir, PAGE_FILES.dashboard);
  await writeFile(target, dashboardHtml({ profile, schools, baseline, planStatus, latestCheck, expertRules, evaluation, courseAudit, outcomeAudit, planAdmit, coverageAudit }), "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
