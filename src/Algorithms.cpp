#include "Algorithms.h"
#include <limits>

using namespace std;


static const double WEIGHT_CPU = 0.35, WEIGHT_MEM = 0.10, WEIGHT_DISTANCE = 0.30, WEIGHT_REMOTE = 0.25;


static double projectedCpuLoad(const ThreadContext& ctx, int nodeId) {
    return (ctx.nodes[nodeId].cpuDemand + ctx.thread.cpuDemand) / ctx.nodes[nodeId].cpus;
}


static double projectedMemLoad(const ThreadContext& ctx, int nodeId) {
    return static_cast<double>(ctx.nodes[nodeId].memUsedMB + ctx.thread.footprintMB) /
           ctx.nodes[nodeId].memoryMB;
}


template <typename ScoreFunction>
static int pickLowestScoringNode(const ThreadContext& ctx, ScoreFunction computeScore) {
    int bestNode = ctx.candidates[0];
    double bestScore = numeric_limits<double>::max();
    for (int nodeId : ctx.candidates) {
        double score = computeScore(nodeId);
        if (score < bestScore) {
            bestScore = score;
            bestNode = nodeId;
        }
    }
    return bestNode;
}

const char* algoName(Algo algo) {
    switch (algo) {
        case Algo::Random:     return "Random";
        case Algo::LocalFirst: return "Local-First";
        case Algo::LoadAware:  return "Load-Aware";
        default:               return "Adaptive NUMA-Aware";
    }
}

const vector<Algo>& allAlgos() {
    static const vector<Algo> algos = {Algo::Random, Algo::LocalFirst, Algo::LoadAware, Algo::Adaptive};
    return algos;
}
int placeRandom(const ThreadContext& ctx, Rng& rng) {
    return ctx.candidates[rng.range(0, static_cast<int>(ctx.candidates.size()))];
}


int placeLocalFirst(const ThreadContext& ctx) {
    return pickLowestScoringNode(ctx, [&](int nodeId) {
        return -static_cast<double>(ctx.accessesOnNode[nodeId]);
    });
}

int placeLoadAware(const ThreadContext& ctx) {
    return pickLowestScoringNode(ctx, [&](int nodeId) {
        return 0.5 * projectedCpuLoad(ctx, nodeId) + 0.5 * projectedMemLoad(ctx, nodeId);
    });
}

int placeAdaptive(const ThreadContext& ctx) {
    return pickLowestScoringNode(ctx, [&](int nodeId) {
        double totalWeightedDistance = 0.0;
        for (int otherNode = 0; otherNode < ctx.topo.size(); ++otherNode) {
            totalWeightedDistance += ctx.accessesOnNode[otherNode] * ctx.topo.distance(nodeId, otherNode);
        }
        double avgDistance = totalWeightedDistance / ctx.totalAccesses;
        double normalizedDistance = avgDistance / ctx.topo.maxDistance();

        double remoteAccessRatio = 1.0 - ctx.accessesOnNode[nodeId] / ctx.totalAccesses;

        return WEIGHT_CPU * projectedCpuLoad(ctx, nodeId) +
               WEIGHT_MEM * projectedMemLoad(ctx, nodeId) +
               WEIGHT_DISTANCE * normalizedDistance +
               WEIGHT_REMOTE * remoteAccessRatio;
    });
}

Placement runAlgorithm(Algo algo, const Workload& workload, const NUMATopology& topo) {
    Placement placement;
    placement.nodes = initialNodeState(topo, workload);
    placement.threadsPerNode.assign(topo.size(), 0);
    Rng rng(workload.seed + 1000);  // only used by Random; fixed so runs are reproducible

    for (const auto& thread : workload.threads) {
        // Only nodes with room for the thread's private memory are candidates.
        vector<int> candidateNodes;
        for (const auto& node : placement.nodes) {
            if (node.hasRoom(thread.footprintMB)) candidateNodes.push_back(node.id);
        }
        if (candidateNodes.empty()) {
            for (const auto& node : placement.nodes) candidateNodes.push_back(node.id);
        }

        ThreadContext ctx{thread, placement.nodes, topo, candidateNodes,
                          vector<long long>(topo.size(), 0),
                          static_cast<double>(thread.totalAccesses())};
        for (const auto& access : thread.accesses) {
            ctx.accessesOnNode[workload.pages[access.page].node] += access.reads + access.writes;
        }

        int chosenNode;
        switch (algo) {
            case Algo::Random: chosenNode = placeRandom(ctx, rng); break;
            case Algo::LocalFirst: chosenNode = placeLocalFirst(ctx);  break;
            case Algo::LoadAware:  chosenNode = placeLoadAware(ctx);   break;
            default:  chosenNode = placeAdaptive(ctx);    break;
        }

        placement.threadNode.push_back(chosenNode);
        placement.threadsPerNode[chosenNode]++;
        placement.nodes[chosenNode].cpuDemand += thread.cpuDemand;
        placement.nodes[chosenNode].memUsedMB += thread.footprintMB;
    }
    return placement;
}