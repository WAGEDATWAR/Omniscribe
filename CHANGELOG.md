# Changelog

All notable changes to Omniscribe are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to the version in `package.json`.

## [Unreleased]

### Added

- Planning documents: the charter (`docs/OMNISCRIBE.md`), the architecture and canonical model
  (`docs/ARCHITECTURE.md`), the decision log, the deferral ledger, the plan and gates, the live status,
  the documentation index and agent notes. No code yet; P0 is next.
- Decisions G-17 to G-20, S-8 to S-10, D-7, P-14 to P-16: user-created and derivable game systems,
  distribution, the generated PDF with an upload override, the vendored PDF libraries, random tables.

- Decision D-8 (vendored three.js, scripted physics-free dice) and P-15 settled on Electron for Windows.

### Changed

- The system editor moved from P6 into P2, random tables moved to post-v1, and the PDF viewer is the
  app's own vendored one (U-8). DEF-021 is dropped.
