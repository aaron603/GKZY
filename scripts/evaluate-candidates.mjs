import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const generatedDir = path.join(rootDir, "data", "generated");

async function readJson(relativePath) {
  const content = await readFile(path.join(rootDir, relativePath), "utf8");
  return JSON.parse(content);
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword));
}

function schoolPlatformScore(school) {
  const tier = school?.tier || "";
  if (tier.includes("985")) return 18;
  if (tier.includes("211")) return 14;
  if (tier.includes("双一流")) return 12;
  return 8;
}

const schoolGroups = [
  {
    name: "C9",
    score: 10,
    names: ["北京大学", "清华大学", "复旦大学", "上海交通大学", "南京大学", "浙江大学", "中国科学技术大学", "哈尔滨工业大学", "西安交通大学"]
  },
  {
    name: "华东五校",
    score: 10,
    names: ["复旦大学", "上海交通大学", "南京大学", "浙江大学", "中国科学技术大学"]
  },
  {
    name: "国防七子",
    score: 9,
    names: ["北京航空航天大学", "北京理工大学", "哈尔滨工业大学", "西北工业大学", "哈尔滨工程大学", "南京航空航天大学", "南京理工大学"]
  },
  {
    name: "中坚九校",
    score: 8,
    names: ["北京理工大学", "天津大学", "东南大学", "厦门大学", "华南理工大学", "四川大学", "华中科技大学", "中山大学", "西北工业大学"]
  },
  {
    name: "985重点",
    score: 5,
    names: []
  }
];

function normalizeSchoolName(value) {
  return String(value || "").replace(/[（）()]/g, "").replace(/\s+/g, "");
}

function schoolPriorityGroups(item, school) {
  const name = normalizeSchoolName(item.school || school?.name || "");
  const matched = [];
  for (const group of schoolGroups) {
    if (group.names.some((candidate) => name.includes(normalizeSchoolName(candidate)))) {
      matched.push(group.name);
    }
  }
  if (!matched.length && /985/.test(school?.tier || "")) matched.push("985重点");
  return matched;
}

function schoolGroupPriority(item, school) {
  const groups = schoolPriorityGroups(item, school);
  if (!groups.length) return 0;
  const scoreByName = new Map(schoolGroups.map((group) => [group.name, group.score]));
  return Math.max(...groups.map((group) => scoreByName.get(group) || 0));
}

function cityScore(school) {
  const city = school?.city || "";
  if (city.includes("西安")) return 8;
  if (/(北京|上海|深圳|广州|杭州|南京|成都|武汉)/.test(city)) return 7;
  if (/(长沙|重庆|大连|济南|青岛|威海)/.test(city)) return 6;
  return 4;
}

function focusSchoolRank(profile, schoolKey) {
  const focusSchools = profile?.familyPreferences?.focusSchools || [];
  const index = focusSchools.findIndex((school) => school.schoolKey === schoolKey);
  return index === -1 ? 999 : index;
}

function focusSchoolPriority(profile, item) {
  const rank = focusSchoolRank(profile, item.schoolKey);
  if (rank === 999) return 0;
  return Math.max(0, 18 - rank * 2);
}

function majorFit(item, rules) {
  const text = `${item.major} ${item.track || ""}`;
  const matched = rules.majorTrackRules.find((rule) => includesAny(text, rule.keywords));
  return {
    score: matched?.fitScore ?? 12,
    matchedTrack: matched?.track ?? item.track ?? "待判断",
    reason: matched?.reason ?? "未匹配到明确专业规则，需要人工判断。"
  };
}

function scoreSafety(item, estimatedScore = 650) {
  const minScore = item.minScore ?? item.score;
  if (!minScore) return 8;
  const delta = estimatedScore - minScore;
  if (delta >= 15) return 22;
  if (delta >= 8) return 20;
  if (delta >= 3) return 17;
  if (delta >= 0) return 14;
  if (delta >= -5) return 10;
  if (delta >= -10) return 6;
  return 3;
}

function graduateFlexibility(item) {
  const text = `${item.major} ${item.track || ""}`;
  if (/(计算机|软件|人工智能|数据|电子|通信|集成电路|自动化|机器人|测控|医学电子|生物医学)/.test(text)) {
    return 8;
  }
  if (/(航空|航天|低空|能源|电气)/.test(text)) return 6;
  return 4;
}

function paidOpportunityBoost(item, school) {
  const text = `${item.school || ""} ${item.major || ""} ${item.track || ""} ${item.admissionCategory || ""} ${item.notes || ""}`;
  const isPaidOpportunity = /中外合作|合作办学|高收费|香港中文|港中深|港校|内地与港澳台合作办学/.test(text);
  if (!isPaidOpportunity) return 0;
  if (/中外合作|合作办学/.test(text)) return -28;
  const strongPlatform = /(985|C9|双一流|香港中文|港中深|深圳)/.test(`${school?.tier || ""} ${school?.name || ""} ${school?.city || ""}`);
  const strongMajor = /(电气|计算机|软件|人工智能|数据|电子|通信|集成电路|自动化|机器人|生物医学|医工)/.test(text);
  if (/香港中文大学（深圳）|港中深|香港中文大学/.test(text) && strongMajor) return -8;
  if (strongPlatform && strongMajor) return -10;
  if (strongPlatform) return /工业设计|建筑学|产品设计/.test(text) ? -18 : -12;
  return -12;
}

