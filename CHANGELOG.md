# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and semantic
versioning.

## [Unreleased]

## [1.0.0] - 2026-08-24

### Added

- typed README claim and repository evidence graph;
- workspace-aware Node, Python, Rust, and Go adapters;
- stable CLI, library/SDK, web app, API, desktop app, and GitHub Action rubrics;
- coverage-aware scoring, SARIF, GitHub annotations, diff gates, and config v2;
- isolated Analyzer API, composable rule packs, and cross-platform quality gates.

### Changed

- project classification now uses weighted evidence rather than first-match regexes;
- generic images and ordinary code samples no longer count as product proof;
- first-impression trust uses README-visible signals rather than hidden metadata;
- scans enforce canonical path, bounded file, and private-network safety invariants.

### Breaking

- the minimum supported runtime is Node.js 22;
- report and baseline schemas are version 2;
- config v2 is generated; v1 remains readable during the migration window;
- scoring exposes category weights, coverage, and `partial` outcomes.

## [0.2.0] - 2025-08-15

### Added

- repository-aware analysis, first-impression audit, baseline mode, and profile experiment.
