import {streets} from './city.js';

export const stopLineOffset = 14.25;
const greenSeconds = 10, amberSeconds = 3, clearanceSeconds = 2;
const halfCycle = greenSeconds + amberSeconds + clearanceSeconds;
const blockSize = streets[1] - streets[0];
const interior = streets.slice(1, -1);
const offsets = new Map();
export const signalJunctions = [];

for (const x of interior) {
  const column = new Map();
  offsets.set(x, column);
  for (const z of interior) {
    if ((x + z) % (2 * blockSize) !== 0) continue;
    signalJunctions.push({x, z});
    column.set(z, (x * 4 + z * 7) / blockSize);
  }
}

// Both directions on one street share a phase. An all-red interval clears the junction.
export function signalAt(x, z, axis, time) {
  const offset = offsets.get(x)?.get(z);
  if (offset === undefined) return null;
  const cycle = 2 * halfCycle;
  const clock = time + offset + (axis === 'x' ? halfCycle : 0);
  const phase = ((clock % cycle) + cycle) % cycle;
  if (phase < greenSeconds) return 'go';
  if (phase < greenSeconds + amberSeconds) return 'yield';
  return 'stop';
}

// Place a head on the far side, over the two incoming lanes. Its local +Z faces the driver.
export const signalHeads = signalJunctions.flatMap(junction =>
  [[0,-1], [1,0], [0,1], [-1,0]].map(([dx, dz]) => ({
    junction, axis: dx ? 'x' : 'z', yaw: Math.atan2(-dx, -dz),
    x: junction.x + dx * 11.25 - dz * 4.95,
    z: junction.z + dz * 11.25 + dx * 4.95,
  }))
);
