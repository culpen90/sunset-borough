import { buildings, streets, streetAt as street } from './city.js';

const length = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function streetExits(point) {
  const x = street(point.x), z = street(point.z);
  const vertical = Math.abs(x - point.x) <= Math.abs(z - point.z);
  const foot = vertical ? { x, z: point.z } : { x: point.x, z };
  const along = vertical ? point.z : point.x;
  return [...new Set([Math.floor(along / 80), Math.ceil(along / 80)].map(n => street(n * 80)))]
    .map(nearest => [point, foot, vertical ? { x, z: nearest } : { x: nearest, z }]);
}

// Evaluate the street exits at either endpoint. Every through-road in the borough is connected.
function getRoute(player, destination) {
  if (!destination) return [];
  if (length(player, destination) < 18) return [player, destination];
  let bestLength = Infinity, best = [];
  for (const a of streetExits(player)) {
    for (const b of streetExits(destination)) {
      const middle = { x: b[2].x, z: a[2].z };
      const points = [a[0], a[1], a[2], middle, b[2], b[1], b[0]];
      if (a[1].x === b[1].x || a[1].z === b[1].z) points.splice(2, 3);
      const total = points.reduce((sum, item, i) => i ? sum + length(item, points[i - 1]) : 0, 0);
      if (total < bestLength) { best = points; bestLength = total; }
    }
  }
  return best;
}

const base = document.createElement('canvas');
base.width = base.height = 640;
const paint = base.getContext('2d');
paint.translate(320, 320);
paint.fillStyle = '#273e48';
paint.fillRect(-320, -320, 640, 640);
paint.fillStyle = '#314947';
paint.fillRect(-256, -256, 512, 512);
paint.fillStyle = '#485054';
for (const b of buildings) paint.fillRect(b.x - b.w / 2, b.z - b.d / 2, b.w, b.d);
for (const line of streets) {
  paint.fillStyle = '#bbb8a5';
  paint.fillRect(line - 7, -254, 14, 508);
  paint.fillRect(-254, line - 7, 508, 14);
  paint.fillStyle = '#d4c3aa';
  paint.fillRect(line - .8, -254, 1.6, 508);
  paint.fillRect(-254, line - .8, 508, 1.6);
}

export function drawMap(canvas, game, overview = false) {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const bufferWidth = Math.round(w * pixelRatio), bufferHeight = Math.round(h * pixelRatio);
  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth; canvas.height = bufferHeight;
  }
  const ctx = canvas.getContext('2d');
  const scale = overview ? Math.min(w / 560, h / 550) : w / (game.player.carId ? 180 : 115);
  const cx = overview ? 0 : game.player.x, cz = overview ? 0 : game.player.z;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.fillStyle = '#273e48'; ctx.fillRect(0, 0, w, h);
  ctx.translate(w / 2, h / 2);
  ctx.scale(scale, scale); ctx.translate(-cx, -cz);
  ctx.drawImage(base, -320, -320);
  const route = getRoute(game.player, game.target);
  if (route.length) {
    ctx.beginPath(); route.forEach((p, i) => i ? ctx.lineTo(p.x, p.z) : ctx.moveTo(p.x, p.z));
    ctx.lineWidth = (overview ? 3 : 2.5) / scale;
    ctx.lineJoin = 'round'; ctx.strokeStyle = '#f6a73c'; ctx.stroke();
    const t = game.target;
    ctx.save();ctx.translate(t.x,t.z);ctx.rotate(Math.PI/4);
    const r = (overview ? 5 : 3.5)/scale;
    ctx.fillStyle = '#ffc562';ctx.strokeStyle='#372939';ctx.lineWidth=1.5/scale;
    ctx.fillRect(-r,-r,r*2,r*2);ctx.strokeRect(-r,-r,r*2,r*2);ctx.restore();
  }
  if (game.wanted) {
    ctx.fillStyle = '#fc7268';
    for (const car of game.cars) if (car.type === 'police') {
      ctx.beginPath();ctx.arc(car.x,car.z,2.5/scale,0,Math.PI*2);ctx.fill();
    }
  }
  ctx.save(); ctx.translate(game.player.x, game.player.z); ctx.rotate(game.player.heading); ctx.scale(1/scale,1/scale);
  ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5.5,5.5);ctx.lineTo(0,3);ctx.lineTo(-5.5,5.5);ctx.closePath();
  ctx.lineWidth=2;ctx.strokeStyle='#20332c';ctx.fillStyle='#a2ffd4';ctx.stroke();ctx.fill();ctx.restore();
  if (overview && w > h * 1.65) {
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    ctx.fillStyle='#96aea9';ctx.font='700 12px Condensed, sans-serif';ctx.textAlign='center';
    ctx.fillText('N',w/2+h*.56,22);
    ctx.beginPath();ctx.moveTo(w/2+h*.56,26);ctx.lineTo(w/2+h*.56-4,37);ctx.lineTo(w/2+h*.56+4,37);ctx.fill();
  }
}
