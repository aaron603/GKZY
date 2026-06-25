import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

const provinceId = "61";
const subjectType = "2073";

const targetSchools = [
  { name: "西安交通大学", tracks: "计算机/软件/电气/智能制造/能源/医工交叉", tierHint: "985" },
  { name: "西北工业大学", tracks: "计算机/软件/电子信息/自动化/航空航天/低空", tierHint: "985" },
  { name: "电子科技大学", tracks: "电子信息/通信/集成电路/计算机/机器人", tierHint: "985" },
  { name: "哈尔滨工业大学（威海）", tracks: "计算机/软件/机器人/智能制造/电气", tierHint: "985分校" },
  { name: "天津大学", tracks: "智能计算/电气信息/精仪光电/智能制造", tierHint: "985" },
  { name: "华南理工大学", tracks: "计算机/AI低空/自动化/电气/信息工程", tierHint: "985" },
  { name: "厦门大学", tracks: "计算机/电子信息/集成电路/航空航天", tierHint: "985" },
  { name: "武汉大学", tracks: "网安/电子信息/电气/微电子/智能制造", tierHint: "985" },
  { name: "华中科技大学", tracks: "光电/机械/航空航天/人工智能/电气", tierHint: "985" },
  { name: "东南大学", tracks: "计算机/电子信息/自动化/智能制造", tierHint: "985" },
  { name: "中山大学", tracks: "计算机/电子信息/人工智能/软件", tierHint: "985" },
  { name: "同济大学", tracks: "计算机/电子信息/工科试验班", tierHint: "985" },
  { name: "南开大学", tracks: "计算机/电子信息/智能科学", tierHint: "985" },
  { name: "大连理工大学", tracks: "人工智能/软件/电子信息/智能制造", tierHint: "985" },
  { name: "重庆大学", tracks: "计算机/电气/自动化/工科试验班", tierHint: "985" },
  { name: "山东大学", tracks: "计算机/软件/电子信息/自动化", tierHint: "985" },
  { name: "四川大学", tracks: "计算机/软件/电子信息/生物医学工程", tierHint: "985" },
  { name: "湖南大学", tracks: "计算机/电子信息/电气/自动化", tierHint: "985" },
  { name: "中南大学", tracks: "软件/计算机/自动化/电子信息", tierHint: "985" },
  { name: "东北大学", tracks: "自动化/计算机/人工智能/软件", tierHint: "985" },
  { name: "东北大学秦皇岛分校", tracks: "计算机/自动化/电子信息", tierHint: "985分校" },
  { name: "吉林大学", tracks: "计算机/软件/人工智能/车辆/电子信息", tierHint: "985" },
  { name: "兰州大学", tracks: "计算机/电子信息/大气/化学/生物信息", tierHint: "985" },
  { name: "中国海洋大学", tracks: "计算机/电子信息/自动化/海洋技术", tierHint: "985", caution: "海洋/农水属性较强，只作985安全补充" },
  { name: "中国农业大学", tracks: "计算机/电子信息/数据科学/生物信息", tierHint: "985", caution: "农林属性明显，不主推，只作985标签备查" },
  { name: "北京邮电大学", tracks: "计算机/通信/电子信息/网安/人工智能", tierHint: "211" },
  { name: "西安电子科技大学", tracks: "通信/电子信息/集成电路/计算机/网安", tierHint: "211" },
  { name: "北京交通大学", tracks: "计算机/通信/交通智能/电气", tierHint: "211" },
  { name: "南京航空航天大学", tracks: "航空航天/软件/电气/低空/无人系统", tierHint: "211" },
  { name: "南京理工大学", tracks: "电子信息/自动化/计算机/智能制造", tierHint: "211" },
  { name: "哈尔滨工程大学", tracks: "计算机/通信/软件/自动化/机器人", tierHint: "211" },
  { name: "华北电力大学（北京）", tracks: "电气/智能电网/通信/人工智能", tierHint: "211" },
  { name: "北京科技大学", tracks: "计算机/自动化/人工智能/材料智能制造", tierHint: "211" },
  { name: "北京工业大学", tracks: "计算机/电子信息/人工智能/自动化", tierHint: "211" },
  { name: "华东理工大学", tracks: "计算机/人工智能/自动化/生物工程/化工", tierHint: "211" },
  { name: "上海大学", tracks: "计算机/电子信息/通信/自动化", tierHint: "211" },
  { name: "苏州大学", tracks: "计算机/软件/电子信息/纳米/生物医学工程", tierHint: "211" },
  { name: "河海大学", tracks: "计算机/电气/自动化/水利智能", tierHint: "211" },
  { name: "武汉理工大学", tracks: "计算机/电子信息/自动化/车辆/材料智能", tierHint: "211" },
  { name: "合肥工业大学", tracks: "计算机/车辆/电气/自动化/智能制造", tierHint: "211" },
  { name: "西南交通大学", tracks: "计算机/通信/电气/轨道智能", tierHint: "211" },
  { name: "郑州大学", tracks: "计算机/电子信息/自动化/软件", tierHint: "211" },
  { name: "中国地质大学（武汉）", tracks: "计算机/电子信息/自动化/地信", tierHint: "211" },
  { name: "中国石油大学（华东）", tracks: "计算机/自动化/电子信息/储能", tierHint: "211" },
  { name: "中国矿业大学", tracks: "计算机/人工智能/电气/自动化", tierHint: "211" },
  { name: "江南大学", tracks: "人工智能/物联网/数字媒体/生物工程", tierHint: "211" },
  { name: "福州大学", tracks: "计算机/电子信息/电气/自动化", tierHint: "211" },
  { name: "南京邮电大学", tracks: "通信/电子信息/计算机/网安", tierHint: "双一流" },
  { name: "杭州电子科技大学", tracks: "计算机/电子信息/通信/自动化", tierHint: "强行业非211" },
  { name: "深圳大学", tracks: "计算机/电子信息/人工智能/软件", tierHint: "强城市非211" },
  { name: "南方科技大学", tracks: "计算机/电子信息/生物医学工程/理工试验", tierHint: "强新型非985/211" },
  { name: "上海科技大学", tracks: "计算机/电子信息/生物科学/创新班", tierHint: "强新型非985/211" }
];

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