function riskScore(item, rules) {
  const text = `${item.major} ${item.track || ""}`;
  const hits = [];
  let penalty = 0;
  if (item.sourceLevel === "C" || item.admissionCategory === "院校最低分覆盖审计") {
    hits.push("院校最低分待核");
    penalty += 2;
  }
  for (const rule of rules.riskPenalties) {
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

function sourceQuality(item) {
  if (item.sourceLevel === "C") return 2;
  return item.sourceLevel === "A" ? 8 : 4;
}

function planReliability(item) {
  return item.plan ? 6 : 2;
}

const nonOrdinaryAdmissionPattern = /中外合作|中外合作办学|合作办学|国家专项|地方专项|高校专项|专项|强基|强基计划|卓越优才|预科|高收费|港校|香港中文|港中深|内地与港澳台|综合评价/;
const medicalCategoryPattern = /医学|医工|医疗|临床|口腔|基础医学|预防医学|法医学|护理学?|药学|中药学|临床药学|医学影像学|医学影像技术|医学检验技术|麻醉学|儿科学|精神医学|眼视光医学|放射医学|公共卫生|卫生检验|中医学|针灸推拿|中西医临床|康复治疗|助产/;
const excludedMainSchoolKeys = new Set(["chd", "nwu"]);

function isOrdinaryAdmission(item) {
  const text = [
    item.school,
    item.major,
    item.track,
    item.admissionCategory,
    item.suggestion,
    item.notes
  ].filter(Boolean).join(" ");
  if (excludedMainSchoolKeys.has(item.schoolKey)) return false;
  if (item.admissionCategory === "院校最低分覆盖审计") return false;
  if (item.schoolKey === "nwpu" && item.major === "软件工程") return false;
  return !nonOrdinaryAdmissionPattern.test(text) && !medicalCategoryPattern.test(text);
}

function inferAdmissionCategory(item) {
  const text = `${item.major} ${item.track || ""}`;
  if (/中外合作|合作办学/.test(text)) return "中外合作";
  if (/国家专项/.test(text)) return "国家专项";
  if (/高校专项/.test(text)) return "高校专项";
  if (/预科/.test(text)) return "预科";
  return "普通类";
}

function recommendation(score, riskHits = [], item = null, estimatedScore = null) {
  const minScore = Number(item?.minScore ?? item?.score);
  const currentScore = Number(estimatedScore);
  if (Number.isFinite(minScore) && Number.isFinite(currentScore)) {
    const gap = minScore - currentScore;
    if (gap >= 12) return "极高冲刺";
    if (gap >= 6) return "冲刺";
    if (gap >= 0 && Number(item?.avgScore) > currentScore + 2) return "高风险冲刺";
  }
  if (riskHits.includes("中外合作")) return "最低优先";
  if (riskHits.includes("设计建筑非主线")) {
    if (score >= 62) return "备选";
    return "谨慎";
  }
  if (score >= 82) return "高优先";
  if (score >= 72) return "优先";
  if (score >= 62) return "备选";
  if (score >= 52) return "安全/待核";
  return "谨慎";
}

async function main() {
  const [schoolsData, baseline, rules, profile] = await Promise.all([
    readJson("data/schools.json"),
    readJson("data/admission-baseline-2025.json"),
    readJson("data/expert-rules.json"),
    readJson("data/profile.json")
  ]);

  const schoolMap = new Map(schoolsData.schools.map((school) => [school.key, school]));
  const estimatedScore = Number(profile?.candidate?.actualScore || 662);
  const actualRank = Number(profile?.candidate?.actualRank || 1558);
  const admissionYear = baseline.year;
  const admissionProvince = baseline.province;
  const admissionSubject = baseline.subject;

  const evaluated = baseline.items.filter(isOrdinaryAdmission).map((item) => {
    const school = schoolMap.get(item.schoolKey);
    const major = majorFit(item, rules);
    const risk = riskScore(item, rules);
    const parts = {
      schoolPlatform: schoolPlatformScore(school),
      schoolGroupPriority: schoolGroupPriority(item, school),
      majorFit: major.score,
      scoreSafety: scoreSafety(item, estimatedScore),
      sourceQuality: sourceQuality(item),
      planReliability: planReliability(item),
      cityAndResource: cityScore(school),
      graduateFlexibility: graduateFlexibility(item),
      riskControl: risk.score,
      paidOpportunity: paidOpportunityBoost(item, school),
      focusSchoolPriority: focusSchoolPriority(profile, item)
    };
    const total = Object.values(parts).reduce((sum, value) => sum + value, 0);
    return {
      ...item,
      majorName: item.major,
      minScore: item.minScore ?? item.score ?? null,
      avgScore: item.avgScore ?? null,
      maxScore: item.maxScore ?? null,
      maxRank: item.maxRank ?? null,
      planYear: item.planYear ?? null,
      admissionYear,
      admissionProvince,
      admissionSubject,
      admissionCategory: item.admissionCategory || inferAdmissionCategory(item),
      actualScore: estimatedScore,
      actualRank,
      priorityGroups: schoolPriorityGroups(item, school),
      expertScore: total,
      recommendation: recommendation(total, risk.hits, item, estimatedScore),
      matchedTrack: major.matchedTrack,
      matchReason: major.reason,
      riskTags: risk.hits,
      scoreParts: parts
    };
  }).sort((a, b) =>
    focusSchoolRank(profile, a.schoolKey) - focusSchoolRank(profile, b.schoolKey) ||
    b.expertScore - a.expertScore ||
    (b.minScore || b.score || 0) - (a.minScore || a.score || 0)
  );

  const output = {
    generatedAt: new Date().toISOString(),
    estimatedScore,
    scoringWeights: rules.scoringWeights,
    items: evaluated
  };

  await mkdir(generatedDir, { recursive: true });
  const target = path.join(generatedDir, "candidate-evaluation.json");
  await writeFile(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  console.log(`Wrote ${path.relative(rootDir, target)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
