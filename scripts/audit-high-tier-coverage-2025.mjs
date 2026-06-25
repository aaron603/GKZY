import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const provinceId = "61";
const subjectType = "2073";
const minScoreFloor = 600;
const minScoreCeiling = 690;

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(rootDir, relativePath), "utf8"));
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0 GKZY/0.1" }
  });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

function normalizeName(name) {
  return String(name || "").replace(/[()]/g, (char) => char === "(" ? "（" : "）");
}

function scoreOf(info) {
  const value = info?.province_score_min?.[provinceId]?.min;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function tierOf(info) {
  const tags = [];
  if (info?.f985 === "1") tags.push("985");
  if (info?.f211 === "1") tags.push("211");
  if (info?.dual_class_name) tags.push(info.dual_class_name);
  return tags.join("/");
}

function isHighTier(info) {
  return info?.f985 === "1" || info?.f211 === "1" || Boolean(info?.dual_class_name);
}

function likelyUsefulForProfile(name, info) {
  const text = [
    name,
    info?.type_name,
    info?.school_nature_name,
    info?.dual_class_name,
    info?.belong,
    info?.level_name
  ].filter(Boolean).join(" ");
  if (/国防科技|解放军|军事|军校/.test(text)) return "特殊类型";
  if (/人民大学|公安|政法|财经|外国语|外交|语言|师范|体育|音乐|美术|戏剧|传媒|农业|林业|医学院|中医|药科/.test(text)) return "谨慎/非主线";
  if (/电子|科技|工业|交通|航空|航天|理工|工程|邮电|电力|矿业|石油|地质|海洋|大学/.test(text)) return "可纳入";
  return "待人工判断";
}

function statusOf({ minScore, inSchools, inBaseline, isCoverageLine, profileFit }) {
  const score = minScore;
  if (inSchools || inBaseline) return isCoverageLine ? "已覆盖：院校线索" : "已覆盖：候选池";
  if (profileFit === "特殊类型") return "特殊类型留审计";
  if (profileFit === "谨慎/非主线") return "非主线留审计";
  if (score === null) return "需人工复核";
  if (score >= 630 && score <= 660) return "疑似遗漏：主分段";
  if (score >= 661 && score <= 690) return "冲刺/高费/专项观察";
  if (score >= 600 && score < 630) return "下探安全观察";
  return "暂不进入";
}

function priorityOf(row) {
  let score = 0;
  if (row.status.startsWith("疑似遗漏")) score += 100;
  if (/冲刺|下探/.test(row.status)) score += 70;
  if (/已覆盖/.test(row.status)) score += 30;
  if (row.f985) score += 30;
  else if (row.f211) score += 18;
  else if (row.dualClass) score += 10;
  if (row.profileFit === "可纳入") score += 10;
  if (row.profileFit === "谨慎/非主线") score -= 20;
  score += Math.max(0, 690 - Math.abs((row.minScore2025 ?? 690) - 645));
  return score;
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: limit }, run));
  return results;
}

async function main() {
  const [nameData, schoolsData, baseline] = await Promise.all([
    fetchJson("https://static-data.gaokao.cn/www/2.0/school/name.json"),
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json")
  ]);

  const schoolNames = new Set((schoolsData.schools || []).map((school) => normalizeName(school.name)));
  const baselineNames = new Set((baseline.items || []).map((item) => normalizeName(item.school)));
  const coverageLineNames = new Set((baseline.items || [])
    .filter((item) => item.admissionCategory === "院校最低分覆盖审计")
    .map((item) => normalizeName(item.school)));

  const sourceSchools = (nameData.data || []).filter((school) => school?.school_id && school?.name);
  const rows = await mapLimit(sourceSchools, 12, async (school) => {
    try {
      const infoData = await fetchJson(`https://static-data.gaokao.cn/www/2.0/school/${school.school_id}/info.json`);
      const info = infoData.data || {};
      const minScore = scoreOf(info);
      const name = normalizeName(info.name || school.name);
      if (!isHighTier(info)) return null;
      if (minScore === null || minScore < minScoreFloor || minScore > minScoreCeiling) return null;
      const row = {
        name,
        schoolId: String(school.school_id),
        province: info.province_name || "",
        city: info.city_name || "",
        type: info.type_name || "",
        f985: info.f985 === "1",
        f211: info.f211 === "1",
        dualClass: info.dual_class_name || "",
        tier: tierOf(info),
        minScore2025: minScore,
        site: info.site || "",
        phone: info.phone || "",
        sourceUrl: `https://www.gaokao.cn/school/${school.school_id}`,
        inSchools: schoolNames.has(name),
        inBaseline: baselineNames.has(name),
        isCoverageLine: coverageLineNames.has(name),
        profileFit: likelyUsefulForProfile(name, info)
      };
      row.status = statusOf({ ...row, minScore: row.minScore2025 });
      row.priority = priorityOf(row);
      return row;
    } catch (error) {
      return {
        name: normalizeName(school.name),
        schoolId: String(school.school_id),
        status: "抓取失败",
        error: error.message
      };
    }
  });

  const filtered = rows
    .filter(Boolean)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0) || (b.minScore2025 || 0) - (a.minScore2025 || 0));

  const output = {
    generatedAt: new Date().toISOString(),
    scope: `全量学校库高层次院校覆盖审计：985/211/双一流，2025陕西物理类院校最低分 ${minScoreFloor}-${minScoreCeiling}`,
    source: "掌上高考 static-data school/name.json + school/{id}/info.json；仅作院校层面漏斗筛查，不能替代学校官方分专业录取数据。",
    summary: {
      scannedSchools: sourceSchools.length,
      matchedHighTierInScoreRange: filtered.length,
      suspectedMissingMainBand: filtered.filter((row) => row.status === "疑似遗漏：主分段").length,
      sprintOrPaidOrSpecial: filtered.filter((row) => row.status === "冲刺/高费/专项观察").length,
      safetyObservation: filtered.filter((row) => row.status === "下探安全观察").length,
      nonMainProfileObservation: filtered.filter((row) => row.status === "非主线留审计").length,
      specialTypeObservation: filtered.filter((row) => row.status === "特殊类型留审计").length,
      covered: filtered.filter((row) => row.status.startsWith("已覆盖")).length
    },
    rows: filtered
  };

  await mkdir(generatedDir, { recursive: true });
  const target = path.join(generatedDir, "high-tier-coverage-audit-2025.json");
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
