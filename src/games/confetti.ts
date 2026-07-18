// Tiny canvas confetti burst for new personal bests. No dependencies, well under 3KB.

const COLORS = ['#22d3ee', '#8b5cf6', '#34d399', '#f8fafc', '#fbbf24'];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vrot: number;
}

export function confettiBurst(): void {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:9999';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(dpr, dpr);
  document.body.appendChild(canvas);

  const cx = innerWidth / 2;
  const cy = innerHeight * 0.4;
  const particles: Particle[] = [];
  for (let i = 0; i < 70; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 4 + Math.random() * 9;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      size: 4 + Math.random() * 5,
      color: COLORS[i % COLORS.length]!,
      rot: Math.random() * Math.PI,
      vrot: (Math.random() - 0.5) * 0.3,
    });
  }

  const start = performance.now();
  const DURATION = 1300;

  function frame(now: number): void {
    const t = now - start;
    ctx!.clearRect(0, 0, innerWidth, innerHeight);
    const fade = 1 - t / DURATION;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.25;
      p.vx *= 0.99;
      p.rot += p.vrot;
      ctx!.save();
      ctx!.translate(p.x, p.y);
      ctx!.rotate(p.rot);
      ctx!.globalAlpha = Math.max(fade, 0);
      ctx!.fillStyle = p.color;
      ctx!.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx!.restore();
    }
    if (t < DURATION) {
      requestAnimationFrame(frame);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(frame);
}
