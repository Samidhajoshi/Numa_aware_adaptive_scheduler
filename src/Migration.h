#pragma once
// ─── Migration.h ──────────────────────────────────────────────────────────────
// Simulated page migration for the NUMA Phase 2 simulation.
//
// IMPORTANT: This is a SIMULATION. No OS-level page migration is performed.
// No real NUMA hardware APIs (numactl, libnuma, ACPI-SLIT) are used.
// Migration cost is a synthetic model, NOT real hardware latency.
//
// Migration cost model (documented):
//   migCost(page) = page.sizeMB * MIGRATION_COST_PER_MB * (dist(src,dst) / 10.0)
//   MIGRATION_COST_PER_MB = 2.0 (simulation cost units per MB per distance unit)
//
// Adaptive evaluation interval heuristic (documented):
//   - Initial interval I0, min Imin, max Imax (all configurable).
//   - After each evaluation:
//     * If remoteRatio > HIGH_THRESHOLD (0.5): nextInterval = max(Imin, interval * 0.5)
//     * If remoteRatio < LOW_THRESHOLD  (0.1) and no migration found: nextInterval = min(Imax, interval * 2.0)
//     * Otherwise: interval unchanged.
//   - Migration decision: migrate page p to dst if:
//     1. predictedSaving = remoteCount(p) * remoteExtraCost(p) > migCost(p) * SAFETY_MARGIN (1.5)
//     2. dst has room for p.sizeMB
//     3. p is not in cooldown (last migration > COOLDOWN_STEPS steps ago)
//     4. dst node is not the same as current home
//   - Cooldown prevents ping-pong migration.

#include <vector>
#include <string>
#include <cstdint>
#include "NUMANode.h"
#include "Workload.h"

// ─── Migration configuration ──────────────────────────────────────────────────
struct MigrationConfig {
    bool   enabled           = false;  // master enable/disable for migration
    double migCostPerMBUnit  = 2.0;    // simulation cost units per MB per dist-unit
    double safetyMargin      = 1.5;    // predicted saving must exceed cost by this factor
    double highRemoteThresh  = 0.50;   // trigger faster evaluation above this remote ratio
    double lowRemoteThresh   = 0.10;   // trigger slower evaluation below this remote ratio
    int    initInterval      = 100;    // initial steps between evaluations
    int    minInterval       = 10;     // minimum steps between evaluations
    int    maxInterval       = 1000;   // maximum steps between evaluations
    int    cooldownSteps     = 200;    // steps a page must wait after a migration

    // ── Policy knobs (defaults reproduce the original naive policy) ───────────
    // decayFactor: multiplied into every access counter at each evaluation.
    //   1.0  = no decay; counters are all-time totals, so the destination choice
    //          is an all-time argmax and lags far behind a change in the access
    //          pattern.  <1.0 turns the counters into an EWMA over a recent
    //          window, so the policy follows the workload instead of its history.
    // horizonAware: when true, predicted saving is extrapolated from a RATE over
    //   the recent window across the steps that actually remain, instead of
    //   using raw past access counts as a stand-in for future ones.  Without it
    //   a page with a long history looks worth moving even near the end of the
    //   run, when there is no time left to recoup the cost.
    // horizonCapMult: how far past the observation window the policy is willing
    //   to extrapolate.  The steps REMAINING in the trace are the wrong horizon:
    //   in a shifting workload the current pattern lasts only until the next
    //   phase change, which the policy cannot see.  Extrapolating a rate from a
    //   short window across the whole remaining run over-predicts savings by
    //   orders of magnitude and causes runaway migration.  Capping the horizon
    //   at a small multiple of what has actually been observed keeps the
    //   estimate honest.  1.0 reproduces the naive policy's implicit horizon
    //   ("assume the future resembles the past, for as long as I have watched").
    double decayFactor       = 1.0;    // 1.0 = off (naive); <1.0 = EWMA
    bool   horizonAware      = false;  // scale predicted saving by a bounded horizon
    double horizonCapMult    = 1.0;    // horizon <= this * observation window
    int    totalSteps        = 0;      // length of the trace; bounds the horizon
};

// ─── Access count per page (tracked during simulation) ────────────────────────
struct PageAccessCounts {
    int pageId         = 0;
    int homeNode       = 0;
    long long localAcc  = 0;  // accesses where threadNode == homeNode
    long long remoteAcc = 0;  // accesses where threadNode != homeNode
    // per-node access counts (size = numNodes)
    std::vector<long long> perNodeAcc;

    long long total() const { return localAcc + remoteAcc; }
    double remoteRatio() const {
        long long t = total();
        return t > 0 ? static_cast<double>(remoteAcc) / t : 0.0;
    }
    // Which node accesses this page most?
    int dominantNode() const {
        int best = homeNode;
        long long bestCount = 0;
        for (int i = 0; i < (int)perNodeAcc.size(); ++i) {
            if (perNodeAcc[i] > bestCount) { bestCount = perNodeAcc[i]; best = i; }
        }
        return best;
    }
};

