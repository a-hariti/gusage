/**
 * Gemini CLI Stats Exporter
 *
 * Standalone script to export quota and usage statistics from Gemini CLI as JSON.
 * This script reverse-engineers the CLI's authentication and API logic to provide
 * a sub-second, machine-readable output.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';

// --- Types ---

interface OAuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType: string;
  scope?: string;
}

interface OAuthCredentials {
  serverName: string;
  token: OAuthToken;
  clientId?: string;
  tokenUrl?: string;
  mcpServerUrl?: string;
  updatedAt: number;
}

interface LegacyCredentials {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
}

interface BucketInfo {
  remainingAmount?: string;
  remainingFraction?: number;
  resetTime?: string;
  tokenType?: string;
  modelId?: string;
}

interface QuotaResponse {
  buckets?: BucketInfo[];
}

// --- Configuration & Constants ---

const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = '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';
const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const CODE_ASSIST_API_VERSION = 'v1internal';

const GEMINI_DIR = '.gemini';
const MAIN_ACCOUNT_KEY = 'main-account';
const ENCRYPTED_FILE_NAME = 'mcp-oauth-tokens-v2.json';
const LEGACY_OAUTH_FILE = 'oauth_creds.json';

const VALID_GEMINI_MODELS = new Set([
  'gemini-3-pro-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
]);

function formatRelativeTime(dateString: string): string {
  const now = new Date();
  const resetTime = new Date(dateString);
  const diffMs = resetTime.getTime() - now.getTime();

  if (diffMs <= 0) return 'Resetting...';

  const diffMins = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMins / 60);
  const m = diffMins % 60;

  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function parseVersion(modelId: string) {
  const match = modelId.match(/gemini-(\d+)(?:\.(\d+))?-(.*)/);
  if (match) {
    return {
      major: parseInt(match[1]!, 10),
      minor: match[2] ? parseInt(match[2], 10) : 0,
      suffix: match[3] || '',
    };
  }
  return { major: 0, minor: 0, suffix: modelId };
}

async function getStats(): Promise<void> {
  const { values } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      help: { type: 'boolean', short: 'h' },
      'output-format': { type: 'string', short: 'o', default: 'table' },
    },
    strict: true,
  });

  if (values.help) {
    console.log(`
Usage: gemini-usage [options]

Options:
  -h, --help                Show this help message
  -o, --output-format <fmt> Output format: table (default), json
    `);
    return;
  }

  const outputFormat = values['output-format'];
  if (outputFormat !== 'json' && outputFormat !== 'table') {
    console.error(`Error: Unsupported output format "${outputFormat}". Use "table" or "json".`);
    process.exit(1);
  }

  const creds = loadLocalCredentials();

  if (!creds) {
    console.error('Error: No credentials found. Please run "gemini login" first.');
    process.exit(1);
  }

  let token = creds.access_token;

  // Check if token is expired (with 1 min buffer)
  const isExpired = creds.expiry_date && (Date.now() > (creds.expiry_date - 60000));

  if (isExpired && creds.refresh_token) {
    try {
      const refreshed = await refreshAccessToken(creds.refresh_token);
      token = refreshed.access_token;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('Error: Failed to refresh access token.', message);
      // Try to proceed with old token anyway
    }
  }

  const baseUrl = `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}`;
  const authHeader = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // 1. Get Project ID via loadCodeAssist
  const loadResponse = await fetch(`${baseUrl}:loadCodeAssist`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({
      metadata: { ideType: 'GEMINI_CLI', platform: 'PLATFORM_UNSPECIFIED', pluginType: 'GEMINI' },
    }),
  });

  if (!loadResponse.ok) {
    console.error(`Error: loadCodeAssist failed (${loadResponse.status})`);
    process.exit(1);
  }

  const loadData = await loadResponse.json() as LoadCodeAssistResponse;
  const projectId = loadData.cloudaicompanionProject || process.env['GOOGLE_CLOUD_PROJECT'];

  if (!projectId) {
    console.error('Error: Could not determine Project ID.');
    process.exit(1);
  }

  // 2. Get Quota
  const quotaResponse = await fetch(`${baseUrl}:retrieveUserQuota`, {
    method: 'POST',
    headers: authHeader,
    body: JSON.stringify({ project: projectId }),
  });

  if (!quotaResponse.ok) {
    console.error(`Error: retrieveUserQuota failed (${quotaResponse.status})`);
    process.exit(1);
  }

  const quotaData = await quotaResponse.json() as QuotaResponse;

  // 3. Filter and Output
  if (quotaData.buckets) {
    quotaData.buckets = quotaData.buckets
      .filter(b => b.modelId && VALID_GEMINI_MODELS.has(b.modelId))
      .sort((a, b) => {
        const vA = parseVersion(a.modelId!);
        const vB = parseVersion(b.modelId!);
        if (vA.major !== vB.major) return vB.major - vA.major;
        if (vA.minor !== vB.minor) return vB.minor - vA.minor;
        return vB.suffix.localeCompare(vA.suffix);
      });
  }

  if (outputFormat === 'json') {
    console.log(JSON.stringify(quotaData.buckets, null, 2));
  } else {
    if (!quotaData.buckets || quotaData.buckets.length === 0) {
      console.log('No quota data available.');
      return;
    }

    const headers = ['Gemini Model', 'Remaining %          ', 'Reset Time'];
    const rows = quotaData.buckets.map(b => [
      b.modelId || 'N/A',
      b.remainingFraction ? `${(b.remainingFraction * 100).toFixed(1)}%` : 'N/A',
      b.resetTime ? formatRelativeTime(b.resetTime) : 'N/A'
    ]);

    // Calculate column widths
    const widths = headers.map((h, i) => Math.max(h.length, ...rows.map(r => r[i]!.length)));

    // Print header
    const headerRow = headers.map((h, i) => h.padEnd(widths[i]!)).join('  ');
    console.log(headerRow);
    console.log('─'.repeat(headerRow.length));

    // Print rows
    rows
		.map(r => r.map((cell, i) => i == 0 ? cell.replace("gemini-", "") : cell))
		.forEach(r => {
      console.log(r.map((cell, i) => cell.padEnd(widths[i]!)).join('  '));
    });
  }
}

getStats().catch(err => {
  const message = err instanceof Error ? err.message : String(err);
  console.error('Fatal Error:', message);
  process.exit(1);
});

// --- Utilities ---

function getGeminiDir(): string {
  return path.join(os.homedir(), GEMINI_DIR);
}

// --- Token Storage & Decryption ---

/**
 * Derives the encryption key used by Gemini CLI for local token storage.
 */
