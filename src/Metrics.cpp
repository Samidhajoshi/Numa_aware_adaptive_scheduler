#include "Metrics.h"
#include <cstdio>
#include <algorithm>
using namespace std;

// ─── Cost model constants (documented) ───────────────────────────────────────
// READ_COST:  simulation cost units per read access at local distance (dist=10).
// WRITE_COST: simulation cost units per write access at local distance.
// The actual access cost is scaled by (dist/10.0) so local accesses use the
// base cost and remote accesses are proportionally more expensive.
//
// cpuFactor: if cpuLoad > 1.0 (oversubscribed), contention raises cost.
// memFactor: if memUtil > MEM_PRESSURE_START, memory pressure raises cost.
static const double READ_COST           = 1.0;
static const double WRITE_COST          = 1.5;
static const double MEM_PRESSURE_START  = 0.75;

// Scratch accumulator used when folding migration events into per-page verdicts.
struct PageAgg {
    int    moves           = 0;
    int    lastFrom        = -1;
    int    lastTo          = -1;
    double migCost         = 0.0;
    double predictedSaving = 0.0;
};

// ─── simulateReplay ───────────────────────────────────────────────────────────
// Single step-ordered replay of the whole access trace.  This is the one code
// path used both with and without migration, so the two are directly comparable.
//
// Ordering: threads run concurrently, so the trace is replayed round-robin by
// access index (step r visits access r of every thread that still has one).
// Because every thread emits the same number of accesses per workload phase,
// this keeps phases aligned across threads and makes `step` a real time axis.
//
// Live state: when `ms` is non-null, pages move during the replay.  Each access
// is charged against the page's home node AT THAT STEP, and node memory
// utilisation tracks migrations, so a migration that improves locality actually
// reduces the cost of the accesses that follow it.  With `ms` null, no page
// moves and the result is identical to charging every access against its
// initial home.
static Metrics simulateReplay(Algo algo, const Workload& w,
                              const NUMATopology& topo,
                              const Placement& p, MigrationState* ms) {
    Metrics m;
    m.algorithm    = algoName(algo);
    m.workloadId   = w.id;
    m.workloadType = workloadTypeName(w.type);
    m.seed         = w.seed;
    m.numThreads   = static_cast<int>(w.threads.size());
    m.numPages     = static_cast<int>(w.pages.size());
    m.numPhases    = w.numPhases();
    m.placement    = p;
    m.migrationEnabled = (ms != nullptr && ms->config.enabled);
    m.perNodeAccesses.assign(topo.size(), 0);

    // Live node state: memory moves between nodes as pages migrate.
    vector<NUMANode> liveNodes = p.nodes;
    // Live page homes: the migration state owns them when migration is on.
    const vector<Page>& livePages = ms ? ms->pages : w.pages;

    // Thread placement never changes, so CPU contention is fixed per node.
    vector<double> cpuFactor(topo.size());
    for (int i = 0; i < topo.size(); ++i) {
        double load  = liveNodes[i].cpuLoad();
        cpuFactor[i] = load > 1.0 ? load : 1.0;
    }

    // Per-node tallies from the point of view of the threads running there.
    vector<long long> issued(topo.size(), 0), issuedLocal(topo.size(), 0);
    vector<double>    issuedCost(topo.size(), 0.0);

    size_t maxAccesses = 0;
    for (const auto& t : w.threads)
        maxAccesses = max(maxAccesses, t.accesses.size());

    int step = 0;
    for (size_t r = 0; r < maxAccesses; ++r) {
        for (const auto& t : w.threads) {
            if (r >= t.accesses.size()) continue;
            const Access& a = t.accesses[r];

            int exec = p.threadNode[t.id];
            int home = livePages[a.page].node;

            double over      = liveNodes[home].memUtil() - MEM_PRESSURE_START;
            double memFactor = 1.0 + (over > 0 ? over : 0.0);
            double distUnit  = topo.distance(exec, home) / 10.0;
            double unit      = distUnit * cpuFactor[exec] * memFactor;

            long long n         = a.reads + a.writes;
            double    thisCost  = a.reads * READ_COST * unit + a.writes * WRITE_COST * unit;
            m.totalReadCost  += a.reads  * READ_COST  * unit;
            m.totalWriteCost += a.writes * WRITE_COST * unit;
            m.totalAccesses  += n;

            if (home == exec) m.localAccesses  += n;
            else              m.remoteAccesses += n;

            m.perNodeAccesses[home] += n;

            issued[exec]     += n;
            issuedCost[exec] += thisCost;
            if (home == exec) issuedLocal[exec] += n;

            // Measure what migration actually bought on this access, against
            // the counterfactual that the page had never moved.  This is
            // computed by the cost model, independently of what the policy
            // predicted, so the two can be compared honestly.
            if (ms) {
                int origHome = w.pages[a.page].node;
                if (origHome != home) {
                    double overO   = liveNodes[origHome].memUtil() - MEM_PRESSURE_START;
                    double memFacO = 1.0 + (overO > 0 ? overO : 0.0);
                    double unitO   = (topo.distance(exec, origHome) / 10.0)
                                     * cpuFactor[exec] * memFacO;
                    double costIfNeverMoved = a.reads  * READ_COST  * unitO
                                            + a.writes * WRITE_COST * unitO;
                    double costActual       = a.reads  * READ_COST  * unit
                                            + a.writes * WRITE_COST * unit;
                    ms->realizedSaving[a.page] += costIfNeverMoved - costActual;
                }
            }

            ++step;
            if (ms) {
                recordAccess(*ms, a.page, exec, a.reads, a.writes);
                if (shouldEvaluate(*ms, step))
                    evaluateAndMigrate(*ms, liveNodes, topo, step, w.pageSizeMB);
            }
        }
    }

    m.totalCost         = m.totalReadCost + m.totalWriteCost;
    m.totalCostWithMig  = m.totalCost;  // migration cost added by the caller
    m.avgCostPerAccess  = m.totalAccesses ? m.totalCost / m.totalAccesses : 0.0;
    m.localRatio        = m.totalAccesses ? (double)m.localAccesses  / m.totalAccesses : 0.0;
    m.remoteRatio       = m.totalAccesses ? (double)m.remoteAccesses / m.totalAccesses : 0.0;

    // Node resource utilization, from the state left at the end of the replay.
    m.nodeDetails.resize(topo.size());
    for (int i = 0; i < topo.size(); ++i) {
        const auto& nd = liveNodes[i];
        auto& det      = m.nodeDetails[i];
        det.id         = i;
        det.threads    = p.threadsPerNode[i];
        det.cpuLoad    = nd.cpuLoad();
        det.cpuUtil    = nd.cpuUtil();
        det.memUtil    = nd.memUtil();
        det.memUsedMB  = nd.memUsedMB;
        det.memTotalMB = nd.memoryMB;
        det.pageCount  = 0;
        det.incomingMigrations = 0;
        det.outgoingMigrations = 0;

        det.issuedAccesses = issued[i];
        det.issuedLocal    = issuedLocal[i];
        det.issuedRemote   = issued[i] - issuedLocal[i];
        det.issuedCost     = issuedCost[i];

        m.avgCpuUtil += nd.cpuUtil();
        m.avgMemUtil += nd.memUtil();
    }

    // Count pages per node at their final positions.
    for (const auto& pg : livePages)
        if (pg.node >= 0 && pg.node < topo.size())
            m.nodeDetails[pg.node].pageCount++;

    m.avgCpuUtil /= topo.size();
    m.avgMemUtil /= topo.size();
    return m;
}

