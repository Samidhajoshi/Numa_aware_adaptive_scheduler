#include "Migration.h"
#include <algorithm>
#include <cmath>
using namespace std;

// ─── Migration cost model ─────────────────────────────────────────────────────
// Documented formula:
//   cost = sizeMB * migCostPerMBUnit * (dist / 10.0)
// dist is a synthetic simulation unit; dist=10 is local (no extra cost).
// This is NOT a real hardware latency measurement.
double computeMigrationCost(const MigrationConfig& cfg, int sizeMB, int dist) {
    return sizeMB * cfg.migCostPerMBUnit * (dist / 10.0);
}

// ─── initMigrationState ───────────────────────────────────────────────────────
MigrationState initMigrationState(const MigrationConfig& cfg,
                                  const vector<Page>& pages,
                                  int numNodes) {
    MigrationState ms;
    ms.config          = cfg;
    ms.pages           = pages;
    ms.currentInterval = cfg.initInterval;
    ms.nextEvalStep    = cfg.initInterval;

    ms.pageAcc.resize(pages.size());
    ms.lastMigrationStep.resize(pages.size(), -cfg.cooldownSteps - 1);
    ms.realizedSaving.assign(pages.size(), 0.0);

    for (int i = 0; i < (int)pages.size(); ++i) {
        ms.pageAcc[i].pageId   = pages[i].id;
        ms.pageAcc[i].homeNode = pages[i].node;
        ms.pageAcc[i].perNodeAcc.assign(numNodes, 0);
    }
    return ms;
}

// ─── recordAccess ─────────────────────────────────────────────────────────────
// O(1): just update access counters.  Does not trigger migration.
void recordAccess(MigrationState& ms, int pageId, int threadNode,
                  long long reads, long long writes) {
    if (pageId < 0 || pageId >= (int)ms.pageAcc.size()) return;
    auto& pa = ms.pageAcc[pageId];
    int home = ms.pages[pageId].node;
    long long total = reads + writes;
    if (threadNode == home) pa.localAcc  += total;
    else                    pa.remoteAcc += total;
    if (threadNode >= 0 && threadNode < (int)pa.perNodeAcc.size())
        pa.perNodeAcc[threadNode] += total;
}

// ─── shouldEvaluate ───────────────────────────────────────────────────────────
bool shouldEvaluate(const MigrationState& ms, int step) {
    return ms.config.enabled && step >= ms.nextEvalStep;
}

