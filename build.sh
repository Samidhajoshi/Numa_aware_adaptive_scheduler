#!/bin/sh
# Build without CMake (Linux/macOS). sqlite3.c is C code: compile it with gcc, not g++.
set -e
[ -f third_party/sqlite3.o ] || gcc -O2 -c -o third_party/sqlite3.o third_party/sqlite3.c
g++ -std=c++17 -O2 -Isrc -Ithird_party -o numa_phase2 \
    src/main.cpp src/NUMANode.cpp src/Workload.cpp src/Algorithms.cpp src/Metrics.cpp src/Database.cpp \
    third_party/sqlite3.o -lpthread -ldl
echo "Built ./numa_phase2"
