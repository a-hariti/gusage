# gusage

A CLI / TUI to monitor Gemini CLI usage.

<p align="center">
    <img src="https://raw.githubusercontent.com/a-hariti/gusage/master/assets/demo.png" width="500" />
</p>

This tool reverse-engineers the internal API handshakes used by the main Gemini CLI to fetch usage statistics.

## Features

- **Live Monitoring:** Real-time quota updates using the `--watch` flag.
- **Low-Quota Alerts:** Optional desktop notifications with `--notify` when usage drops below a threshold.
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

# Monitor quota and notify when any model falls below 20% (default threshold)
gusage --watch --notify

# Monitor quota and notify when any model falls below 15%
gusage --watch 30s --notify 15

# Output raw JSON for scripting
gusage --json | jq .

# Stream JSON updates every 5 seconds (one line per tick)
gusage --json --watch 5s | jq .
```

## Options

- `-h, --help`: Show help message.
- `-w, --watch [interval]`: Update live every interval (default: 10s). Supports units like `20s`, `5m`, `1m20s`.
- `-n, --notify [threshold]`: Send a desktop notification when a model drops below the threshold percent (default: `20`). Requires `--watch`.
- `-j, --json`: Output raw JSON instead of a table. Can be combined with `--watch` for streaming data.
- `--no-color`: Disable color output (also respects `NO_COLOR` env var).

## Requirements

- **Authentication:** You must have already authenticated via the official Gemini CLI (`gemini login`).
- **Notifications (Linux only):** `notify-send` must be installed when using `--notify`.

## License

MIT
