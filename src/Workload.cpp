#include "Workload.h"
using namespace std;

static const int kThreads = 16;
static const int kPartitionPages = 40;   // private table partition per thread
static const int kSharedPages = 160;     // shared index / hot lookup pages
static const int kRefsPerThread = 48;    // page references per thread

static int weightedNode(Rng& rng, int numNodes) {   // node 0 is the "busiest" data loader
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

Workload generateWorkload(unsigned seed, int numNodes) {
    Workload w;
    w.seed = seed;
    Rng rng(seed);

    // Resident page layout: each thread's partition was loaded mostly onto one node
    // (skewed towards low node IDs); shared pages are striped round-robin.
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

    // Threads: 80% of references hit their own partition, 20% the shared pages.
    for (int t = 0; t < kThreads; ++t) {
        ThreadTask th;
        th.id = t;
        th.cpuDemand = 0.6 + 0.4 * rng.real();
        th.footprintMB = 256 + 64 * rng.range(0, 8);
        for (int r = 0; r < kRefsPerThread; ++r) {
            double skew = rng.real();
            skew *= skew;                                    // hot pages first
            int page = rng.real() < 0.80
                           ? t * kPartitionPages + static_cast<int>(skew * kPartitionPages)
                           : sharedBase + static_cast<int>(skew * kSharedPages);
            int count = 10 + rng.range(0, 40);
            int writes = count * rng.range(10, 40) / 100;    // 10-40% writes
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