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

function link(url, label = url) {
  if (!url) return "-";
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function rows(items, mapper) {
  return items.map(mapper).join("\n");
}

function schoolEntryLinks(schoolRows) {
  return schoolRows
    .filter((item) => item.url)
    .map((item) => link(item.url, item.school))
    .join("、");
}

function buildSchoolRows(schools, statuses) {
  const statusByKey = new Map(statuses.map((item) => [item.schoolKey, item]));
  return schools.map((school) => {
    const status = statusByKey.get(school.key);
    const entryUrl = school.manualCheckUrl || school.queryApi?.listUrl || school.queryApi?.typeUrl || "";
    const action = status
      ? status.shaanxiPhysicsPlan
      : "尚未在本轮逐校核验2026陕西物理普通批分专业计划；先按2025基线入池，后续逐校核。";
    return {
      school: school.name,
      role: school.role,
      sourceLevel: school.sourceLevel,
      url: entryUrl,
      status: status?.status || "待复核",
      action,
      notes: school.notes || status?.impact || ""
    };
  });
}

function columnHelp(column) {
  const helps = {
    "梯度": "冲、冲稳、稳、保、安全池；出分后按真实位次重算。",
    "学校": "填学校全称，和招生计划目录一致。",
    "城市": "用于家庭权衡城市和本地资源。",
    "层次": "985、211、双一流、行业强校等。",
    "招生计划年份": "正式填报用2026计划；若学校系统仍停留2025，必须标未上线/待核。",
    "招生计划省份": "正式填报按陕西计划；不要用学校面向其他省份的计划数。",
    "招生计划科类": "正式目录中的科类，当前按陕西物理类；不要和选科要求混写。",
    "招生计划类别": "普通类、中外合作、国家专项、预科等必须分开；当前重点是普通类和中外合作。",
    "录取参考年份": "当前历史分数位次主要用2025；不要和2026计划数混用。",
    "录取参考省份": "历史分数位次按陕西物理类；外省分数线不能直接比较。",
    "录取参考科类": "历史分数位次按陕西物理类；历史理科/物理类口径变化要单独核。",
    "录取参考类别": "历史录取分必须和同类别比较；中外合作不能直接和普通类混算。",
    "院校专业组代码": "正式填报核心字段，必须照抄陕西2026招生计划目录。",
    "专业代码": "正式填报核心字段，必须照抄陕西2026招生计划目录。",
    "专业名称": "必须照抄陕西2026招生计划目录；大类、试验班、卓越班、拔尖班和中外合作名称不能简写，括号内容要完整保留。",
    "2026计划数": "正式风险测算核心字段；优先用陕西计划目录。",
    "2025计划数": "用于比较扩招/缩招；没有官方数据时标待核。",
    "计划变化": "计算2026计划数-2025计划数，并标注缩招/扩招比例。",
    "2025最低分": "只作历史参考，不直接按裸分套用。",
    "2025平均分": "比最低分更能反映专业真实热度；若平均分明显高于最低分，说明低分录取可能只是少数情况。",
    "2025最高分": "用于观察该专业录取分布上沿和热门程度；若学校未公开则标待核，不用最低分代替。",
    "2025最低位次": "和2026真实位次比较，作为冲稳保基础。",
    "2026真实位次差": "孩子2026位次 - 2025最低位次；负数代表孩子位次更靠前。",
    "校区": "主校区、分校区、前后两年变化必须写清。",
    "学费": "软件、中外合作、高收费项目要写总费用和后两年变化。",
    "选科要求": "陕西2026正式目录中的选科要求。",
    "是否中外合作/高收费": "单独标注，不和普通专业简单混排。",
    "是否大类分流": "写清入校后二次分流规则和目标专业名额是否明确。",
    "体检/视力/色觉限制": "结合孩子近视475/500且矫正视力接近1.5逐项核验。",
    "专业清/分数清/级差": "来自招生章程，影响专业志愿排序和调剂风险。",
    "是否服从调剂": "必须结合不可接受专业判断，不能机械勾选。",
    "招生办证据": "记录官网链接、电话时间、老师、答复原文和截图。",
    "最终建议": "填报、备选、放弃；写清理由。"
  };
  return helps[column] || "按陕西2026招生计划目录和学校章程填写。";
}

function handbookHtml({ profile, parentActionPlan, planStatus, schools, biomedTransition }) {
  const generatedAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  const schoolRows = buildSchoolRows(schools.schools, planStatus.statuses);
  const targetSchoolLinks = schoolEntryLinks(schoolRows);
  const coreLinks = [
    {
      name: "陕西招生考试信息网",
      url: "https://www.sneac.com/",
      use: "最终看陕西政策、招生计划、一分一段、成绩查询入口和志愿填报通知。"
    },
    {
      name: "陕西历年数据",
      url: "https://www.sneac.com/kszx/ptgk/lnsj.htm",
      use: "查历史一分一段、往年分数线；出分后用2026一分一段替换估分锚点。"
    },
    {
      name: "陕西2026招生实施办法",
      url: "https://www.sneac.com/info/1019/18713.htm",
      use: "核对陕西2026录取批次、志愿设置、投档录取规则。"
    },
    {
      name: "阳光高考志愿填报专题",
      url: "https://gaokao.chsi.com.cn/gkxx/zytb/",
      use: "查看教育部/阳光高考公开志愿填报规则和风险提示。"
    },
    {
      name: "阳光高考招生章程查询",
      url: "https://gaokao.chsi.com.cn/zsgs/zhangcheng/",
      use: "查招生章程，重点核体检、外语、单科、调档、专业录取规则。"
    },
    {
      name: "中国教育在线院校库",
      url: "https://www.gaokao.cn/",
      use: "第三方初筛专业分和学校资料；只作B源，最终要回官方核验。"
    }
  ];

  const beforeScoreDetailed = [
    {
      stage: "每天固定复核",
      action: "打开陕西招生考试信息网、目标校本科招生网，查是否发布2026招生计划、一分一段、咨询会通知。",
      output: "在家庭群更新一句话：今日是否有新计划；若有，记录链接和截图。",
      status: "立即执行"
    },
    {
      stage: "候选池维护",
      action: "按660、650、640、630、620五档准备候选。每档至少保留学校、专业、2025分/位次、风险备注。",
      output: "保留冲、稳、保和安全池，不因估分波动临时慌乱。",
      status: "已在项目中初步完成，仍需2026计划替换"
    },
    {
      stage: "联系学校",
      action: "优先联系目标校招生办，学校名已链接到对应招生入口。",
      actionHtml: `优先联系目标校招生办：${targetSchoolLinks || "目标校招生入口待补充"}。`,
      output: "建立“学校-电话/群/老师-答复-截图”证据表。",
      status: "需要家长人工执行"
    },
    {
      stage: "专业底线",
      action: "家庭先写死不可接受项：医学类、医工/医疗相关、国家专项、地方专项、强基计划、综合评价、师范、农林、纯文科财经法学、中外合作办学、合作办学、高收费和港校项目。",
      output: "后续填报时先排除不可接受专业，再谈学校层次。",
      status: "立即执行"
    },
    {
      stage: "工科底座",
      action: "把本科计算机、电子、自动化、测控、软件、智能制造等标记为“工科底座可迁移”。",
      output: "生物兴趣只作背景保留，本科主方案不纳入医学、医工、医疗、药学、护理等方向。",
      status: "已固化，后续逐专业标记"
    }
  ];

  const afterScoreDetailed = [
    {
      time: "出分当天0-2小时",
      action: "记录总分、单科、2026陕西物理类省位次；不要用裸分直接套2025。",
      output: "真实位次成为唯一主锚点。"
    },
    {
      time: "出分当天2-6小时",
      action: "用真实位次重跑候选池，把明显过高、明显过低、可冲、稳、保重新分组。",
      output: "生成第一版真实位次志愿草表。"
    },
    {
      time: "出分后24小时内",
      action: "按“2026可填报表”模板录入院校专业组、专业代码、计划数、校区、学费、备注和来源证据。",
      output: "把2025基线表替换成带专业组代码和计划变化的2026可填报表。"
    },
    {
      time: "出分后24-48小时",
      action: "集中电话/官方群问招生办，重点问计划数、大类分流、转专业、调剂、校区、收费、体检。",
      output: "每个候选至少有一条官方或准官方证据。"
    },
    {
      time: "提交前最后一天",
      action: "逐项检查是否有不可接受调剂、是否混入专项/中外合作/高收费、是否把第三方数据当最终依据。",
      output: "最终志愿表和家庭确认版。"
    }
  ];

  const evidenceColumns = [
    "学校",
    "咨询入口",
    "咨询时间",
    "咨询对象",
    "问题",
    "答复原文",
    "截图/链接",
    "是否影响志愿顺序"
  ];

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>家长出分前后行动手册</title>
  <style>
    :root {
      --bg: #f6f7f9;
      --panel: #ffffff;
      --ink: #172033;
      --muted: #667085;
      --line: #d9dee7;
      --blue: #2459a6;
      --green: #147a4a;
      --amber: #a85b00;
      --red: #b42318;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif;
      line-height: 1.56;
    }
    header {
      background: #fff;
      border-bottom: 1px solid var(--line);
    }
    .wrap {
      max-width: 1240px;
      margin: 0 auto;
      padding: 22px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 18px 0 8px; font-size: 16px; letter-spacing: 0; }
    p { margin: 0 0 10px; }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    section {
      margin: 16px 0;
      padding: 18px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      background: #fff;
    }
    th, td {
      padding: 9px 8px;
      border-bottom: 1px solid var(--line);
      text-align: left;
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    th {
      background: #f8fafc;
      color: #344054;
      font-weight: 800;
    }
    tr:last-child td { border-bottom: 0; }
    .grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .metric {
      min-height: 84px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
    }
    .metric strong { display: block; font-size: 22px; margin-bottom: 4px; }
    .note {
      padding: 12px;
      border-left: 4px solid var(--blue);
      border-radius: 6px;
      background: #f1f6ff;
    }
    .tag {
      display: inline-flex;
      min-height: 22px;
      align-items: center;
      padding: 2px 7px;
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
    .subtle { color: var(--muted); }
    .print {
      display: inline-flex;
      min-height: 36px;
      align-items: center;
      padding: 7px 11px;
      border: 1px solid var(--blue);
      border-radius: 6px;
      background: var(--blue);
      color: #fff;
      cursor: pointer;
      font: inherit;
    }
    ul { margin: 8px 0 0; padding-left: 20px; }
    @media print {
      body { background: #fff; }
      .print { display: none; }
      section { break-inside: avoid; }
      a { color: #172033; text-decoration: none; }
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
      .wrap { padding: 14px; }
      table { font-size: 13px; }
      th, td { padding: 7px 5px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>家长出分前后行动手册</h1>
      <p class="subtle">陕西物理类｜${escapeHtml(profile.candidate.estimatedScoreRange)} 预估区间｜生成时间：${escapeHtml(generatedAt)}</p>
      <button class="print" onclick="window.print()">打印/另存PDF</button>
      <div class="grid" style="margin-top:16px">
        <div class="metric"><strong>${escapeHtml(profile.candidate.estimatedScoreRange)}</strong><span class="subtle">当前估分</span></div>
        <div class="metric"><strong>${escapeHtml(profile.candidate.lowerBoundForRiskControl)}+</strong><span class="subtle">风险下探线</span></div>
        <div class="metric"><strong>${escapeHtml(schools.schools.length)}</strong><span class="subtle">已入池学校</span></div>
        <div class="metric"><strong>${escapeHtml(planStatus.statuses.length)}</strong><span class="subtle">计划状态项</span></div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section>
      <h2>当前总判断</h2>
      <p class="note">截至 ${escapeHtml(planStatus.asOf)}，最关键的“2026陕西物理类普通批分专业计划数”尚未完成逐校核验。现阶段家长工作的重点是：先把官方入口、学校入口、问询证据和不可接受底线准备好；出分后用真实省位次和2026计划数快速替换2025基线。</p>
    </section>

    <section>
      <h2>一、核心官方入口</h2>
      <table>
        <thead><tr><th>入口</th><th>链接</th><th>用途</th></tr></thead>
        <tbody>
          ${rows(coreLinks, (item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${link(item.url)}</td><td>${escapeHtml(item.use)}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>二、出分前可立即做的工作</h2>
      <table>
        <thead><tr><th>阶段</th><th>具体动作</th><th>产出结果</th><th>状态</th></tr></thead>
        <tbody>
          ${rows(beforeScoreDetailed, (item) => `<tr><td><strong>${escapeHtml(item.stage)}</strong></td><td>${item.actionHtml || escapeHtml(item.action)}</td><td>${escapeHtml(item.output)}</td><td><span class="tag ${item.status.includes("立即") ? "good" : "warn"}">${escapeHtml(item.status)}</span></td></tr>`)}
        </tbody>
      </table>
      <h3>原始任务清单</h3>
      <table>
        <thead><tr><th>任务</th><th>要点</th></tr></thead>
        <tbody>
          ${rows(parentActionPlan.beforeScore, (item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.details)}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>三、出分后时间线</h2>
      <table>
        <thead><tr><th>时间</th><th>具体动作</th><th>产出结果</th></tr></thead>
        <tbody>
          ${rows(afterScoreDetailed, (item) => `<tr><td><strong>${escapeHtml(item.time)}</strong></td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.output)}</td></tr>`)}
        </tbody>
      </table>
      <h3>原始任务清单</h3>
      <table>
        <thead><tr><th>任务</th><th>要点</th></tr></thead>
        <tbody>
          ${rows(parentActionPlan.afterScore, (item) => `<tr><td>${escapeHtml(item.task)}</td><td>${escapeHtml(item.details)}</td></tr>`)}
        </tbody>
      </table>
      <h3>出分后24小时内：具体操作</h3>
      <table>
        <thead><tr><th>步骤</th><th>动作</th><th>产出</th></tr></thead>
        <tbody>
          ${rows(parentActionPlan.first24HoursWorkflow || [], (item) => `<tr><td><strong>${escapeHtml(item.step)}</strong></td><td>${escapeHtml(item.action)}</td><td>${escapeHtml(item.output)}</td></tr>`)}
        </tbody>
      </table>
      <h3>2026可填报表字段模板</h3>
      <p class="note">这张表是出分后真正用于排序的工作表。2025表只保留最低分、平均分、最高分和位次作参照，正式填报必须以2026院校专业组、专业代码和计划数为准。</p>
      <table>
        <thead><tr><th>字段</th><th>填写说明</th></tr></thead>
        <tbody>
          ${rows(parentActionPlan.fillablePlanColumns2026 || [], (column) => `<tr><td>${escapeHtml(column)}</td><td>${escapeHtml(columnHelp(column))}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>四、目标校入口和当前状态</h2>
      <p class="note">下表中的“状态”只说明本项目当前掌握的信息，不等于最终官方结果。出分后要逐校回官网、招生章程、陕西计划汇编复核。</p>
      <table>
        <thead><tr><th>学校</th><th>角色</th><th>入口</th><th>当前状态</th><th>下一步</th></tr></thead>
        <tbody>
          ${rows(schoolRows, (item) => `<tr><td><strong>${link(item.url, item.school)}</strong><br><span class="subtle">源：${escapeHtml(item.sourceLevel)}</span></td><td>${escapeHtml(item.role)}</td><td>${link(item.url, "招生入口")}</td><td><span class="tag warn">${escapeHtml(item.status)}</span><br>${escapeHtml(item.notes)}</td><td>${escapeHtml(item.action)}</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>五、招生办问询模板</h2>
      <p class="note">电话、官方群、直播间都要记录证据。不要只问“我这个分能不能上”，要问能影响志愿顺序的客观问题。</p>
      <table>
        <thead><tr><th>优先级</th><th>问题</th><th>为什么问</th></tr></thead>
        <tbody>
          ${rows(parentActionPlan.questionBank, (question, index) => `<tr><td>${index < 5 ? '<span class="tag good">必问</span>' : '<span class="tag">可问</span>'}</td><td>${escapeHtml(question)}</td><td>${escapeHtml(index < 5 ? "直接影响能否填、怎么排序、是否接受调剂。" : "用于判断长期培养和专业适配。")}</td></tr>`)}
          ${rows(biomedTransition?.questionsForAdmissions || [], (question) => `<tr><td><span class="tag">医工</span></td><td>${escapeHtml(question)}</td><td>用于判断本科理工底座是否能衔接研究生生物医药/医工交叉。</td></tr>`)}
        </tbody>
      </table>
    </section>

    <section>
      <h2>六、证据记录表模板</h2>
      <table>
        <thead><tr>${evidenceColumns.map((item) => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead>
        <tbody>
          <tr>${evidenceColumns.map(() => "<td>&nbsp;</td>").join("")}</tr>
          <tr>${evidenceColumns.map(() => "<td>&nbsp;</td>").join("")}</tr>
          <tr>${evidenceColumns.map(() => "<td>&nbsp;</td>").join("")}</tr>
        </tbody>
      </table>
    </section>

    <section>
      <h2>七、信息不足项和下一步计划</h2>
      <table>
        <thead><tr><th>信息不足项</th><th>为什么现在不能定</th><th>下一步动作</th></tr></thead>
        <tbody>
          <tr><td>2026陕西物理普通批分专业计划数</td><td>大多数学校当前尚未在本项目中核到可直接用于测算的2026陕西计划。</td><td>每日查陕西招生考试信息网、学校本科招生网；计划发布后录入专业组、专业、计划数。</td></tr>
          <tr><td>2026真实省位次</td><td>估分不能替代省位次，数学难度和个体发挥会改变裸分含义。</td><td>出分当天用2026一分一段表替换所有630/640/650/660历史锚点。</td></tr>
          <tr><td>大类分流和转专业</td><td>同名试验班、工科大类在不同学校分流差异很大。</td><td>逐校问招生办，要求给出章程/培养方案/学院说明链接。</td></tr>
          <tr><td>校区、学费、毕业证、体检限制</td><td>软件、威海/沙河/天目湖/江阴等校区，以及色觉限制都会影响接受度。</td><td>最终志愿表每一项单独标注，不和普通主校区专业混排。</td></tr>
          <tr><td>就业和升学质量</td><td>第三方介绍不等于学院真实出口。</td><td>查学校就业质量报告、就业信息网、学院官网；优先找学院口径毕业去向。</td></tr>
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [profile, parentActionPlan, planStatus, schools, biomedTransition] = await Promise.all([
    readJson("data/profile.json"),
    readJson("data/parent-action-plan.json"),
    readJson("data/plan-status-2026.json"),
    readJson("data/schools.json"),
    readJson("data/biomed-transition-routes.json", null)
  ]);

  const html = handbookHtml({ profile, parentActionPlan, planStatus, schools, biomedTransition });
  const target = path.join(rootDir, PAGE_FILES.parentHandbook);
  await writeFile(target, html, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
