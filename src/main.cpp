#include <cstdio>
#include <cstdlib>
#include <iostream>
#include <string>
#include "Algorithms.h"
#include "Database.h"
#include "Metrics.h"
#include "NUMANode.h"
#include "Workload.h"

#ifndef PHASE2_DB_PATH
#define PHASE2_DB_PATH "database/numa_phase2.db"
#endif

using namespace std;

static bool readLine(const char* prompt, string& out) {
    printf("%s", prompt);
    fflush(stdout);
    return static_cast<bool>(getline(cin, out));
}

// Parse workload type from a single character ("1"-"4").
// Returns MIXED for empty input or unrecognised values.
static WorkloadType parseWorkloadType(const string& s) {
    if (s == "1") return WorkloadType::CPU_INTENSIVE;
    if (s == "2") return WorkloadType::READ_HEAVY;
    if (s == "3") return WorkloadType::WRITE_HEAVY;
    return WorkloadType::MIXED;   // "4" or empty
}

int main(int argc, char** argv) {
    string dbPath = argc > 1 ? argv[1] : PHASE2_DB_PATH;
    Database db(dbPath);
    if (!db.ok()) printf("Warning: could not open SQLite database at %s\n", dbPath.c_str());

    NUMATopology topo(4, 4, 8192);
    Workload workload;
    bool haveWorkload = false;
    vector<Metrics> results;

    auto makeWorkload = [&](unsigned seed, WorkloadType wt) {
        workload = generateWorkload(seed, topo.size(), wt);
        workload.id = db.saveWorkload(workload);
        haveWorkload = true;
        results.clear();
        printf("\nWorkload #%d generated (seed %u, type: %s)\n",
               workload.id, seed, workloadTypeName(wt));
        printf("  Pages: %zu x %d MB | Threads: %zu\n",
               workload.pages.size(), workload.pageSizeMB, workload.threads.size());
        printf("  Accesses: %lld total (%lld reads, %lld writes)\n",
               workload.totalAccesses(), workload.totalReads(), workload.totalWrites());
        vector<int> perNode(topo.size(), 0);
        for (const auto& p : workload.pages) perNode[p.node]++;
        printf("  Resident pages per node:");
        for (int n = 0; n < topo.size(); ++n) printf(" N%d=%d", n, perNode[n]);
        printf("\n");
    };

    string line;
    while (true) {
        printf("\n========================================\n"
               " NUMA PAGE PLACEMENT SIMULATOR - PHASE 2\n"
               "========================================\n\n"
               "1. Create/Display NUMA Nodes\n2. Generate Database Workload\n3. Run All Four Algorithms\n"
               "4. Compare Performance\n5. View Stored Results\n6. Exit\n\n");
        if (!readLine("Choice: ", line)) break;

        if (line == "1") {
            printNodes(haveWorkload ? initialNodeState(topo, workload) : topo.nodes);
            printf("\nDistance matrix (10 = local, +10 per ring hop):\n");
            for (int i = 0; i < topo.size(); ++i) {
                for (int j = 0; j < topo.size(); ++j) printf("%4d", topo.distance(i, j));
                printf("\n");
            }
            if (haveWorkload) printf("\n(Memory util shows resident database pages; CPU is idle until threads are placed.)\n");
        } else if (line == "2") {
            string t, s;
            if (!readLine("Workload type [1=CPU-Intensive 2=Read-Heavy 3=Write-Heavy 4=Mixed]: ", t)) break;
            if (!readLine("Seed [42]: ", s)) break;
            WorkloadType wt = parseWorkloadType(t.empty() ? "4" : t);
            unsigned seed   = s.empty() ? 42u : static_cast<unsigned>(strtoul(s.c_str(), nullptr, 10));
            makeWorkload(seed, wt);
        } else if (line == "3") {
            if (!haveWorkload) makeWorkload(42u, WorkloadType::MIXED);
            results.clear();
            bool stored = db.ok();
            for (Algo a : allAlgos()) {
                Metrics m = evaluate(a, workload, topo, runAlgorithm(a, workload, topo));
                printRunSummary(m);
                stored = db.saveRun(m) && stored;
                results.push_back(m);
            }
            printf("\n%s\n", stored ? "Results successfully stored in SQLite." : "Warning: results could not be stored in SQLite.");
        } else if (line == "4") {
            if (results.empty()) printf("\nNo results yet - generate a workload and run option 3 first.\n");
            else printComparison(results);
        } else if (line == "5") {
            db.printStoredResults();
        } else if (line == "6") {
            printf("Goodbye.\n");
            break;
        } else {
            printf("Invalid choice.\n");
        }
    }
    return 0;
}