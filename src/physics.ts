interface CollisionBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function resolveBallCollision(a: CollisionBody, b: CollisionBody, radius: number): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const diameter = radius * 2;
  const distanceSquared = dx * dx + dy * dy;
  if (distanceSquared > diameter * diameter) return false;

  const distance = Math.sqrt(distanceSquared);
  const relativeX = b.vx - a.vx;
  const relativeY = b.vy - a.vy;
  const relativeSpeed = Math.hypot(relativeX, relativeY);
  const nx = distance > 0 ? dx / distance : relativeSpeed > 0 ? -relativeX / relativeSpeed : 1;
  const ny = distance > 0 ? dy / distance : relativeSpeed > 0 ? -relativeY / relativeSpeed : 0;
  const separation = (diameter - distance) / 2 + 0.000001;
  a.x -= nx * separation;
  a.y -= ny * separation;
  b.x += nx * separation;
  b.y += ny * separation;

  const approachingSpeed = relativeX * nx + relativeY * ny;
  if (approachingSpeed >= 0) return false;

  // 同じ質量の弾性衝突では、接触方向の速度成分を交換し、接線方向の成分は保つ。
  a.vx += approachingSpeed * nx;
  a.vy += approachingSpeed * ny;
  b.vx -= approachingSpeed * nx;
  b.vy -= approachingSpeed * ny;
  return true;
}
