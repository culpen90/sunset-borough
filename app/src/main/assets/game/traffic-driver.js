import {streetAt} from './city.js';
import {cruiseSpeed} from './cruise-speed.js';
import {signalAt, signalJunctions, stopLineOffset} from './traffic-lights.js';

const frontBumper = 2.7;
const braking = 4.5;
const amberDecisions = new WeakMap();

// Leave enough distance to stop after travelling at the returned speed for this tick.
function stoppingSpeed(distance, dt) {
  if (distance <= 0.005) return 0;
  const step = braking * dt;
  return Math.sqrt(step * step + 2 * braking * distance) - step;
}

export function signalSpeedLimit(car, axis, direction, time, dt) {
  const across = axis === 'x' ? 'z' : 'x';
  const street = streetAt(car[across]);
  let next = null, distance = Infinity;
  for (const junction of signalJunctions) {
    if (junction[across] !== street) continue;
    const remaining = direction * (junction[axis] - car[axis]) - stopLineOffset - frontBumper;
    if (remaining >= -1e-6 && remaining < distance) {
      next = junction;
      distance = remaining;
    }
  }
  if (!next) return Infinity;
  const phase = signalAt(next.x, next.z, axis, time);
  if (phase === 'yield') {
    let choice = amberDecisions.get(car);
    if (choice?.junction !== next || choice.axis !== axis || choice.direction !== direction ||
        time - choice.time > 3 || time < choice.time) {
      const speed = Math.max(0, car.speed);
      // A save resumed on the braking curve should continue its stop despite rounding.
      const commit = distance + 0.05 < speed * speed / (2 * braking) &&
        signalAt(next.x, next.z, axis, time + distance / Math.max(speed, 0.01)) === 'yield';
      choice = {junction: next, axis, direction, time, commit};
      amberDecisions.set(car, choice);
    }
    if (choice.commit) return Infinity;
  } else {
    amberDecisions.delete(car);
    if (phase === 'go') return Infinity;
  }
  return stoppingSpeed(distance, dt);
}

// A driver turning across another vehicle's path yields to the one arriving first.
// This also lets traffic filter through junctions that have no signal.
function crossingSpeed(car, other, ahead, across, dt) {
  const angle = other.heading - car.heading;
  const align = Math.cos(angle);
  if (align >= Math.SQRT1_2) return Infinity; // Handled by same-lane following.
  if (other.speed < 0.3 || align < -0.9) {
    return ahead > 0 && Math.abs(across) < 2.1 ? stoppingSpeed(ahead - 5.7, dt) : Infinity;
  }
  const toCrossing = -across / Math.sin(angle);
  const distance = ahead + toCrossing * align;
  if (toCrossing < -frontBumper || toCrossing > other.speed * 1.8 || distance <= 0) return Infinity;
  const arrival = distance / Math.max(car.speed, 1);
  const otherArrival = toCrossing / other.speed;
  if (otherArrival > arrival || (otherArrival === arrival && car.id < other.id)) return Infinity;
  return stoppingSpeed(distance - 5.2, dt);
}

export function ambientSpeed(car, cars, player, time, dt) {
  const forwardX = Math.sin(car.heading), forwardZ = -Math.cos(car.heading);
  const rightX = -forwardZ, rightZ = forwardX;
  const lane = {forwardX, forwardZ, rightX, rightZ, heading: car.heading, center: car.x * rightX + car.z * rightZ};
  let speed = cruiseSpeed(car, cars, lane, car.cruise * 3.6, 0.6, dt).speed;
  // The route turns after the stop bar. A vehicle already turning can clear the junction.
  if (Math.abs(forwardZ) < 1e-6) speed = Math.min(speed, signalSpeedLimit(car, 'x', Math.sign(forwardX), time, dt));
  if (Math.abs(forwardX) < 1e-6) speed = Math.min(speed, signalSpeedLimit(car, 'z', Math.sign(forwardZ), time, dt));

  for (const other of cars) {
    if (car === other) continue;
    const dx = other.x - car.x, dz = other.z - car.z;
    if (Math.abs(dx) > 32 || Math.abs(dz) > 32) continue;
    speed = Math.min(speed, crossingSpeed(car, other, dx * forwardX + dz * forwardZ, dx * rightX + dz * rightZ, dt));
  }
  if (!player.carId) {
    const dx = player.x - car.x, dz = player.z - car.z;
    const ahead = dx * forwardX + dz * forwardZ;
    if (ahead > -1 && Math.abs(dx * rightX + dz * rightZ) < 2.1) {
      speed = Math.min(speed, stoppingSpeed(ahead - frontBumper - 1.2, dt));
    }
  }
  return speed;
}
