import type { ClientMessage, ServerMessage, ServerMessageType } from "@tomino/shared";
import { parseS2CMessage, serializeMessage } from "@tomino/shared";

export type MessageHandler<T extends ServerMessage = ServerMessage> = (
  msg: T,
) => void;

type ConnectionState = "disconnected" | "connecting" | "connected";
type ConnectionHandler = (state: ConnectionState) => void;

/**
 * Thin wrapper around a browser WebSocket that speaks the Tetris protocol.
 *
 * - Serializes outgoing `ClientMessage` via `serializeMessage`
 * - Parses incoming data via `parseS2CMessage`
 * - Lets callers subscribe to specific message types
 */
export class ClientSocket {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<MessageHandler>>();
  private wildcardListeners = new Set<MessageHandler>();
  private connectionListeners = new Set<ConnectionHandler>();
  private _state: ConnectionState = "disconnected";

  get state(): ConnectionState {
    return this._state;
  }

  /** Connect to the game server. */
  connect(url: string): void {
    if (this.ws) {
      this.ws.close();
    }

    this._setState("connecting");
    const ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      if (this.ws !== ws) return; // stale socket
      this._setState("connected");
    });

    ws.addEventListener("message", (event) => {
      if (this.ws !== ws) return; // stale socket
      const raw = typeof event.data === "string" ? event.data : null;
      if (!raw) return;

      const msg = parseS2CMessage(raw);
      if (!msg) return;

      // Notify type-specific listeners
      const typed = this.listeners.get(msg.type);
      if (typed) {
        for (const handler of typed) handler(msg);
      }

      // Notify wildcard listeners
      for (const handler of this.wildcardListeners) handler(msg);
    });

    ws.addEventListener("close", () => {
      if (this.ws !== ws) return; // stale socket
      this._setState("disconnected");
      this.ws = null;
    });

    ws.addEventListener("error", () => {
      // The close event will follow; state is handled there.
    });

    this.ws = ws;
  }

  /** Disconnect from the server. */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /** Send a client message to the server. */
  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(serializeMessage(msg));
    }
  }

  /** Subscribe to a specific server message type. Returns an unsubscribe function. */
  on<T extends ServerMessageType>(
    type: T,
    handler: MessageHandler<Extract<ServerMessage, { type: T }>>,
  ): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler as MessageHandler);
    return () => set!.delete(handler as MessageHandler);
  }

  /** Subscribe to all server messages. Returns an unsubscribe function. */
  onAny(handler: MessageHandler): () => void {
    this.wildcardListeners.add(handler);
    return () => this.wildcardListeners.delete(handler);
  }

  /** Subscribe to connection state changes. Returns an unsubscribe function. */
  onConnection(handler: ConnectionHandler): () => void {
    this.connectionListeners.add(handler);
    return () => this.connectionListeners.delete(handler);
  }

  private _setState(state: ConnectionState): void {
    this._state = state;
    for (const handler of this.connectionListeners) handler(state);
  }
}
