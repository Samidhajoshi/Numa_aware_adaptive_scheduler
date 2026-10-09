#pragma once
#include <string>
#include <vector>
#include "Algorithms.h"

struct Metrics {
    std::string algorithm;
    int workloadId = 0;
    long long totalAccesses = 0, localAccesses = 0, remoteAccesses = 0;
    double remoteRatio = 0, avgCpuUtil = 0, avgMemUtil = 0;
    double totalCost = 0, avgCostPerAccess = 0;
    Placement placement;
};

Metrics evaluate(Algo algo, const Workload& w, const NUMATopology& topo, const Placement& p);

void printRunSummary(const Metrics& m);
void printComparison(const std::vector<Metrics>& results);
