const express = require("express");
const cors = require("cors");
const { spawn } = require("child_process");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

const EXE = path.resolve(__dirname, "../numa_phase2.exe");
const DB  = path.resolve(__dirname, "../database/numa_phase2.db");

// ─── Workload type mapping ────────────────────────────────────────────────────
const WORKLOAD_TYPES = [
  { key: "CPU_INTENSIVE", label: "CPU Intensive",  menuChoice: "1" },
  { key: "READ_HEAVY",    label: "Read Heavy",     menuChoice: "2" },
  { key: "WRITE_HEAVY",   label: "Write Heavy",    menuChoice: "3" },
  { key: "MIXED",         label: "Mixed",          menuChoice: "4" },
];

function workloadMenuChoice(typeKey) {
  const found = WORKLOAD_TYPES.find(t => t.key === typeKey);
  return found ? found.menuChoice : "4";
}

// ─── JSON-mode simulator runner ───────────────────────────────────────────────
// Sends a JSON config to the C++ simulator via stdin (--json mode) and
// returns the parsed JSON response.  This is the primary API for all new
// features.  No text parsing required.
function runSimulatorJson(config) {
  return new Promise((resolve, reject) => {
    const child = spawn(EXE, ["--json", DB], {
      cwd: path.resolve(__dirname, ".."),
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`Simulator exited with code ${code}: ${stderr}`));
      }
      try {
        const parsed = JSON.parse(stdout);
        resolve(parsed);
      } catch (e) {
        reject(new Error(`Failed to parse simulator JSON output: ${e.message}\nOutput: ${stdout.substring(0, 500)}`));
      }
    });

    // Write config JSON to stdin.
    child.stdin.write(JSON.stringify(config) + "\n");
    child.stdin.end();
  });
}

// ─── Legacy text-mode simulator runner ───────────────────────────────────────
// Kept for backward compatibility with any code that still uses the menu system.
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

    const allChoices = [...choices, "6"];
    let idx = 0;
    function sendNext() {
      if (idx < allChoices.length) {
        child.stdin.write(allChoices[idx] + "\n");
        idx++;
        if (idx < allChoices.length) setTimeout(sendNext, 120);
        else child.stdin.end();
      }
    }
    sendNext();
  });
}

