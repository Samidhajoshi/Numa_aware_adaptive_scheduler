#include "Workload.h"
#include <algorithm>
using namespace std;


const char* workloadTypeName(WorkloadType t) {
    switch (t) {
        case WorkloadType::CPU_INTENSIVE: return "CPU_INTENSIVE";
        case WorkloadType::READ_HEAVY:   return "READ_HEAVY";
        case WorkloadType::WRITE_HEAVY:  return "WRITE_HEAVY";
        default:                         return "MIXED";
    }
}

long long ThreadTask::totalAccesses() const {
    long long t = 0;
    for (const auto& a : accesses) t += a.reads + a.writes;
    return t;
}
long long ThreadTask::totalReads() const {
    long long t = 0;
    for (const auto& a : accesses) t += a.reads;
    return t;
}
long long ThreadTask::totalWrites() const {
    long long t = 0;
    for (const auto& a : accesses) t += a.writes;
    return t;
}

long long Workload::totalAccesses() const {
    long long t = 0;
    for (const auto& th : threads) t += th.totalAccesses();
    return t;
}
long long Workload::totalReads() const {
    long long t = 0;
    for (const auto& th : threads) t += th.totalReads();
    return t;
}
long long Workload::totalWrites() const { return totalAccesses() - totalReads(); }
int Workload::numPhases() const {
    return config.phases.empty() ? 1 : static_cast<int>(config.phases.size());
}


static int weightedNode(Rng& rng, int numNodes) {
    int total = numNodes * (numNodes + 1) / 2;
    int r = rng.range(0, total);
    for (int n = 0; n < numNodes; ++n) {
        r -= numNodes - n;
        if (r < 0) return n;
    }
    return numNodes - 1;
}


static double applySkew(double rawSkew, WorkloadType type) {
    switch (type) {
    case WorkloadType::READ_HEAVY:    return rawSkew * rawSkew * rawSkew;
    case WorkloadType::WRITE_HEAVY:   return rawSkew;
    case WorkloadType::CPU_INTENSIVE:
    case WorkloadType::MIXED:
    default:                          return rawSkew * rawSkew;
    }
}


static int computeWrites(int count, WorkloadType type, Rng& rng,
                         double readWriteRatio, bool useDefault) {
    if (!useDefault) {
        // User-specified ratio; readWriteRatio = fraction that are reads.
        return static_cast<int>(count * (1.0 - readWriteRatio));
    }
    switch (type) {
    case WorkloadType::CPU_INTENSIVE: return count * 30 / 100;
    case WorkloadType::READ_HEAVY:    return count * rng.range(5, 16) / 100;
    case WorkloadType::WRITE_HEAVY:   return count * rng.range(70, 81) / 100;
    case WorkloadType::MIXED:
    default:                          return count * rng.range(20, 41) / 100;
    }
}

