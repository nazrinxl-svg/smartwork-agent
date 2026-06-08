import fs from "fs";
import path from "path";

const root = process.cwd();
const inputPath = path.join(root, "data", "teacher-accounts.example.json");
const reportsDir = path.join(root, "reports");
const logsDir = path.join(root, "logs");

fs.mkdirSync(reportsDir, { recursive: true });
fs.mkdirSync(logsDir, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function now() {
  return new Date().toISOString();
}

function slugify(value) {
  return String(value || "unknown")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function flattenJobs(data) {
  const jobs = [];

  for (const teacher of data.teachers || []) {
    for (const app of teacher.apps || []) {
      for (const task of app.tasks || []) {
        jobs.push({
          jobId: `${teacher.teacherId}-${app.appId}-${task}`,
          teacherId: teacher.teacherId,
          teacherName: teacher.name,
          wa: teacher.wa,
          appId: app.appId,
          appName: app.appName,
          username: app.username,
          passwordRef: app.passwordRef,
          task,
          browserProfile: `browser-profile/${teacher.teacherId}/${app.appId}`,
          status: "pending",
          startedAt: null,
          endedAt: null,
          log: []
        });
      }
    }
  }

  return jobs;
}

async function runDummyWorker(job) {
  job.status = "running";
  job.startedAt = now();
  job.log.push(`[${now()}] START ${job.jobId}`);
  job.log.push(`[${now()}] TEACHER=${job.teacherName}`);
  job.log.push(`[${now()}] APP=${job.appName}`);
  job.log.push(`[${now()}] TASK=${job.task}`);
  job.log.push(`[${now()}] PROFILE=${job.browserProfile}`);
  job.log.push(`[${now()}] GUARD=NO_SAVE_NO_SUBMIT_NO_DELETE`);
  job.log.push(`[${now()}] CREDENTIAL=USING_PASSWORD_REF_ONLY_NO_REAL_PASSWORD`);

  await sleep(700 + Math.floor(Math.random() * 800));
  job.log.push(`[${now()}] STEP=prepare isolated worker`);

  await sleep(700 + Math.floor(Math.random() * 800));
  job.log.push(`[${now()}] STEP=simulate open application`);

  await sleep(700 + Math.floor(Math.random() * 800));
  job.log.push(`[${now()}] STEP=simulate check/fill without final submit`);

  await sleep(500 + Math.floor(Math.random() * 600));
  job.status = "done";
  job.endedAt = now();
  job.log.push(`[${now()}] DONE ${job.jobId}`);

  const safeName = slugify(job.jobId);
  const logPath = path.join(logsDir, `parallel-${safeName}.log`);
  fs.writeFileSync(logPath, job.log.join("\n"), "utf8");

  return job;
}

async function runPool(jobs, limit) {
  const queue = [...jobs];
  const running = new Set();
  const completed = [];

  async function launch(job) {
    running.add(job);
    try {
      const result = await runDummyWorker(job);
      completed.push(result);
    } catch (error) {
      job.status = "failed";
      job.endedAt = now();
      job.log.push(`[${now()}] ERROR=${error.message}`);
      completed.push(job);
    } finally {
      running.delete(job);
    }
  }

  while (queue.length > 0 || running.size > 0) {
    while (queue.length > 0 && running.size < limit) {
      const job = queue.shift();
      launch(job);
    }

    await sleep(200);
  }

  return completed;
}

async function main() {
  console.log("SMARTWORK_PARALLEL_RUNNER=START");
  console.log("MODE=DUMMY_SAFE_NO_REAL_LOGIN_NO_SAVE");
  console.log(`INPUT=${inputPath}`);

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file tidak ditemukan: ${inputPath}`);
  }

  const rawInput = fs.readFileSync(inputPath, "utf8")
    .replace(/^\uFEFF/, "")
    .trim();

  const data = JSON.parse(rawInput);
  const limit = Number(data.parallelLimit || 2);
  const jobs = flattenJobs(data);

  console.log(`TOTAL_JOBS=${jobs.length}`);
  console.log(`PARALLEL_LIMIT=${limit}`);
  console.log("RULE=ONE_ACCOUNT_ONE_WORKER_ONE_BROWSER_PROFILE");
  console.log("RULE=NO_SAVE_NO_SUBMIT_NO_DELETE");

  const startedAt = now();
  const completed = await runPool(jobs, limit);
  const endedAt = now();

  const report = {
    ok: true,
    mode: "dummy-safe-parallel-runner",
    startedAt,
    endedAt,
    parallelLimit: limit,
    totalJobs: completed.length,
    summary: {
      done: completed.filter((job) => job.status === "done").length,
      failed: completed.filter((job) => job.status === "failed").length
    },
    jobs: completed.map((job) => ({
      jobId: job.jobId,
      teacherId: job.teacherId,
      teacherName: job.teacherName,
      wa: job.wa,
      appId: job.appId,
      appName: job.appName,
      task: job.task,
      browserProfile: job.browserProfile,
      status: job.status,
      startedAt: job.startedAt,
      endedAt: job.endedAt,
      logFile: `logs/parallel-${slugify(job.jobId)}.log`
    }))
  };

  const reportPath = path.join(reportsDir, "parallel-runner-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  console.log("SMARTWORK_PARALLEL_RUNNER=DONE");
  console.log(`REPORT=${reportPath}`);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error) => {
  console.error("SMARTWORK_PARALLEL_RUNNER=FAILED");
  console.error(error.message);
  process.exit(1);
});

