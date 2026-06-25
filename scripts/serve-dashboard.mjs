import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_FILES } from "./page-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const preferredPort = Number(process.env.GKZY_PORT || 4173);
let activePort = preferredPort;

const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"]
]);

let updateInProgress = false;
let lastUpdate = null;
let currentUpdate = null;

const pipelineSteps = [
  { script: "scripts/update-data.mjs", label: "联网检查2026招生计划" },
  { script: "scripts/generate-score-rank-reference.mjs", label: "更新一分一段位次表" },
  { script: "scripts/generate-binhe-itinerary-audit.mjs", label: "更新滨河招生行程" },
  { script: "scripts/audit-coverage-2025.mjs", label: "审计630-660学校覆盖" },
  { script: "scripts/evaluate-candidates.mjs", label: "重算候选专业评分" },
  { script: "scripts/generate-plan-admit-audit.mjs", label: "生成计划实录审计" },
  { script: "scripts/generate-historical-reference.mjs", label: "生成历年分数参考" },
  { script: "scripts/generate-report.mjs", label: "生成家庭报告" },
  { script: "scripts/generate-dashboard.mjs", label: "生成dashboard" },
  { script: "scripts/generate-course-audit.mjs", label: "生成课程审计" },
  { script: "scripts/generate-outcome-audit.mjs", label: "生成保研就业审计" },
  { script: "scripts/generate-parent-handbook.mjs", label: "生成家长行动手册" }
];

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function runNodeScript(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(rootDir, script)], {
      cwd: rootDir,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ script, stdout, stderr });
        return;
      }
      const error = new Error(`${script} exited with ${code}`);
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

async function runUpdatePipeline() {
  const logs = [];
  for (let index = 0; index < pipelineSteps.length; index += 1) {
    const { script, label } = pipelineSteps[index];
    currentUpdate = {
      ...currentUpdate,
      stepIndex: index + 1,
      stepTotal: pipelineSteps.length,
      currentStep: label,
      currentScript: script,
      message: `正在执行：${label}`
    };
    logs.push(await runNodeScript(script));
    currentUpdate = {
      ...currentUpdate,
      completedSteps: [...(currentUpdate?.completedSteps || []), label],
      message: `已完成：${label}`
    };
  }
  const latestCheck = JSON.parse(await readFile(path.join(rootDir, "data", "generated", "latest-plan-check.json"), "utf8"));
  return { logs, latestCheck };
}

async function startUpdateInBackground() {
  updateInProgress = true;
  const startedAt = new Date().toISOString();
  currentUpdate = {
    ok: null,
    startedAt,
    finishedAt: null,
    stepIndex: 0,
    stepTotal: pipelineSteps.length,
    currentStep: "准备开始",
    currentScript: null,
    completedSteps: [],
    message: "更新任务已启动"
  };

  try {
    const result = await runUpdatePipeline();
    lastUpdate = {
      ok: true,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: result.latestCheck.summary
    };
    currentUpdate = {
      ...currentUpdate,
      ok: true,
      finishedAt: lastUpdate.finishedAt,
      stepIndex: pipelineSteps.length,
      currentStep: "完成",
      message: "同步完成，可刷新页面查看最新数据",
      latestSummary: result.latestCheck.summary
    };
  } catch (error) {
    lastUpdate = {
      ok: false,
      startedAt,
      finishedAt: new Date().toISOString(),
      message: error.message,
      stderr: error.stderr || ""
    };
    currentUpdate = {
      ...currentUpdate,
      ok: false,
      finishedAt: lastUpdate.finishedAt,
      message: error.message,
      stderr: error.stderr || ""
    };
  } finally {
    updateInProgress = false;
  }
}

async function serveFile(request, response) {
  const requestUrl = new URL(request.url, `http://127.0.0.1:${activePort}`);
  const pathname = decodeURIComponent(requestUrl.pathname);
  const relativePath = pathname === "/" ? PAGE_FILES.dashboard : pathname.slice(1);
  const target = path.resolve(rootDir, relativePath);

  if (!target.startsWith(rootDir) || !existsSync(target)) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  const ext = path.extname(target);
  const contentType = contentTypes.get(ext) || "application/octet-stream";
  const content = await readFile(target);
  response.writeHead(200, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(content);
}

async function handleRequest(request, response) {
  try {
    if (request.method === "GET" && request.url === "/api/status") {
      sendJson(response, 200, {
        updateInProgress,
        lastUpdate,
        currentUpdate,
        pipelineSteps
      });
      return;
    }

    if (request.method === "POST" && request.url === "/api/update") {
      if (updateInProgress) {
        sendJson(response, 409, {
          ok: false,
          message: "已有更新任务正在运行，请稍后再试。"
        });
        return;
      }

      startUpdateInBackground();
      sendJson(response, 202, {
        ok: true,
        message: "更新任务已启动",
        currentUpdate,
        pipelineSteps
      });
      return;
    }

    if (request.method === "GET") {
      await serveFile(request, response);
      return;
    }

    response.writeHead(405, { "content-type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.stack || error.message);
  }
}

function listen(port, attempt = 0) {
  const maxAttempts = 10;
  const server = createServer(handleRequest);
  server.once("error", (error) => {
    if (error.code === "EADDRINUSE" && attempt < maxAttempts) {
      const nextPort = port + 1;
      console.log(`端口 ${port} 已被占用，尝试 http://127.0.0.1:${nextPort}/`);
      listen(nextPort, attempt + 1);
      return;
    }
    throw error;
  });
  server.listen(port, "127.0.0.1", () => {
    activePort = port;
    console.log(`GKZY dashboard: http://127.0.0.1:${port}/`);
    console.log("点击 dashboard 顶部“同步最新数据”会执行联网检查和本地页面重生成。");
  });
}

listen(preferredPort);
