import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const TARGET_KEYWORDS = [
  "西安铁一中滨河高级中学",
  "西安铁一中滨河学校",
  "铁一中滨河高级中学",
  "铁一中滨河学校",
  "铁一中滨河",
  "铁一滨河",
  "滨河高级中学",
  "滨河学校"
];

const STRUCTURED_SOURCES = [
  {
    schoolKey: "xjtu",
    type: "xcxc",
    pageUrl: "https://zswxxcx.xjtu.edu.cn/public/zsxc/xcxcpc/#/",
    baseUrl: "https://zswxxcx.xjtu.edu.cn/zsxc/m",
    province: "陕西"
  },
  {
    schoolKey: "xdu",
    type: "xcxc",
    pageUrl: "https://zsxc.xidian.edu.cn/public/zsxc/xcxcpc/#/",
    baseUrl: "https://zsxc.xidian.edu.cn/zsxc/t",
    province: "陕西"
  },
  {
    schoolKey: "uestc",
    type: "xcxc",
    pageUrl: "https://chaxun.uestc.edu.cn/public/zsxc/xcxcpc/#/",
    baseUrl: "https://chaxun.uestc.edu.cn/zsxc/t",
    province: "陕西"
  },
  {
    schoolKey: "hitwh",
    type: "360eol-itinerary",
    pageUrl: "https://ai-enroll.360eol.com/teacherenroll/itinerary/index/school_id/3716",
    baseUrl: "https://ai-enroll.360eol.com",
    schoolId: "3716",
    province: "陕西",
    city: "西安市"
  }
];

async function readJson(relativePath, fallback = null) {
  try {
    const content = await readFile(path.join(rootDir, relativePath), "utf8");
    return JSON.parse(content);
  } catch {
    return fallback;
  }
}

