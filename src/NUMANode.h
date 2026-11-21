#pragma once
#include <vector>
#include <string>

using namespace std;


enum class TopologyType { Symmetric, Asymmetric };


struct NodeConfig {
    int    cpus     = 4;
    long long memMB = 8192;
};

struct TopologyConfig {
    int            numNodes      = 4;          // valid range: 2–8
    TopologyType   type          = TopologyType::Symmetric;
    vector<NodeConfig> nodeConfigs;            // size == numNodes
 
    vector<vector<int>> distMatrix;           // size numNodes × numNodes

    // Serialises the topology type to a human-readable string.
    const char* typeName() const {
        return type == TopologyType::Asymmetric ? "Asymmetric" : "Symmetric";
    }
};


struct NUMANode {
    int       id        = 0;
    int       cpus      = 4;
    long long memoryMB  = 8192;
    double    cpuDemand = 0.0;   // sum of thread cpuDemands placed here
    long long memUsedMB = 0;     // pages + thread footprints

    // Derived helpers
    double cpuLoad() const { return cpuDemand / cpus; }
    // cpuUtil is capped at 1.0 (100%); cpuLoad may exceed 1.0 if oversubscribed.
    double cpuUtil() const { return cpuLoad() > 1.0 ? 1.0 : cpuLoad(); }
    double memUtil() const { return static_cast<double>(memUsedMB) / memoryMB; }
    bool   hasRoom(long long mb) const { return memUsedMB + mb <= memoryMB; }
};

class NUMATopology {
public:
    // Build from a full TopologyConfig.  Validates numNodes (clamped 2–8).
    explicit NUMATopology(const TopologyConfig& cfg);

    // Legacy constructor: symmetric 4-node ring (preserves existing behaviour).
    NUMATopology(int numNodes = 4, int cpusPerNode = 4, long long memPerNodeMB = 8192);

  
    int  distance(int from, int to) const;
    int  maxDistance() const;
    int  size() const { return static_cast<int>(nodes.size()); }

    // Topology metadata
    TopologyType topologyType() const { return type_; }
    const vector<vector<int>>& distMatrix() const { return distMatrix_; }

    vector<NUMANode> nodes;     // public for backward compat

private:
    void buildSymmetricMatrix();
    void buildAsymmetricMatrix(unsigned seed = 1234);

    TopologyType       type_;
    vector<vector<int>> distMatrix_;
};

void printNodes(const vector<NUMANode>& nodes);


TopologyConfig makeSymmetricConfig(int numNodes, int cpusPerNode = 4,
                                   long long memPerNodeMB = 8192);


TopologyConfig makeAsymmetricConfig(int numNodes, unsigned seed = 42);