function deriveEncryptionKey(): Buffer {
  const salt = `${os.hostname()}-${os.userInfo().username}-gemini-cli`;
  // Password is hardcoded in the CLI for local obfuscation
  return crypto.scryptSync('gemini-cli-oauth', salt, 32);
}

/**
 * Decrypts AES-256-GCM data stored in the v2 token file.
 */
function decrypt(encryptedData: string, key: Buffer): string {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }

  const ivHex = parts[0]!;
  const authTagHex = parts[1]!;
  const encrypted = parts[2]!;

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  let decrypted: string = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Loads credentials from either the encrypted v2 file or the legacy json file.
 */
function loadLocalCredentials(): LegacyCredentials | null {
  const geminiDir = getGeminiDir();

  // Try V2 Encrypted Storage first
  const v2Path = path.join(geminiDir, ENCRYPTED_FILE_NAME);
  if (fs.existsSync(v2Path)) {
    try {
      const data = fs.readFileSync(v2Path, 'utf-8');
      const key = deriveEncryptionKey();
      const decrypted = decrypt(data, key);
      const tokens = JSON.parse(decrypted) as Record<string, OAuthCredentials>;
      const mainAccount = tokens[MAIN_ACCOUNT_KEY];

      if (mainAccount && mainAccount.token) {
        return {
          access_token: mainAccount.token.accessToken,
          refresh_token: mainAccount.token.refreshToken,
          expiry_date: mainAccount.token.expiresAt,
          token_type: mainAccount.token.tokenType
        };
      }
    } catch (e) {
      // Fallback to legacy if V2 fails
    }
  }

  // Fallback to Legacy Storage
  const legacyPath = path.join(geminiDir, LEGACY_OAUTH_FILE);
  if (fs.existsSync(legacyPath)) {
    try {
      return JSON.parse(fs.readFileSync(legacyPath, 'utf-8')) as LegacyCredentials;
    } catch (e) {
      // Ignored
    }
  }

  return null;
}

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  refresh_token?: string;
}

interface LoadCodeAssistResponse {
  cloudaicompanionProject?: string | null;
}

// --- OAuth & API ---

/**
 * Minimal OAuth2 refresh implementation to avoid external dependencies.
 */
async function refreshAccessToken(refreshToken: string): Promise<RefreshResponse> {
  const url = 'https://oauth2.googleapis.com/token';
  const body = new URLSearchParams({
    client_id: OAUTH_CLIENT_ID,
    client_secret: OAUTH_CLIENT_SECRET,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to refresh token: ${response.statusText}`);
  }

  return response.json() as Promise<RefreshResponse>;
}
