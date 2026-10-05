#include "Metrics.h"
#include <cstdio>

using namespace std;

// Simulated cost model (abstract cost units).
static const double READ_COST = 1.0, WRITE_COST = 1.5;   // writes cost more (coherence traffic)
static const double MEM_PRESSURE_START = 0.75;           // page-node memory pressure above this slows access

Metrics evaluate(Algo algo, const Workload& w, const NUMATopology& topo, const Placement& p) {
    Metrics m;
    m.algorithm = algoName(algo);
    m.workloadId = w.id;
    m.placement = p;

    for (const auto& t : w.threads) {
        int exec = p.threadNode[t.id];
        double load = p.nodes[exec].cpuLoad();
        double cpuFactor = load > 1.0 ? load : 1.0;               // CPU contention on the executing node
        for (const auto& a : t.accesses) {
            int home = w.pages[a.page].node;
            double over = p.nodes[home].memUtil() - MEM_PRESSURE_START;
            double memFactor = 1.0 + (over > 0 ? over : 0.0);     // memory pressure on the page's node
            double unit = topo.distance(exec, home) / 10.0 * cpuFactor * memFactor;
            m.totalCost += (a.reads * READ_COST + a.writes * WRITE_COST) * unit;
            long long n = a.reads + a.writes;
            m.totalAccesses += n;
            (home == exec ? m.localAccesses : m.remoteAccesses) += n;
        }
    }
    for (const auto& n : p.nodes) { m.avgCpuUtil += n.cpuUtil(); m.avgMemUtil += n.memUtil(); }
    m.avgCpuUtil /= p.nodes.size();
    m.avgMemUtil /= p.nodes.size();
    m.remoteRatio = m.totalAccesses ? static_cast<double>(m.remoteAccesses) / m.totalAccesses : 0.0;
    m.avgCostPerAccess = m.totalAccesses ? m.totalCost / m.totalAccesses : 0.0;
    return m;
}

void printRunSummary(const Metrics& m) {
    printf("\n[%s]\n", m.algorithm.c_str());
    for (const auto& n : m.placement.nodes)
        printf("  Node %d | Threads: %2d | CPU load: %3.0f%% | Mem: %5.1f%%\n", n.id,
               m.placement.threadsPerNode[n.id], n.cpuLoad() * 100.0, n.memUtil() * 100.0);
    printf("  Accesses: %lld total, %lld local, %lld remote | Cost: %.0f\n",
           m.totalAccesses, m.localAccesses, m.remoteAccesses, m.totalCost);
}

void printComparison(const vector<Metrics>& r) {
    printf("\n%-20s | %-7s | %-8s | %-8s | %-11s | %s\n", "Algorithm", "Local %", "Remote %",
           "CPU Util", "Memory Util", "Cost");
    printf("---------------------------------------------------------------------------------\n");
    size_t best = 0;
    for (size_t i = 0; i < r.size(); ++i) {
        printf("%-20s | %6.2f%% | %7.2f%% | %7.1f%% | %10.1f%% | %.0f\n", r[i].algorithm.c_str(),
               (1.0 - r[i].remoteRatio) * 100.0, r[i].remoteRatio * 100.0, r[i].avgCpuUtil * 100.0,
               r[i].avgMemUtil * 100.0, r[i].totalCost);
        if (r[i].totalCost < r[best].totalCost) best = i;
    }
    printf("\nWorkload #%d, %lld accesses per algorithm. Lowest cost: %s", r[0].workloadId,
           r[0].totalAccesses, r[best].algorithm.c_str());
    if (best != 0 && r[0].totalCost > 0)
        printf(" (%.1f%% below Random)", (1.0 - r[best].totalCost / r[0].totalCost) * 100.0);
    printf("\n");
}