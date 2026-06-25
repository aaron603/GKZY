import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const dataDir = path.join(rootDir, "data");
const generatedDir = path.join(dataDir, "generated");

function nowIso() {
  return new Date().toISOString();
}

async function readJson(relativePath) {
  const content = await readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(content);
}

async function postJson(url, body) {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 版本不支持 fetch，请使用 Node 18+。");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json;charset=utf-8",
        "user-agent": "Mozilla/5.0 GKZY/0.1"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url) {
  if (!url || typeof fetch !== "function") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 GKZY/0.1",
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(url) {
  if (!url || typeof fetch !== "function") return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "user-agent": "Mozilla/5.0 GKZY/0.1",
        "accept": "application/json,text/plain,*/*"
      },
      signal: controller.signal
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function extractYears(typeMap = {}) {
  const years = new Set();
  for (const key of Object.keys(typeMap)) {
    const match = key.match(/_(20\d{2})_/);
    if (match) years.add(match[1]);
  }
  return [...years].sort((a, b) => Number(b) - Number(a));
}

function parseTypeMap(typeMap = {}) {
  return Object.entries(typeMap).map(([key, categories]) => {
    const parts = key.split("_");
    return {
      key,
      sf: parts[0] || "",
      nf: parts[1] || "",
      klmc: parts[2] || "",
      xqmc: parts.slice(3).join("_") || "",
      categories: Array.isArray(categories) ? categories : []
    };
  });
}

function queryKey(body) {
  return [body.type, body.sf, body.nf, body.zslb, body.klmc, body.xqmc].join("\u0001");
}

function categoryCandidates(categories, desiredCategory) {
  const desired = [desiredCategory, "普通类", "全部"];
  const loose = categories.filter((category) => category.includes("普通"));
  return [...new Set([...desired, ...loose])].filter((category) => categories.includes(category));
}

function branchCompatible(actualBranch, desiredBranch) {
  if (actualBranch === desiredBranch) return true;
  if (actualBranch === "全部") return true;
  if (desiredBranch?.includes("物理") && /物理|理工/.test(actualBranch)) return true;
  return false;
}

function buildListBodiesFromTypeMap(typeMap, query) {
  const entries = parseTypeMap(typeMap)
    .filter((entry) => entry.sf === query.province && entry.nf === query.year)
    .filter((entry) => branchCompatible(entry.klmc, query.branch))
    .sort((a, b) => {
      const aScore = (a.klmc === query.branch ? 4 : 0) + (a.xqmc === query.campus ? 2 : 0) + (a.xqmc === "" ? 1 : 0);
      const bScore = (b.klmc === query.branch ? 4 : 0) + (b.xqmc === query.campus ? 2 : 0) + (b.xqmc === "" ? 1 : 0);
      return bScore - aScore;
    });

  const bodies = [];
  for (const entry of entries) {
    const categories = categoryCandidates(entry.categories, query.category);
    for (const zslb of categories) {
      bodies.push({
        type: query.type,
        sf: entry.sf,
        nf: entry.nf,
        zslb,
        klmc: entry.klmc,
        xqmc: entry.xqmc === "全部" ? "" : entry.xqmc
      });
    }
  }

  bodies.push(buildListBody(query));
  const seen = new Set();
  return bodies.filter((body) => {
    const key = queryKey(body);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function buildListBody(query) {
  return {
    type: query.type,
    sf: query.province,
    nf: query.year,
    zslb: query.category,
    klmc: query.branch,
    xqmc: query.campus
  };
}

function decodeHtml(value) {
  return String(value ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(value) {
  return decodeHtml(String(value ?? "").replace(/<[^>]+>/g, " "));
}

function absoluteUrl(href, baseUrl) {
  if (!href || /^javascript:|^mailto:|^tel:|^#/i.test(href)) return "";
  try {
    return new URL(decodeHtml(href), baseUrl).toString();
  } catch {
    return "";
  }
}

function targetSchoolAliases(profile) {
  const candidate = profile?.candidate || {};
  const aliases = [
    candidate.school,
    ...(Array.isArray(candidate.schoolAliases) ? candidate.schoolAliases : [])
  ].filter(Boolean);
  const expanded = new Set(aliases);
  for (const alias of aliases) {
    expanded.add(alias.replace(/^西安市?/, ""));
    expanded.add(alias.replace(/学校$|高级中学$|中学$/, ""));
  }
  return [...expanded].filter((item) => item && item.length >= 2);
}

function includesAlias(value, aliases) {
  const text = String(value ?? "");
  return aliases.some((alias) => text.includes(alias));
}

function consultationPublicUrl(value, baseUrl) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  try {
    return new URL(value, `${baseUrl.replace(/\/$/, "")}/`).toString();
  } catch {
    return "";
  }
}

function eventText(event) {
  return [
    event.gznr,
    event.xcdd,
    event.zxmc,
    event.xczmc,
    event.city,
    event.area,
    event.xcxs,
    event.zbpt,
    event.bzxx,
    event.lxrxxx
  ].filter(Boolean).join(" ");
}

function normalizeConsultationEvent(event, pageUrl) {
  const contacts = Array.isArray(event.lxrxx)
    ? event.lxrxx.map((item) => ({
        name: item.xm || "",
        phone: item.lxdh || ""
      })).filter((item) => item.name || item.phone)
    : [];
  return {
    title: event.gznr || event.xczmc || "咨询行程",
    mode: event.xcxs || "",
    city: event.city || "",
    area: event.area || "",
    place: event.xcdd || event.zxmc || event.zbpt || "",
    startDate: event.ksrq || "",
    endDate: event.jsrq || "",
    startTime: event.kssj ? String(event.kssj).slice(0, 5) : "",
    endTime: event.jssj ? String(event.jssj).slice(0, 5) : "",
    contacts,
    statusCode: event.isks || "",
    sourceUrl: pageUrl
  };
}

function allConsultationEvents(cityXcxxlist = [], pageUrl) {
  return cityXcxxlist.flatMap((city) => [
    ...(Array.isArray(city.jxzList) ? city.jxzList : []),
    ...(Array.isArray(city.wksList) ? city.wksList : []),
    ...(Array.isArray(city.yjsList) ? city.yjsList : [])
  ].map((event) => normalizeConsultationEvent(event, pageUrl)));
}

function uniqueBy(items, keyOf) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function subjectTeamPriority(item) {
  const name = `${item.xczmc || item.name || ""} ${item.area || ""}`;
  let score = 0;
  if (/计算机|人工智能|人智|软件|信通|通信|电子|微电子|电气|机械|自动化|航天|能动|材料|化学/.test(name)) score += 20;
  if (/铁一滨河|西安|高新|铁一中|交大附/.test(name)) score += 8;
  if (/医学|法学|公管|马院|人文/.test(name)) score -= 20;
  if (/中外|米兰|合作|联合/.test(name)) score += 5;
  return score;
}

async function fetchConsultationSignals(school, profile, query) {
  const api = school.consultationApi;
  if (!api?.baseUrl) return null;

  const baseUrl = api.baseUrl.replace(/\/$/, "");
  const pageUrl = api.pageUrl || school.manualCheckUrl;
  const province = api.province || query.province;
  const year = query.year;
  const aliases = targetSchoolAliases(profile);
  const candidateCity = profile?.candidate?.city || "";
  const cityAliases = [...new Set([candidateCity, candidateCity ? `${candidateCity}市` : "", "西安市"].filter(Boolean))];

  try {
    const cityUrl = `${baseUrl}/api/common/xcxc/getCityXcxcListBySf?sf=${encodeURIComponent(province)}&nf=${encodeURIComponent(year)}`;
    const [cityData, contactData] = await Promise.all([
      getJson(cityUrl),
      postJson(`${baseUrl}/api/common/xcxc/getSfLxxx`, { sf: province })
    ]);

    const rawEvents = [
      ...((cityData?.cityXcxxlist || []).flatMap((city) => [
        ...(Array.isArray(city.jxzList) ? city.jxzList : []),
        ...(Array.isArray(city.wksList) ? city.wksList : []),
        ...(Array.isArray(city.yjsList) ? city.yjsList : [])
      ]))
    ];
    const events = allConsultationEvents(cityData?.cityXcxxlist || [], pageUrl);
    const targetEventIds = new Set(rawEvents
      .filter((event) => includesAlias(eventText(event), aliases))
      .map((event) => event.id || `${event.gznr}-${event.ksrq}-${event.xcdd}`));
    const targetEvents = events.filter((event, index) => {
      const raw = rawEvents[index];
      return targetEventIds.has(raw?.id || `${raw?.gznr}-${raw?.ksrq}-${raw?.xcdd}`);
    }).slice(0, 5);
    const cityEvents = events
      .filter((event) => cityAliases.some((alias) => event.city.includes(alias) || event.place.includes(alias)))
      .slice(0, 6);
    const provinceEvents = events
      .filter((event) => event.city && !cityAliases.some((alias) => event.city.includes(alias) || event.place.includes(alias)))
      .slice(0, 6);

    const contacts = Array.isArray(contactData?.qyfzrxxList) ? contactData.qyfzrxxList : [];
    const groups = Array.isArray(contactData?.qzlxxxList) ? contactData.qzlxxxList : [];
    const teams = Array.isArray(cityData?.xczxxList) ? cityData.xczxxList : [];

    const targetContacts = contacts
      .filter((item) => includesAlias(item.fzqy, aliases))
      .map((item) => ({
        name: item.xm || "",
        phone: item.lxdh || "",
        area: item.fzqy || "",
        sourceUrl: pageUrl
      }));
    const cityContacts = contacts
      .filter((item) => cityAliases.some((alias) => String(item.fzqy || "").includes(alias)))
      .map((item) => ({
        name: item.xm || "",
        phone: item.lxdh || "",
        area: item.fzqy || "",
        sourceUrl: pageUrl
      }));
    const provinceContacts = contacts
      .filter((item) => !includesAlias(item.fzqy, aliases))
      .filter((item) => !cityAliases.some((alias) => String(item.fzqy || "").includes(alias)))
      .filter((item) => /^(陕西|陕西省)$|其他中学|招生办|咨询电话|全省/.test(item.fzqy || ""))
      .map((item) => ({
        name: item.xm || "",
        phone: item.lxdh || "",
        area: item.fzqy || "",
        sourceUrl: pageUrl
      }));
    const targetGroups = groups
      .filter((item) => includesAlias(item.city, aliases))
      .map((item) => ({
        label: item.city || "咨询群",
        groupNo: item.qrcode || "",
        sourceUrl: pageUrl
      }));
    const cityGroups = groups
      .filter((item) => cityAliases.some((alias) => String(item.city || "").includes(alias)))
      .map((item) => ({
        label: item.city || "咨询群",
        groupNo: item.qrcode || "",
        sourceUrl: pageUrl
      }));
    const provinceGroups = groups
      .filter((item) => !includesAlias(item.city, aliases))
      .filter((item) => !cityAliases.some((alias) => String(item.city || "").includes(alias)))
      .filter((item) => /陕西|全省|其他中学|招生办|咨询/.test(item.city || ""))
      .map((item) => ({
        label: item.city || "咨询群",
        groupNo: item.qrcode || "",
        sourceUrl: pageUrl
      }));
    const targetTeams = teams
      .filter((item) => includesAlias([item.xczmc, item.fzqy, item.description].filter(Boolean).join(" "), aliases))
      .map((item) => ({
        name: item.xczmc || "",
        area: item.fzqy || "",
        qrcodeUrl: consultationPublicUrl(item.qrcode, baseUrl),
        sourceUrl: pageUrl
      }));
    const linkedTeamGroups = teams.flatMap((team) => (team.xczLxxx || []).map((item) => ({
      team: team.xczmc || item.xczmc || "",
      description: item.description || "",
      qrcodeUrl: consultationPublicUrl(item.qztp || team.qrcode, baseUrl),
      sourceUrl: pageUrl
    }))).filter((item) => includesAlias(`${item.team} ${item.description}`, aliases));
    const subjectTeams = teams
      .filter((item) => /陕西招生组/.test(item.xczmc || ""))
      .filter((item) => !includesAlias([item.xczmc, item.fzqy].filter(Boolean).join(" "), aliases))
      .sort((a, b) => subjectTeamPriority(b) - subjectTeamPriority(a))
      .map((item) => ({
        name: item.xczmc || "",
        area: item.fzqy || "",
        qrcodeUrl: consultationPublicUrl(item.qrcode, baseUrl),
        sourceUrl: pageUrl
      }));

    return {
      checked: true,
      pageUrl,
      province,
      year,
      hasTargetSchoolSignal: targetContacts.length > 0 || targetGroups.length > 0 || targetTeams.length > 0 || targetEvents.length > 0 || linkedTeamGroups.length > 0,
      targetSchool: profile?.candidate?.school || "",
      targetContacts: uniqueBy(targetContacts, (item) => `${item.name}\u0001${item.phone}\u0001${item.area}`).slice(0, 5),
      targetGroups: uniqueBy(targetGroups, (item) => `${item.label}\u0001${item.groupNo}`).slice(0, 5),
      targetTeams: uniqueBy(targetTeams, (item) => `${item.name}\u0001${item.qrcodeUrl}`).slice(0, 5),
      targetTeamGroups: uniqueBy(linkedTeamGroups, (item) => `${item.team}\u0001${item.description}\u0001${item.qrcodeUrl}`).slice(0, 5),
      targetEvents,
      cityEvents,
      provinceEvents,
      cityContacts: uniqueBy(cityContacts, (item) => `${item.name}\u0001${item.phone}\u0001${item.area}`).slice(0, 5),
      cityGroups: uniqueBy(cityGroups, (item) => `${item.label}\u0001${item.groupNo}`).slice(0, 8),
      provinceContacts: uniqueBy(provinceContacts, (item) => `${item.name}\u0001${item.phone}\u0001${item.area}`).slice(0, 5),
      provinceGroups: uniqueBy(provinceGroups, (item) => `${item.label}\u0001${item.groupNo}`).slice(0, 8),
      subjectTeams: uniqueBy(subjectTeams, (item) => `${item.name}\u0001${item.qrcodeUrl}`).slice(0, 8),
      scopeScenarios: [
        "本校对口老师/QQ群/招生组",
        "城市或片区咨询行程",
        "省份公共咨询热线/群",
        "学院或专业方向招生组",
        "官方招生入口、直播、开放日和总咨询渠道",
        "特殊项目/中外合作/校区专项咨询渠道"
      ],
      totalEvents: events.length
    };
  } catch (error) {
    return {
      checked: false,
      pageUrl,
      province,
      year,
      error: error.message
    };
  }
}


function extractAnchorLinks(html, baseUrl, targetYear) {
  const links = [];
  const anchorPattern = /<a\b[^>]*href\s*=\s*["']?([^"'\s>]+)["']?[^>]*>([\s\S]*?)<\/a>/gi;
  const activityPattern = /咨询会|咨询|直播|开放日|校园开放日|招生宣传|宣讲|行程|面对面|招生组|答疑/;
  const generalPattern = new RegExp(`${targetYear}|招生章程|招生计划|报考指南|招生简章|招生政策|专业目录|本科招生`);
  for (const match of html.matchAll(anchorPattern)) {
    const href = match[1];
    const label = stripTags(match[2]);
    const url = absoluteUrl(href, baseUrl);
    if (!url || !label) continue;
    const isActivity = activityPattern.test(label);
    const isGeneral = generalPattern.test(label);
    if (!isActivity && !isGeneral) continue;
    const years = [...label.matchAll(/20\d{2}/g)].map((item) => item[0]);
    if (years.length && !years.includes(targetYear)) continue;
    links.push({ text: label, url, type: isActivity ? "activity" : "general" });
  }

  const seen = new Set();
  return links.filter((item) => {
    const key = `${item.text}\u0001${item.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractHomepageSignals(html, targetYear, baseUrl) {
  if (!html) {
    return {
      checked: false,
      hasTargetYearSignal: false,
      activityLinks: [],
      links: [],
      activityMatches: [],
      matches: []
    };
  }

  const links = extractAnchorLinks(html, baseUrl, targetYear);
  const activityLinks = links.filter((item) => item.type === "activity").slice(0, 8);
  const generalLinks = links.slice(0, 8);
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");
  const pattern = new RegExp(`.{0,24}${targetYear}.{0,36}(招生章程|招生计划|报考指南|招生简章|招生政策|专业目录|本科招生).{0,24}|.{0,24}(招生章程|招生计划|报考指南|招生简章|招生政策|专业目录|本科招生).{0,36}${targetYear}.{0,24}`, "g");
  const activityPattern = new RegExp(`.{0,28}${targetYear}.{0,42}(咨询会|咨询|直播|开放日|校园开放日|招生宣传|宣讲|行程|面对面|招生组|答疑).{0,28}|.{0,28}(咨询会|咨询|直播|开放日|校园开放日|招生宣传|宣讲|行程|面对面|招生组|答疑).{0,42}${targetYear}.{0,28}`, "g");
  const matches = [...text.matchAll(pattern)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  const activityMatches = [...text.matchAll(activityPattern)]
    .map((match) => match[0].trim())
    .filter(Boolean);

  return {
    checked: true,
    hasTargetYearSignal: matches.length > 0 || generalLinks.length > 0,
    activityLinks,
    links: generalLinks,
    activityMatches: [...new Set(activityMatches)].slice(0, 5),
    matches: [...new Set(matches)].slice(0, 5)
  };
}

function rowCountOf(listData) {
  return Array.isArray(listData?.list) ? listData.list.length : 0;
}

function summaryCountOf(listData) {
  return Array.isArray(listData?.sumLists) ? listData.sumLists.length : 0;
}

function classifyResult({ years, listData, query, homepageSignals }) {
  const rowCount = rowCountOf(listData);
  const sumCount = summaryCountOf(listData);
  const hasTargetYear = years.includes(query.year);

  if (rowCount > 0 || sumCount > 0) {
    return {
      status: "available",
      statusText: `已查到${query.year}${query.province}${query.branch}${query.category}分专业计划`,
      planRows: rowCount,
      summaryRows: sumCount
    };
  }

  if (hasTargetYear) {
    return {
      status: "year-present-empty",
      statusText: `分专业计划接口已有${query.year}年份，但当前查询条件返回空，需核对省份/科类/类别/校区参数`,
      planRows: rowCount,
      summaryRows: sumCount
    };
  }

  if (homepageSignals?.hasTargetYearSignal) {
    return {
      status: "info-published-plan-api-not-ready",
      statusText: `官网已出现${query.year}招生信息线索，但分省分专业计划接口尚未返回${query.year}数据`,
      planRows: rowCount,
      summaryRows: sumCount
    };
  }

  return {
    status: "not-published",
    statusText: `未在分专业计划接口查到${query.year}${query.province}${query.branch}${query.category}数据`,
    planRows: rowCount,
    summaryRows: sumCount
  };
}

async function checkSchool(school, query, profile) {
  const homepageSignals = extractHomepageSignals(await getText(school.manualCheckUrl), query.year, school.manualCheckUrl);
  const consultationSignals = await fetchConsultationSignals(school, profile, query);

  if (!school.queryApi) {
    return {
      key: school.key,
      school: school.name,
      checked: false,
      status: "manual-required",
      statusText: school.notes || "暂无可自动调用的官方接口，需要人工复核。",
      manualCheckUrl: school.manualCheckUrl || null,
      homepageSignals,
      consultationSignals
    };
  }

  const typeBody = { type: query.type };

  try {
    const typeData = await postJson(school.queryApi.typeUrl, typeBody);
    const years = extractYears(typeData.typeMap);
    const listBodies = buildListBodiesFromTypeMap(typeData.typeMap, query);
    const attempts = [];
    let selectedBody = listBodies[0] || buildListBody(query);
    let selectedData = null;

    for (const body of listBodies) {
      const listData = await postJson(school.queryApi.listUrl, body);
      const attempt = {
        query: body,
        success: Boolean(listData?.success),
        planRows: rowCountOf(listData),
        summaryRows: summaryCountOf(listData)
      };
      attempts.push(attempt);
      selectedBody = body;
      selectedData = listData;
      if (attempt.planRows > 0 || attempt.summaryRows > 0) break;
    }

    const classified = classifyResult({ years, listData: selectedData, query, homepageSignals });

    return {
      key: school.key,
      school: school.name,
      checked: true,
      sourceLevel: school.sourceLevel,
      typeUrl: school.queryApi.typeUrl,
      listUrl: school.queryApi.listUrl,
      years,
      query: selectedBody,
      success: Boolean(typeData.success && selectedData?.success),
      homepageSignals,
      consultationSignals,
      attemptedQueries: attempts,
      ...classified,
      rows: Array.isArray(selectedData?.list) ? selectedData.list : [],
      summaryRowsData: Array.isArray(selectedData?.sumLists) ? selectedData.sumLists : [],
      sampleRows: Array.isArray(selectedData?.list) ? selectedData.list.slice(0, 5) : [],
      sampleSummaryRows: Array.isArray(selectedData?.sumLists) ? selectedData.sumLists.slice(0, 5) : []
    };
  } catch (error) {
    return {
      key: school.key,
      school: school.name,
      checked: true,
      sourceLevel: school.sourceLevel,
      status: "error",
      statusText: "自动检查失败",
      error: error.message,
      homepageSignals,
      consultationSignals
    };
  }
}

async function main() {
  const config = await readJson("data/schools.json");
  const profile = await readJson("data/profile.json");
  const query = config.defaultQuery;
  const results = [];

  for (const school of config.schools) {
    results.push(await checkSchool(school, query, profile));
  }

  const output = {
    generatedAt: nowIso(),
    query,
    schools: results,
    summary: {
      total: results.length,
      autoChecked: results.filter((item) => item.checked).length,
      available: results.filter((item) => item.status === "available").length,
      infoPublishedPlanApiNotReady: results.filter((item) => item.status === "info-published-plan-api-not-ready").length,
      yearPresentEmpty: results.filter((item) => item.status === "year-present-empty").length,
      notPublished: results.filter((item) => item.status === "not-published").length,
      manualRequired: results.filter((item) => item.status === "manual-required").length,
      errors: results.filter((item) => item.status === "error").length
    }
  };

  await mkdir(generatedDir, { recursive: true });
  const target = path.join(generatedDir, "latest-plan-check.json");
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
