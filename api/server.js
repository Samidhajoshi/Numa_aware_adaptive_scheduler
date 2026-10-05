const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const EXE = path.resolve(__dirname, "../numa_phase2.exe");
const DB  = path.resolve(__dirname, "../database/numa_phase2.db");


function runSimulator(choices) {
  return new Promise((resolve, reject) => {
    const child = spawn(EXE, [DB], {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", () => resolve({ stdout, stderr }));

    // Write choices one by one then "6" to exit
    const allChoices = [...choices, "6"];
    let idx = 0;

    function sendNext() {
      if (idx < allChoices.length) {
        child.stdin.write(allChoices[idx] + "\n");
        idx++;
        // Small delay gives the C++ side time to print before we send next line
        if (idx < allChoices.length) setTimeout(sendNext, 120);
        else child.stdin.end();
      }
    }
    sendNext();
  });
}


function parseNodes(text) {

  const nodes = [];

  // Format A: newer "CPU Util / Mem Util" style
  const reA =
    /Node\s+(\d+)\s*\|\s*CPUs:\s*(\d+)\s*\|\s*Memory:\s*([\d.]+)\s*MB\s*\|\s*CPU Util:\s*([\d.]+)%\s*\|\s*Mem Util:\s*([\d.]+)%/g;
  let m;
  while ((m = reA.exec(text)) !== null) {
    const memTotalMB = parseFloat(m[3]);
    const memUtil    = parseFloat(m[5]);
    nodes.push({
      id:         parseInt(m[1]),
      cpus:       parseInt(m[2]),
      cpuLoad:    parseFloat(m[4]),
      memUsedMB:  Math.round(memUtil / 100 * memTotalMB),
      memTotalMB,
      memUtil,
    });
  }

  if (nodes.length === 0) {
    const reB =
      /Node\s+(\d+)\s*\|\s*CPUs:\s*(\d+)\s*\|\s*CPU load:\s*([\d.]+)%\s*\|\s*Mem:\s*([\d.]+)\s*MB used\s*\/\s*([\d.]+)\s*MB total\s*\(\s*([\d.]+)%\s*\)/g;
    while ((m = reB.exec(text)) !== null) {
      nodes.push({
        id:         parseInt(m[1]),
        cpus:       parseInt(m[2]),
        cpuLoad:    parseFloat(m[3]),
        memUsedMB:  parseFloat(m[4]),
        memTotalMB: parseFloat(m[5]),
        memUtil:    parseFloat(m[6]),
      });
    }
  }

  // Distance matrix  (lines like:  10  20  30  20)
  const distMatrix = [];
  const lines = text.split("\n");
  let inMatrix = false;
  for (const line of lines) {
    if (/Distance matrix/i.test(line)) { inMatrix = true; continue; }
    if (inMatrix) {
      const nums = line.trim().split(/\s+/).map(Number).filter((n) => !isNaN(n) && n > 0);
      if (nums.length > 0) distMatrix.push(nums);
      else if (distMatrix.length > 0) break;
    }
  }

  return { nodes, distMatrix };
}

function parseWorkload(text) {
  const idM    = text.match(/Workload #(\d+)/);
  const seedM  = text.match(/seed\s+(\d+)/);
  const pagesM = text.match(/Pages:\s*(\d+)\s*x\s*(\d+)\s*MB/);
  const thrM   = text.match(/Threads:\s*(\d+)/);
  const accM   = text.match(/Accesses:\s*([\d,]+)\s*total\s*\(([\d,]+)\s*reads,\s*([\d,]+)\s*writes\)/);
  const residentM = [...text.matchAll(/N(\d+)=(\d+)/g)];

  return {
    workloadId:     idM    ? parseInt(idM[1])                       : null,
    seed:           seedM  ? parseInt(seedM[1])                     : null,
    numPages:       pagesM ? parseInt(pagesM[1])                    : null,
    pageSizeMB:     pagesM ? parseInt(pagesM[2])                    : null,
    numThreads:     thrM   ? parseInt(thrM[1])                      : null,
    totalAccesses:  accM   ? parseInt(accM[1].replace(/,/g, ""))    : null,
    totalReads:     accM   ? parseInt(accM[2].replace(/,/g, ""))    : null,
    totalWrites:    accM   ? parseInt(accM[3].replace(/,/g, ""))    : null,
    residentPerNode: residentM.map((m) => ({ node: parseInt(m[1]), pages: parseInt(m[2]) })),
  };
}

function parseAlgorithmBlock(block) {
  /**
   * [Random]
   *   Node 0 | Threads:  2 | CPU load:  50% | Mem:  12.3%
   *   ...
   *   Accesses: 12345 total, 8000 local, 4345 remote | Cost: 9999
   */
  const nameM = block.match(/^\[(.+?)\]/m);
  if (!nameM) return null;

  const nodeLines = [];
  const nodeRe =
    /Node\s+(\d+)\s*\|\s*Threads:\s*(\d+)\s*\|\s*CPU load:\s*([\d.]+)%\s*\|\s*Mem:\s*([\d.]+)%/g;
  let nm;
  while ((nm = nodeRe.exec(block)) !== null) {
    nodeLines.push({
      id: parseInt(nm[1]),
      threads: parseInt(nm[2]),
      cpuLoad: parseFloat(nm[3]),
      memUtil: parseFloat(nm[4]),
    });
  }

  const accM = block.match(
    /Accesses:\s*([\d,]+)\s*total,\s*([\d,]+)\s*local,\s*([\d,]+)\s*remote\s*\|\s*Cost:\s*([\d.]+)/
  );

  return {
    algorithm:     nameM[1],
    nodes:         nodeLines,
    totalAccesses: accM ? parseInt(accM[1].replace(/,/g, ""))  : 0,
    localAccesses: accM ? parseInt(accM[2].replace(/,/g, ""))  : 0,
    remoteAccesses:accM ? parseInt(accM[3].replace(/,/g, ""))  : 0,
    cost:          accM ? parseFloat(accM[4])                  : 0,
  };
}

function parseRunResults(text) {
  // Split on lines that start with "["
  const blocks = text.split(/(?=^\[)/m).filter((b) => b.includes("["));
  return blocks.map(parseAlgorithmBlock).filter(Boolean);
}

function parseComparison(text) {
  /**
   * Parse line-by-line (pipe-split). Actual output:
   * Random               |  19.43% |   80.57% |    77.6% |       61.9% | 49672
   * Numbers may have leading spaces before the % sign.
   */
  const rows = [];
  const lines = text.split(/\r?\n/);
  let inTable = false;
  for (const line of lines) {
    if (/^-{5,}/.test(line)) { inTable = true; continue; }
    if (!inTable) continue;
    if (!line.includes('|')) { inTable = false; continue; }
    const parts = line.split('|').map(s => s.trim());
    if (parts.length < 6) continue;
    const algo = parts[0].trim();
    if (!algo || /Algorithm/i.test(algo)) continue;
    const localPct  = parseFloat(parts[1]);
    const remotePct = parseFloat(parts[2]);
    const cpuUtil   = parseFloat(parts[3]);
    const memUtil   = parseFloat(parts[4]);
    const cost      = parseFloat(parts[5]);
    if (isNaN(localPct) || isNaN(cost)) continue;
    rows.push({ algorithm: algo, localPct, remotePct, cpuUtil, memUtil, cost });
  }
  const bestM   = text.match(/Lowest cost:\s*(.+?)(?:\s*\(|$)/m);
  const improvM = text.match(/([\d.]+)%\s*below Random/);
  return {
    rows,
    bestAlgorithm:  bestM   ? bestM[1].trim()        : null,
    improvementPct: improvM ? parseFloat(improvM[1]) : null,
  };
}

function parseStoredResults(text) {
  /**
   * Header: Run  Wkld Algorithm               Total    Local   Remote  Remote%   CPU%   Mem%      Cost  Time
   * Actual:  1    1    Random                  22183     4311    17872   80.57%  77.6%  61.9%     49672  2026-09-20 14:01:34
   * Strategy: after the separator line, each line starts with two integers (run_id, workload_id).
   * Algorithm name ends where the first large integer starts.
   * Datetime at the end is always "YYYY-MM-DD HH:MM:SS".
   */
  const rows = [];
  const lines = text.split(/\r?\n/);
  let inTable = false;
  for (const rawLine of lines) {
    if (/^-{10,}/.test(rawLine)) { inTable = true; continue; }
    if (!inTable) continue;
    const line = rawLine.trim();
    if (!line) { inTable = false; continue; }
    // match the fixed-pattern tail: 7 numbers + datetime
    const tail = line.match(
      /^(\d+)\s+(\d+)\s+(.*?)\s{2,}(\d+)\s+(\d+)\s+(\d+)\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)%\s+([\d.]+)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\s*$/
    );
    if (!tail) continue;
    rows.push({
      runId:          parseInt(tail[1]),
      workloadId:     parseInt(tail[2]),
      algorithm:      tail[3].trim(),
      totalAccesses:  parseInt(tail[4]),
      localAccesses:  parseInt(tail[5]),
      remoteAccesses: parseInt(tail[6]),
      remotePct:      parseFloat(tail[7]),
      cpuUtil:        parseFloat(tail[8]),
      memUtil:        parseFloat(tail[9]),
      cost:           parseFloat(tail[10]),
      runAt:          tail[11],
    });
  }
  return rows;
}

// ─── routes ─────────────────────────────────────────────────────────────────

// GET /api/nodes
app.get("/api/nodes", async (req, res) => {
  try {
    const { stdout } = await runSimulator(["1"]);
    const data = parseNodes(stdout);
    res.json({ ok: true, raw: stdout, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/workload  body: { seed?: number }
app.post("/api/workload", async (req, res) => {
  const seed = req.body?.seed ?? 42;
  try {
    const { stdout } = await runSimulator(["2", String(seed)]);
    const data = parseWorkload(stdout);
    res.json({ ok: true, raw: stdout, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/run  body: { seed?: number }   — generates workload then runs all 4 algos
app.post("/api/run", async (req, res) => {
  const seed = req.body?.seed ?? 42;
  try {
    // choice 2 (workload), seed, choice 3 (run algos)
    const { stdout } = await runSimulator(["2", String(seed), "3"]);
    const workload  = parseWorkload(stdout);
    const algos     = parseRunResults(stdout);
    res.json({ ok: true, raw: stdout, workload, algorithms: algos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/compare  body: { seed?: number }
app.post("/api/compare", async (req, res) => {
  const seed = req.body?.seed ?? 42;
  try {
    const { stdout } = await runSimulator(["2", String(seed), "3", "4"]);
    const comparison = parseComparison(stdout);
    const algos      = parseRunResults(stdout);
    res.json({ ok: true, raw: stdout, comparison, algorithms: algos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/history
app.get("/api/history", async (req, res) => {
  try {
    const { stdout } = await runSimulator(["5"]);
    const rows = parseStoredResults(stdout);
    res.json({ ok: true, raw: stdout, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


const PORT = 3001;
app.listen(PORT, () => console.log(`NUMA API listening on http://localhost:${PORT}`));
