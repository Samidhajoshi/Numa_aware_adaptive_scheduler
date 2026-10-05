#pragma once
#include <cstdint>
#include <vector>
#include "NUMANode.h"

// Small deterministic RNG (xorshift64) so a seed gives the same workload on every
// compiler/platform; std::*_distribution is not portable across standard libraries.
struct Rng {
    uint64_t s;
    explicit Rng(uint64_t seed) : s(seed * 6364136223846793005ULL + 1442695040888963407ULL) {}
    uint32_t next() { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return static_cast<uint32_t>(s >> 32); }
    int range(int lo, int hi) { return lo + static_cast<int>(next() % static_cast<uint32_t>(hi - lo)); }  // [lo, hi)
    double real() { return next() / 4294967296.0; }                                                      // [0, 1)
};

// A database page that already lives on a NUMA node (its resident location is fixed).
struct Page { int id; int node; };

// One thread's access record for one page.
struct Access { int page; int reads; int writes; };

// A database worker (query/transaction thread) that a strategy must place on a node.
struct ThreadTask {
    int id;
    double cpuDemand;          // cores of CPU it needs
    long long footprintMB;     // private memory it allocates on the node it runs on
    std::vector<Access> accesses;
    long long totalAccesses() const;
};

struct Workload {
    int id = 0;                // assigned by the database
    unsigned seed = 0;
    int pageSizeMB = 16;
    std::vector<Page> pages;
    std::vector<ThreadTask> threads;

    long long totalAccesses() const;
    long long totalReads() const;
    long long totalWrites() const;
};

Workload generateWorkload(unsigned seed, int numNodes);

// Nodes loaded with the memory of their resident pages (no threads placed yet).
std::vector<NUMANode> initialNodeState(const NUMATopology& topo, const Workload& w);
