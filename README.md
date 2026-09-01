# NUMA-Aware Adaptive Scheduler for Database Workloads

**A simulation-based evaluation of NUMA page placement strategies for DB workload**

Team: OSDBMS-V-T096

| Role | Name | Email |
|---|---|---|
| Team Lead | Samidha Joshi | 240221347@geu.ac.in |
| Team Member | Ishita Shinghari | 24022375@geu.ac.in |
| Team Member | Mehak Sethi | 24022844@geu.ac.in |

---

## Motivation

Accessing local memory generally has lower latency, while accessing memory on a remote NUMA node adds extra latency. This matters a lot for database workloads, which constantly pull large volumes of data through their buffer pools.

Current NUMA placement policies force a trade-off:
- **Strict local allocation** maximizes locality but can easily overload a single node.
- **Interleaving** spreads memory evenly across nodes but increases remote accesses.

This project explores how different NUMA page placement strategies affect database workload performance, using simulation rather than assuming any one policy is best.

## State of the Art

Common OS-level NUMA placement strategies:
- **Local allocation** — place pages on the requesting CPU's node
- **Preferred node allocation** — prefer one node, fall back when needed
- **Interleaved allocation** — spread pages across multiple nodes
- **Node binding** — restrict allocation to specific nodes
- **Page migration** — move pages when their current placement becomes suboptimal

At the DB level, systems like SAP HANA and Microsoft SQL Server already implement NUMA-aware memory management (e.g., partitioning the buffer pool across nodes). Despite this, the core trade-off between locality and load balancing remains unresolved — this project runs a comparative, simulation-based evaluation across several strategies using measured metrics.

## Project Goals

- Study NUMA architecture, memory placement, page migration, and NUMA-aware DBMS techniques
- Design and implement a working simulation framework
- Implement multiple placement/scheduling strategies for comparison
- Model realistic database workloads
- Track local page accesses and access frequency; trigger migration based on remote-access ratio or threshold
- Run all strategies across different workload types and NUMA configurations
- Determine the most suitable strategy per workload type

## Project Approach

1. **Model the NUMA system** — simulated multi-node architecture in C++ (nodes with CPUs, local memory, and NUMA distances)
2. **Create processes and threads** — varying CPU/memory/execution requirements, initially assigned to nodes
3. **Manage memory pages** — divide process memory into pages, distribute across nodes, track page location
4. **Generate memory accesses** — simulate reads/writes, classify each as local or remote
5. **Monitor system state** — track CPU utilization, memory utilization, local/remote access ratio, workload behavior
6. **Implement baseline scheduling algorithms** — Random, Local-First, Load-Aware
7. **Develop the adaptive NUMA scheduler** — considers CPU load, memory utilization, NUMA distance, and access locality
8. **Implement migration** — evaluate and perform thread/page migration when justified by expected performance gain vs. cost
9. **Store results** — SQLite for processes, pages, access stats, migration events, scheduler decisions, experiment results
10. **Build a monitoring UI** — React frontend connected via REST + WebSockets, visualizing topology, processes, memory, migrations, and scheduler decisions
11. **Evaluate performance** — compare execution time, remote accesses, throughput, CPU utilization, and migration overhead across algorithms
12. **Analyze results** — Python-based performance graphs to assess whether the adaptive scheduler improves locality and overall performance

## System Architecture

**NUMA-Aware Adaptive Scheduler — System Architecture**

```
Frontend (React)  <--- JSON (Read/Write) --->  Backend Engine (C++)  <--- Store/Load Data --->  Data Storage (SQLite)
```

**Frontend (React)**
- Dashboard & Visualization: system overview, NUMA topology view, process/thread monitor, memory & page monitor, scheduler decisions, migration history, performance graphs, workload configuration
- User Interaction: start/stop simulation, select scheduling algorithm, configure workload, view reports
- Communication: local communication via shared JSON data files

**Backend Engine (C++)**
- Simulation Controller — initialize, load config, start/stop/pause simulation, collect and store results
- Core Modules:
  - Process Manager — create processes, manage states, assign to NUMA nodes
  - Thread Manager — create threads, track execution, maintain affinity
  - NUMA Topology Manager — create nodes, distance matrix, CPU & memory info
  - Memory Manager — manage memory pages, page allocation, track page location
  - Access Monitor — track memory accesses, local/remote access, update statistics
  - Locality Analyzer — analyze access patterns, calculate locality score, detect imbalance
  - Adaptive Scheduler — evaluate nodes, compute score, select best node
  - Migration Manager — thread migration, page migration, migration cost
  - Workload Generator — generate workloads, CPU & memory patterns, multiple workload types
- Performance Monitor — CPU/memory utilization, migration count, execution time, local/remote access ratio, throughput
- Data Manager — save simulation data, statistics, logs/events, results

**Data Storage (SQLite)** — `numa_scheduler.db`
- Tables: `nodes`, `cpus`, `distance_matrix`, `processes`, `threads`, `memory_pages`, `memory_accesses`, `migrations`, `scheduler_decisions`, `workloads`, `performance_results`

**Data Flow:** Configure Workload → Run Simulation → Engine Processes Events → Results Stored → Visualize & Analyze

**Technologies Used**
- Frontend: React (charts, tables, UI components)
- Backend Engine: C++ (algorithms, simulation, scheduling, monitoring)
- Database: SQLite (local file)

## Project Outcome / Deliverables

- A working simulation of a NUMA-based system with multiple CPUs and memory nodes
- A memory allocation method that keeps data close to the CPU using it while avoiding overloading a single node
- Detection of frequent remote memory access with migration of that memory when it makes sense
- Comparison against simpler methods such as local allocation
- Measurement of whether the adaptive approach reduces remote memory accesses and improves overall performance
- Understanding of when adaptive memory allocation helps — and when the overhead isn't worth it

## Assumptions

- Different processes have different memory requirements and access patterns
- Memory pages can be moved between NUMA nodes
- Page migration carries processing overhead, so it should only happen when likely to improve performance
- The initial implementation uses a simulated NUMA environment — no dedicated NUMA hardware required
- Keeping frequently accessed data closer to the CPU using it will reduce remote memory accesses and improve overall system performance

## References

1. B. Lepers, V. Quéma, and A. Fedorova, *Thread and Memory Placement on NUMA Systems: Asymmetry Matters*. USENIX ATC, 2015.
2. A. Drebes, A. Pop, K. Heydemann, N. Drach, and A. Cohen, *NUMA-aware Scheduling and Memory Allocation for Data-flow Task-parallel Applications*. PPoPP, 2016.
3. T. Kiefer, B. Schlegel, and W. Lehner, *Experimental Evaluation of NUMA Effects on Database Management Systems*. BTW, 2013.
4. M. Dashti, A. Fedorova, J. Funston, F. Gaud, R. Lachaize, B. Lepers, V. Quéma, and M. Roth, *Traffic Management: A Holistic Approach to Memory Placement on NUMA Systems*. ASPLOS, 2013.
5. R. Lachaize, B. Lepers, and V. Quéma, *MemProf: A Memory Profiler for NUMA Multicore Systems*. USENIX ATC, 2012.
