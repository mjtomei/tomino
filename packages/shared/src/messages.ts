/**
 * Message parsing, validation, and serialization helpers.
 *
 * These functions bridge the gap between raw WebSocket JSON and the typed
 * protocol unions, enabling safe handling of untrusted data.
 */

import type { ClientMessage, ServerMessage } from "./protocol.js";
import { CLIENT_MESSAGE_TYPES, SERVER_MESSAGE_TYPES } from "./protocol.js";

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

const clientTypeSet: ReadonlySet<string> = new Set(CLIENT_MESSAGE_TYPES);
const serverTypeSet: ReadonlySet<string> = new Set(SERVER_MESSAGE_TYPES);

/** Check whether `value` looks like a valid ClientMessage (has a known `type`). */
export function isC2SMessage(value: unknown): value is ClientMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as Record<string, unknown>).type === "string" &&
    clientTypeSet.has((value as Record<string, unknown>).type as string)
  );
}

/** Check whether `value` looks like a valid ServerMessage (has a known `type`). */
export function isS2CMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as Record<string, unknown>).type === "string" &&
    serverTypeSet.has((value as Record<string, unknown>).type as string)
  );
}

// ---------------------------------------------------------------------------
// Parsing (JSON string → typed message | null)
// ---------------------------------------------------------------------------

/**
 * Parse a raw JSON string into a ClientMessage.
 * Returns `null` if the string is not valid JSON or has an unknown type.
 */
export function parseC2SMessage(raw: string): ClientMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isC2SMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Parse a raw JSON string into a ServerMessage.
 * Returns `null` if the string is not valid JSON or has an unknown type.
 */
export function parseS2CMessage(raw: string): ServerMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    return isS2CMessage(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/** Serialize a ClientMessage or ServerMessage to a JSON string. */
export function serializeMessage(
  message: ClientMessage | ServerMessage,
): string {
  return JSON.stringify(message);
}