function schoolKeyFromName(name) {
  const direct = {
    "同济大学": "tongji",
    "南开大学": "nankai",
    "中山大学": "sysu",
    "上海科技大学": "shanghaitech",
    "南方科技大学": "sustech"
  };
  if (direct[name]) return direct[name];
  const ascii = name
    .replace(/[（）()]/g, "")
    .replace(/大学|学院|科技|工业|交通|电子|北京|南京|西安|中国|华东|华北|华南|华中|东北|西南|西北|哈尔滨|大连|重庆|山东|四川|湖南|中南|吉林|兰州|上海|苏州|武汉|合肥|郑州|杭州|深圳|南方/g, "")
    .replace(/\s+/g, "");
  const map = {
    中山: "sysu",
    同济: "tongji",
    南开: "nankai",
    农业: "cau",
    海洋: "ouc",
    地质武汉: "cug",
    石油华东: "upc",
    矿业: "cumt",
    江南: "jiangnan",
    福州: "fzu",
    邮电: "njupt",
    电子: "hdu",
    南方: "sustech",
    上海: "shanghaitech"
  };
  return map[ascii] || name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 18);
}

function classify(minScore, covered, coverageAdded, target) {
  if (coverageAdded) return "覆盖审计已补入";
  if (covered) return "已在当前候选池";
  if (minScore === null) return "需人工复核";
  if (minScore > 660) return "高于660，暂不主推";
  if (minScore >= 630) return "建议补入主观察池";
  if (minScore >= 610) return "低于630，补入安全观察池";
  return "低于610，暂不进入主池";
}

