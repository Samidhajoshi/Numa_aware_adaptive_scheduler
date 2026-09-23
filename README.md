# NUMA Page Placement Simulator - Phase 2

Terminal-only C++17 demonstration: one deterministic database workload is run through four
placement strategies (Random, Local-First, Load-Aware, Adaptive NUMA-Aware), scored, stored in SQLite
and compared. **No migration of any kind exists in this phase** (that is Phase 3).

## Build & run
    cmake -S . -B build && cmake --build build
    ./build/numa_phase2            # Windows: .\build\numa_phase2.exe

No CMake: run `.\build.ps1` (Windows/MinGW) or `./build.sh` (Linux/macOS), then run `numa_phase2`.
`third_party/sqlite3.c` is C code: compile it with **gcc**, never g++ (g++ fails with
"invalid use of incomplete type 'struct ExprList_item'"). Optional argument: path of another SQLite file.

## Files
| File | Role |
|---|---|
| src/NUMANode | Node (CPUs, memory, utilisation) and ring topology with distances 10/20/30 |
| src/Workload | Seeded RNG, resident pages, threads and their read/write accesses |
| src/Algorithms | The four static thread-placement strategies |
| src/Metrics | Replays all accesses against a placement; local/remote counts, utilisation, cost; table printing |
| src/Database | SQLite tables `workloads` and `runs`; store and view results |
| src/main.cpp | Menu |
| third_party/sqlite3.* | Vendored SQLite amalgamation (library, not project code) |

## Model
- 4 nodes x 4 CPUs x 8192 MB. Pages (800 x 16 MB) are already resident on nodes when the workload starts
  (skewed loader layout). The layout is part of the workload, identical for every algorithm.
- 16 threads, each with a CPU demand, a private memory footprint and read/write accesses to pages.
- A strategy assigns each thread to a node once. Nothing moves afterwards.
- Access cost = (reads x 1 + writes x 1.5) x distance/10 x CPU-contention factor (node CPU load > 100%)
  x memory-pressure factor (page node > 75% full). All results are computed, none hard-coded.
