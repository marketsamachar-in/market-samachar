/**
 * Gemini Multi-Key Manager
 * ────────────────────────────────────────────────────────────────────────────
 * Manages multiple Gemini API keys with automatic fallback on quota exhaustion.
 *
 * Reads keys from GEMINI_API_KEYS (comma-separated) or falls back to
 * GEMINI_API_KEY (single key).
 *
 * When a key returns HTTP 429 (RESOURCE_EXHAUSTED), it's "cooldown-ed"
 * for a configurable period (default 1 hour) and the next key is tried.
 *
 * Usage:
 *   import { geminiCall } from "./geminiKeyManager.ts";
 *   const result = await geminiCall(prompt);                 // simple string
 *   const result = await geminiCall(prompt, { config });     // with config
 */

import { GoogleGenAI } from "@google/genai";

// ─── Types ───────────────────────────────────────────────────────────────────

interface GeminiCallOptions {
  /** Model name — defaults to gemini-2.5-flash */
  model?: string;
  /** Optional Gemini config (responseMimeType, responseSchema, etc.) */
  config?: Record<string, any>;
  /** Max retries across all keys (default: total keys × 2) */
  maxRetries?: number;
}

interface KeyState {
  key: string;
  label: string;         // "free-1", "free-2", "paid-1" etc.
  exhaustedAt: number;   // 0 = available
  cooldownMs: number;    // how long to wait before retrying (default 1hr)
  totalCalls: number;
  totalErrors: number;
}

// ─── State ───────────────────────────────────────────────────────────────────

const KEY_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour default cooldown

let keyStates: KeyState[] = [];
let currentKeyIndex = 0;

function initKeys(): void {
  if (keyStates.length > 0) return; // already initialized

  const multiKeys = process.env.GEMINI_API_KEYS;
  const singleKey = process.env.GEMINI_API_KEY;

  let keys: string[] = [];

  if (multiKeys) {
    keys = multiKeys
      .split(",")
      .map(k => k.trim())
      .filter(Boolean);
  }

  // Fallback to single key if GEMINI_API_KEYS not set or empty
  if (keys.length === 0 && singleKey) {
    keys = [singleKey];
  }

  if (keys.length === 0) {
    console.warn("[gemini-keys] ⚠️  No Gemini API keys configured");
    return;
  }

  keyStates = keys.map((key, i) => ({
    key,
    label: keys.length === 1 ? "default" : (i < keys.length - 1 ? `free-${i + 1}` : `paid-${i + 1}`),
    exhaustedAt: 0,
    cooldownMs: KEY_COOLDOWN_MS,
    totalCalls: 0,
    totalErrors: 0,
  }));

  console.log(
    `[gemini-keys] ✅ Loaded ${keyStates.length} key(s): ${keyStates.map(k => k.label).join(", ")}`
  );
}

// Initialize on first import
initKeys();

// ─── Key Selection ───────────────────────────────────────────────────────────

/**
 * Get the next available key, skipping exhausted ones.
 * Returns null if ALL keys are exhausted (within cooldown).
 */
function getAvailableKey(): KeyState | null {
  if (keyStates.length === 0) return null;

  const now = Date.now();

  // Try from current index forward, wrapping around
  for (let i = 0; i < keyStates.length; i++) {
    const idx = (currentKeyIndex + i) % keyStates.length;
    const state = keyStates[idx];

    if (state.exhaustedAt === 0 || (now - state.exhaustedAt) > state.cooldownMs) {
      // Key is available (either never exhausted, or cooldown has passed)
      if (state.exhaustedAt > 0) {
        console.log(`[gemini-keys] 🔄 Key "${state.label}" cooldown expired, re-enabling`);
        state.exhaustedAt = 0;
      }
      currentKeyIndex = idx;
      return state;
    }
  }

  return null; // all keys exhausted
}

/**
 * Mark a key as exhausted (hit 429 quota limit).
 */
function markExhausted(state: KeyState): void {
  state.exhaustedAt = Date.now();
  state.totalErrors++;
  const cooldownMins = Math.round(state.cooldownMs / 60000);
  console.warn(
    `[gemini-keys] 🚫 Key "${state.label}" quota exhausted — cooldown ${cooldownMins} min`
  );

  // Advance to next key
  currentKeyIndex = (keyStates.indexOf(state) + 1) % keyStates.length;
  const nextKey = getAvailableKey();
  if (nextKey) {
    console.log(`[gemini-keys] ➡️  Switched to key "${nextKey.label}"`);
  } else {
    console.error(`[gemini-keys] ❌ ALL keys exhausted! Calls will fail until cooldown expires.`);
  }
}