Workload generateWorkload(unsigned seed, int numNodes, WorkloadType type,
                          const WorkloadConfig* cfgPtr) {
    // Build effective config (caller can override defaults).
    WorkloadConfig cfg;
    if (cfgPtr) cfg = *cfgPtr;
    cfg.type = type;  // type arg always wins

    // Clamp config to sane ranges.
    if (cfg.numThreads < 1)   cfg.numThreads  = 1;
    if (cfg.numThreads > 64)  cfg.numThreads  = 64;
    if (cfg.refsPerThread < 1) cfg.refsPerThread = 1;
    if (cfg.pageSizeMB < 1)   cfg.pageSizeMB  = 1;
    if (cfg.hotPageSkew < 0)  cfg.hotPageSkew = 0;
    if (cfg.hotPageSkew > 1)  cfg.hotPageSkew = 1;

    const int kThreads       = cfg.numThreads;
    const int kRefsPerThread = cfg.refsPerThread;
    const int kPageSizeMB    = cfg.pageSizeMB;

    // If numPages is explicitly set, split between partition and shared;
    // otherwise use the original 40/thread + 160 shared layout.
    int kPartitionPages, kSharedPages;
    if (cfg.numPages > 0) {
        // Allocate 50% to partitions (ceil), rest to shared; at least 1 shared.
        int partTotal = (cfg.numPages / 2);
        kPartitionPages = std::max(1, partTotal / kThreads);
        kSharedPages    = std::max(1, cfg.numPages - kPartitionPages * kThreads);
    } else {
        kPartitionPages = 40;
        kSharedPages    = 160;
    }

    Workload w;
    w.seed       = seed;
    w.type       = type;
    w.pageSizeMB = kPageSizeMB;
    w.config     = cfg;

    Rng rng(seed);


    for (int p = 0; p < kThreads; ++p) {
        int loader = weightedNode(rng, numNodes);
        for (int i = 0; i < kPartitionPages; ++i) {
            int node = rng.real() < cfg.hotPageSkew
                       ? loader
                       : rng.range(0, numNodes);
            w.pages.push_back({ static_cast<int>(w.pages.size()), node });
        }
    }

    int sharedBase = static_cast<int>(w.pages.size());
    for (int i = 0; i < kSharedPages; ++i)
        w.pages.push_back({ sharedBase + i, i % numNodes });

    vector<WorkloadPhase> phases = cfg.phases;
    if (phases.empty()) phases.emplace_back(type, kRefsPerThread);


    for (int t = 0; t < kThreads; ++t) {
        ThreadTask th;
        th.id = t;

        // CPU demand and memory footprint depend on primary type.
        switch (type) {
        case WorkloadType::CPU_INTENSIVE:
            th.cpuDemand   = 0.85 + 0.15 * rng.real();    // 0.85–1.00 cores
            th.footprintMB = 256  + 64   * rng.range(0, 4); // 256–448 MB
            break;
        case WorkloadType::READ_HEAVY:
            th.cpuDemand   = 0.40 + 0.30 * rng.real();    // 0.40–0.70 cores
            th.footprintMB = 128  + 64   * rng.range(0, 4); // 128–320 MB
            break;
        case WorkloadType::WRITE_HEAVY:
            th.cpuDemand   = 0.70 + 0.30 * rng.real();    // 0.70–1.00 cores
            th.footprintMB = 384  + 64   * rng.range(0, 6); // 384–704 MB
            break;
        case WorkloadType::MIXED:
        default:
            th.cpuDemand   = 0.60 + 0.40 * rng.real();    // 0.60–1.00 cores
            th.footprintMB = 256  + 64   * rng.range(0, 8); // 256–704 MB
            break;
        }

        // Generate accesses for each phase.
        int phaseIdx = 0;
        for (const auto& phase : phases) {
            WorkloadType ptype = phase.type;
          
            int srcPartition = ((t + phase.affinityShift) % kThreads + kThreads) % kThreads;

            for (int r = 0; r < phase.steps; ++r) {
                double skew = applySkew(rng.real(), ptype);

                // 80% chance: access the phase's partition; 20%: shared pages.
                int page = rng.real() < cfg.hotPageSkew
                    ? srcPartition * kPartitionPages + static_cast<int>(skew * kPartitionPages)
                    : sharedBase                     + static_cast<int>(skew * kSharedPages);

                // Guard against out-of-range page IDs.
                if (page < 0) page = 0;
                if (page >= (int)w.pages.size()) page = (int)w.pages.size() - 1;

                int count  = 10 + rng.range(0, 40);
                int writes = computeWrites(count, ptype, rng,
                                           phase.readWriteRatio, phase.useDefaultRatio);
                if (writes > count) writes = count;
                if (writes < 0)    writes = 0;

                th.accesses.push_back({ page, count - writes, writes, phaseIdx });
            }
            ++phaseIdx;
        }

        w.threads.push_back(th);
    }
    return w;
}


vector<NUMANode> initialNodeState(const NUMATopology& topo, const Workload& w) {
    vector<NUMANode> nodes = topo.nodes;
    for (const auto& pg : w.pages)
        nodes[pg.node].memUsedMB += w.pageSizeMB;
    return nodes;
}
