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
].map(direction => ({...direction, rightX: -direction.forwardZ, rightZ: direction.forwardX}));
const outerStreet = streets[streets.length - 1];
// Stop with the front bumper behind the painted stop bar, 14.25 m before the junction center.
const stoppingPosition = outerStreet - 14.25 - 2.7;
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const forward = (car, lane) => car.x * lane.forwardX + car.z * lane.forwardZ;
const lateral = (car, lane) => car.x * lane.rightX + car.z * lane.rightZ;

function directionAt(heading) {
  const index = Math.round(heading / (Math.PI / 2));
  return directions[((index % 4) + 4) % 4];
}

export function acquireLane(car) {
  if (car.speed < 0) return null;
  const direction = directionAt(car.heading);
  if (Math.abs(angleDiff(direction.heading, car.heading)) > Math.PI / 8) return null;
  const across = lateral(car, direction);
  const street = streetAt(across);
  const offset = across - street;
  if (offset < laneMarkings.yellow || offset > laneMarkings.shoulder) return null;
  if (Math.abs(forward(car, direction)) > outerStreet + 10) return null;
  const center = street + laneOffsets[offset < laneMarkings.divider ? 0 : 1];
  return {...direction, center};
}

// Remember the crossing while the driver steers, even if a wide turn carries the car past it.
function trackTurn(car, maneuver, currentLane, steer) {
  const entry = maneuver.entry;
  const along = forward(car, entry);
  const crossing = streetAt(along);
  const street = streetAt(entry.center);
  if (Math.abs(crossing - along) <= 20 && Math.abs(lateral(car, entry) - street) <= laneMarkings.shoulder + 2) {
    maneuver.crossing = crossing;
  } else if (maneuver.crossing !== null) {
    // The driver can keep steering through more than one junction without releasing.
    const occupied = acquireLane(car);
    if (occupied && Math.abs(forward(car, occupied) - streetAt(forward(car, occupied))) > 20) {
      maneuver.entry = occupied;
      maneuver.crossing = null;
      return occupied;
    }
  }
  if (maneuver.crossing === null) return entry;

  const yaw = angleDiff(car.heading, entry.heading);
  // At the final stop line there may be too little speed to turn the nose first.
  const leavingStop = maneuver.crossing === outerStreet && laneEndDistance(car, entry) < 2 && steer !== 0;
  let side = Math.sign(yaw);
  if (leavingStop && Math.abs(yaw) < Math.PI / 6) {
    side = Math.sign(steer);
  } else {
    if (Math.abs(yaw) < (currentLane === entry ? Math.PI / 6 : Math.PI / 10)) return entry;
    // Keep the chosen street even if an oversteer takes the heading past 180 degrees.
    if (currentLane !== entry) return currentLane;
  }
  if (side * street >= outerStreet) return entry;
  const direction = directionAt(entry.heading + side * Math.PI / 2);
  const center = -side * maneuver.crossing + (entry.center - street);
  if (currentLane.heading === direction.heading && currentLane.center === center) return currentLane;
  return {...direction, center};
}

export function cruiseSteering(car, cruise, steer, steeringHeld, dt) {
  if (steeringHeld && !cruise.maneuver) {
    cruise.maneuver = {entry: cruise.lane, crossing: null, releasedFor: 0};
  }
  const maneuver = cruise.maneuver;
  if (maneuver) {
    const wasSteering = cruise.driverSteering;
    maneuver.releasedFor = steeringHeld ? 0 : maneuver.releasedFor + dt;
    if (cruise.driverSteering) {
      cruise.lane = trackTurn(car, maneuver, cruise.lane, steer);
      return steer;
    }
    if (wasSteering) {
      // Honor the lane the driver actually reached, including a manual lane change.
      const occupied = acquireLane(car);
      const reversed = occupied && Math.cos(occupied.heading - maneuver.entry.heading) < -0.9;
      if (occupied && (occupied.heading === cruise.lane.heading || reversed)) {
        if (occupied.heading === maneuver.entry.heading || reversed) maneuver.entry = occupied;
        cruise.lane = occupied;
      }
    }
  }

  const lane = cruise.lane;
  const lateralError = lane.center - lateral(car, lane);
  const headingError = angleDiff(lane.heading, car.heading);
  if (maneuver && Math.abs(lateralError) < 0.2 && Math.abs(headingError) < 0.035) cruise.maneuver = null;
  const correction = Math.atan2(lateralError, Math.max(4, car.speed * 0.7));
  const targetHeading = lane.heading + correction;
  return Math.max(-1, Math.min(1, angleDiff(targetHeading, car.heading) * 2.5));
}

export function laneEndDistance(car, lane) {
  return stoppingPosition - forward(car, lane);
}
