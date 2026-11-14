interface SuperPartyBurstScene {
  width: number;
  height: number;
  age: number;
  colors: readonly [HexColor, HexColor, HexColor];
}

function drawSuperPartyBurst(ctx: CanvasRenderingContext2D, scene: SuperPartyBurstScene): void {
  const duration = 1.4;
  if (!Number.isFinite(scene.age) || scene.age < 0 || scene.age >= duration) return;

  const progress = scene.age / duration;
  const expansion = 1 - (1 - progress) ** 3;
  const fade = (1 - progress) ** 2;
  const centerX = scene.width * 0.5;
  const centerY = scene.height * 0.5;
  const maxRadius = Math.max(1, Math.min(scene.width * 0.32, scene.height * 0.8));

  ctx.save();
  scene.colors.forEach((color, index) => {
    const radius = maxRadius * (0.12 + index * 0.09 + expansion * 0.64);
    ctx.globalAlpha = fade * (0.65 - index * 0.12);
    ctx.strokeStyle = color;
    ctx.lineWidth = (2.2 - index * 0.35) * (1 - progress * 0.6);
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();
  });

  const innerRadius = maxRadius * (0.1 + expansion * 0.52);
  const rayLength = Math.min(scene.height * 0.12, 24) * (1 - progress * 0.75);
  ctx.globalAlpha = fade * 0.5;
  ctx.lineWidth = 1.4 - progress * 0.9;
  for (let index = 0; index < 18; index++) {
    const angle = (index * Math.PI * 2) / 18 - Math.PI / 2 + expansion * 0.08;
    const directionX = Math.cos(angle);
    const directionY = Math.sin(angle);
    ctx.strokeStyle = scene.colors[index % 3] ?? scene.colors[0];
    ctx.beginPath();
    ctx.moveTo(centerX + directionX * innerRadius, centerY + directionY * innerRadius);
    ctx.lineTo(centerX + directionX * (innerRadius + rayLength), centerY + directionY * (innerRadius + rayLength));
    ctx.stroke();
  }
  ctx.restore();
}
