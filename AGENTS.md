# Gemini Usage Project Context

This project is a standalone tool for exporting Gemini CLI quota and usage statistics. It reverse-engineers the internal authentication and API handshakes used by the main Gemini CLI.

## Core Mandates & Tribal Knowledge

### 1. Authentication & Encryption

- **Storage:** The script reads from `~/.gemini/mcp-oauth-tokens-v2.json` (primary) or `~/.gemini/oauth_creds.json` (legacy).
- **Encryption Key:** The V2 storage is encrypted with AES-256-GCM. The key is derived using:
  `crypto.scryptSync('gemini-cli-oauth', salt, 32)`
  where `salt` is `${os.hostname()}-${os.userInfo().username}-gemini-cli`.
- **Constraint:** The script must run on the same machine/user where the CLI was authenticated, or tokens will fail to decrypt due to hostname/username mismatch.

### 2. API Handshake (Quota Proxy)

- **Endpoint:** `https://cloudcode-pa.googleapis.com/v1internal`
- **Identity:** Uses the Gemini CLI internal OAuth Client ID (`681255809395...`).
- **Logic:** You cannot call `retrieveUserQuota` with just any Project ID. You must first call `:loadCodeAssist` to retrieve the `cloudaicompanionProject` ID, which acts as the metering proxy for the user's quota.

### 3. Data Filtering

- **Parity:** The script filters the raw API response to match the Gemini CLI UI.
- **Valid Models:** Only models in the `VALID_GEMINI_MODELS` set (e.g., `gemini-3-pro-preview`, `gemini-2.5-pro`) are displayed. Internal `_vertex` variants are hidden as they represent the same underlying quota pool.

## Development Guidelines (Bun-first)

- **Runtime:** Default to using **Bun** instead of Node.js.
- **Commands:**
  - Run script: `bun index.ts`
  - Install dependencies: `bun install`
  - Run tests: `bun test`
  - Build: `bun build ./index.ts --outfile index.js`
- **APIs:**
  - Use `Bun.file` over `node:fs`'s readFile/writeFile where possible.
  - Use `Bun.serve()` for servers.
  - Use `bun:sqlite` for SQLite.
  - Bun automatically loads `.env` files.
- **Testing:** Use `bun test`. Example:
  ```ts
  import { test, expect } from 'bun:test';
  test('math', () => {
    expect(1 + 1).toBe(2);
  });
  ```

## Style & Structure

- Mimic the clean, functional style of the original Gemini CLI core.
- Prefer `fetch` over external libraries for minimal footprint.
- Adhere to TypeScript best practices for type safety.