// ─── evaluate ─────────────────────────────────────────────────────────────────
// Computes all metrics A-D and G for a placement without migration.
Metrics evaluate(Algo algo, const Workload& w, const NUMATopology& topo,
                 const Placement& p) {
    return simulateReplay(algo, w, topo, p, nullptr);
}

// ─── evaluateWithMigration ────────────────────────────────────────────────────
// Drives the replay with migration enabled, then merges the migration state
// results into metrics groups E-F.  `ms` is mutated by the replay: pages move,
// evaluations are logged and the adaptive interval evolves.
Metrics evaluateWithMigration(Algo algo, const Workload& w,
                              const NUMATopology& topo,
                              const Placement& p,
                              MigrationState& ms) {
    Metrics m = simulateReplay(algo, w, topo, p, &ms);

    m.migrationEnabled = true;

    // ── E: Migration metrics ──────────────────────────────────────────────────
    MigrationSummary sum = summariseMigration(ms);
    m.evalCount               = sum.evalCount;
    m.migrationsAttempted     = sum.migrationsAttempted;
    m.migrationsCompleted     = sum.migrationsCompleted;
    m.migrationsRejected      = sum.migrationsRejected;
    m.pagesMoved              = sum.migrationsCompleted;
    m.mbTransferred           = sum.bytesTransferred;
    m.avgIntervalBetweenEvals = sum.avgIntervalBetweenEvals;
    m.pingPongPrevented       = sum.pingPongPrevented;
    m.migrationCostTotal      = sum.totalMigrationCost;
    m.totalCostWithMig        = m.totalCost + m.migrationCostTotal;

    // ── F: Adaptive behavior ──────────────────────────────────────────────────
    for (const auto& ee : ms.evalLog) {
        m.intervalHistory.push_back(ee.intervalBefore);
        m.remoteRatioHistory.push_back(ee.remoteRatio);
        m.evalTrace.push_back({ ee.stepNumber, ee.intervalBefore, ee.intervalAfter,
                                ee.remoteRatio, ee.pagesMigrated, ee.reason });
    }

    m.rejectCooldown     = sum.rejectCooldown;
    m.rejectInsufficient = sum.rejectInsufficient;
    m.rejectNoCapacity   = sum.rejectNoCapacity;
    m.totalPredictedSaving = sum.totalPredictedSaving;
    m.totalActualSaving    = sum.totalRealizedSaving;

    // Per-page verdicts: cost of moving it vs what the move actually saved.
    {
        vector<PageAgg> agg(ms.realizedSaving.size());
        for (const auto& evt : ms.migrations) {
            if (!evt.completed) continue;
            auto& g = agg[evt.pageId];
            ++g.moves;
            g.migCost         += evt.migCost;
            g.predictedSaving += evt.predictedSaving;
            g.lastFrom         = evt.fromNode;
            g.lastTo           = evt.toNode;
        }
        for (int pid = 0; pid < (int)agg.size(); ++pid) {
            if (agg[pid].moves == 0) continue;
            m.pageVerdicts.push_back({ pid, agg[pid].moves,
                                       agg[pid].lastFrom, agg[pid].lastTo,
                                       agg[pid].migCost, agg[pid].predictedSaving,
                                       ms.realizedSaving[pid] });
        }
        // Worst outcomes first: the migrations that did not pay are the
        // interesting ones, so the UI can show them without scrolling.
        sort(m.pageVerdicts.begin(), m.pageVerdicts.end(),
             [](const Metrics::PageVerdict& a, const Metrics::PageVerdict& b) {
                 return (a.realizedSaving - a.migCost) < (b.realizedSaving - b.migCost);
             });
    }

    // Per-node incoming/outgoing migration counts.
    for (const auto& evt : ms.migrations) {
        if (evt.completed) {
            if (evt.fromNode >= 0 && evt.fromNode < (int)m.nodeDetails.size())
                m.nodeDetails[evt.fromNode].outgoingMigrations++;
            if (evt.toNode >= 0 && evt.toNode < (int)m.nodeDetails.size())
                m.nodeDetails[evt.toNode].incomingMigrations++;
        }
    }

    return m;
}

