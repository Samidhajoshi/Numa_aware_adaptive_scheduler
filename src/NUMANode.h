#pragma once
#include <vector>

// One NUMA node: a group of CPU cores plus locally attached memory.
struct NUMANode {
    int id = 0;
    int cpus = 4;
    long long memoryMB = 8192;
    double cpuDemand = 0.0;      // cores' worth of work placed on this node
    long long memUsedMB = 0;     // page data + thread footprints on this node

    double cpuLoad() const { return cpuDemand / cpus; }             // may exceed 1.0 (oversubscribed)
    double cpuUtil() const { return cpuLoad() > 1.0 ? 1.0 : cpuLoad(); }  // capped, for reporting
    double memUtil() const { return static_cast<double>(memUsedMB) / memoryMB; }
    bool hasRoom(long long mb) const { return memUsedMB + mb <= memoryMB; }
};

// The machine: N nodes arranged in a ring. Distance follows the ACPI-SLIT style:
// 10 = local, +10 for every hop around the ring.
class NUMATopology {
public:
    NUMATopology(int numNodes = 4, int cpusPerNode = 4, long long memPerNodeMB = 8192);
    int distance(int from, int to) const;
    int maxDistance() const;
    int size() const { return static_cast<int>(nodes.size()); }

    std::vector<NUMANode> nodes;  // pristine nodes (no load)
};

void printNodes(const std::vector<NUMANode>& nodes);