// ─── evaluateAndMigrate ───────────────────────────────────────────────────────
// Adaptive heuristic:
//
// Interval adjustment:
//   1. Compute global remote-access ratio across all pages.
//   2. If ratio > HIGH_THRESHOLD: halve the interval (evaluate more often).
//   3. If ratio < LOW_THRESHOLD AND no migration found: double the interval.
//   4. Otherwise keep interval.
//   Interval is bounded to [minInterval, maxInterval].
//
// Migration decision per page p:
//   1. If p is in cooldown (lastMigStepN > step - cooldownSteps): skip.
//   2. Find candidate destination dst = dominantNode(p) if dst != home.
//   3. Compute predictedSaving:
//        remoteExtraCost = accesses that are remote × (dist(currentHome, dst) - dist(dst,dst)) / 10 × READ_COST
//        (simplified: we use remoteAcc × (dist(home, dst) / 10 - 1.0) × UNIT_COST)
//      predictedSaving ≈ remoteAcc × (dist(home, dst)/10.0 - 1.0) × 1.0  [1 cost unit per access unit]
//   4. migCost = computeMigrationCost(...)
//   5. If predictedSaving > migCost * safetyMargin AND dst has room: migrate.
//   6. Record event (completed or rejected with reason).
//
// Rationale:
//   - We do NOT use a fixed interval as the only policy.
//   - The heuristic is deterministic for the same inputs and seed.
//   - Cooldown prevents ping-pong migration.
//   - Cold pages (little/no remote accesses) are naturally skipped.
//   - This is an experimental heuristic; we do not claim it is optimal.
void evaluateAndMigrate(MigrationState& ms,
                        vector<NUMANode>& nodes,
                        const NUMATopology& topo,
                        int step,
                        int pageSizeMB) {
    if (!ms.config.enabled || step < ms.nextEvalStep) return;

    // ── Age the access counters ──────────────────────────────────────────────
    // With decayFactor == 1.0 this is a no-op and the counters stay all-time
    // totals (the original policy).  Below 1.0 they become an EWMA, so the
    // destination choice reflects the recent access pattern rather than the
    // whole history.  accountedSteps tracks the effective window the counters
    // now cover, which is what lets us read a rate off them.
    double decay = ms.config.decayFactor;
    if (decay < 1.0) {
        for (auto& pa : ms.pageAcc) {
            pa.localAcc  = static_cast<long long>(pa.localAcc  * decay);
            pa.remoteAcc = static_cast<long long>(pa.remoteAcc * decay);
            for (auto& c : pa.perNodeAcc) c = static_cast<long long>(c * decay);
        }
        ms.accountedSteps = ms.accountedSteps * decay + (step - ms.lastEvalStep);
    } else {
        ms.accountedSteps = step;
    }
    ms.lastEvalStep = step;

    // ── Compute global remote ratio for interval adjustment ──────────────────
    long long gTotal = 0, gRemote = 0;
    for (const auto& pa : ms.pageAcc) {
        gTotal  += pa.localAcc + pa.remoteAcc;
        gRemote += pa.remoteAcc;
    }
    double gRemoteRatio = gTotal > 0 ? static_cast<double>(gRemote) / gTotal : 0.0;

    // Steps left in the trace; 0 if the caller did not supply a total.
    int stepsRemaining = ms.config.totalSteps > step
                         ? ms.config.totalSteps - step : 0;

    int intervalBefore = ms.currentInterval;
    int foundMigrations = 0;

    // ── Evaluate each page ───────────────────────────────────────────────────
    for (int pid = 0; pid < (int)ms.pageAcc.size(); ++pid) {
        auto& pa = ms.pageAcc[pid];
        if (pa.total() == 0) continue;  // cold page – skip

        int home = ms.pages[pid].node;
        int dst  = pa.dominantNode();
        if (dst == home) continue;  // already on best node

        ++ms.migrationsAttempted;

        MigrationEvent evt;
        evt.pageId    = pid;
        evt.fromNode  = home;
        evt.toNode    = dst;
        evt.sizeMB    = pageSizeMB;
        evt.stepNumber = step;

        // Check cooldown (ping-pong prevention).
        if (step - ms.lastMigrationStep[pid] < ms.config.cooldownSteps) {
            evt.completed    = false;
            evt.rejectReason = "cooldown";
            ms.migrations.push_back(evt);
            ++ms.migrationsRejected;
            continue;
        }

        // Compute migration cost.
        int dist  = topo.distance(home, dst);
        evt.migCost = computeMigrationCost(ms.config, pageSizeMB, dist);

        // Estimate predicted saving:
        // If page moves to dst, future accesses from dst become local (cost dist/10=1).
        // Current remotes cost: remoteAcc × (dist(home,dominantNode)/10.0) per unit.
        // Saving per future access ≈ (dist(home,dst)/10.0 - 1.0) for accesses from dst.
        // We use pa.perNodeAcc[dst] as the "accesses from dst".
        long long dstAcc = (dst >= 0 && dst < (int)pa.perNodeAcc.size())
                           ? pa.perNodeAcc[dst] : 0;
        double remoteExtraCostPerAccess = (dist / 10.0) - 1.0;
        if (remoteExtraCostPerAccess < 0) remoteExtraCostPerAccess = 0;

        // Naive: treat past accesses from dst as if they were future ones.
        // Horizon-aware: read a rate off the recent window and extrapolate it
        // over the steps that actually remain, so a migration near the end of
        // the run is correctly judged as having no time to pay for itself.
        double expectedFutureAcc = static_cast<double>(dstAcc);
        if (ms.config.horizonAware && ms.accountedSteps > 0.0) {
            double rate    = dstAcc / ms.accountedSteps;
            double horizon = ms.config.horizonCapMult * ms.accountedSteps;
            if (horizon > stepsRemaining) horizon = stepsRemaining;
            expectedFutureAcc = rate * horizon;
        }
        evt.predictedSaving = expectedFutureAcc * remoteExtraCostPerAccess;

        // Reject if saving insufficient.
        if (evt.predictedSaving < evt.migCost * ms.config.safetyMargin) {
            evt.completed    = false;
            evt.rejectReason = "insufficient_saving";
            ms.migrations.push_back(evt);
            ++ms.migrationsRejected;
            continue;
        }

        // Reject if destination has no capacity.
        if (!nodes[dst].hasRoom(pageSizeMB)) {
            evt.completed    = false;
            evt.rejectReason = "no_capacity";
            ms.migrations.push_back(evt);
            ++ms.migrationsRejected;
            continue;
        }

        // ── Perform migration ────────────────────────────────────────────────
        // Update node memory: remove from src, add to dst.
        nodes[home].memUsedMB -= pageSizeMB;
        nodes[dst].memUsedMB  += pageSizeMB;

        // Update page home and access tracking.
        ms.pages[pid].node    = dst;
        pa.homeNode            = dst;
        // Reset per-page access counts so the evaluator adapts to new placement.
        // We keep the counts but they'll be accumulated from here onward.
        pa.localAcc  = 0;
        pa.remoteAcc = 0;

        ms.lastMigrationStep[pid] = step;
        ms.totalMigrationCost    += evt.migCost;
        ms.bytesTransferred      += pageSizeMB;

        evt.completed = true;
        ms.migrations.push_back(evt);
        ++ms.migrationsCompleted;
        ++foundMigrations;
    }

    // ── Adjust adaptive interval ─────────────────────────────────────────────
    EvalEvent ee;
    ee.stepNumber     = step;
    ee.intervalBefore = intervalBefore;
    ee.remoteRatio    = gRemoteRatio;
    ee.pagesEvaluated = static_cast<int>(ms.pageAcc.size());
    ee.pagesMigrated  = foundMigrations;

    if (gRemoteRatio > ms.config.highRemoteThresh) {
        ms.currentInterval = max(ms.config.minInterval, ms.currentInterval / 2);
        ee.reason = "high_remote_ratio: evaluate_more_often";
    } else if (gRemoteRatio < ms.config.lowRemoteThresh && foundMigrations == 0) {
        ms.currentInterval = min(ms.config.maxInterval, ms.currentInterval * 2);
        ee.reason = "low_remote_ratio_stable: evaluate_less_often";
    } else {
        ee.reason = "stable";
    }

    ee.intervalAfter = ms.currentInterval;
    ms.evalLog.push_back(ee);

    ms.nextEvalStep = step + ms.currentInterval;
    ++ms.evalCount;
}