async function getJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: {
        "user-agent": "Mozilla/5.0 GKZY/0.1",
        "accept": "application/json,text/plain,*/*",
        "content-type": "application/json;charset=utf-8",
        ...(options.headers || {})
      },
      body: options.body,
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 GKZY/0.1",
        "accept": "text/html,application/xhtml+xml,text/plain,*/*"
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function stripTags(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeText(value) {
  return String(value ?? "").replace(/\s+/g, "").toLowerCase();
}

function matchedKeywords(value) {
  const text = normalizeText(value);
  return TARGET_KEYWORDS.filter((keyword) => text.includes(normalizeText(keyword)));
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function flattenEvents(cityXcxxlist = []) {
  const events = [];
  for (const city of cityXcxxlist || []) {
    for (const bucket of ["jxzList", "wksList", "yjsList"]) {
      for (const item of city[bucket] || []) {
        events.push({
          statusBucket: bucket,
          city: item.city || city.city || "",
          area: item.area || "",
          title: item.gznr || "",
          place: item.xcdd || "",
          schoolName: item.zxmc || "",
          mode: item.xcxs || "",
          startDate: item.ksrq || "",
          endDate: item.jsrq || "",
          startTime: item.kssj ? item.kssj.slice(0, 5) : "",
          endTime: item.jssj ? item.jssj.slice(0, 5) : "",
          groupName: item.xczmc || "",
          contacts: (item.lxrxx || []).map((contact) => [contact.xm, contact.lxdh].filter(Boolean).join(" ")).filter(Boolean),
          rawId: item.id || item.xcxxid || ""
        });
      }
    }
  }
  return events;
}

function flattenGroups(xczxxList = []) {
  return (xczxxList || []).map((item) => ({
    groupName: item.xczmc || "",
    area: item.fzqy || "",
    qqOrQr: item.qrcode || "",
    descriptions: (item.xczLxxx || []).map((link) => compact([link.description, link.qrtype].filter(Boolean).join(" "))).filter(Boolean)
  }));
}

function normalizeProvinceName(value) {
  return String(value ?? "").replace(/省|市|自治区|壮族|回族|维吾尔|特别行政区/g, "");
}

function eventHaystack(event) {
  return [
    event.title,
    event.place,
    event.schoolName,
    event.groupName,
    event.city,
    event.area
  ].join(" ");
}

function groupHaystack(group) {
  return [group.groupName, group.area, group.descriptions.join(" ")].join(" ");
}

async function fetchXcxcSource(source, school) {
  const endpoint = `${source.baseUrl.replace(/\/$/, "")}/api/common/xcxc/getCityXcxcListBySf?sf=${encodeURIComponent(source.province)}`;
  const data = await getJson(endpoint);
  const events = flattenEvents(data.cityXcxxlist);
  const groups = flattenGroups(data.xczxxList);
  const eventMatches = events
    .map((event) => ({ ...event, matchedKeywords: matchedKeywords(eventHaystack(event)) }))
    .filter((event) => event.matchedKeywords.length);
  const groupMatches = groups
    .map((group) => ({ ...group, matchedKeywords: matchedKeywords(groupHaystack(group)) }))
    .filter((group) => group.matchedKeywords.length);
  return {
    schoolKey: source.schoolKey,
    school: school?.name || source.schoolKey,
    shortName: school?.shortName || "",
    sourceType: "structured-xcxc",
    sourceUrl: source.pageUrl,
    apiUrl: endpoint,
    status: data.success ? "checked" : "api-warning",
    message: data.msg || "",
    totalEvents: events.length,
    eventMatches,
    groupMatches,
    checkedAt: new Date().toISOString()
  };
}

async function fetchEolItinerarySource(source, school) {
  const baseUrl = source.baseUrl.replace(/\/$/, "");
  const addressUrl = `${baseUrl}/teacherenroll/Itinerary/getSchoolItineraryAddressList?school_id=${encodeURIComponent(source.schoolId)}&batch_id=`;
  const addressData = await getJson(addressUrl);
  if (!addressData.success) throw new Error(addressData.msg || "360eol address request failed");

  const targetProvince = normalizeProvinceName(source.province);
  const province = (addressData.data || []).find((item) => normalizeProvinceName(item.name) === targetProvince);
  if (!province) throw new Error(`360eol 未找到省份：${source.province}`);
  const city = (province.list || []).find((item) => item.name === source.city || normalizeProvinceName(item.name) === normalizeProvinceName(source.city));
  if (!city) throw new Error(`360eol 未找到城市：${source.city}`);

  const events = [];
  let page = 1;
  let isend = false;
  while (!isend && page <= 8) {
    const listUrl = `${baseUrl}/teacherenroll/Itinerary/getSchoolItineraryList?school_id=${encodeURIComponent(source.schoolId)}&province_id=${encodeURIComponent(province.id)}&city_id=${encodeURIComponent(city.id)}&page=${page}&batch_id=`;
    const listData = await getJson(listUrl);
    if (!listData.success) throw new Error(listData.msg || "360eol list request failed");
    const payload = listData.data || {};
    for (const item of payload.list || []) {
      events.push({
        statusBucket: "eolList",
        city: item.city || city.name || "",
        area: "",
        title: item.title || "",
        place: item.high_school_name || "",
        schoolName: item.high_school_name || "",
        mode: item.type_name || "",
        startDate: String(item.start_time || "").slice(0, 10),
        endDate: String(item.end_time || "").slice(0, 10),
        startTime: item.time_string?.split(" - ")?.[0] || String(item.start_time || "").slice(11, 16),
        endTime: item.time_string?.split(" - ")?.[1] || String(item.end_time || "").slice(11, 16),
        groupName: "",
        contacts: (item.members || []).map((member) => [member.name, member.phone].filter(Boolean).join(" ")).filter(Boolean),
        rawId: item.id ? String(item.id) : ""
      });
    }
    isend = Boolean(payload.isend);
    page += 1;
  }

  const eventMatches = events
    .map((event) => ({ ...event, matchedKeywords: matchedKeywords(eventHaystack(event)) }))
    .filter((event) => event.matchedKeywords.length);

  return {
    schoolKey: source.schoolKey,
    school: school?.name || source.schoolKey,
    shortName: school?.shortName || "",
    sourceType: "structured-360eol",
    sourceUrl: source.pageUrl,
    apiUrl: `${baseUrl}/teacherenroll/Itinerary/getSchoolItineraryList`,
    status: "checked",
    message: `已按 ${source.province}/${source.city} 过滤`,
    totalEvents: events.length,
    eventMatches,
    groupMatches: [],
    checkedAt: new Date().toISOString()
  };
}

async function scanSchoolHomepage(school) {
  if (!school.manualCheckUrl) {
    return {
      schoolKey: school.key,
      school: school.name,
      sourceType: "homepage-scan",
      sourceUrl: "",
      status: "no-url",
      keywordMatches: []
    };
  }
  try {
    const html = await getText(school.manualCheckUrl);
    const text = stripTags(html);
    const keywordMatches = matchedKeywords(text);
    const discoveredItinerarySources = discoverEolItinerarySources(html, school);
    return {
      schoolKey: school.key,
      school: school.name,
      sourceType: "homepage-scan",
      sourceUrl: school.manualCheckUrl,
      status: "checked",
      keywordMatches,
      discoveredItinerarySources,
      snippet: keywordMatches.length ? text.slice(Math.max(0, text.indexOf(keywordMatches[0]) - 80), text.indexOf(keywordMatches[0]) + 160) : "",
      checkedAt: new Date().toISOString()
    };
  } catch (error) {
    return {
      schoolKey: school.key,
      school: school.name,
      sourceType: "homepage-scan",
      sourceUrl: school.manualCheckUrl,
      status: "fetch-error",
      error: error.message,
      keywordMatches: [],
      checkedAt: new Date().toISOString()
    };
  }
}

function discoverEolItinerarySources(html, school) {
  const sources = [];
  const seen = new Set();
  const hrefRe = /href=["']([^"']*ai-enroll\.360eol\.com\/teacherenroll\/itinerary\/index\/school_id\/(\d+)[^"']*)["']/gi;
  let match;
  while ((match = hrefRe.exec(html))) {
    const schoolId = match[2];
    if (seen.has(schoolId)) continue;
    seen.add(schoolId);
    sources.push({
      schoolKey: school.key,
      type: "360eol-itinerary",
      pageUrl: match[1].startsWith("http") ? match[1] : `https:${match[1]}`,
      baseUrl: "https://ai-enroll.360eol.com",
      schoolId,
      province: "陕西",
      city: "西安市",
      discoveredFrom: school.manualCheckUrl
    });
  }
  return sources;
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
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

function formatDateTime(item) {
  const date = item.startDate === item.endDate || !item.endDate ? item.startDate : `${item.startDate} 至 ${item.endDate}`;
  const time = item.startTime ? ` ${item.startTime}${item.endTime ? `-${item.endTime}` : ""}` : "";
  return `${date || "-"}${time}`;
}

function renderEventRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="9" class="empty">暂未抓到“滨河/铁一滨河/滨河高级中学”等关键词命中的明确行程。</td></tr>`;
  }
  return rows.map((row) => `<tr>
    <td><strong>${escapeHtml(row.school)}</strong><div class="small">${escapeHtml(row.shortName || "")}</div></td>
    <td>${escapeHtml(formatDateTime(row))}</td>
    <td>${escapeHtml(row.mode || "-")}</td>
    <td>${escapeHtml(row.city || "-")}</td>
    <td>${escapeHtml(row.title || "-")}</td>
    <td>${escapeHtml(row.schoolName || row.place || "-")}</td>
    <td>${escapeHtml(row.groupName || "-")}</td>
    <td>${escapeHtml(row.contacts?.join("；") || "-")}</td>
    <td><a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noreferrer">来源</a></td>
  </tr>`).join("\n");
}

function renderGroupRows(rows) {
  if (!rows.length) {
    return `<tr><td colspan="6" class="empty">暂未抓到相关招生组线索。</td></tr>`;
  }
  return rows.map((row) => `<tr>
    <td><strong>${escapeHtml(row.school)}</strong><div class="small">${escapeHtml(row.shortName || "")}</div></td>
    <td>${escapeHtml(row.groupName || "-")}</td>
    <td>${escapeHtml(row.area || "-")}</td>
    <td>${escapeHtml(row.matchedKeywords?.join("、") || "-")}</td>
    <td>${escapeHtml(row.descriptions?.join("；") || row.qqOrQr || "-")}</td>
    <td><a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noreferrer">来源</a></td>
  </tr>`).join("\n");
}

function renderCoverageRows(rows) {
  return rows.map((row) => {
    const statusText = row.status === "checked" ? "已检查" : row.status === "fetch-error" ? "访问失败" : row.status;
    const matchText = row.keywordMatches?.length ? row.keywordMatches.join("、") : "-";
    return `<tr>
      <td>${escapeHtml(row.school)}</td>
      <td>${escapeHtml(row.sourceType)}</td>
      <td><span class="tag ${row.keywordMatches?.length ? "good" : row.status === "fetch-error" ? "bad" : ""}">${escapeHtml(statusText)}</span></td>
      <td>${escapeHtml(matchText)}</td>
      <td>${row.sourceUrl ? `<a href="${escapeHtml(row.sourceUrl)}" target="_blank" rel="noreferrer">打开</a>` : "-"}</td>
    </tr>`;
  }).join("\n");
}

function html(data) {
  const explicitMatches = data.explicitMatches;
  const groupMatches = data.groupMatches;
  const checkedCount = data.schoolChecks.length;
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>滨河高级中学招生行程跟踪</title>
  <style>
    :root { --bg:#f5f6f8; --panel:#fff; --ink:#172033; --muted:#637083; --line:#d8dee8; --blue:#1f5aa6; --green:#147a4a; --amber:#a85b00; --red:#b42318; }
    * { box-sizing:border-box; }
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
    .metric { border:1px solid var(--line); border-radius:8px; padding:12px; background:#fff; min-height:82px; }
    .metric strong { display:block; font-size:24px; }
    .notice { border-left:4px solid var(--amber); background:#fff7ed; padding:10px 12px; border-radius:6px; color:#7a3d00; }
    .table-scroll { overflow:auto; border:1px solid var(--line); border-radius:8px; background:#fff; }
    table { width:100%; min-width:1120px; border-collapse:collapse; table-layout:fixed; font-size:13px; }
    th, td { padding:8px 7px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; overflow-wrap:anywhere; }
    th { background:#f8fafc; color:#344054; font-weight:800; }
    tr:last-child td { border-bottom:0; }
    .empty { text-align:center; color:var(--muted); padding:22px; }
    .tag { display:inline-flex; align-items:center; border:1px solid var(--line); border-radius:999px; padding:2px 7px; font-size:12px; font-weight:800; white-space:nowrap; }
    .tag.good { color:var(--green); background:#ecfdf3; border-color:#abefc6; }
    .tag.bad { color:var(--red); background:#fee4e2; border-color:#fecaca; }
    @media (max-width: 900px) { .wrap { padding:12px; } .metrics { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main class="wrap">
    <header>
      <h1>滨河高级中学招生行程跟踪</h1>
      <p class="subtle">目标关键词：${TARGET_KEYWORDS.map(escapeHtml).join("、")}。生成时间：${escapeHtml(data.generatedAt)}</p>
      <div class="metrics">
        <div class="metric"><strong>${escapeHtml(checkedCount)}</strong><span class="subtle">已纳入检查学校</span></div>
        <div class="metric"><strong>${escapeHtml(data.structuredChecks.length)}</strong><span class="subtle">结构化行程接口</span></div>
        <div class="metric"><strong>${escapeHtml(explicitMatches.length)}</strong><span class="subtle">明确行程命中</span></div>
        <div class="metric"><strong>${escapeHtml(groupMatches.length)}</strong><span class="subtle">招生组线索命中</span></div>
      </div>
    </header>

    <section>
      <h2>判定口径</h2>
      <p class="notice">“明确行程”只统计行程标题、地点、中学名称、招生组等字段命中“滨河/铁一滨河/滨河高级中学”的条目；“招生组线索”只说明该校招生组或联系方式与铁一滨河有关，不能等同于已发布到校宣讲时间。</p>
    </section>

    <section>
      <h2>明确行程匹配</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th>学校</th><th>时间</th><th>形式</th><th>城市</th><th>行程内容</th><th>地点/中学</th><th>招生组</th><th>联系人</th><th>来源</th></tr></thead>
          <tbody>${renderEventRows(explicitMatches)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>相关招生组线索</h2>
      <div class="table-scroll">
        <table>
          <thead><tr><th>学校</th><th>招生组/联系组</th><th>负责区域</th><th>命中词</th><th>备注/群信息</th><th>来源</th></tr></thead>
          <tbody>${renderGroupRows(groupMatches)}</tbody>
        </table>
      </div>
    </section>

    <section>
      <h2>检查覆盖</h2>
      <p class="small">结构化接口优先；没有可识别行程接口的学校，先检查招办首页关键词并保留官网入口，后续可继续补接口。</p>
      <div class="table-scroll">
        <table>
          <thead><tr><th>学校</th><th>来源类型</th><th>状态</th><th>首页关键词命中</th><th>入口</th></tr></thead>
          <tbody>${renderCoverageRows(data.schoolChecks)}</tbody>
        </table>
      </div>
    </section>
  </main>
</body>
</html>`;
}

async function main() {
  await mkdir(generatedDir, { recursive: true });
  const schoolsData = await readJson("data/schools.json", { schools: [] });
  const schools = schoolsData.schools || [];
  const schoolByKey = new Map(schools.map((school) => [school.key, school]));
  const previous = await readJson("data/generated/binhe-itinerary-audit.json", { structuredChecks: [], schoolChecks: [] });
  const previousStructuredByKey = new Map((previous.structuredChecks || []).map((item) => [item.schoolKey, item]));

  const structuredChecks = [];
  for (const source of STRUCTURED_SOURCES) {
    const school = schoolByKey.get(source.schoolKey);
    try {
      const check = source.type === "360eol-itinerary"
        ? await fetchEolItinerarySource(source, school)
        : await fetchXcxcSource(source, school);
      structuredChecks.push(check);
    } catch (error) {
      const fallback = previousStructuredByKey.get(source.schoolKey);
      structuredChecks.push({
        ...(fallback || {
          schoolKey: source.schoolKey,
          school: school?.name || source.schoolKey,
          shortName: school?.shortName || "",
          sourceType: "structured-xcxc",
          sourceUrl: source.pageUrl,
          totalEvents: 0,
          eventMatches: [],
          groupMatches: []
        }),
        status: fallback ? "stale" : "fetch-error",
        error: error.message,
        checkedAt: new Date().toISOString()
      });
    }
  }

  const structuredKeys = new Set(STRUCTURED_SOURCES.map((source) => source.schoolKey));
  const homepageScans = await mapWithConcurrency(
    schools.filter((item) => !structuredKeys.has(item.key)),
    6,
    scanSchoolHomepage
  );

  const knownEolSchoolIds = new Set(
    STRUCTURED_SOURCES
      .filter((source) => source.type === "360eol-itinerary")
      .map((source) => String(source.schoolId))
  );
  const discoveredEolSources = homepageScans
    .flatMap((scan) => scan.discoveredItinerarySources || [])
    .filter((source) => {
      if (knownEolSchoolIds.has(String(source.schoolId))) return false;
      knownEolSchoolIds.add(String(source.schoolId));
      return true;
    });
  for (const source of discoveredEolSources) {
    const school = schoolByKey.get(source.schoolKey);
    try {
      structuredChecks.push(await fetchEolItinerarySource(source, school));
    } catch (error) {
      structuredChecks.push({
        schoolKey: source.schoolKey,
        school: school?.name || source.schoolKey,
        shortName: school?.shortName || "",
        sourceType: "structured-360eol",
        sourceUrl: source.pageUrl,
        totalEvents: 0,
        eventMatches: [],
        groupMatches: [],
        status: "fetch-error",
        error: error.message,
        checkedAt: new Date().toISOString()
      });
    }
  }

  const explicitMatches = structuredChecks.flatMap((check) => (check.eventMatches || []).map((event) => ({
    ...event,
    schoolKey: check.schoolKey,
    school: check.school,
    shortName: check.shortName,
    sourceUrl: check.sourceUrl
  }))).sort((a, b) => String(a.startDate || "").localeCompare(String(b.startDate || "")) || a.school.localeCompare(b.school, "zh-CN"));

  const groupMatches = structuredChecks.flatMap((check) => (check.groupMatches || []).map((group) => ({
    ...group,
    schoolKey: check.schoolKey,
    school: check.school,
    shortName: check.shortName,
    sourceUrl: check.sourceUrl
  }))).sort((a, b) => a.school.localeCompare(b.school, "zh-CN"));

  const structuredCoverage = structuredChecks.map((check) => ({
    schoolKey: check.schoolKey,
    school: check.school,
    sourceType: check.sourceType,
    sourceUrl: check.sourceUrl,
    status: check.status,
    keywordMatches: [
      ...new Set([
        ...(check.eventMatches || []).flatMap((item) => item.matchedKeywords || []),
        ...(check.groupMatches || []).flatMap((item) => item.matchedKeywords || [])
      ])
    ],
    checkedAt: check.checkedAt
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    targetSchool: "西安铁一中滨河高级中学",
    targetKeywords: TARGET_KEYWORDS,
    notes: [
      "明确行程匹配来自可结构化抓取的高校咨询行程接口。",
      "招生组线索不等同于已发布到校行程，需等高校更新具体行程后再确认时间地点。",
      "无结构化接口的学校目前做招办首页关键词扫描，并保留官网入口以便人工复核。"
    ],
    structuredChecks,
    schoolChecks: [...structuredCoverage, ...homepageScans],
    explicitMatches,
    groupMatches
  };

  const jsonTarget = path.join(generatedDir, "binhe-itinerary-audit.json");
  await writeFile(jsonTarget, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  const htmlTarget = path.join(rootDir, PAGE_FILES.binheItineraryAudit);
  await writeFile(htmlTarget, html(output), "utf8");
  console.log(`Wrote ${path.relative(rootDir, jsonTarget)}`);
  console.log(`Wrote ${path.relative(rootDir, htmlTarget)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
