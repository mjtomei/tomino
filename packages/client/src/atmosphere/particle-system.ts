export type ParticleShape =
  | "circle"
  | "square"
  | "diamond"
  | "line"
  | "star"
  | "triangle";

export interface EmitConfig {
  shape: ParticleShape;
  color: string;
  lifetime: number;
  velocity: { x: number; y: number };
  velocityJitter?: { x: number; y: number };
  gravity?: { x: number; y: number };
  size: number;
  sizeCurve?: [number, number];
  fade?: [number, number];
  trailLength?: number;
  rotation?: number;
  rotationSpeed?: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  ax: number;
  ay: number;
  age: number;
  lifetime: number;
  shape: ParticleShape;
  color: string;
  size: number;
  sizeCurve: [number, number];
  fade: [number, number];
  trail: Array<{ x: number; y: number }>;
  trailLength: number;
  rotation: number;
  rotationSpeed: number;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ParticleSystemOptions {
  bounds?: Bounds;
  rng?: () => number;
  maxParticles?: number;
  maxDelta?: number;
}

const DEFAULT_MAX_DELTA = 0.1;
const DEFAULT_MAX_PARTICLES = 2000;

export class ParticleSystem {
  private particles: Particle[] = [];
  private rng: () => number;
  private bounds: Bounds | undefined;
  private readonly maxParticles: number;
  private readonly maxDelta: number;

  constructor(options: ParticleSystemOptions = {}) {
    this.rng = options.rng ?? Math.random;
    this.bounds = options.bounds;
    this.maxParticles = options.maxParticles ?? DEFAULT_MAX_PARTICLES;
    this.maxDelta = options.maxDelta ?? DEFAULT_MAX_DELTA;
  }

  setBounds(bounds: Bounds | undefined): void {
    this.bounds = bounds;
  }

  count(): number {
    return this.particles.length;
  }

  clear(): void {
    this.particles.length = 0;
  }

  emit(
    config: EmitConfig,
    position: { x: number; y: number },
    count: number,
  ): void {
    if (count <= 0) return;
    const jx = config.velocityJitter?.x ?? 0;
    const jy = config.velocityJitter?.y ?? 0;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) return;
      const p: Particle = {
        x: position.x,
        y: position.y,
        vx: config.velocity.x + (this.rng() * 2 - 1) * jx,
        vy: config.velocity.y + (this.rng() * 2 - 1) * jy,
        ax: config.gravity?.x ?? 0,
        ay: config.gravity?.y ?? 0,
        age: 0,
        lifetime: config.lifetime,
        shape: config.shape,
        color: config.color,
        size: config.size,
        sizeCurve: config.sizeCurve ?? [1, 1],
        fade: config.fade ?? [1, 0],
        trail: [],
        trailLength: config.trailLength ?? 0,
        rotation: config.rotation ?? 0,
        rotationSpeed: config.rotationSpeed ?? 0,
      };
      this.particles.push(p);
    }
  }

  update(deltaSeconds: number): void {
    const dt = Math.min(Math.max(deltaSeconds, 0), this.maxDelta);
    if (dt === 0) return;
    const bounds = this.bounds;
    const kept: Particle[] = [];
    for (const p of this.particles) {
      if (p.trailLength > 0) {
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > p.trailLength) p.trail.shift();
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rotation += p.rotationSpeed * dt;
      p.age += dt;
      if (p.age >= p.lifetime) continue;
      if (
        bounds &&
        (p.x < bounds.minX ||
          p.x > bounds.maxX ||
          p.y < bounds.minY ||
          p.y > bounds.maxY)
      ) {
        continue;
      }
      kept.push(p);
    }
    this.particles = kept;
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const t = p.lifetime > 0 ? Math.min(p.age / p.lifetime, 1) : 1;
      const scale = lerp(p.sizeCurve[0], p.sizeCurve[1], t);
      const alpha = lerp(p.fade[0], p.fade[1], t);
      const size = p.size * scale;
      if (alpha <= 0 || size <= 0) continue;

      if (p.trailLength > 0 && p.trail.length > 0) {
        for (let i = 0; i < p.trail.length; i++) {
          const entry = p.trail[i];
          if (!entry) continue;
          const ta = ((i + 1) / (p.trail.length + 1)) * alpha * 0.5;
          ctx.globalAlpha = ta;
          ctx.fillStyle = p.color;
          ctx.strokeStyle = p.color;
          drawShape(ctx, p.shape, entry.x, entry.y, size, p.rotation);
        }
      }

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      drawShape(ctx, p.shape, p.x, p.y, size, p.rotation);
    }
    ctx.globalAlpha = 1;
  }

  getParticles(): readonly Particle[] {
    return this.particles;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function drawShape(
  ctx: CanvasRenderingContext2D,
  shape: ParticleShape,
  x: number,
  y: number,
  size: number,
  rotation: number,
): void {
  switch (shape) {
    case "circle": {
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    case "square": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.fillRect(-size, -size, size * 2, size * 2);
      ctx.restore();
      return;
    }
    case "diamond": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    case "line": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.lineWidth = Math.max(1, size * 0.4);
      ctx.beginPath();
      ctx.moveTo(-size, 0);
      ctx.lineTo(size, 0);
      ctx.stroke();
      ctx.restore();
      return;
    }
    case "triangle": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size, size);
      ctx.lineTo(-size, size);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
    case "star": {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation);
      ctx.beginPath();
      const spikes = 5;
      const outer = size;
      const inner = size * 0.5;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (i * Math.PI) / spikes - Math.PI / 2;
        const px = Math.cos(a) * r;
        const py = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      return;
    }
  }
}