// ─── Main API Call ───────────────────────────────────────────────────────────

/**
 * Make a Gemini API call with automatic key rotation on quota errors.
 *
 * @param contents  - Prompt string or structured contents array
 * @param options   - Model, config, and retry settings
 * @returns         - The response text
 * @throws          - Error if all keys are exhausted or non-quota error occurs
 */
export async function geminiCall(
  contents: string | Array<{ role: string; parts: Array<{ text: string }> }>,
  options: GeminiCallOptions = {},
): Promise<string> {
  if (keyStates.length === 0) {
    initKeys(); // retry initialization
    if (keyStates.length === 0) {
      throw new Error("GEMINI_API_KEY(S) not set");
    }
  }

  const model = options.model ?? "gemini-2.5-flash";
  const maxRetries = options.maxRetries ?? keyStates.length * 2;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const keyState = getAvailableKey();
    if (!keyState) {
      throw new Error(
        `All ${keyStates.length} Gemini API key(s) are quota-exhausted. ` +
        `Retry after cooldown.`
      );
    }

    try {
      const ai = new GoogleGenAI({ apiKey: keyState.key });
      const response = await ai.models.generateContent({
        model,
        contents,
        ...(options.config ? { config: options.config } : {}),
      });

      keyState.totalCalls++;
      return response.text ?? "";
    } catch (err: any) {
      const status = err?.status ?? err?.httpStatusCode ?? err?.code;
      const message = err?.message ?? String(err);

      // Check for quota exhaustion (HTTP 429 or RESOURCE_EXHAUSTED)
      if (
        status === 429 ||
        message.includes("RESOURCE_EXHAUSTED") ||
        message.includes("429") ||
        message.includes("quota")
      ) {
        markExhausted(keyState);
        // Continue to next iteration — will try next key
        continue;
      }

      // Non-quota error — throw immediately
      throw err;
    }
  }

  throw new Error(`Gemini call failed after ${maxRetries} attempts across all keys`);
}

/**
 * Get a raw GoogleGenAI instance with the best available key.
 * Used for structured output calls that need direct SDK access.
 */
export function getGeminiClient(): { ai: InstanceType<typeof GoogleGenAI>; keyLabel: string } {
  if (keyStates.length === 0) {
    initKeys();
    if (keyStates.length === 0) {
      throw new Error("GEMINI_API_KEY(S) not set");
    }
  }

  const keyState = getAvailableKey();
  if (!keyState) {
    throw new Error("All Gemini API keys are quota-exhausted");
  }

  keyState.totalCalls++;
  return {
    ai: new GoogleGenAI({ apiKey: keyState.key }),
    keyLabel: keyState.label,
  };
}

/**
 * Wrap a structured Gemini call (with config/schema) with key rotation.
 * Use this for calls that need responseMimeType, responseSchema, etc.
 */
export async function geminiStructuredCall(
  contents: string | Array<{ role: string; parts: Array<{ text: string }> }>,
  config: Record<string, any>,
  model: string = "gemini-2.5-flash",
): Promise<string> {
  return geminiCall(contents, { model, config });
}

// ─── Status / Diagnostics ────────────────────────────────────────────────────

/**
 * Returns current key status for the admin dashboard.
 */
export function getKeyStatus(): Array<{
  label: string;
  status: "active" | "exhausted" | "cooldown";
  totalCalls: number;
  totalErrors: number;
  cooldownRemainingMs: number;
}> {
  const now = Date.now();
  return keyStates.map((state) => {
    const remaining = state.exhaustedAt > 0
      ? Math.max(0, state.cooldownMs - (now - state.exhaustedAt))
      : 0;

    return {
      label: state.label,
      status: state.exhaustedAt === 0
        ? "active"
        : remaining > 0
          ? "exhausted"
          : "cooldown",
      totalCalls: state.totalCalls,
      totalErrors: state.totalErrors,
      cooldownRemainingMs: remaining,
    };
  });
}

/**
 * Check if any key is available right now.
 */
export function hasAvailableKey(): boolean {
  return getAvailableKey() !== null;
}
