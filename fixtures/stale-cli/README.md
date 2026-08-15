# stale-cli

[![one](https://img.shields.io/badge/one-1-blue)](#)
[![two](https://img.shields.io/badge/two-2-blue)](#)
[![three](https://img.shields.io/badge/three-3-blue)](#)
[![four](https://img.shields.io/badge/four-4-blue)](#)
[![five](https://img.shields.io/badge/five-5-blue)](#)
[![six](https://img.shields.io/badge/six-6-blue)](#)
[![seven](https://img.shields.io/badge/seven-7-blue)](#)
[![eight](https://img.shields.io/badge/eight-8-blue)](#)
[![nine](https://img.shields.io/badge/nine-9-blue)](#)

A static analysis framework built with an extensible internal pipeline.

Requires Node >=18. Licensed under Apache 2.0.

## Motivation

This fixture intentionally spends a long time discussing its motivation before showing how the
tool behaves. Visitors learn about architectural boundaries, plugin composition, internal data
flow, configuration philosophy, portability, maintenance policy, naming conventions, historical
context, and implementation tradeoffs. None of these paragraphs provides a minimal first-success
path. The prose exists to make the first runnable command objectively late enough for the fixture.

The system separates collection, normalization, transformation, analysis, scoring, presentation,
serialization, validation, compatibility, and integration concerns. Each concern can evolve on a
different schedule. The design supports multiple adapters and future execution environments. It
also creates a foundation for additional output formats and external integrations in later work.

The internal architecture favors immutable records, explicit boundaries, deterministic behavior,
and portable paths. It avoids hidden side effects and keeps presentation separate from analysis.
Contributors can reason about each stage independently. These details may be useful eventually,
but they do not tell a first-time visitor how to reach a useful result right now.

Additional discussion covers configuration layers, error conventions, compatibility, dependency
selection, maintenance expectations, and proposed extension points. The README keeps explaining
how the project might grow rather than proving what the current command produces for a user.

## Architecture

The pipeline contains collectors, classifiers, analyzers, scorers, and reporters. Each stage emits
typed data for the next stage. This fixture deliberately puts all of that context ahead of usage.

See [the architecture notes](docs/missing.md).

## Configuration

Configuration can be supplied in a future release.

## Running the project

```bash
npm install wrong-package
npm run dev
```

## Demonstration

![Late demo](assets/demo.gif)
