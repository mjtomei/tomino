import { describe, it, expect, beforeEach } from "vitest";
import { ParticleSystem, type EmitConfig } from "../particle-system";

const baseConfig: EmitConfig = {
  shape: "circle",
  color: "#fff",
  lifetime: 1,
  velocity: { x: 10, y: 0 },
  size: 2,
};

describe("ParticleSystem", () => {
  let system: ParticleSystem;

  beforeEach(() => {
    // deterministic RNG
    let i = 0;
    const rng = (): number => {
      i++;
      return (i * 0.3137) % 1;
    };
    system = new ParticleSystem({ rng });
  });

  it("spawns the requested count", () => {
    system.emit(baseConfig, { x: 0, y: 0 }, 5);
    expect(system.count()).toBe(5);
  });

  it("no-op on count <= 0", () => {
    system.emit(baseConfig, { x: 0, y: 0 }, 0);
    system.emit(baseConfig, { x: 0, y: 0 }, -3);
    expect(system.count()).toBe(0);
  });

  it("integrates velocity", () => {
    system.emit(baseConfig, { x: 0, y: 0 }, 1);
    system.update(0.05);
    const p = system.getParticles()[0]!;
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo(0, 5);
  });

  it("applies gravity to velocity", () => {
    system.emit(
      { ...baseConfig, velocity: { x: 0, y: 0 }, gravity: { x: 0, y: 100 } },
      { x: 0, y: 0 },
      1,
    );
    system.update(0.1);
    const p = system.getParticles()[0]!;
    expect(p.vy).toBeCloseTo(10, 5);
    expect(p.y).toBeCloseTo(1, 5);
  });

  it("expires particles past lifetime", () => {
    system.emit({ ...baseConfig, lifetime: 0.2 }, { x: 0, y: 0 }, 3);
    system.update(0.1);
    expect(system.count()).toBe(3);
    system.update(0.15);
    expect(system.count()).toBe(0);
  });

  it("culls particles outside bounds", () => {
    system = new ParticleSystem({
      bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
    });
    system.emit(
      { ...baseConfig, velocity: { x: 1000, y: 0 }, lifetime: 100 },
      { x: 0, y: 0 },
      1,
    );
    system.update(0.05);
    expect(system.count()).toBe(0);
  });

  it("keeps particles inside bounds", () => {
    system = new ParticleSystem({
      bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
    });
    system.emit({ ...baseConfig, lifetime: 100 }, { x: 0, y: 0 }, 1);
    system.update(0.1);
    expect(system.count()).toBe(1);
  });

  it("clamps large dt to avoid tunneling", () => {
    system.emit({ ...baseConfig, lifetime: 10 }, { x: 0, y: 0 }, 1);
    system.update(5);
    const p = system.getParticles()[0]!;
    // dt clamped to 0.1
    expect(p.x).toBeCloseTo(1, 5);
  });

  it("emit from event trigger increments count", () => {
    const onLineClear = (): void => {
      system.emit(baseConfig, { x: 50, y: 50 }, 20);
    };
    expect(system.count()).toBe(0);
    onLineClear();
    expect(system.count()).toBe(20);
    onLineClear();
    expect(system.count()).toBe(40);
  });

  it("clear removes all particles", () => {
    system.emit(baseConfig, { x: 0, y: 0 }, 10);
    system.clear();
    expect(system.count()).toBe(0);
  });

  it("respects maxParticles cap", () => {
    system = new ParticleSystem({ maxParticles: 5 });
    system.emit(baseConfig, { x: 0, y: 0 }, 100);
    expect(system.count()).toBe(5);
  });

  it("tracks trail history when trailLength > 0", () => {
    system.emit({ ...baseConfig, trailLength: 3 }, { x: 0, y: 0 }, 1);
    system.update(0.05);
    system.update(0.05);
    system.update(0.05);
    const p = system.getParticles()[0]!;
    expect(p.trail.length).toBe(3);
  });

  it("velocityJitter varies particles", () => {
    system.emit(
      { ...baseConfig, velocityJitter: { x: 5, y: 5 } },
      { x: 0, y: 0 },
      5,
    );
    const vxs = system.getParticles().map((p) => p.vx);
    const unique = new Set(vxs);
    expect(unique.size).toBeGreaterThan(1);
  });
});
