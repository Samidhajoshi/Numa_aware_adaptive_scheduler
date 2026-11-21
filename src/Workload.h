#pragma once
#include <cstdint>
#include <vector>
#include <string>
#include "NUMANode.h"

struct Rng {
    uint64_t s;
    explicit Rng(uint64_t seed) : s(seed * 6364136223846793005ULL + 1442695040888963407ULL) {}
    uint32_t next() { s ^= s << 13; s ^= s >> 7; s ^= s << 17; return static_cast<uint32_t>(s >> 32); }
    int range(int lo, int hi) { return lo + static_cast<int>(next() % static_cast<uint32_t>(hi - lo)); }
    double real() { return next() / 4294967296.0; }
};

enum class WorkloadType {
    CPU_INTENSIVE,  // High CPU demand, moderate memory, skewed reads
    READ_HEAVY,     // Low CPU, light memory, strong read skew (cubic)
    WRITE_HEAVY,    // High CPU, heavy memory, distributed writes
    MIXED           // General OLTP/OLAP baseline
};

const char* workloadTypeName(WorkloadType t);


struct WorkloadPhase {
    WorkloadType type;
    int          steps;        // number of steps in this phase
    double       readWriteRatio; // 0..1 = fraction of reads (overrides type default)
    bool         useDefaultRatio; // if true, ignore readWriteRatio and use type default
    int          affinityShift;   // rotate which thread's partition is accessed
    WorkloadPhase(WorkloadType t, int s)
        : type(t), steps(s), readWriteRatio(0.7), useDefaultRatio(true), affinityShift(0) {}
    WorkloadPhase(WorkloadType t, int s, double rwr)
        : type(t), steps(s), readWriteRatio(rwr), useDefaultRatio(false), affinityShift(0) {}
    WorkloadPhase(WorkloadType t, int s, double rwr, int shift)
        : type(t), steps(s), readWriteRatio(rwr), useDefaultRatio(false), affinityShift(shift) {}
};


struct WorkloadConfig {
    int    numThreads      = 16;    // Number of worker threads (1–64)
    int    numPages        = 800;   // Total database pages  (partitioned + shared)
    double hotPageSkew     = 0.80;  // Fraction of accesses that go to "hot" pages (0..1)
    int    refsPerThread   = 48;    // Access references per thread
    int    pageSizeMB      = 16;    // Size of each page in MB

    // Multi-phase support.  If phases is empty, a single phase of `type` is used.
    WorkloadType           type    = WorkloadType::MIXED;
    std::vector<WorkloadPhase> phases;   // optional multi-phase definition
};

struct Page {
    int id;    // stable page ID across migration
    int node;  // initial home node (where the page is loaded at start)
};

struct Access {
    int page;
    int reads;
    int writes;
    int phase;   // which workload phase this access belongs to (0-indexed; -1 = single phase)
};

struct ThreadTask {
    int                   id;
    double                cpuDemand;       // cores demanded (not necessarily an integer)
    long long             footprintMB;     // working-set memory footprint
    std::vector<Access>   accesses;

    long long totalAccesses() const;
    long long totalReads()    const;
    long long totalWrites()   const;
};


struct Workload {
    int           id          = 0;      // DB row ID (set after saveWorkload)
    unsigned      seed        = 0;
    WorkloadType  type        = WorkloadType::MIXED;
    int           pageSizeMB  = 16;
    WorkloadConfig config;              // config used to generate this workload

    std::vector<Page>       pages;
    std::vector<ThreadTask> threads;

    long long totalAccesses() const;
    long long totalReads()    const;
    long long totalWrites()   const;
    int       numPhases()     const;     // 1 if no multi-phase, else phases.size()
};


Workload generateWorkload(unsigned seed, int numNodes,
                          WorkloadType type = WorkloadType::MIXED,
                          const WorkloadConfig* cfg = nullptr);


std::vector<NUMANode> initialNodeState(const NUMATopology& topo, const Workload& w);
