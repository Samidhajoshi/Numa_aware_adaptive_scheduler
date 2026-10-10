#include "Workload.h"
using namespace std;

static const int kThreads       = 16;
static const int kPartitionPages = 40;   // private table partition per thread
static const int kSharedPages   = 160;   // shared index / hot lookup pages
static const int kRefsPerThread = 48;    // page references per thread


const char* workloadTypeName(WorkloadType t) {
    switch (t) {
        case WorkloadType::CPU_INTENSIVE: return "CPU_INTENSIVE";
        case WorkloadType::READ_HEAVY:    return "READ_HEAVY";
        case WorkloadType::WRITE_HEAVY:   return "WRITE_HEAVY";
        default:                          return "MIXED";
    }
}

static int weightedNode(Rng& rng, int numNodes) {   
    int total = numNodes * (numNodes + 1) / 2, r = rng.range(0, total);
    for (int n = 0; n < numNodes; ++n) {
        r -= numNodes - n;
        if (r < 0) return n;
    }
    return numNodes - 1;
}


long long ThreadTask::totalAccesses() const {
    long long t = 0;
    for (const auto& a : accesses) t += a.reads + a.writes;
    return t;
}
long long Workload::totalAccesses() const {
    long long t = 0;
    for (const auto& th : threads) t += th.totalAccesses();
    return t;
}
long long Workload::totalReads() const {
    long long t = 0;
    for (const auto& th : threads) for (const auto& a : th.accesses) t += a.reads;
    return t;
}
long long Workload::totalWrites() const { return totalAccesses() - totalReads(); }

Workload generateWorkload(unsigned seed, int numNodes, WorkloadType type) {
    Workload w;
    w.seed = seed;
    w.type = type;
    Rng rng(seed);

    for (int p = 0; p < kThreads; ++p) {
        int loader = weightedNode(rng, numNodes);
        for (int i = 0; i < kPartitionPages; ++i) {
            int node = rng.real() < 0.80 ? loader : rng.range(0, numNodes);
            w.pages.push_back({static_cast<int>(w.pages.size()), node});
        }
    }

    int sharedBase = static_cast<int>(w.pages.size());
    for (int i = 0; i < kSharedPages; ++i)
        w.pages.push_back({sharedBase + i, i % numNodes});

    for (int t = 0; t < kThreads; ++t) {
        ThreadTask th;
        th.id = t;

        switch (type) {

        case WorkloadType::CPU_INTENSIVE:
            th.cpuDemand   = 0.85 + 0.15 * rng.real();          // 0.85–1.00 cores
            th.footprintMB = 256  + 64   * rng.range(0, 4);     // 256–448 MB
            break;

        case WorkloadType::READ_HEAVY:
            th.cpuDemand   = 0.40 + 0.30 * rng.real();          // 0.40–0.70 cores
            th.footprintMB = 128  + 64   * rng.range(0, 4);     // 128–320 MB
            break;

        case WorkloadType::WRITE_HEAVY:
            th.cpuDemand   = 0.70 + 0.30 * rng.real();          // 0.70–1.00 cores
            th.footprintMB = 384  + 64   * rng.range(0, 6);     // 384–704 MB
            break;

        case WorkloadType::MIXED:
        default:
            // General-purpose OLTP/OLAP mix (the baseline workload).
            th.cpuDemand   = 0.60 + 0.40 * rng.real();          // 0.60–1.00 cores
            th.footprintMB = 256  + 64   * rng.range(0, 8);     // 256–704 MB
            break;
        }

        
        for (int r = 0; r < kRefsPerThread; ++r) {
            double skew = rng.real();

            // Hot-page skew: different exponents per workload type.
            // Higher exponent → more accesses concentrated on the first few (hottest) pages.
            switch (type) {
            case WorkloadType::READ_HEAVY:
                skew = skew * skew * skew;  // cubic: very strong hot-page concentration
                break;
            case WorkloadType::WRITE_HEAVY:
                // linear (skew unchanged): writes are more distributed — dirty pages spread out
                break;
            case WorkloadType::CPU_INTENSIVE:
            case WorkloadType::MIXED:
            default:
                skew *= skew;              // quadratic: moderate hot-page skew (original behaviour)
                break;
            }

            // 80% accesses hit own private partition, 20% hit shared index pages.
            int page = rng.real() < 0.80
                           ? t * kPartitionPages + static_cast<int>(skew * kPartitionPages)
                           : sharedBase          + static_cast<int>(skew * kSharedPages);

            int count = 10 + rng.range(0, 40);   // 10–49 operations per reference

            int writes;
            switch (type) {
            case WorkloadType::CPU_INTENSIVE:
                // ~30% writes (compute queries do update aggregates/temp tables)
                writes = count * 30 / 100;
                break;

            case WorkloadType::READ_HEAVY:
                // ~10% writes (5–15% range for natural variance)
                writes = count * rng.range(5, 16) / 100;
                break;

            case WorkloadType::WRITE_HEAVY:
                // ~75% writes (70–80% range)
                writes = count * rng.range(70, 81) / 100;
                break;

            case WorkloadType::MIXED:
            default:
                // ~30% writes (20–40% range for natural variance)
                writes = count * rng.range(20, 41) / 100;
                break;
            }

            th.accesses.push_back({page, count - writes, writes});
        }
        w.threads.push_back(th);
    }
    return w;
}

vector<NUMANode> initialNodeState(const NUMATopology& topo, const Workload& w) {
    vector<NUMANode> nodes = topo.nodes;
    for (const auto& pg : w.pages) nodes[pg.node].memUsedMB += w.pageSizeMB;
    return nodes;
}