// ─── Single migration event record ───────────────────────────────────────────
struct MigrationEvent {
    int    pageId        = 0;
    int    fromNode      = 0;
    int    toNode        = 0;
    long long sizeMB     = 0;
    double migCost       = 0.0;      // simulated migration cost (cost units)
    double predictedSaving = 0.0;    // estimated future saving at time of decision
    double actualSaving  = 0.0;      // observed saving after migration (set post-hoc)
    int    stepNumber    = 0;        // simulation step when migration occurred
    bool   completed     = false;    // false if rejected (capacity / cooldown)
    std::string rejectReason;        // non-empty if rejected
};

// ─── Adaptive evaluation event record ────────────────────────────────────────
struct EvalEvent {
    int    stepNumber      = 0;
    int    intervalBefore  = 0;
    int    intervalAfter   = 0;
    double remoteRatio     = 0.0;
    int    pagesEvaluated  = 0;
    int    pagesMigrated   = 0;
    std::string reason;              // why interval changed (or "stable")
};

// ─── MigrationState: runtime state for a single simulation run ─────────────────
struct MigrationState {
    MigrationConfig config;

    // Per-page access tracking.  Indexed by page ID.
    std::vector<PageAccessCounts> pageAcc;

    // Migration history per page: last step a page was migrated.
    std::vector<int> lastMigrationStep;   // -cooldown initially

    // Current pages vector (may be modified by migration).
    std::vector<Page> pages;

    // Log of migration events.
    std::vector<MigrationEvent> migrations;

    // Log of evaluation events.
    std::vector<EvalEvent> evalLog;

    // Realized saving per page, measured during the replay against the
    // counterfactual "page never moved".  Filled in by the cost model, not by
    // the policy, so predicted and realized saving are independent numbers.
    std::vector<double> realizedSaving;

    // Adaptive interval state.
    int currentInterval = 100;
    int nextEvalStep    = 0;

    // Effective length of the window the access counters cover.  With no decay
    // this is simply the number of steps so far; with decay it converges to
    // interval / (1 - decayFactor).  Used to turn counts into a rate.
    double accountedSteps = 0.0;
    int    lastEvalStep   = 0;

    // Summary counters.
    int evalCount             = 0;
    int migrationsAttempted   = 0;
    int migrationsCompleted   = 0;
    int migrationsRejected    = 0;
    long long bytesTransferred = 0;  // MB × dist-unit, proxy for data transferred
    double totalMigrationCost = 0.0;
};

// ─── Functions ────────────────────────────────────────────────────────────────

// Initialise MigrationState for a run.  Must be called before recording accesses.
MigrationState initMigrationState(const MigrationConfig& cfg,
                                  const std::vector<Page>& pages,
                                  int numNodes);

// Record that thread `threadNode` accessed page `pageId`.
// Updates PageAccessCounts.  Does NOT trigger evaluation (call evaluateAndMigrate
// at interval boundaries).
void recordAccess(MigrationState& ms, int pageId, int threadNode,
                  long long reads, long long writes);

// Evaluate all pages and potentially migrate them.
// `nodes` is the current node state (used for capacity check).
// `topo`  provides distance information.
// `step`  is the current simulation step number.
// Returns the set of pages that were migrated in this evaluation.
// Evaluation only happens if step >= ms.nextEvalStep.
bool shouldEvaluate(const MigrationState& ms, int step);

void evaluateAndMigrate(MigrationState& ms,
                        std::vector<NUMANode>& nodes,
                        const NUMATopology& topo,
                        int step,
                        int pageSizeMB);

// Compute simulated migration cost for moving `sizeMB` from `src` to `dst`.
// cost = sizeMB * migCostPerMBUnit * (dist(src,dst) / 10.0)
double computeMigrationCost(const MigrationConfig& cfg,
                            int sizeMB,
                            int dist);

// Summary statistics derived from MigrationState.
struct MigrationSummary {
    int    evalCount            = 0;
    int    migrationsAttempted  = 0;
    int    migrationsCompleted  = 0;
    int    migrationsRejected   = 0;
    long long bytesTransferred  = 0;  // proxy: sum(sizeMB) of completed migrations
    double totalMigrationCost   = 0.0;
    double avgIntervalBetweenEvals = 0.0;
    int    pingPongPrevented    = 0;  // migrations avoided due to cooldown
    // Why migrations were turned down, so the UI can say what the policy did.
    int    rejectCooldown       = 0;
    int    rejectInsufficient   = 0;
    int    rejectNoCapacity     = 0;
    double totalPredictedSaving = 0.0;  // what the policy expected to save
    double totalRealizedSaving  = 0.0;  // what the replay actually measured
};
MigrationSummary summariseMigration(const MigrationState& ms);
