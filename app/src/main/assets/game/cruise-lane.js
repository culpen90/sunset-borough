import {laneMarkings, streetAt, streets} from './city.js';

// Centers between the double yellow, dashed divider and shoulder in streetscape.js.
export const laneOffsets = [
  (laneMarkings.yellow + laneMarkings.divider) / 2,
  (laneMarkings.divider + laneMarkings.shoulder) / 2,
];
const directions = [
  {heading: 0, forwardX: 0, forwardZ: -1},
  {heading: Math.PI / 2, forwardX: 1, forwardZ: 0},
  {heading: Math.PI, forwardX: 0, forwardZ: 1},
  {heading: -Math.PI / 2, forwardX: -1, forwardZ: 0},
];
const outerStreet = streets[streets.length - 1];
// Stop with the front bumper behind the painted stop bar, 14.25 m before the junction center.
const stoppingPosition = outerStreet - 14.25 - 2.7;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export function acquireLane(car) {
  if (car.speed < 0) return null;
  const index = Math.round(car.heading / (Math.PI / 2));
  const direction = directions[((index % 4) + 4) % 4];
  if (Math.abs(angleDiff(direction.heading, car.heading)) > Math.PI / 8) return null;
  const {forwardX, forwardZ} = direction;
  const rightX = -forwardZ, rightZ = forwardX;
  const lateral = car.x * rightX + car.z * rightZ;
  const street = streetAt(lateral);
  const offset = lateral - street;
  if (offset < laneMarkings.yellow || offset > laneMarkings.shoulder) return null;
  if (Math.abs(car.x * forwardX + car.z * forwardZ) > outerStreet + 10) return null;
  const center = street + laneOffsets[offset < laneMarkings.divider ? 0 : 1];
  return {...direction, rightX, rightZ, center};
}

export function laneSteering(car, lane) {
  const lateralError = lane.center - (car.x * lane.rightX + car.z * lane.rightZ);
  const headingError = angleDiff(lane.heading, car.heading);
  // Keep the acquired lane through breaks in the paint. A turn or departure requires a new set.
  if (Math.abs(lateralError) > 3.2 || Math.abs(headingError) > Math.PI / 5) return null;
  const lookAhead = Math.max(4, car.speed * 0.7);
  const correction = Math.atan2(lateralError, lookAhead);
  return Math.max(-0.85, Math.min(0.85, (headingError + correction) * 2.5));
}

export function laneEndDistance(car, lane) {
  return stoppingPosition - (car.x * lane.forwardX + car.z * lane.forwardZ);
}
