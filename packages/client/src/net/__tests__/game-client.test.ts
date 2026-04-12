import { describe, it, expect, vi } from "vitest";
import type {
  ClientMessage,
  GameStateSnapshot,
  PlayerId,
  RoomId,
  ServerMessage,
  ServerMessageType,
} from "@tetris/shared";
import { makeGameState } from "@tetris/shared/__test-utils__/factories.js";
import { GameClient, type GameSessionData } from "../game-client";
import type { ClientSocket, MessageHandler } from "../client-socket";

type TypedHandler = MessageHandler<ServerMessage>;

/**
 * Minimal fake ClientSocket for unit-testing GameClient without a real
 * WebSocket. Records sent messages and lets the test fire incoming ones.
 */
function createFakeSocket() {
  const listeners = new Map<string, Set<TypedHandler>>();
  const sent: ClientMessage[] = [];

  const fake = {
    state: "connected" as const,
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn((msg: ClientMessage) => {
      sent.push(msg);
    }),
    on: vi.fn(<T extends ServerMessageType>(
      type: T,
      handler: MessageHandler<Extract<ServerMessage, { type: T }>>,
    ) => {
      let set = listeners.get(type);
      if (!set) {
        set = new Set();
        listeners.set(type, set);
      }
      set.add(handler as TypedHandler);
      return () => set!.delete(handler as TypedHandler);
    }),
    onAny: vi.fn(() => () => undefined),
    onConnection: vi.fn(() => () => undefined),
  } as unknown as ClientSocket;

  function fire(msg: ServerMessage): void {
    const set = listeners.get(msg.type);
    if (!set) return;
    for (const h of set) h(msg);
  }

  return { fake, sent, fire };
}

const ROOM: RoomId = "room-1";
const LOCAL: PlayerId = "p-local";
const REMOTE: PlayerId = "p-remote";
const SEED = 999;

function makeSession(): GameSessionData {
  return {
    seed: SEED,
    playerIndexes: { [LOCAL]: 0, [REMOTE]: 1 },
    initialStates: {
      [LOCAL]: makeGameState(),
      [REMOTE]: makeGameState(),
    },
  };
}

describe("GameClient", () => {
  it("sends a playerInput message with the assigned sequence number", () => {
    const { fake, sent } = createFakeSocket();
    const client = new GameClient({
      socket: fake,
      roomId: ROOM,
      localPlayerId: LOCAL,
      session: makeSession(),
    });

    const seq = client.sendInput("moveLeft");

    expect(seq).toBe(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      type: "playerInput",
      roomId: ROOM,
      action: "moveLeft",
      tick: 1,
    });
  });

  it("predicts the input locally before any server response", () => {
    const { fake } = createFakeSocket();
    const client = new GameClient({
      socket: fake,
      roomId: ROOM,
      localPlayerId: LOCAL,
      session: makeSession(),
    });

    const x0 = client.getRenderSnapshot().activePiece!.x;
    client.sendInput("moveLeft");
    const x1 = client.getRenderSnapshot().activePiece!.x;
    expect(x1).toBe(x0 - 1);
  });

  it("routes only local-player snapshots into the prediction engine", () => {
    const { fake, fire } = createFakeSocket();
    const client = new GameClient({
      socket: fake,
      roomId: ROOM,
      localPlayerId: LOCAL,
      session: makeSession(),
    });

    const localSnap: GameStateSnapshot = makeGameState({ tick: 7 });
    const remoteSnap: GameStateSnapshot = makeGameState({ tick: 99 });

    fire({
      type: "gameStateSnapshot",
      roomId: ROOM,
      playerId: REMOTE,
      state: remoteSnap,
    });
    expect(client.prediction.getServerSnapshot()).toBeNull();

    fire({
      type: "gameStateSnapshot",
      roomId: ROOM,
      playerId: LOCAL,
      state: localSnap,
    });
    expect(client.prediction.getServerSnapshot()).toBe(localSnap);
    expect(client.prediction.latestTick).toBe(7);
  });

  it("ignores snapshots for other rooms", () => {
    const { fake, fire } = createFakeSocket();
    const client = new GameClient({
      socket: fake,
      roomId: ROOM,
      localPlayerId: LOCAL,
      session: makeSession(),
    });

    fire({
      type: "gameStateSnapshot",
      roomId: "other-room",
      playerId: LOCAL,
      state: makeGameState({ tick: 42 }),
    });
    expect(client.prediction.getServerSnapshot()).toBeNull();
  });
});
