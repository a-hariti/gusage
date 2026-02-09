# gusage

A standalone, sub-second CLI to export and monitor Gemini CLI quota and usage statistics.

<p align="center">
    <img src="https://raw.githubusercontent.com/a-hariti/gusage/master/assets/demo.png" width="500" />
</p>

This tool reverse-engineers the internal API handshakes used by the main Gemini CLI to fetch usage statistics.

## Features

- **Live Monitoring:** Real-time quota updates using the `--watch` flag.
- **Machine Readable:** Supports JSON output for easy integration with other tools.
- **Fast:** Returns results in sub-second time.
- **Smart Sorting:** Automatically sorts models to highlight the ones you care about.
- **Beautiful TUI**

## Installation

You can run it directly without installation using `npx` or `bunx`:

```bash
bunx gusage
# or
npx gusage
```

Or install it globally:

```bash
bun add -g gusage
# or
npm install -g gusage
```

## Usage

```bash
# Display quota in a beautiful table (default)
gusage

# Monitor quota live every 10 seconds
gusage --watch

# Monitor quota every 1 minute and 20 seconds
gusage --watch 1m20s

# Output raw JSON for scripting
gusage -o json

# Disable colors
gusage --no-color
```

## Options

- `-h, --help`: Show help message.
- `-w, --watch [interval]`: Update live every interval (default: 10s). Supports units like `20s`, `5m`, `1m20s`.
- `-o, --output-format <fmt>`: Set output format to `table` (default) or `json`.
- `--no-color`: Disable color output (also respects `NO_COLOR` env var).

## Requirements

- **Authentication:** You must have already authenticated via the official Gemini CLI (`gemini login`).

## License

MIT
