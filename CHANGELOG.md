# MMM-CalDAV-Tasks Change Log

All notable changes to this project will be documented in this file.
This project adheres to [Semantic Versioning](http://semver.org/).

## [Unreleased]

### Changed
- Simplified toggle animation - removed complex blur/opacity effects
- Improved visual feedback with clean CSS transitions
- Better performance - no more DOM manipulation intervals
- Updated `toggleTime` default from 1600ms to 1000ms

### Removed
- `offsetTop` and `offsetLeft` config options (no longer needed)
- Complex overlay animation on task toggle
- Glow effect that caused text jumping issues

## [1.1.3] - 2026-02-15

### Changed
- Updated package.json dependencies
- Changed module type to commonjs for better compatibility
- Refactored MMM-CalDAV-Tasks module structure

## [1.1.2] - 2026-02-01

### Added
- Utility modules for better code organization (date-utils, config-validator, error-handler, task-renderer)
- Configuration validation with automatic type checking and range validation
- Enhanced error handling with specific guidance messages
- CLI debug tool for testing and debugging (`node --run debug:*`)
- Docker support for development environment
- Comprehensive unit tests (29 tests passing)

### Changed
- Improved code quality and consistency
- Better default values for missing config options
- Enhanced CalDAV error messages (e.g., "Use app password!")
- Updated Node.js engine requirement to >= 20
- Refactored VTodoCompleter and WebDAV helper functions

### Fixed
- README clone URL
- Module description and author details in package.json

## [1.1.1] - 2025-11-23

### Changed
- Updated dependencies to latest versions
- Improved code formatting and style consistency
- Refactored linting scripts

### Fixed
- Node engine version requirement

## [1.1.0] - 2025-10-01

### Changed
- Major code refactoring and cleanup
- Updated .gitignore

### Fixed
- Priority icon alignment in CSS

## [1.0.10] - 2025-05-11

### Changed
- Merged multiple development branches
- Style improvements for task item layout

## [1.0.9] - 2025-03-23

### Added
- Recurring task icon with non-breaking space for layout consistency

### Changed
- Adjusted line height and heading elements for improved layout
- Streamlined non-recurring VTODO update logic

### Fixed
- Task item HTML structure for better readability

## [1.0.8] - 2025-03-09

### Added
- Grid display layout for task items
- Recurring rule icon display
- New example screenshots

### Changed
- Updated task item layout to use full width
- Enhanced CSS for priority icon and summary layout

### Fixed
- Calendar filtering logic
- Various minor bugs

## [1.0.7] - 2025-03-07

### Added
- Option to disable sound (`playSound` config)
- Better calendar filtering

### Changed
- Refactored codebase for better maintainability

## [1.0.6] - 2025-03-02

### Changed
- Renamed module from MMM-NextCloud-Tasks to MMM-CalDAV-Tasks
- Updated all references and documentation

### Fixed
- NextCloud compatibility issues

## [1.0.5] - 2025-02-26

### Added
- Package dependencies management
- iOS compatibility for task completion

### Changed
- Improved task closing mechanism

## [1.0.4] - 2025-02-09

### Added
- Option to hide date section on task completion (`hideDateSectionOnCompletion`)
- Multiple retry attempts for WebDAV requests to solve "socket hung up" errors
- Faster fetchList timeout with more attempts

### Fixed
- DOM update issues (reinitialize usedUrlIndices)
- Date section null error
- Canvas rendering issues

## [1.0.3] - 2025-02-05

### Added
- Pie chart ring to show completion percentage (`showCompletionPercent`)
- Styling for started and overdue dates
- CSS classes for finished tasks (`.MMM-CalDAV-Tasks-Completed`)

### Changed
- Replaced hardcoded colors with CSS variables
- Updated README with CSS class documentation

### Fixed
- Wrong class selector
- Minor bugfixes

## [1.0.2] - 2025-01-31

### Changed
- CSS class naming: `.MMM-NextCloud-Task-List-Item` → `.MMM-NextCloud-Tasks-List-Item`
- Improved layout consistency
- Simplified installation to one line

### Fixed
- Typos in documentation

## [1.0.1] - 2025-01-26

### Added
- `offsetTop`, `offsetLeft`, `toggleTime` configuration options
- Touch screen compatibility
- Sound on task completion
- Task toggle functionality (send to server via WebDAV)

### Fixed
- `hideCompletedTasksAfter` logic
- Config value handling

## [1.0.0] - 2025-01-17

### Added
- Support for multiple calendar URLs (array format)
- Task start and due date filtering (`startsInDays`, `dueInDays`)
- Timeout and retry logic to prevent errors
- Comprehensive README documentation

### Changed
- Config format: `listUrl` is now an array instead of a single string
- Improved date display handling
- Enhanced error messages

### Fixed
- Duplicate code blocks
- URL array validation
- Date formatting issues

## [0.9.0] - 2025-01-14

### Added
- Update information in README
- Enhanced task display options and styling

### Changed
- Installation instructions

## [0.0.1] - 2022-12-19

### Added
- Color configuration options (`colorize`)
- Priority-based colorization for task icons
- Sorting functionality (`sortMethod`)
- Sort helper module
- Left text-alignment CSS

### Changed
- Updated screenshots and assets
- Improved README documentation

## [Initial] - 2021-02-26

### Added
- Initial working version
- Basic WebDAV integration
- Task nesting support
- Option to hide completed tasks
- Basic styling and visualization
- Support for multiple instances
- CalDAV task fetching
- Task list rendering

### Features
- Display tasks from CalDAV/Nextcloud
- Priority visualization
- Date display (start and due dates)
- Sub-task support
- Completion status tracking