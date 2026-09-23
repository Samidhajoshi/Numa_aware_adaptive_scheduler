# Build without CMake (Windows / MinGW). Run from the project folder:  .\build.ps1
# NOTE: sqlite3.c is C code - it must be compiled with gcc, NOT g++ (g++ gives the
# "invalid use of incomplete type" errors).
$ErrorActionPreference = "Stop"

if (-not (Test-Path "third_party/sqlite3.o")) {
    Write-Host "Compiling SQLite (C, one-time)..."
    gcc -O2 -c -o third_party/sqlite3.o third_party/sqlite3.c
}

Write-Host "Compiling and linking numa_phase2..."
g++ -std=c++17 -O2 -Isrc -Ithird_party -o numa_phase2.exe `
    src/main.cpp src/NUMANode.cpp src/Workload.cpp src/Algorithms.cpp src/Metrics.cpp src/Database.cpp `
    third_party/sqlite3.o

Write-Host "Built numa_phase2.exe. Run it with: .\numa_phase2.exe"