// ─── summariseMigration ───────────────────────────────────────────────────────
MigrationSummary summariseMigration(const MigrationState& ms) {
    MigrationSummary s;
    s.evalCount           = ms.evalCount;
    s.migrationsAttempted = ms.migrationsAttempted;
    s.migrationsCompleted = ms.migrationsCompleted;
    s.migrationsRejected  = ms.migrationsRejected;
    s.bytesTransferred    = ms.bytesTransferred;
    s.totalMigrationCost  = ms.totalMigrationCost;

    // Classify rejections and total up what the policy expected to gain.
    for (const auto& evt : ms.migrations) {
        if (evt.completed) { s.totalPredictedSaving += evt.predictedSaving; continue; }
        if      (evt.rejectReason == "cooldown")            { ++s.pingPongPrevented; ++s.rejectCooldown; }
        else if (evt.rejectReason == "insufficient_saving")   ++s.rejectInsufficient;
        else if (evt.rejectReason == "no_capacity")           ++s.rejectNoCapacity;
    }
    for (double v : ms.realizedSaving) s.totalRealizedSaving += v;

    // Average interval between evaluations.
    if (ms.evalCount > 1) {
        int totalIntervalSteps = 0;
        for (const auto& ee : ms.evalLog) totalIntervalSteps += ee.intervalBefore;
        s.avgIntervalBetweenEvals = static_cast<double>(totalIntervalSteps) / ms.evalCount;
    }

    return s;
}