// ─── printRunSummary ──────────────────────────────────────────────────────────
void printRunSummary(const Metrics& m) {
    printf("\n[%s]\n", m.algorithm.c_str());
    for (const auto& nd : m.nodeDetails) {
        printf("  Node %d | Threads: %2d | CPU load: %3.0f%% | Mem: %5.1f MB used / %5.1f MB total (%4.1f%%)\n",
               nd.id, nd.threads, nd.cpuLoad * 100.0,
               (double)nd.memUsedMB, (double)nd.memTotalMB, nd.memUtil * 100.0);
    }
    printf("  Accesses: %lld total, %lld local, %lld remote | Cost: %.0f\n",
           m.totalAccesses, m.localAccesses, m.remoteAccesses, m.totalCost);
    if (m.migrationEnabled) {
        printf("  Migration: %d completed, %d rejected | MigCost: %.1f | Total cost: %.0f\n",
               m.migrationsCompleted, m.migrationsRejected,
               m.migrationCostTotal, m.totalCostWithMig);
    }
}

// ─── printComparison ──────────────────────────────────────────────────────────
void printComparison(const vector<Metrics>& r) {
    // Print header.
    printf("\n%-22s | %-7s | %-8s | %-8s | %-11s | %-12s | %s\n",
           "Algorithm", "Local %", "Remote %", "CPU Util", "Memory Util", "Cost", "WithMig");
    printf("---------------------------------------------------------------------"
           "-------------------\n");

    size_t best = 0;
    for (size_t i = 0; i < r.size(); ++i) {
        double costForCompare = r[i].migrationEnabled
                                ? r[i].totalCostWithMig
                                : r[i].totalCost;
        double bestCost = r[best].migrationEnabled
                          ? r[best].totalCostWithMig
                          : r[best].totalCost;
        if (costForCompare < bestCost) best = i;

        printf("%-22s | %6.2f%% | %7.2f%% | %7.1f%% | %10.1f%% | %12.0f | %.0f\n",
               r[i].algorithm.c_str(),
               r[i].localRatio  * 100.0,
               r[i].remoteRatio * 100.0,
               r[i].avgCpuUtil  * 100.0,
               r[i].avgMemUtil  * 100.0,
               r[i].totalCost,
               r[i].totalCostWithMig);
    }

    printf("\nWorkload #%d, %lld accesses per algorithm. Lowest cost: %s",
           r[0].workloadId, r[0].totalAccesses, r[best].algorithm.c_str());

    double baseCost = r[0].migrationEnabled ? r[0].totalCostWithMig : r[0].totalCost;
    double bestCost = r[best].migrationEnabled ? r[best].totalCostWithMig : r[best].totalCost;
    if (best != 0 && baseCost > 0)
        printf(" (%.1f%% below Random)", (1.0 - bestCost / baseCost) * 100.0);
    printf("\n");
    printf("NOTE: Cost values are SIMULATED units, not real hardware latency.\n");
}