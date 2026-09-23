cmake_minimum_required(VERSION 3.10)
project(numa_phase2 CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

add_executable(numa_phase2
    src/main.cpp
    src/NUMANode.cpp
    src/Workload.cpp
    src/Algorithms.cpp
    src/Metrics.cpp
    src/Database.cpp
    third_party/sqlite3.c   # vendored SQLite amalgamation - no system install needed
)

target_include_directories(numa_phase2 PRIVATE src third_party)
target_compile_definitions(numa_phase2 PRIVATE PHASE2_DB_PATH="${CMAKE_SOURCE_DIR}/database/numa_phase2.db")

if(UNIX)
    target_link_libraries(numa_phase2 PRIVATE pthread dl)
endif()
