export const streets = [-240, -160, -80, 0, 80, 160, 240];
export const worldLimit = 255;

export function districtAt(x, z) {
  if (x >= 120) return 'Marina Keys';
  if (x <= -120) return 'Palm Heights';
  if (z <= -100) return 'Civic Center';
  if (z >= 100) return 'South Docks';
  return 'Lido District';
}

// Facades face the sidewalks. Narrow passages between properties can be explored on foot.
export const buildings = [];
for (let row = 0; row < streets.length - 1; row++) {
  for (let col = 0; col < streets.length - 1; col++) {
    const x = streets[col] + 40;
    const z = streets[row] + 40;
    const block = row * 6 + col;
    const downtown = Math.abs(x) < 95 && z < -35;
    const parcels = block % 5 === 1
      ? [[-13, 0, 20, 45], [12, -13, 20, 19], [12, 12, 20, 22]]
      : block % 4 === 2
        ? [[0, -11, 45, 21], [-12, 13, 19, 18], [12, 13, 19, 18]]
        : [[-13, -13, 20, 21], [13, -13, 19, 21], [-13, 13, 21, 20], [13, 13, 19, 19]];
    parcels.forEach(([dx, dz, w, d], unit) => {
      const seed = (block * 13 + unit * 7) % 19;
      const h = downtown ? 17 + seed * 2.1 : 6 + (seed % 11) * 1.3;
      buildings.push({x: x + dx, z: z + dz, w, d, h, style: (block * 3 + unit) % 8});
    });
  }
}

// A block index keeps movement queries local even while several patrols are navigating.
const blocks = new Map();
function blockKey(x, z) {
  return Math.floor((x + 240) / 80) + ',' + Math.floor((z + 240) / 80);
}
for (const building of buildings) {
  const key = blockKey(building.x, building.z);
  if (!blocks.has(key)) blocks.set(key, []);
  blocks.get(key).push(building);
}
const emptyBlock = [];
export function isOpen(x, z, radius = 0) {
  if (Math.abs(x) > worldLimit - radius || Math.abs(z) > worldLimit - radius) return false;
  const nearby = blocks.get(blockKey(x, z)) || emptyBlock;
  for (const b of nearby) {
    if (Math.abs(x - b.x) < b.w / 2 + radius && Math.abs(z - b.z) < b.d / 2 + radius) {
      return false;
    }
  }
  return true;
}

export function streetAt(value) {
  return Math.min(240, Math.max(-240, Math.round(value / 80) * 80));
}