function priority(status, target) {
  const is985 = /985/.test(target.tierHint) && !/非985/.test(target.tierHint);
  if (status === "覆盖审计已补入") return is985 ? 90 : 78;
  if (status === "建议补入主观察池") return is985 ? 92 : 84;
  if (status === "低于630，补入安全观察池") return is985 ? 80 : 68;
  if (status === "已在当前候选池") return 60;
  if (status === "高于660，暂不主推") return 45;
  return 40;
}

async function main() {
  const [nameData, schoolsData, baseline] = await Promise.all([
    fetchJson("https://static-data.gaokao.cn/www/2.0/school/name.json"),
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json")
  ]);

  const nameMap = new Map((nameData.data || []).map((item) => [normalizeName(item.name), item]));
  const coveredNames = new Set([
    ...schoolsData.schools.map((school) => school.name),
    ...baseline.items.filter((item) => item.admissionCategory !== "院校最低分覆盖审计").map((item) => item.school)
  ]);
  const coverageAddedNames = new Set(baseline.items
    .filter((item) => item.admissionCategory === "院校最低分覆盖审计")
    .map((item) => item.school));

  const rows = [];
  for (const target of targetSchools) {
    const found = nameMap.get(normalizeName(target.name));
    if (!found) {
      rows.push({ ...target, status: "需人工复核", reason: "未在掌上高考学校名录匹配到", minScore2025: null });
      continue;
    }
    let info = null;
    try {
      info = await fetchJson(`https://static-data.gaokao.cn/www/2.0/school/${found.school_id}/info.json`);
    } catch (error) {
      rows.push({ ...target, schoolId: found.school_id, status: "需人工复核", reason: error.message, minScore2025: null });
      continue;
    }

    const detail = info.data || {};
    const min = detail.province_score_min?.[provinceId]?.min ?? null;
    const minScore = min === null ? null : Number(min);
    const covered = coveredNames.has(target.name);
    const coverageAdded = coverageAddedNames.has(target.name);
    const status = classify(minScore, covered, coverageAdded, target);
    rows.push({
      name: target.name,
      key: schoolKeyFromName(target.name),
      schoolId: found.school_id,
      city: detail.city_name || "",
      province: detail.province_name || "",
      tierHint: target.tierHint,
      f985: detail.f985 === "1",
      f211: detail.f211 === "1",
      dualClass: detail.dual_class_name || "",
      minScore2025: minScore,
      subjectType,
      sourceUrl: `https://www.gaokao.cn/school/${found.school_id}`,
      site: detail.site || "",
      phone: detail.phone || "",
      tracks: target.tracks,
      caution: target.caution || "",
      covered,
      coverageAdded,
      status,
      priority: priority(status, target),
      reason: status === "已在当前候选池"
        ? "当前数据已覆盖，后续只需继续核专业明细。"
        : "按院校最低分做覆盖筛查；目标专业通常高于院校最低分，必须继续核专业录取分。"
    });
  }

  rows.sort((a, b) => b.priority - a.priority || (b.minScore2025 ?? 0) - (a.minScore2025 ?? 0));
  const output = {
    generatedAt: new Date().toISOString(),
    scope: "2025陕西物理类院校最低分覆盖审计，重点排查630-660估分段可能遗漏的985/211/双一流/强工科学校。",
    source: "掌上高考静态数据 school/info.json 的 province_score_min[61][2073]；专业明细仍需回学校官方或省考试院复核。",
    rows,
    summary: {
      total: rows.length,
      covered: rows.filter((row) => row.covered).length,
      addMainObservation: rows.filter((row) => row.status === "建议补入主观察池").length,
      addSafetyObservation: rows.filter((row) => row.status === "低于630，补入安全观察池").length,
      above660: rows.filter((row) => row.status === "高于660，暂不主推").length,
      manual: rows.filter((row) => row.status === "需人工复核").length
    }
  };

  await mkdir(generatedDir, { recursive: true });
  const target = path.join(generatedDir, "coverage-audit-2025.json");
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
  console.log(JSON.stringify(output.summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
