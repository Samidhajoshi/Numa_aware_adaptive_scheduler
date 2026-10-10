#pragma once
#include <vector>
#include "NUMANode.h"
#include "Workload.h"
using namespace std;

enum class Algo { Random, LocalFirst, LoadAware, Adaptive };

const char* algoName(Algo a);
const vector<Algo>& allAlgos();

struct Placement {
    vector<int> threadNode;      // indexed by thread id
    vector<int> threadsPerNode;
    vector<NUMANode> nodes;      // final CPU/memory state
};

struct ThreadContext {
    const ThreadTask& thread;
    const vector<NUMANode>& nodes;       // current load (threads placed so far)
    const NUMATopology& topo;
    const vector<int>& candidates;       // nodes with enough free memory
    vector<long long> accessesOnNode;    // this thread's accesses to pages resident on each node
    double totalAccesses;
};

// The four strategies: each returns the node ID chosen for the thread.
int placeRandom(const ThreadContext& ctx, Rng& rng);
int placeLocalFirst(const ThreadContext& ctx);
int placeLoadAware(const ThreadContext& ctx);
int placeAdaptive(const ThreadContext& ctx);

// Runs one strategy over every thread of the workload.
Placement runAlgorithm(Algo algo, const Workload& w, const NUMATopology& topo);
