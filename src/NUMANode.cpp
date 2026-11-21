#include "NUMANode.h"
#include <cstdio>
#include <cstdlib>
#include <cmath>
#include <algorithm>
using namespace std;


static uint32_t lcg(uint32_t& s) {
    s = s * 1664525u + 1013904223u;
    return s;
}


NUMATopology::NUMATopology(const TopologyConfig& cfg) : type_(cfg.type) {
    int n = cfg.numNodes;
    if (n < 2) n = 2;
    if (n > 8) n = 8;

    nodes.resize(n);
    distMatrix_.assign(n, vector<int>(n, 0));

    for (int i = 0; i < n; ++i) {
        nodes[i].id       = i;
        if (i < (int)cfg.nodeConfigs.size()) {
            nodes[i].cpus     = cfg.nodeConfigs[i].cpus;
            nodes[i].memoryMB = cfg.nodeConfigs[i].memMB;
        } else {
            nodes[i].cpus     = 4;
            nodes[i].memoryMB = 8192;
        }
    }

    if (type_ == TopologyType::Symmetric) {
        buildSymmetricMatrix();
    } else {
        // If a matrix was provided in the config, use it; otherwise auto-generate.
        if ((int)cfg.distMatrix.size() == n && (int)cfg.distMatrix[0].size() == n) {
            distMatrix_ = cfg.distMatrix;
        } else {
            buildAsymmetricMatrix(1234);
        }
    }
}


NUMATopology::NUMATopology(int numNodes, int cpusPerNode, long long memPerNodeMB)
    : type_(TopologyType::Symmetric) {
    if (numNodes < 2) numNodes = 2;
    if (numNodes > 8) numNodes = 8;
    nodes.resize(numNodes);
    distMatrix_.assign(numNodes, vector<int>(numNodes, 0));
    for (int i = 0; i < numNodes; ++i) {
        nodes[i].id       = i;
        nodes[i].cpus     = cpusPerNode;
        nodes[i].memoryMB = memPerNodeMB;
    }
    buildSymmetricMatrix();
}


void NUMATopology::buildSymmetricMatrix() {
    int n = static_cast<int>(nodes.size());
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            int d    = abs(i - j);
            int hops = d < n - d ? d : n - d;  // shortest ring path
            distMatrix_[i][j] = 10 + 10 * hops;
        }
    }
}


void NUMATopology::buildAsymmetricMatrix(unsigned seed) {
    int n = static_cast<int>(nodes.size());
    // First, build the symmetric base.
    buildSymmetricMatrix();
    // Then perturb off-diagonal entries.
    uint32_t s = seed;
    for (int i = 0; i < n; ++i) {
        for (int j = 0; j < n; ++j) {
            if (i == j) continue;
            // perturbation in [-20%, +30%] to keep positive and introduce variety
            int base = distMatrix_[i][j];
            int delta = (int)(lcg(s) % 51) - 10;  // -10..+40 then /100 of base
            int perturbed = base + (base * delta / 100);
            if (perturbed < 11) perturbed = 11; // always > local (10)
            distMatrix_[i][j] = perturbed;
        }
    }
}

int NUMATopology::distance(int from, int to) const {
    int n = size();
    if (from < 0 || from >= n || to < 0 || to >= n) return 10;
    return distMatrix_[from][to];
}

int NUMATopology::maxDistance() const {
    int m = 10;
    for (int i = 0; i < size(); ++i)
        for (int j = 0; j < size(); ++j)
            if (distMatrix_[i][j] > m) m = distMatrix_[i][j];
    return m;
}

void printNodes(const vector<NUMANode>& nodes) {
    printf("\nNUMA System\n");
    for (const auto& n : nodes)
        printf("Node %d | CPUs: %d | Memory: %lld MB | CPU Util: %5.1f%% | Mem Util: %5.1f%%\n",
               n.id, n.cpus, n.memoryMB, n.cpuUtil() * 100.0, n.memUtil() * 100.0);
}


TopologyConfig makeSymmetricConfig(int numNodes, int cpusPerNode, long long memPerNodeMB) {
    if (numNodes < 2) numNodes = 2;
    if (numNodes > 8) numNodes = 8;
    TopologyConfig cfg;
    cfg.numNodes = numNodes;
    cfg.type     = TopologyType::Symmetric;
    cfg.nodeConfigs.resize(numNodes, { cpusPerNode, memPerNodeMB });
    // distMatrix left empty; constructor will fill it via buildSymmetricMatrix().
    return cfg;
}


TopologyConfig makeAsymmetricConfig(int numNodes, unsigned seed) {
    if (numNodes < 2) numNodes = 2;
    if (numNodes > 8) numNodes = 8;
    uint32_t s = seed;
    TopologyConfig cfg;
    cfg.numNodes = numNodes;
    cfg.type     = TopologyType::Asymmetric;
    cfg.nodeConfigs.resize(numNodes);
    // CPU choices: 2, 4, 6, 8 cores (vary per node)
    static const int cpuChoices[] = {2, 4, 4, 6, 8};
    // Memory choices: 4 GB, 8 GB, 12 GB, 16 GB
    static const long long memChoices[] = {4096, 8192, 12288, 16384};
    for (int i = 0; i < numNodes; ++i) {
        cfg.nodeConfigs[i].cpus  = cpuChoices[lcg(s) % 5];
        cfg.nodeConfigs[i].memMB = memChoices[lcg(s) % 4];
    }
    // distMatrix left empty; constructor will call buildAsymmetricMatrix(1234).
    return cfg;
}
