
#include <vector>
#include "NUMANode.h"
#include "Workload.h"
using namespace std;

enum class Algo { Random, LocalFirst, LoadAware, Adaptive };

const char* algoName(Algo a);
const vector<Algo>& allAlgos();

struct Placement {
    vector<int> threadNode;      
    vector<int> threadsPerNode;
    vector<NUMANode> nodes;      
};

struct ThreadContext {
    const ThreadTask& thread;
    const vector<NUMANode>& nodes;      
    const NUMATopology& topo;
    const vector<int>& candidates;       
    vector<long long> accessesOnNode;    
    double totalAccesses;
};


int placeRandom(const ThreadContext& ctx, Rng& rng);
int placeLocalFirst(const ThreadContext& ctx);
int placeLoadAware(const ThreadContext& ctx);
int placeAdaptive(const ThreadContext& ctx);


Placement runAlgorithm(Algo algo, const Workload& w, const NUMATopology& topo);