// ─── Legacy parsers (kept for /api/nodes and /api/history) ────────────────────
function parseNodes(text) {
  const nodes = [];
  const reA =
    /Node\s+(\d+)\s*\|\s*CPUs:\s*(\d+)\s*\|\s*Memory:\s*([\d.]+)\s*MB\s*\|\s*CPU Util:\s*([\d.]+)%\s*\|\s*Mem Util:\s*([\d.]+)%/g;
  let m;
  while ((m = reA.exec(text)) !== null) {
    const memTotalMB = parseFloat(m[3]);
    const memUtil    = parseFloat(m[5]);
    nodes.push({
      id: parseInt(m[1]), cpus: parseInt(m[2]),
      cpuLoad: parseFloat(m[4]),
      memUsedMB: Math.round(memUtil / 100 * memTotalMB),
      memTotalMB, memUtil,
    });
  }
  if (nodes.length === 0) {
    const reB =
      /Node\s+(\d+)\s*\|\s*CPUs:\s*(\d+)\s*\|\s*CPU load:\s*([\d.]+)%\s*\|\s*Mem:\s*([\d.]+)\s*MB used\s*\/\s*([\d.]+)\s*MB total\s*\(\s*([\d.]+)%\s*\)/g;
    while ((m = reB.exec(text)) !== null) {
      nodes.push({
        id: parseInt(m[1]), cpus: parseInt(m[2]),
        cpuLoad: parseFloat(m[3]),
        memUsedMB: parseFloat(m[4]),
        memTotalMB: parseFloat(m[5]),
        memUtil: parseFloat(m[6]),
      });
    }
  }

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

function parseStoredResults(text) {
  const rows = [];
  const lines = text.split(/\r?\n/);
  let inTable = false;
  for (const rawLine of lines) {
    if (/^-{10,}/.test(rawLine)) { inTable = true; continue; }
    if (!inTable) continue;
    const line = rawLine.trim();
    if (!line) { inTable = false; continue; }
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

// ─── Input validation helpers ─────────────────────────────────────────────────
function validateTopology(body) {
  const errors = [];
  const numNodes = body.numNodes ?? 4;
  if (numNodes < 2 || numNodes > 8) errors.push("numNodes must be 2–8");

  const topologyType = body.topologyType ?? "Symmetric";
  if (!["Symmetric", "Asymmetric"].includes(topologyType))
    errors.push("topologyType must be 'Symmetric' or 'Asymmetric'");

  // Validate per-node resources if provided.
  if (body.nodeConfigs && Array.isArray(body.nodeConfigs)) {
    if (body.nodeConfigs.length !== numNodes)
      errors.push(`nodeConfigs length must equal numNodes (${numNodes})`);
    body.nodeConfigs.forEach((nc, i) => {
      if (nc.cpus < 1 || nc.cpus > 128) errors.push(`nodeConfigs[${i}].cpus must be 1–128`);
      if (nc.memMB < 1024) errors.push(`nodeConfigs[${i}].memMB must be >= 1024`);
    });
  }

  // Validate asymmetric distance matrix if provided.
  if (body.distMatrix) {
    if (!Array.isArray(body.distMatrix) || body.distMatrix.length !== numNodes)
      errors.push(`distMatrix must be a ${numNodes}×${numNodes} array`);
    else {
      body.distMatrix.forEach((row, i) => {
        if (!Array.isArray(row) || row.length !== numNodes)
          errors.push(`distMatrix[${i}] must have ${numNodes} entries`);
        row.forEach((v, j) => {
          if (typeof v !== "number" || v <= 0)
            errors.push(`distMatrix[${i}][${j}] must be a positive number`);
          if (i === j && v !== 10)
            errors.push(`distMatrix diagonal must be 10 (local distance convention)`);
        });
      });
    }
  }

  return errors;
}

function buildSimulatorConfig(body) {
  const numNodes    = body.numNodes     ?? 4;
  const topologyType = body.topologyType ?? "Symmetric";
  const seed        = body.seed         ?? 42;
  const workloadType = body.workloadType ?? "MIXED";

  const cfg = {
    numNodes,
    topologyType,
    seed,
    workloadType,
    migrationEnabled: body.migrationEnabled ?? false,
    numThreads:    body.numThreads    ?? 16,
    numPages:      body.numPages      ?? 0,
    refsPerThread: body.refsPerThread ?? 48,
    pageSizeMB:    body.pageSizeMB    ?? 16,
    hotPageSkew:   body.hotPageSkew   ?? 0.80,
    // Migration config
    initInterval:     body.initInterval     ?? 100,
    minInterval:      body.minInterval      ?? 10,
    maxInterval:      body.maxInterval      ?? 1000,
    cooldownSteps:    body.cooldownSteps    ?? 200,
    safetyMargin:     body.safetyMargin     ?? 1.5,
    highRemoteThresh: body.highRemoteThresh ?? 0.5,
    lowRemoteThresh:  body.lowRemoteThresh  ?? 0.1,
    migCostPerMBUnit: body.migCostPerMBUnit ?? 2.0,
  };

  // Per-node configs as flat keys (matches C++ JSON parser).
  const nodeConfigs = body.nodeConfigs;
  if (nodeConfigs && Array.isArray(nodeConfigs)) {
    nodeConfigs.forEach((nc, i) => {
      cfg[`cpus${i}`]  = nc.cpus  ?? 4;
      cfg[`memMB${i}`] = nc.memMB ?? 8192;
    });
  }

  // Distance matrix as flat keys dist_i_j.
  if (body.distMatrix && Array.isArray(body.distMatrix)) {
    body.distMatrix.forEach((row, i) => {
      if (Array.isArray(row)) {
        row.forEach((v, j) => { cfg[`dist_${i}_${j}`] = v; });
      }
    });
  }

  // Multi-phase workload.
  if (body.phases && Array.isArray(body.phases)) {
    body.phases.forEach((ph, i) => {
      cfg[`phase${i}Type`]  = ph.type  ?? "MIXED";
      cfg[`phase${i}Steps`] = ph.steps ?? 48;
      cfg[`phase${i}Shift`] = ph.affinityShift ?? 0;
    });
  }

  return cfg;
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/workload-types
app.get("/api/workload-types", (_req, res) => {
  res.json({ ok: true, types: WORKLOAD_TYPES });
});

// GET /api/nodes  — legacy text-mode endpoint for simple topology display
app.get("/api/nodes", async (req, res) => {
  try {
    const { stdout } = await runSimulator(["1"]);
    const data = parseNodes(stdout);
    res.json({ ok: true, raw: stdout, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/topology  — JSON-mode: get topology info for a given config
// body: { numNodes, topologyType, nodeConfigs?, distMatrix?, seed? }
app.post("/api/topology", async (req, res) => {
  const errors = validateTopology(req.body);
  if (errors.length) return res.status(400).json({ ok: false, errors });

  try {
    const cfg = buildSimulatorConfig({ ...req.body, workloadType: "MIXED", seed: req.body.seed ?? 42 });
    const data = await runSimulatorJson(cfg);
    // Return topology + workload info
    res.json({
      ok: true,
      topology: data.topology,
      workload:  data.workload,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/workload  — legacy + JSON hybrid
// body: { seed?, workloadType?, numNodes?, topologyType?, ... }
app.post("/api/workload", async (req, res) => {
  const seed      = req.body?.seed         ?? 42;
  const typeKey   = req.body?.workloadType ?? "MIXED";

  // If extended config present, use JSON mode.
  if (req.body?.numNodes || req.body?.topologyType) {
    const errors = validateTopology(req.body);
    if (errors.length) return res.status(400).json({ ok: false, errors });
    try {
      const cfg = buildSimulatorConfig(req.body);
      const data = await runSimulatorJson(cfg);
      res.json({ ok: true, ...data.workload, topology: data.topology });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  // Legacy mode.
  const typeChoice = workloadMenuChoice(typeKey);
  try {
    const { stdout } = await runSimulator(["2", typeChoice, String(seed)]);
    const workloadId = stdout.match(/Workload #(\d+)/)?.[1];
    const seedM      = stdout.match(/seed\s+(\d+)/)?.[1];
    const pagesM     = stdout.match(/Pages:\s*(\d+)\s*x\s*(\d+)\s*MB/);
    const thrM       = stdout.match(/Threads:\s*(\d+)/)?.[1];
    const accM       = stdout.match(/Accesses:\s*([\d,]+)\s*total\s*\(([\d,]+)\s*reads,\s*([\d,]+)\s*writes\)/);
    const residentM  = [...stdout.matchAll(/N(\d+)=(\d+)/g)];
    res.json({
      ok: true, raw: stdout,
      workloadId: workloadId ? parseInt(workloadId) : null,
      seed:       seedM      ? parseInt(seedM)      : null,
      workloadType: typeKey,
      numPages:   pagesM ? parseInt(pagesM[1]) : null,
      pageSizeMB: pagesM ? parseInt(pagesM[2]) : null,
      numThreads: thrM   ? parseInt(thrM)      : null,
      totalAccesses: accM ? parseInt(accM[1].replace(/,/g,"")) : null,
      totalReads:    accM ? parseInt(accM[2].replace(/,/g,"")) : null,
      totalWrites:   accM ? parseInt(accM[3].replace(/,/g,"")) : null,
      residentPerNode: residentM.map(m => ({ node: parseInt(m[1]), pages: parseInt(m[2]) })),
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/run  — JSON mode: run all 4 algorithms with full config
// body: { seed?, workloadType?, numNodes?, topologyType?, migrationEnabled?, ... }
app.post("/api/run", async (req, res) => {
  // If any extended config, use JSON mode.
  if (req.body?.numNodes || req.body?.topologyType || req.body?.migrationEnabled !== undefined) {
    const errors = validateTopology(req.body);
    if (errors.length) return res.status(400).json({ ok: false, errors });
    try {
      const cfg = buildSimulatorConfig(req.body);
      const data = await runSimulatorJson(cfg);
      res.json({ ok: true, ...data });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
    return;
  }

  // Legacy mode (no new config fields).
  const seed      = req.body?.seed         ?? 42;
  const typeKey   = req.body?.workloadType ?? "MIXED";
  const typeChoice = workloadMenuChoice(typeKey);
  try {
    const cfg = buildSimulatorConfig(req.body);
    const data = await runSimulatorJson(cfg);
    res.json({ ok: true, ...data });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/compare  — JSON mode: compare + return structured result
// body: same as /api/run
app.post("/api/compare", async (req, res) => {
  const errors = validateTopology(req.body ?? {});
  if (errors.length) return res.status(400).json({ ok: false, errors });
  try {
    const cfg = buildSimulatorConfig(req.body ?? {});
    const data = await runSimulatorJson(cfg);

    // Build comparison object matching the legacy shape the frontend expects.
    const rows = (data.comparison?.rows ?? []).map(r => ({
      algorithm: r.algorithm,
      localPct:  r.localPct,
      remotePct: r.remotePct,
      cpuUtil:   r.cpuUtil,
      memUtil:   r.memUtil,
      cost:      r.cost,
      costWithMig: r.costWithMig,
    }));
    const best = data.comparison?.bestAlgorithm;
    const improvPct = data.comparison?.improvementVsRandomPct;

    res.json({
      ok: true,
      workload:    data.workload,
      topology:    data.topology,
      algorithms:  data.algorithms,
      comparison: {
        rows,
        bestAlgorithm:  best,
        improvementPct: improvPct,
        migrationEnabled: data.comparison?.migrationEnabled ?? false,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/migration-study  — the paired experiment.
// Runs the SAME workload three ways (migration off, naive policy, recency
// policy) and returns all three plus a per-algorithm verdict, so the question
// "was migration worth it here?" is answered without the user re-running and
// diffing numbers by hand.
app.post("/api/migration-study", async (req, res) => {
  const errors = validateTopology(req.body ?? {});
  if (errors.length) return res.status(400).json({ ok: false, errors });

  try {
    const base = buildSimulatorConfig(req.body ?? {});
    const [off, naive, recency] = await Promise.all([
      runSimulatorJson({ ...base, migrationEnabled: false }),
      runSimulatorJson({ ...base, migrationEnabled: true, migrationPolicy: "naive" }),
      runSimulatorJson({ ...base, migrationEnabled: true, migrationPolicy: "recency" }),
    ]);

    // Pair the runs up by algorithm and score each one.
    const byAlgo = (run) =>
      Object.fromEntries((run.algorithms ?? []).map(a => [a.algorithm, a]));
    const offA = byAlgo(off), naiveA = byAlgo(naive), recA = byAlgo(recency);

    const verdicts = (off.algorithms ?? []).map(a => {
      const name     = a.algorithm;
      const baseline = a.totalCost;
      const score = (run) => {
        const r = run[name];
        if (!r) return null;
        const net = baseline - r.totalCostWithMig;
        return {
          placementCost: r.totalCost,
          migrationCost: r.migrationCostTotal,
          totalCost:     r.totalCostWithMig,
          net,
          paidOff:       net > 0,
          pctOfBaseline: baseline > 0 ? (net / baseline) * 100 : 0,
          localRatio:    r.localRatio,
          migrationsCompleted: r.migrationsCompleted,
          evalCount:     r.evalCount,
          predicted:     r.totalPredictedSaving,
          realized:      r.totalRealizedSaving,
        };
      };
      return {
        algorithm:   name,
        baselineCost: baseline,
        baselineLocalRatio: a.localRatio,
        naive:       score(naiveA),
        recency:     score(recA),
      };
    });

    res.json({
      ok: true,
      workload: off.workload,
      topology: off.topology,
      verdicts,
      runs: { off, naive, recency },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/history  — reads stored results via legacy CLI
app.get("/api/history", async (req, res) => {
  try {
    const { stdout } = await runSimulator(["5"]);
    const rows = parseStoredResults(stdout);
    res.json({ ok: true, raw: stdout, rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`NUMA API listening on http://localhost:${PORT}`));
