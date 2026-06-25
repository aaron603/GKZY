import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const targetScore = 662;
const targetRank = 1558;
const nonOrdinaryPattern = /中外合作|中外合作办学|合作办学|国家专项|地方专项|高校专项|专项|强基|强基计划|卓越优才|预科|高收费|港校|香港中文|港中深|内地与港澳台|综合评价/;
const medicalCategoryPattern = /医学|医工|医疗|临床|口腔|基础医学|预防医学|法医学|护理学?|药学|中药学|临床药学|医学影像学|医学影像技术|医学检验技术|麻醉学|儿科学|精神医学|眼视光医学|放射医学|公共卫生|卫生检验|中医学|针灸推拿|中西医临床|康复治疗|助产/;
const focusPattern = /计算机|软件|人工智能|智能|电子|通信|信息|集成电路|微电子|自动化|电气|机器人|仪器|低空|航空|航天|无人|网安|网络安全|数据|智能制造|光电|测控|具身|未来技术|强工科/;
const strictMainExcludedSchoolKeys = new Set(["chd", "nwu"]);

async function readJson(relativePath, fallback = null) {
  try {
    return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
  } catch {
    return fallback;
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

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isOrdinary(item) {
  const text = [item.school, item.major, item.track, item.admissionCategory, item.notes].filter(Boolean).join(" ");
  if (strictMainExcludedSchoolKeys.has(item.schoolKey)) return false;
  if (item.admissionCategory === "院校最低分覆盖审计") return false;
  if (item.schoolKey === "nwpu" && item.major === "软件工程") return false;
  return !nonOrdinaryPattern.test(text) && !medicalCategoryPattern.test(text);
}

function isTargetTier(item, school) {
  const tier = [school?.tier, item.tier].filter(Boolean).join(" ");
  return /985|211/.test(tier);
}

function gradient(item) {
  const score = number(item.minScore ?? item.score);
  if (score === null) return "待核";
  const delta = targetScore - score;
  if (delta < 0) return "冲";
  if (delta <= 2) return "冲稳";
  if (delta <= 10) return "稳";
  if (delta <= 25) return "保";
  return "安全";
}

function gradientOrder(label) {
  return { "冲": 1, "冲稳": 2, "稳": 3, "保": 4, "安全": 5, "待核": 6 }[label] || 9;
}

function compact(value) {
  return String(value ?? "").replace(/[（）()【】\[\]\s·,，/、-]/g, "").toLowerCase();
}

function findPlanRow(latestCheck, item) {
  const school = (latestCheck?.schools || []).find((entry) => entry.key === item.schoolKey);
  if (!school?.rows?.length) return null;
  const major = compact(item.major);
  return school.rows.find((row) => {
    const planMajor = compact(row.zymc || row.recruitmentMajorName || "");
    return planMajor && (major.includes(planMajor) || planMajor.includes(major.slice(0, Math.min(major.length, 8))));
  }) || null;
}

function planStatus(latestCheck, item) {
  const school = (latestCheck?.schools || []).find((entry) => entry.key === item.schoolKey);
  if (!school) return "2026计划待核";
  const row = findPlanRow(latestCheck, item);
  if (row) {
    const count = row.jhrs ?? row.recruitmentStudentsNumber ?? "人数待核";
    const subject = row.xkkm || row.xkyq || "";
    return `${count}人${subject ? `｜${subject}` : ""}`;
  }
  if (school.rows?.length) return `已取${school.rows.length}条，专业待匹配`;
  return ordinaryOnlyText(school.statusText || "官网/计划目录人工核对");
}

function planLabel(item) {
  if (!item.plan) return "-";
  return item.plan;
}

function scoreValue(value, missingLabel = "-") {
  return value === null || value === undefined || value === "" ? missingLabel : value;
}

function schoolLink(item, school) {
  const url = school?.manualCheckUrl || item.schoolUrl || "";
  const name = escapeHtml(item.school);
  return url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${name}</a>` : name;
}

function focusSchoolRank(profile, schoolKey) {
  const focusSchools = profile?.familyPreferences?.focusSchools || [];
  const index = focusSchools.findIndex((school) => school.schoolKey === schoolKey);
  return index === -1 ? 999 : index;
}

function focusSchoolLabel(profile, schoolKey) {
  const focusSchools = profile?.familyPreferences?.focusSchools || [];
  const focus = focusSchools.find((school) => school.schoolKey === schoolKey);
  return focus ? `重点${focus.priority}` : "";
}

function focusSummary(schoolKey) {
  if (schoolKey === "hit") return "本部普通批平台最强，但2025陕西物理普通类最低约679，高于662约17分；只作极高冲刺和招生办重点咨询，本轮只按普通批口径判断。";
  if (schoolKey === "xjtu") return "本地C9强工科，662分段最现实的重点冲刺对象；优先核软件工程、智能感知与仪器、智慧能源、智能制造、自动化和电气信息类的计划数、分流、调剂。";
  if (schoolKey === "hitwh") return "威海校区仍是重点关注对象；带卓越优才字样条目本版先屏蔽，需向招生办确认普通批可报后再单独加回。";
  if (schoolKey === "hitsz") return "深圳校区平台和城市资源强，但当前贴线线索主要来自卓越优才；本版先从普通类主方案屏蔽，确认普通批可报后再加回。";
  return "按家庭重点院校顺序单独复核。";
}

function buildSelection(evaluation, schools, latestCheck, profile) {
  const schoolByKey = new Map((schools.schools || []).map((school) => [school.key, school]));
  return (evaluation.items || [])
    .filter(isOrdinary)
    .filter((item) => isTargetTier(item, schoolByKey.get(item.schoolKey)))
    .filter((item) => focusPattern.test([item.major, item.track, item.matchedTrack].filter(Boolean).join(" ")))
    .map((item) => {
      const school = schoolByKey.get(item.schoolKey);
      const grad = gradient(item);
      return {
        ...item,
        schoolInfo: school,
        gradient: grad,
        plan2026: planStatus(latestCheck, item),
        focusRank: focusSchoolRank(profile, item.schoolKey),
        focusLabel: focusSchoolLabel(profile, item.schoolKey)
      };
    })
    .sort((a, b) =>
      gradientOrder(a.gradient) - gradientOrder(b.gradient) ||
      a.focusRank - b.focusRank ||
      (b.expertScore || 0) - (a.expertScore || 0) ||
      (b.minScore || 0) - (a.minScore || 0)
    );
}

function groupedRows(items) {
  return ["冲", "冲稳", "稳", "保", "安全", "待核"].map((label) => ({
    label,
    rows: items.filter((item) => item.gradient === label)
  })).filter((group) => group.rows.length);
}

function buildDraftHtml({ profile, selection }) {
  const groups = groupedRows(selection);
  const focusSchools = profile.familyPreferences?.focusSchools || [];
  const focusGroups = focusSchools.map((focus) => ({
    focus,
    rows: selection.filter((item) => item.schoolKey === focus.schoolKey).slice(0, 6)
  }));
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>普通类志愿草表与梯度方案</title>
  <style>
    :root { --bg:#f6f7f9; --panel:#fff; --ink:#18202a; --muted:#667085; --line:#d9dee7; --blue:#2459a6; --green:#147a4a; --amber:#a85b00; }
    * { box-sizing:border-box; }
    body { margin:0; background:var(--bg); color:var(--ink); font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.55; }
    header { background:#fff; border-bottom:1px solid var(--line); }
    .wrap { max-width:none; margin:0 auto; padding:16px 18px; }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:20px; letter-spacing:0; }
    h3 { margin:18px 0 8px; font-size:16px; letter-spacing:0; }
    section { margin:18px 0; padding:18px; background:var(--panel); border:1px solid var(--line); border-radius:8px; }
    table { width:100%; border-collapse:collapse; font-size:13px; background:#fff; }
    th, td { padding:7px 6px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { position:sticky; top:0; z-index:5; background:#f8fafc; color:#344054; box-shadow:0 1px 0 var(--line), 0 3px 8px rgba(15,23,42,.08); }
    a { color:var(--blue); text-decoration:none; }
    a:hover { text-decoration:underline; }
    .tag { display:inline-flex; align-items:center; min-height:24px; margin:0 4px 4px 0; padding:2px 7px; border:1px solid var(--line); border-radius:6px; background:#fff; font-size:12px; font-weight:800; }
    .note { padding:12px; border-left:4px solid var(--blue); background:#f1f6ff; border-radius:6px; }
    .muted { color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .metric { padding:12px; border:1px solid var(--line); border-radius:8px; background:#fff; }
    .metric strong { display:block; font-size:22px; color:var(--blue); }
    @media (max-width:900px){ .wrap{padding:14px;} .grid{grid-template-columns:1fr 1fr;} table{font-size:13px;} }
  </style>
</head>
<body>
  <header>
    <div class="wrap">
      <h1>普通类志愿草表与梯度方案</h1>
      <p class="muted">陕西物理类｜${escapeHtml(profile.candidate.actualScore || targetScore)} 分｜${escapeHtml(profile.candidate.actualRank || targetRank)} 位｜只看普通类主方案，剔除医学类、国家专项、地方专项、强基计划、综合评价、中外合作办学、高收费和港校项目</p>
      <div class="grid">
        <div class="metric"><strong>${selection.length}</strong><span>普通类候选专业</span></div>
        <div class="metric"><strong>${selection.filter((item) => item.gradient === "冲" || item.gradient === "冲稳").length}</strong><span>冲/冲稳</span></div>
        <div class="metric"><strong>${selection.filter((item) => item.gradient === "稳").length}</strong><span>稳</span></div>
        <div class="metric"><strong>${selection.filter((item) => item.gradient === "保" || item.gradient === "安全").length}</strong><span>保/安全</span></div>
      </div>
    </div>
  </header>
  <main class="wrap">
    <section>
      <h2>排序口径</h2>
      <p class="note">本草表按 2025 专业最低分与 2026 已核计划线索做梯度初排：高于 662 为“冲”，低 0-2 分为“冲稳”，低 3-10 分为“稳”，低 11-25 分为“保”，再下探为“安全”。本版选择策略已改为先重点研究哈工大本部，再研究西交大，再研究哈工大威海；哈工大深圳作为补充重点观察。正式填报仍必须结合院校专业组内全部专业、招生计划数变化、调剂规则和体检限制重排。</p>
      <p class="note">本版主表执行严格口径：剔除长安大学、西北大学；院校最低分覆盖审计只做防漏提醒，不进入草表；西工大软件工程因当前未核到2026同名计划，不进入主草表。视力按当前眼镜矫正4.8保守处理，4.8约等于小数视力0.63，医学可矫正能力1.5约等于5分视力5.2。</p>
    </section>
    <section>
      <h2>重点校区/院校优先分析</h2>
      <table>
        <thead><tr><th style="width:150px">优先级</th><th style="width:170px">学校</th><th>核心判断</th><th>当前可讨论普通类方向</th></tr></thead>
        <tbody>
          ${focusGroups.map(({ focus, rows }) => `<tr>
            <td><strong>第${escapeHtml(focus.priority)}优先</strong></td>
            <td><strong>${rows[0] ? schoolLink(rows[0], rows[0].schoolInfo) : escapeHtml(focus.name)}</strong></td>
            <td>${escapeHtml(focus.strategy || focusSummary(focus.schoolKey))}<div class="muted">${escapeHtml(focusSummary(focus.schoolKey))}</div></td>
            <td>${rows.length ? rows.map((item) => `<div><span class="tag">${escapeHtml(item.gradient)}</span>${escapeHtml(item.major)}｜${escapeHtml(item.minScore ?? item.score ?? "-")}分｜专家${escapeHtml(item.expertScore ?? "-")}</div>`).join("") : "当前普通类主池暂无可用专业行，需人工补2026计划和2025分专业录取。"}</td>
          </tr>`).join("\n")}
        </tbody>
      </table>
    </section>
    ${groups.map((group) => `<section>
      <h2>${escapeHtml(group.label)}梯度</h2>
      <table>
        <thead><tr><th style="width:140px">学校</th><th>重点院校族群</th><th>专业/专业类</th><th style="width:90px">2025最低</th><th style="width:90px">位次</th><th style="width:140px">2026计划</th><th style="width:130px">方向</th><th>填报判断</th></tr></thead>
        <tbody>
          ${group.rows.map((item) => `<tr>
            <td><strong>${schoolLink(item, item.schoolInfo)}</strong><div class="muted">${escapeHtml([item.focusLabel, item.schoolInfo?.tier].filter(Boolean).join("｜"))}</div></td>
            <td>${(item.priorityGroups || []).length ? item.priorityGroups.map((group) => `<span class="tag">${escapeHtml(group)}</span>`).join("") : "-"}</td>
            <td>${escapeHtml(item.major)}<div><span class="tag">${escapeHtml(item.recommendation || item.suggestion || "")}</span><span class="tag">${escapeHtml(item.sourceLevel || "")}源</span></div></td>
            <td>${escapeHtml(scoreValue(item.minScore ?? item.score))}</td>
            <td>${escapeHtml(item.rank ?? "-")}</td>
            <td>${escapeHtml(item.plan ? planLabel(item) : ordinaryOnlyText(item.plan2026))}</td>
            <td>${escapeHtml(item.matchedTrack || item.track || "-")}</td>
            <td>${escapeHtml(item.notes || item.matchReason || "核2026计划、专业组和分流规则")}</td>
          </tr>`).join("\n")}
        </tbody>
      </table>
    </section>`).join("\n")}
  </main>
</body>
</html>`;
}

function collectLinks({ schools, latestCheck }) {
  const links = [];
  for (const school of schools.schools || []) {
    if (school.manualCheckUrl) links.push({ label: `${school.name} 招生网`, url: school.manualCheckUrl, type: "school" });
  }
  for (const item of latestCheck.schools || []) {
    const signals = item.homepageSignals || {};
    for (const link of [...(signals.links || []), ...(signals.activityLinks || [])]) {
      links.push({ label: `${item.school} ${link.text}`, url: link.url, type: link.type || "official" });
    }
    const consultation = item.consultationSignals;
    if (consultation?.pageUrl) links.push({ label: `${item.school} 招生咨询/行程`, url: consultation.pageUrl, type: "activity" });
  }
  return [...new Map(links.filter((item) => item.url).map((item) => [item.url, item])).values()];
}

async function checkHttpLink(link) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(link.url, {
      method: "GET",
      headers: { "user-agent": "Mozilla/5.0 GKZY/0.1" },
      signal: controller.signal,
      redirect: "follow"
    });
    return {
      ...link,
      ok: response.ok,
      status: response.status,
      finalUrl: response.url
    };
  } catch (error) {
    return {
      ...link,
      ok: false,
      status: "ERROR",
      error: error.message
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function checkLocalFile(file) {
  try {
    const info = await stat(path.join(rootDir, file));
    return { label: file, url: file, type: "local", ok: info.isFile(), status: info.isFile() ? "OK" : "MISSING" };
  } catch {
    return { label: file, url: file, type: "local", ok: false, status: "MISSING" };
  }
}

async function validateLinks({ schools, latestCheck }) {
  const localFiles = Object.values(PAGE_FILES);
  const local = await Promise.all(localFiles.map(checkLocalFile));
  const httpLinks = collectLinks({ schools, latestCheck }).slice(0, 120);
  const http = await mapLimit(httpLinks, 12, checkHttpLink);
  return {
    generatedAt: new Date().toISOString(),
    summary: {
      localTotal: local.length,
      localOk: local.filter((item) => item.ok).length,
      httpTotal: http.length,
      httpOk: http.filter((item) => item.ok).length
    },
    links: [...local, ...http]
  };
}

function buildLinkHtml(validation) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>2026招生计划链接验证报告</title>
  <style>
    body { margin:0; background:#f6f7f9; color:#18202a; font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif; line-height:1.55; }
    .wrap { max-width:1280px; margin:0 auto; padding:22px; }
    header, section { background:#fff; border-bottom:1px solid #d9dee7; }
    section { margin:18px 0; padding:18px; border:1px solid #d9dee7; border-radius:8px; }
    h1 { margin:0 0 8px; font-size:28px; letter-spacing:0; }
    h2 { margin:0 0 12px; font-size:20px; letter-spacing:0; }
    table { width:100%; border-collapse:collapse; font-size:14px; background:#fff; }
    th, td { padding:9px 8px; border-bottom:1px solid #d9dee7; text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { background:#f8fafc; color:#344054; }
    a { color:#2459a6; text-decoration:none; }
    a:hover { text-decoration:underline; }
    .ok { color:#147a4a; font-weight:800; }
    .bad { color:#b42318; font-weight:800; }
    .muted { color:#667085; }
  </style>
</head>
<body>
  <header><div class="wrap"><h1>2026招生计划链接验证报告</h1><p class="muted">生成时间：${escapeHtml(new Date(validation.generatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }))}</p></div></header>
  <main class="wrap">
    <section>
      <h2>验证汇总</h2>
      <p>本地子文档：${validation.summary.localOk}/${validation.summary.localTotal} 可访问；学校官网/活动/计划链接：${validation.summary.httpOk}/${validation.summary.httpTotal} 返回成功状态。</p>
    </section>
    <section>
      <h2>链接明细</h2>
      <table>
        <thead><tr><th>状态</th><th>类型</th><th>名称</th><th>链接</th><th>备注</th></tr></thead>
        <tbody>
          ${validation.links.map((link) => `<tr>
            <td class="${link.ok ? "ok" : "bad"}">${escapeHtml(link.ok ? "OK" : "需复核")}</td>
            <td>${escapeHtml(link.type || "")}</td>
            <td>${escapeHtml(link.label || "")}</td>
            <td>${/^https?:/i.test(link.url) ? `<a href="${escapeHtml(link.url)}" target="_blank" rel="noreferrer">${escapeHtml(link.url)}</a>` : escapeHtml(link.url)}</td>
            <td>${escapeHtml([link.status, link.error, link.finalUrl && link.finalUrl !== link.url ? `跳转：${link.finalUrl}` : ""].filter(Boolean).join("；"))}</td>
          </tr>`).join("\n")}
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  const [profile, evaluation, schools, latestCheck] = await Promise.all([
    readJson("data/profile.json"),
    readJson("data/generated/candidate-evaluation.json"),
    readJson("data/schools.json"),
    readJson("data/generated/latest-plan-check.json")
  ]);

  const selection = buildSelection(evaluation, schools, latestCheck, profile);
  await mkdir(generatedDir, { recursive: true });
  await writeFile(path.join(generatedDir, "ordinary-selection-2026.json"), `${JSON.stringify({ generatedAt: new Date().toISOString(), targetScore, targetRank, items: selection }, null, 2)}\n`, "utf8");
  await writeFile(path.join(rootDir, PAGE_FILES.ordinaryVolunteerDraft), buildDraftHtml({ profile, selection }), "utf8");

  const validation = await validateLinks({ schools, latestCheck });
  await writeFile(path.join(generatedDir, "link-validation-2026.json"), `${JSON.stringify(validation, null, 2)}\n`, "utf8");
  await writeFile(path.join(rootDir, PAGE_FILES.linkValidation), buildLinkHtml(validation), "utf8");

  console.log(`Wrote ${PAGE_FILES.ordinaryVolunteerDraft}`);
  console.log(`Wrote ${PAGE_FILES.linkValidation}`);
  console.log(JSON.stringify(validation.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
