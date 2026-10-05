#include "NUMANode.h"
#include <cstdio>
#include <cstdlib>
using namespace std;
NUMATopology::NUMATopology(int numNodes, int cpusPerNode, long long memPerNodeMB) {
    for (int i = 0; i < numNodes; ++i) {
        NUMANode n;
        n.id = i;
        n.cpus = cpusPerNode;
        n.memoryMB = memPerNodeMB;
        nodes.push_back(n);
    }
}

int NUMATopology::distance(int from, int to) const {
    int n = size();
    int d =    abs(from - to);
    int hops = d < n - d ? d : n - d;
    return 10 + 10 * hops;
}

int NUMATopology::maxDistance() const {
    int m = 10;
    for (int i = 0; i < size(); ++i)
        for (int j = 0; j < size(); ++j)
            if (distance(i, j) > m) m = distance(i, j);
    return m;
}

void printNodes(const    vector<NUMANode>& nodes) {
       printf("\nNUMA System\n--------------------------------------------------------------\n");
    for (const auto& n : nodes)
           printf("Node %d | CPUs: %d | Memory: %lld MB | CPU Util: %5.1f%% | Mem Util: %5.1f%%\n",
                    n.id, n.cpus, n.memoryMB, n.cpuUtil() * 100.0, n.memUtil() * 100.0);
}
