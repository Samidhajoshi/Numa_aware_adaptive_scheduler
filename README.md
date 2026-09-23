# A Simulation-Based Evaluation of NUMA Page Placement Strategies for DB Workloads

A C++ simulation project that evaluates NUMA-aware placement strategies for database-oriented workloads.

The project simulates NUMA nodes, CPU and memory resources, database pages, threads, memory access patterns, NUMA distances, and performance metrics. It does not require real NUMA hardware.

## Overview

In a NUMA (Non-Uniform Memory Access) system, memory is distributed across multiple nodes. Accessing memory on the same node as the executing thread is modeled as a local access, while accessing memory on another node is modeled as a remote access.

This project studies how different placement strategies affect:

- Local and remote memory accesses
- CPU utilization
- Memory utilization
- NUMA distance
- Simulated execution cost

## Objectives

- Simulate a multi-node NUMA architecture.
- Generate synthetic database workloads.
- Model database pages and thread access patterns.
- Implement and compare multiple placement strategies.
- Measure local/remote memory accesses and resource utilization.
- Store experiment results using SQLite.
- Provide a foundation for future page and thread migration.

## Project Architecture

```text
NUMA Topology
      ↓
Workload Generation
      ↓
Pages + Threads + Access Patterns
      ↓
Placement Algorithms
      ↓
Thread Placement
      ↓
Metrics & Cost Calculation
      ↓
SQLite Storage
      ↓
Comparison
```

## Simulation Model

### NUMA Nodes

Each simulated NUMA node contains:

- CPU capacity
- Memory capacity
- Current CPU load
- Current memory usage

### Database Pages

Pages represent simulated database/buffer-pool pages.

Each page has:

```text
Page ID
Home NUMA Node
```

### Threads

Each thread has:

```text
Thread ID
CPU Demand
Memory Footprint
Page Accesses
```

The workload generator creates access patterns so that threads have locality to particular pages and nodes.

## Placement Algorithms

### 1. Random

Selects a candidate NUMA node randomly. It acts as a baseline and does not consider load or locality.

### 2. Local-First

Places a thread on the node containing the largest number of pages accessed by that thread.

**Focus:** Data locality.

### 3. Load-Aware

Chooses the node with the lowest projected combination of CPU and memory utilization.

**Focus:** Resource balancing.

### 4. Adaptive NUMA-Aware

Combines:

```text
CPU Load
Memory Load
NUMA Distance
Remote Access Ratio
```

Current heuristic:

```text
Score =
0.35 × CPU
+ 0.10 × Memory
+ 0.30 × Distance
+ 0.25 × Remote Access Ratio
```

The node with the lowest score is selected.

## Workload Generation

The workload is generated synthetically using a deterministic random seed.

The current workload contains approximately:

```text
16 Threads
800 Pages
48 References per Thread
16 MB Page Size
```

Pages include private/partition pages and shared pages. Threads primarily access their own partition while also accessing shared pages, creating locality and remote-access scenarios.

The same workload is used for all four algorithms to ensure a fair comparison.

## Metrics

The simulation evaluates:

- **Total Accesses**
- **Local Accesses**
- **Remote Accesses**
- **Remote Access Ratio**
- **CPU Utilization**
- **Memory Utilization**
- **NUMA Distance**
- **Simulated Access/Execution Cost**

An access is local when:

```text
Thread Node == Page Home Node
```

Otherwise, it is remote.

## Database

SQLite is used to store:

- Workload information
- Random seeds
- Thread/page information
- Algorithm runs
- Performance metrics
- Experiment results

## Project Phases

### Phase 1 — NUMA Simulation

- NUMA node modeling
- CPU and memory modeling
- Page and thread modeling
- Workload generation
- NUMA distance
- Basic metrics

### Phase 2 — Placement Evaluation

- Random placement
- Local-First
- Load-Aware
- Adaptive NUMA-Aware
- Performance comparison
- SQLite result storage

### Phase 3 — Migration

Planned extensions include:

- Page migration
- Thread migration
- Migration overhead
- Runtime adaptation
- Dynamic placement decisions

## Project Structure

```text
NUMA PHASE 2/
│
├── src/
│   ├── main.cpp
│   ├── NUMANode.h
│   ├── NUMANode.cpp
│   ├── Workload.h
│   ├── Workload.cpp
│   ├── Algorithms.h
│   ├── Algorithms.cpp
│   ├── Metrics.h
│   ├── Metrics.cpp
│   ├── Database.h
│   └── Database.cpp
│
├── database/
├── third_party/
│   ├── sqlite3.h
│   └── sqlite3.c
│
├── CMakeLists.txt
├── build.ps1
├── build.sh
├── README.md
└── .gitignore
```

## Technologies

- **C++17**
- **SQLite**
- **CMake**
- **PowerShell**
- **Bash**

## Build & Run

### Windows

```powershell
.uild.ps1
```

### Linux / macOS

```bash
chmod +x build.sh
./build.sh
```

Or using CMake:

```bash
mkdir build
cd build
cmake ..
cmake --build .
```

## Example Output

```text
[Local-First]
Node 0 | Threads: 4 | CPU load: 68% | Mem: 65.8%
Node 1 | Threads: 5 | CPU load: 104% | Mem: 73.6%
Node 2 | Threads: 4 | CPU load: 73% | Mem: 63.9%
Node 3 | Threads: 3 | CPU load: 57% | Mem: 45.9%

Accesses: 22651 total
15692 local
6959 remote
Cost: 35905
```

## Important Note

This project is a **simulation**, not a real NUMA benchmark. CPU load, memory usage, NUMA distance, and execution cost are modeled values.

The project is intended to study and compare placement strategies under controlled database-oriented workloads.

## Team

**Team Lead:** Samidha Joshi

**Team Members:**
- Ishita Shinghari
- Mehak Sethi
