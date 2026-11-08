# Changelog

All notable changes to `@arraypress/extension-kit` are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] — 2026-11-09

### Added

- **`chrome-ui.css`**: the Chrome-native page styles, formerly the `Extensions/_chrome-ui` kit copied into each extension.
- **`createSettingsStore(schema)`** and **`createSettingsSaver(store, storage)`**: settings on Chrome Sync, one item per setting, per-computer keys in local, debounced writes, refused writes kept and retried. From More Tab Actions' and Upright's `settings.js`, generalised to a schema of defaults and a normaliser.
- **Toolbar glyph**: `createToolbarTheme`, `startToolbarTheme`, `watchFromOffscreen`, `watchSchemeOffscreen`, `watchColorScheme`, `reportColorScheme`, `schemeSender`, `toolbarIcon`.
- **About links**: `githubAboutLinks`, `isPlaceholder`.
- **`/build`**: `renderToolbarIcons`, `zipExtension`, `shipsFile`, `vendorKit`, `placeholderWarning`, `repositoryReminder`, `printReleaseChecks`, `findDisallowedClones`.
- **`/testing`**: `fakeChromeStorage`, `launchExtension`, `until`, `offscreenEmulator`, `recordIconCalls`, `filesUnder`, `zipEntries`, `missingReferences`, `manifestReferences`.
- **`extension-kit` command**: `vendor <dir>` and `duplication`.
