import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const YEARS = ["2025", "2024", "2023"];
const PROVINCE = "陕西";

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function postJson(url, body) {
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
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
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

function branchCompatible(actualBranch) {
  if (!actualBranch || actualBranch === "全部") return true;
  return /物理|理工/.test(actualBranch);
}

function categoryPriority(categories) {
  const wanted = ["普通类", "中外合作", "国家专项", "高校专项", "少数民族预科班"];
  const loose = categories.filter((item) => /普通|合作|专项|预科/.test(item));
  return [...new Set([...wanted, ...loose])].filter((item) => categories.includes(item));
}

function listBodies(typeMap, year) {
  const entries = parseTypeMap(typeMap)
    .filter((entry) => entry.sf === PROVINCE && entry.nf === year)
    .filter((entry) => branchCompatible(entry.klmc))
    .sort((a, b) => {
      const score = (entry) =>
        (entry.klmc === "物理类" ? 6 : 0) +
        (entry.klmc === "理工" ? 5 : 0) +
        (entry.klmc === "全部" ? 1 : 0) +
        (entry.xqmc ? 1 : 0);
      return score(b) - score(a);
    });

  const bodies = [];
  for (const entry of entries) {
    for (const zslb of categoryPriority(entry.categories)) {
      bodies.push({
        type: "lnfs",
        sf: entry.sf,
        nf: entry.nf,
        zslb,
        klmc: entry.klmc,
        xqmc: entry.xqmc === "全部" ? "" : entry.xqmc
      });
    }
  }

  const seen = new Set();
  return bodies.filter((body) => {
    const key = [body.nf, body.zslb, body.klmc, body.xqmc].join("\u0001");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function normalizeRow(row, school) {
  const minScore = numberOrNull(row.zdf ?? row.minScore ?? row.score);
  if (!row.zymc && minScore === null) return null;
  return {
    schoolKey: school.key,
    school: school.name,
    major: row.zymc || row.major || "未命名专业",
    admissionYear: row.nf || row.admissionYear || "",
    admissionProvince: row.sf || row.admissionProvince || PROVINCE,
    admissionSubject: row.klmc || row.admissionSubject || "",
    admissionCategory: row.zslb || row.admissionCategory || "",
    campus: row.xqlx || row.xqmc || row.campus || "",
    subjectRequirement: row.xkkm || row.xkyq || "",
    admittedCount: numberOrNull(row.lqrs),
    minScore,
    avgScore: numberOrNull(row.pjf ?? row.avgScore),
    maxScore: numberOrNull(row.zgf ?? row.maxScore),
    minRank: numberOrNull(row.zdfwc ?? row.rank),
    avgRank: numberOrNull(row.pjfwc),
    maxRank: numberOrNull(row.zgfwc),
    sourceLevel: school.sourceLevel === "A" ? "A" : "B",
    sourceName: `${school.name}本科招生网历年分数接口`,
    sourceUrl: school.manualCheckUrl || ""
  };
}

function dedupeRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = [
      row.schoolKey,
      row.admissionYear,
      row.admissionProvince,
      row.admissionSubject,
      row.admissionCategory,
      row.campus,
      row.major,
      row.minScore
    ].join("\u0001");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fetchSchool(school) {
  if (!school.queryApi?.typeUrl || !school.queryApi?.listUrl) {
    return {
      key: school.key,
      school: school.name,
      checked: false,
      status: "manual-required",
      rows: [],
      error: "暂无标准历年分数接口"
    };
  }

  try {
    const typeData = await postJson(school.queryApi.typeUrl, { type: "lnfs" });
    const rows = [];
    const attempts = [];
    for (const year of YEARS) {
      const bodies = listBodies(typeData.typeMap || {}, year);
      for (const body of bodies) {
        const data = await postJson(school.queryApi.listUrl, body);
        const list = Array.isArray(data?.list) ? data.list : [];
        attempts.push({ year, query: body, rows: list.length });
        for (const item of list) {
          const normalized = normalizeRow(item, school);
          if (normalized) rows.push(normalized);
        }
      }
    }
    return {
      key: school.key,
      school: school.name,
      checked: true,
      status: rows.length ? "available" : "empty",
      rows: dedupeRows(rows),
      attempts
    };
  } catch (error) {
    return {
      key: school.key,
      school: school.name,
      checked: true,
      status: "error",
      rows: [],
      error: error.message
    };
  }
}

function baselineRows(baseline, schools) {
  const schoolMap = new Map((schools.schools || []).map((school) => [school.key, school]));
  return (baseline.items || []).map((item) => {
    const school = schoolMap.get(item.schoolKey);
    return {
      schoolKey: item.schoolKey,
      school: item.school,
      major: item.major,
      admissionYear: String(item.admissionYear || baseline.year || "2025"),
      admissionProvince: item.admissionProvince || baseline.province || PROVINCE,
      admissionSubject: item.admissionSubject || baseline.subject || "",
      admissionCategory: item.admissionCategory || "2025候选基线",
      campus: item.campus || "",
      subjectRequirement: item.subjectRequirement || "",
      admittedCount: null,
      plan: item.plan ?? null,
      minScore: numberOrNull(item.minScore ?? item.score),
      avgScore: numberOrNull(item.avgScore),
      maxScore: numberOrNull(item.maxScore),
      minRank: numberOrNull(item.rank),
      sourceLevel: item.sourceLevel || school?.sourceLevel || "B",
      sourceName: "2025候选专业基线",
      sourceUrl: school?.manualCheckUrl || ""
    };
  });
}

async function main() {
  const [schools, baseline] = await Promise.all([
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json")
  ]);

  const results = [];
  for (const school of schools.schools || []) {
    results.push(await fetchSchool(school));
  }

  const officialRows = dedupeRows(results.flatMap((result) => result.rows || []));
  const officialSchoolKeys = new Set(officialRows.map((row) => row.schoolKey).filter(Boolean));
  const fallbackRows = baselineRows(baseline, schools).filter((row) => !officialSchoolKeys.has(row.schoolKey));
  const output = {
    generatedAt: new Date().toISOString(),
    province: PROVINCE,
    years: YEARS,
    description: "官方可自动化接口优先；无接口学校保留2025候选基线，页面中标注待官方复核。",
    summary: {
      schools: results.length,
      availableSchools: results.filter((item) => item.status === "available").length,
      officialRows: officialRows.length,
      fallbackRows: fallbackRows.length
    },
    schools: results.map((result) => ({
      key: result.key,
      school: result.school,
      checked: result.checked,
      status: result.status,
      rows: result.rows?.length || 0,
      error: result.error || null,
      attempts: (result.attempts || []).filter((attempt) => attempt.rows > 0).slice(0, 12)
    })),
    rows: dedupeRows([...officialRows, ...fallbackRows])
  };

  await mkdir(generatedDir, { recursive: true });
  const target = path.join(generatedDir, "historical-admissions.json");
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
