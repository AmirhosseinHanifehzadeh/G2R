# GoGherkinRunner VS Code Extension

![GoGherkinRunner Logo](logo.png)

GoGherkinRunner helps you run and debug individual Gherkin scenarios in Go projects directly from VS Code. It is designed for teams working with `.feature` files and Go test integration, making it easy to execute or debug a single scenario with one click.

## Features

- **CodeLens Buttons**: Above every `Scenario:` line in `.feature` files, you get:
  - ▶️ **Run test**: Runs only that scenario using your Go test setup.
  - 🐞 **Debug (Scenario N)**: Launches the VS Code debugger for that specific scenario, with all required environment variables.
- **Terminal Integration**: Runs the Go test command in the integrated terminal, matching your project’s structure and environment.
- **Debug Integration**: Launches a Go debug session with the correct `-test.run` and `-dotenv-dir` arguments.
- **Automatic Project Path Detection**: Dynamically finds the correct Go package and environment directory for each scenario.

## Requirements

- [Go extension for VS Code](https://marketplace.visualstudio.com/items?itemName=golang.Go)
- Your Go project must use `.feature` files and have test functions that map to those features.
- Environment variables should be set via a `.env` file in your `service` directory.

## Installation

### From VSIX
1. Build the extension:
   ```sh
   npm install
   npm run compile
   vsce package
   ```
   This creates a `.vsix` file (e.g., `GoGherkinRunner-0.0.1.vsix`).
2. In VS Code, open the Command Palette (`Ctrl+Shift+P`), select `Extensions: Install from VSIX...`, and choose your `.vsix` file.

### From Source (Development)
- Clone the repo, run `npm install`, then press `F5` in VS Code to launch a development window.

## Usage

1. Open a `.feature` file in your Go project.
2. You will see CodeLens buttons above each `Scenario:` line:
   - ▶️ **Run test**: Runs the scenario in the terminal.
   - 🐞 **Debug (Scenario N)**: Starts a debug session for that scenario.
3. You can also run the commands manually:
   - `GoGherkinRunner: Run Single Scenario`
   - `GoGherkinRunner: Debug Single Scenario`

## How It Works

- The extension parses the `.feature` file, finds the corresponding Go test function, and constructs the correct test command.
- It automatically finds the `service` directory for environment variables.
- Debugging uses the Go extension’s debug adapter with the right arguments for single-scenario execution.

## Troubleshooting

- **No CodeLens buttons?**
  - Make sure your file is recognized as `feature` or `gherkin` (see the language mode in the status bar).
  - Ensure CodeLens is enabled in VS Code settings.
- **Debug session fails with missing env?**
  - Check that your `.env` file exists in the `service` directory and contains all required variables.
- **Go test not found?**
  - Make sure your Go test files reference the feature file name.

## Contributing

Pull requests and suggestions are welcome!

## License

MIT
