import { mkdir, readFile, writeFile } from "node:fs/promises";
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

function formatNumber(value) {
  if (value === null || value === undefined || value === "") return "-";
  return Number(value).toLocaleString("zh-CN");
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

function statusFor(row) {
  if (row.plan2025 !== null && row.admitted2025 !== null) {
    if (row.delta === 0) return "计划与实录一致";
    return row.delta > 0 ? "实录多于计划，需核追加/同分/调剂" : "实录少于计划，需核退档/专业调整";
  }
  if (row.plan2025 !== null) return "计划已入库，实录待核";
  return "计划和实录均待核";
}

function nextActionFor(row, school) {
  if (row.plan2025 !== null && row.admitted2025 !== null) return "保留来源截图；最终填报前复核2026计划变化。";
  if (row.plan2025 !== null) return "优先查该校历年录取查询是否返回“录取人数/实际录取人数”；若无，只把计划数用于稳定性判断。";
  if (school?.manualCheckUrl) return `打开学校招生网复核2025陕西物理普通批计划和录取人数：${school.manualCheckUrl}`;
  return "回陕西招生计划汇编、学校本科招生网或招生办电话复核。";
}

function buildRows(baseline, schools) {
  const schoolByKey = new Map(schools.schools.map((school) => [school.key, school]));
  return baseline.items.map((item, index) => {
    const admitted2025 = item.admitted2025 ?? item.actualAdmitted2025 ?? item.admitted ?? item.actualAdmitted ?? null;
    const plan2025 = item.plan ?? null;
    const delta = plan2025 !== null && admitted2025 !== null ? Number(admitted2025) - Number(plan2025) : null;
    const school = schoolByKey.get(item.schoolKey);
    const row = {
      id: index + 1,
      schoolKey: item.schoolKey,
      school: item.school,
      major: item.major,
      majorName: item.major,
      score2025: item.minScore ?? item.score ?? null,
      avgScore2025: item.avgScore ?? null,
      maxScore2025: item.maxScore ?? null,
      rank2025: item.rank ?? null,
      plan2025,
      admitted2025,
      delta,
      sourceLevel: item.sourceLevel,
      sourceType: item.sourceLevel === "A" ? "校方/官方查询口径" : "第三方初筛，待官方替换",
      status: "",
      nextAction: "",
      sourceUrl: school?.manualCheckUrl || school?.queryApi?.listUrl || ""
    };
    row.status = statusFor(row);
    row.nextAction = nextActionFor(row, school);
    return row;
  });
}

function summarize(rows) {
  const planKnown = rows.filter((row) => row.plan2025 !== null).length;
  const admittedKnown = rows.filter((row) => row.admitted2025 !== null).length;
  return {
    total: rows.length,
    planKnown,
    planMissing: rows.length - planKnown,
    admittedKnown,
    admittedMissing: rows.length - admittedKnown,
    bothKnown: rows.filter((row) => row.plan2025 !== null && row.admitted2025 !== null).length,
    officialPlanKnown: rows.filter((row) => row.sourceLevel === "A" && row.plan2025 !== null).length
  };
}

function html({ audit, schools }) {
  const rows = audit.rows;
  const summary = audit.summary;
  const schoolLink = createSchoolLinker(schools);
  const sourceLinks = [
    { name: "陕西招生考试信息网", url: "https://www.sneac.com/", use: "最终关注陕西政策、计划汇编、志愿填报、录取查询入口。" },
    { name: "教育部阳光高考招生章程", url: "https://gaokao.chsi.com.cn/zsgs/zhangcheng/", use: "核招生章程、录取规则、专业安排和体检限制。" },
    { name: "西安交通大学招生数据查询", url: "https://zswxxcx.xjtu.edu.cn/public/zsdata/lqxx/", use: "本项目已用作A源之一，页面需启用JavaScript。" },
    { name: "西安电子科技大学招生数据查询", url: "https://zsxc.xidian.edu.cn/auth/zsdata/lqxx/", use: "本项目已用作A源之一，页面需启用JavaScript。" }
  ];
  const schoolLinks = schools.schools
    .filter((school) => school.manualCheckUrl || school.queryApi)
    .map((school) => ({
      school: school.name,
      url: school.manualCheckUrl || school.queryApi?.listUrl,
      level: school.sourceLevel,
      note: school.notes || school.role || ""
    }));

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>2025计划与实际录取人数审计</title>
  <style>
    :root {
      --bg: #f6f7f9;
      --panel: #fff;
      --ink: #172033;
      --muted: #667085;
      --line: #d8dee8;
      --blue: #1f5aa6;
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
      line-height: 1.55;
    }
    header {
      background: #fff;
      border-bottom: 1px solid var(--line);
    }
    .wrap {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: 0; }
    h2 { margin: 0 0 12px; font-size: 20px; letter-spacing: 0; }
    h3 { margin: 16px 0 8px; font-size: 16px; letter-spacing: 0; }
    p { margin: 0 0 10px; }
    section {
      margin: 18px 0;
      padding: 18px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--panel);
    }
    .subtle { color: var(--muted); }
    .metrics {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 10px;
      margin-top: 18px;
    }
    .metric {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: #fff;
      padding: 12px;
      min-height: 84px;
    }
    .metric strong { display: block; font-size: 24px; }
    .note {
      padding: 12px;
      border-left: 4px solid var(--blue);
      background: #f1f6ff;
      border-radius: 6px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
      table-layout: fixed;
    }
    th, td {
      padding: 9px 8px;
      border-bottom: 1px solid var(--line);
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
    a { color: var(--blue); }
    .tag {
      display: inline-flex;
      align-items: center;
      min-height: 22px;
      padding: 2px 7px;
      border-radius: 999px;
      background: #eef2f7;
      color: #344054;
      font-size: 12px;
      font-weight: 800;
      white-space: normal;
    }
    .tag.good { background: #e8f5ee; color: var(--green); }
    .tag.warn { background: #fff4e5; color: var(--amber); }
    .tag.bad { background: #fee4e2; color: var(--red); }
    .grid-two {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      gap: 14px;
    }
    @media (max-width: 980px) {
      .metrics, .grid-two { grid-template-columns: 1fr; }
      .wrap { padding: 16px; }
      table { font-size: 13px; }
    }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>2025计划与实际录取人数审计</h1>
      <p class="subtle">陕西物理类候选池｜生成时间：${escapeHtml(new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</p>
      <div class="metrics">
        <div class="metric"><strong>${summary.total}</strong><span class="subtle">候选专业项</span></div>
        <div class="metric"><strong>${summary.planKnown}</strong><span class="subtle">已有2025计划数</span></div>
        <div class="metric"><strong>${summary.planMissing}</strong><span class="subtle">计划待核</span></div>
        <div class="metric"><strong>${summary.admittedKnown}</strong><span class="subtle">已有实录人数</span></div>
        <div class="metric"><strong>${summary.admittedMissing}</strong><span class="subtle">实录待核</span></div>
        <div class="metric"><strong>${summary.officialPlanKnown}</strong><span class="subtle">A源计划数</span></div>
      </div>
    </div>
  </header>

  <main class="wrap">
    <section>
      <h2>结论口径</h2>
      <p class="note">计划招生人数通常能从省级招生计划、学校分省分专业计划或学校招生查询系统获取；“最后实际录取人数”不是所有学校都会按省份+科类+专业公开。当前项目不能把计划数当作实录人数，后续必须逐校标记来源和证据。</p>
      <div class="grid-two">
        <div>
          <h3>哪些数据可自动化</h3>
          <table>
            <thead><tr><th>字段</th><th>可得性</th><th>用途</th></tr></thead>
            <tbody>
              <tr><td>2025分省分专业计划数</td><td><span class="tag good">多数可得</span></td><td>判断大小年风险、小计划波动和2026扩招/缩招。</td></tr>
              <tr><td>2025最低分/平均分/最高分/最低位次</td><td><span class="tag good">部分可得</span></td><td>最低分建立冲稳保基线，平均分观察真实热度，最高分观察分布上沿。</td></tr>
              <tr><td>2025实际录取人数</td><td><span class="tag warn">部分可得</span></td><td>用于核计划是否变化、是否存在追加计划或录取异常。</td></tr>
              <tr><td>专业组代码/专业代码</td><td><span class="tag warn">等2026计划</span></td><td>正式志愿表必需字段。</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h3>为什么不能默认实录=计划</h3>
          <table>
            <thead><tr><th>原因</th><th>影响</th></tr></thead>
            <tbody>
              <tr><td>学校预留计划、追加计划</td><td>实录可能多于原计划。</td></tr>
              <tr><td>同分投档、调剂、退档</td><td>专业实录人数可能与计划数有小幅偏差。</td></tr>
              <tr><td>大类招生和入校分流</td><td>录取专业类人数不等于未来目标专业人数。</td></tr>
              <tr><td>第三方页面字段不完整</td><td>只给最低分/位次时，不能反推出最高分、平均分或录取人数。</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <section>
      <h2>逐专业审计表</h2>
      <table>
        <thead>
          <tr>
            <th style="width:48px">序</th>
            <th style="width:128px">学校</th>
            <th>专业名称</th>
            <th style="width:72px">最低分</th>
            <th style="width:72px">平均分</th>
            <th style="width:72px">最高分</th>
            <th style="width:88px">位次</th>
            <th style="width:80px">计划</th>
            <th style="width:80px">实录</th>
            <th style="width:80px">差额</th>
            <th style="width:130px">状态</th>
            <th style="width:96px">来源</th>
            <th>下一步</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => {
            const statusClassName = row.admitted2025 !== null ? "good" : row.plan2025 !== null ? "warn" : "bad";
            return `<tr>
              <td>${row.id}</td>
              <td><strong>${schoolLink(row.schoolKey, row.school)}</strong></td>
              <td>${escapeHtml(row.major)}</td>
              <td>${escapeHtml(row.score2025 ?? "-")}</td>
              <td>${escapeHtml(row.avgScore2025 ?? "-")}</td>
              <td>${escapeHtml(row.maxScore2025 ?? "-")}</td>
              <td>${formatNumber(row.rank2025)}</td>
              <td>${formatNumber(row.plan2025)}</td>
              <td>${formatNumber(row.admitted2025)}</td>
              <td>${formatNumber(row.delta)}</td>
              <td><span class="tag ${statusClassName}">${escapeHtml(row.status)}</span></td>
              <td>${escapeHtml(row.sourceLevel)}<br><span class="subtle">${escapeHtml(row.sourceType)}</span></td>
              <td>${escapeHtml(row.nextAction)}</td>
            </tr>`;
          }).join("\n")}
        </tbody>
      </table>
    </section>

    <section>
      <h2>官方入口和复核链接</h2>
      <h3>通用入口</h3>
      <table>
        <thead><tr><th>入口</th><th>用途</th><th>链接</th></tr></thead>
        <tbody>
          ${sourceLinks.map((item) => `<tr><td><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.name)}</a></td><td>${escapeHtml(item.use)}</td><td><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></td></tr>`).join("\n")}
        </tbody>
      </table>
      <h3>学校入口</h3>
      <table>
        <thead><tr><th>学校</th><th>级别</th><th>入口</th><th>备注</th></tr></thead>
        <tbody>
          ${schoolLinks.map((item) => `<tr><td><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.school)}</a></td><td>${escapeHtml(item.level)}</td><td><a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(item.url)}</a></td><td>${escapeHtml(item.note)}</td></tr>`).join("\n")}
        </tbody>
      </table>
    </section>

    <section>
      <h2>后续落地规则</h2>
      <ul>
        <li>对最终志愿候选池，至少要补齐：2025计划数、2026计划数、2025最低分/平均分/最高分/位次、来源链接、招生章程风险。</li>
        <li>如果学校公开2025实际录取人数，就录入实录人数并计算差额；如果不公开，明确标为“实录待核”，不做猜测。</li>
        <li>计划数小于5、首次招生、名称变化、大类拆分或合并的专业，风险等级上调。</li>
        <li>2026计划数相比2025缩招20%以上，上调风险；扩招20%以上只小幅降低风险，仍以真实位次为核心。</li>
      </ul>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [baseline, schools] = await Promise.all([
    readJson("data/admission-baseline-2025.json"),
    readJson("data/schools.json")
  ]);
  const rows = buildRows(baseline, schools);
  const audit = {
    generatedAt: new Date().toISOString(),
    province: baseline.province,
    subject: baseline.subject,
    year: baseline.year,
    methodology: [
      "计划招生人数与实际录取人数分开管理。",
      "计划数来自现有2025专业录取基线中的plan字段；实录人数只接受官方或明确来源字段，不从计划数推断。",
      "B源候选项必须回学校官网、陕西招生计划汇编或招生办复核。"
    ],
    summary: summarize(rows),
    rows
  };

  const generatedDir = path.join(rootDir, "data", "generated");
  await mkdir(generatedDir, { recursive: true });
  await writeFile(path.join(generatedDir, "plan-admit-reconciliation-2025.json"), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  await writeFile(path.join(rootDir, PAGE_FILES.planAdmitAudit), html({ audit, schools }), "utf8");
  console.log("Wrote data/generated/plan-admit-reconciliation-2025.json");
  console.log(`Wrote ${PAGE_FILES.planAdmitAudit}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
