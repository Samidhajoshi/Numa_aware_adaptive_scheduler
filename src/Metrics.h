#pragma once
#include <string>
#include <vector>
#include "Algorithms.h"
#include "Migration.h"

// ─── Extended metrics struct ──────────────────────────────────────────────────
// Groups A–G as specified in the feature requirements.
// All cost values are SYNTHETIC SIMULATION UNITS, not real milliseconds.
// CPU utilization is the mean of (cpuDemand/cpus) per node, capped to [0,1].
struct Metrics {
    // ── A: Workload metadata ──────────────────────────────────────────────────
    std::string algorithm;
    int         workloadId    = 0;
    std::string workloadType;   // e.g., "MIXED"
    unsigned    seed          = 0;
    int         numThreads    = 0;
    int         numPages      = 0;
    int         numPhases     = 1;

    // ── B: Memory access ──────────────────────────────────────────────────────
    long long totalAccesses  = 0;
    long long localAccesses  = 0;
    long long remoteAccesses = 0;
    double    localRatio     = 0.0;  // localAccesses / totalAccesses
    double    remoteRatio    = 0.0;  // remoteAccesses / totalAccesses

    // Per-node access counts (indexed by node ID).
    std::vector<long long> perNodeAccesses;

    // ── C: Performance model (simulated cost) ─────────────────────────────────
    // Formula: cost = sum over all (thread,access) of
    //   (reads * READ_COST + writes * WRITE_COST) * (dist/10) * cpuFactor * memFactor
    // where READ_COST=1.0, WRITE_COST=1.5, cpuFactor=max(1,cpuLoad),
    //       memFactor=1+(memUtil-0.75) if memUtil>0.75 else 1.
    double totalCost           = 0.0;   // placement cost only (no migration)
    double totalReadCost       = 0.0;
    double totalWriteCost      = 0.0;
    double avgCostPerAccess    = 0.0;
    double migrationCostTotal  = 0.0;   // total simulated migration cost
    double totalCostWithMig    = 0.0;   // totalCost + migrationCostTotal
    double costSavingsVsRandom = 0.0;   // absolute saving vs Random baseline (set by compare)

    // ── D: Node resources ─────────────────────────────────────────────────────
    double avgCpuUtil = 0.0;   // mean across nodes, capped to 1.0
    double avgMemUtil = 0.0;   // mean across nodes

    // Per-node detail (size = numNodes).
    struct NodeDetail {
        int       id;
        int       threads;
        double    cpuLoad;      // may exceed 1.0 if oversubscribed
        double    cpuUtil;      // capped to 1.0
        double    memUtil;
        long long memUsedMB;
        long long memTotalMB;
        int       incomingMigrations;
        int       outgoingMigrations;
        long long pageCount;    // pages homed here at the END of the run

        // What the threads RUNNING on this node experienced.  This is the
        // node's own point of view, and it is what migration is supposed to
        // improve: fewer of its accesses reaching across the interconnect.
        long long issuedAccesses = 0;   // accesses made by threads on this node
        long long issuedLocal    = 0;   // ...that landed on a page homed here
        long long issuedRemote   = 0;   // ...that had to go to another node
        double    issuedCost     = 0.0; // access cost those threads paid
    };
    std::vector<NodeDetail> nodeDetails;

    // ── E: Migration metrics ──────────────────────────────────────────────────
    bool   migrationEnabled       = false;
    int    evalCount              = 0;
    int    migrationsAttempted    = 0;
    int    migrationsCompleted    = 0;
    int    migrationsRejected     = 0;
    long long pagesMoved          = 0;   // = migrationsCompleted
    long long mbTransferred       = 0;   // sum of sizeMB for completed migrations
    double avgIntervalBetweenEvals= 0.0;
    int    pingPongPrevented      = 0;

    // ── F: Adaptive behavior ──────────────────────────────────────────────────
    std::vector<int>    intervalHistory;    // eval intervals over time
    std::vector<double> remoteRatioHistory; // remote ratio at each eval

    // One entry per evaluation: what the policy saw and what it decided.
    // This is the raw material for showing WHEN the system chose to migrate.
    struct EvalPoint {
        int         step;
        int         intervalBefore;
        int         intervalAfter;
        double      remoteRatio;
        int         pagesMigrated;
        std::string reason;
    };
    std::vector<EvalPoint> evalTrace;

    // Per-page outcome: what moving this page cost, and what it actually saved.
    // net > 0 means the move paid for itself.
    struct PageVerdict {
        int    pageId;
        int    moves;
        int    lastFrom;
        int    lastTo;
        double migCost;
        double predictedSaving;
        double realizedSaving;
    };
    std::vector<PageVerdict> pageVerdicts;

    // Why the policy declined to move pages.
    int rejectCooldown     = 0;
    int rejectInsufficient = 0;
    int rejectNoCapacity   = 0;

    // Predicted vs realized saving, aggregated.
    double totalPredictedSaving  = 0.0;
    double totalActualSaving     = 0.0;

    // ── G: Comparison helper (set by printComparison / API) ───────────────────
    std::string bestAlgorithm;
    double      improvementVsRandom = 0.0;  // % cost reduction vs Random

    // Full placement data (for node-level display in frontend).
    Placement placement;
};

// ─── Evaluation functions ─────────────────────────────────────────────────────

// Evaluate a placement (no migration).
Metrics evaluate(Algo algo, const Workload& w, const NUMATopology& topo,
                 const Placement& p);

// Drive the replay with migration enabled and merge the results in.
// `ms` is mutated: pages move, evaluations are logged, the interval adapts.
Metrics evaluateWithMigration(Algo algo, const Workload& w,
                              const NUMATopology& topo,
                              const Placement& p,
                              MigrationState& ms);

// ─── Display functions ────────────────────────────────────────────────────────
void printRunSummary(const Metrics& m);
void printComparison(const std::vector<Metrics>& results);
