import { describe, it, expect } from "vitest";
import {
  SFX_PROFILES,
  DEFAULT_SFX_PROFILE,
  getSfxProfile,
  type SfxProfile,
} from "./sfx-profiles";
import type { SoundEvent } from "./sounds";

const ALL_EVENTS: SoundEvent[] = [
  "move",
  "rotate",
  "lock",
  "hardDrop",
  "lineClear1",
  "lineClear2",
  "lineClear3",
  "lineClear4",
  "tSpin",
  "hold",
  "levelUp",
  "gameOver",
];

describe("sfx-profiles", () => {
  it("registers all 4 genres", () => {
    expect(Object.keys(SFX_PROFILES).sort()).toEqual(
      ["ambient", "chiptune", "minimal-techno", "synthwave"].sort(),
    );
  });

  it.each(Object.entries(SFX_PROFILES))(
    "%s profile defines every SoundEvent",
    (_name, profile) => {
      for (const event of ALL_EVENTS) {
        expect(profile[event]).toBeDefined();
      }
    },
  );

  it("default profile defines every SoundEvent", () => {
    for (const event of ALL_EVENTS) {
      expect(DEFAULT_SFX_PROFILE[event]).toBeDefined();
    }
  });

  it("every patch in every profile is well-formed", () => {
    const allProfiles: SfxProfile[] = [
      DEFAULT_SFX_PROFILE,
      ...Object.values(SFX_PROFILES),
    ];
    for (const profile of allProfiles) {
      for (const event of ALL_EVENTS) {
        const patch = profile[event];
        expect(patch.duration).toBeGreaterThan(0);
        expect(patch.gain).toBeGreaterThan(0);
        expect(patch.gain).toBeLessThanOrEqual(1);
        expect(patch.layers.length).toBeGreaterThan(0);
        for (const layer of patch.layers) {
          expect(layer.frequency).toBeGreaterThan(0);
          expect(["sine", "square", "sawtooth", "triangle"]).toContain(
            layer.type,
          );
        }
        const env = patch.envelope;
        expect(env.attack).toBeGreaterThanOrEqual(0);
        expect(env.decay).toBeGreaterThanOrEqual(0);
        expect(env.release).toBeGreaterThanOrEqual(0);
        expect(env.sustain).toBeGreaterThanOrEqual(0);
        expect(env.sustain).toBeLessThanOrEqual(1);
        expect(env.peak).toBeGreaterThan(0);
      }
    }
  });

  it("getSfxProfile returns the matching profile by id", () => {
    expect(getSfxProfile("chiptune")).toBe(SFX_PROFILES.chiptune);
    expect(getSfxProfile("synthwave")).toBe(SFX_PROFILES.synthwave);
    expect(getSfxProfile("ambient")).toBe(SFX_PROFILES.ambient);
    expect(getSfxProfile("minimal-techno")).toBe(
      SFX_PROFILES["minimal-techno"],
    );
  });

  it("getSfxProfile falls back to default for unknown / null / empty", () => {
    expect(getSfxProfile(null)).toBe(DEFAULT_SFX_PROFILE);
    expect(getSfxProfile(undefined)).toBe(DEFAULT_SFX_PROFILE);
    expect(getSfxProfile("")).toBe(DEFAULT_SFX_PROFILE);
    expect(getSfxProfile("nope")).toBe(DEFAULT_SFX_PROFILE);
  });

  it("chiptune move patch differs from synthwave move patch", () => {
    const chip = SFX_PROFILES.chiptune!.move;
    const syn = SFX_PROFILES.synthwave!.move;
    // Different layers / oscillator shapes — at least one oscillator type differs
    const chipTypes = chip.layers.map((l) => l.type).sort();
    const synTypes = syn.layers.map((l) => l.type).sort();
    expect(chipTypes.join(",")).not.toEqual(synTypes.join(","));
  });
});
