// The rendered cars are about five metres long. The selected gap is clear space
// between bumpers, while simulation positions are measured at vehicle centers.
const carLength = 5;
const maxAcceleration = 3.2;
const comfortBraking = 4.5;
const pedalBraking = 31;

export function cruiseSpeed(car, cars, lane, setSpeedKph, gapCars, dt) {
  let lead = null;
  let distance = Infinity;
  for (const other of cars) {
    if (other === car) continue;
    const across = other.x * lane.rightX + other.z * lane.rightZ - lane.center;
    if (Math.abs(across) > 2.25 || Math.cos(other.heading - lane.heading) < Math.SQRT1_2) continue;
    const ahead = (other.x - car.x) * lane.forwardX + (other.z - car.z) * lane.forwardZ;
    if (ahead > 0 && ahead < distance) {
      lead = other;
      distance = ahead;
    }
  }

  const speed = Math.max(0, car.speed);
  const setSpeed = Math.max(0, setSpeedKph / 3.6);
  const freeChange = setSpeed - speed;
  let change = Math.max(-comfortBraking * dt, Math.min(maxAcceleration * dt, freeChange));
  let following = null;
  if (lead) {
    const leadSpeed = Math.max(0, lead.speed * Math.cos(lead.heading - lane.heading));
    const clearance = distance - carLength;
    const gapError = clearance - gapCars * carLength;
    // Leave room to match the lead's speed, then close the last metres gently.
    const approach = Math.min(gapError / 1.5, Math.sqrt(2 * 3 * Math.max(0, gapError)));
    const followSpeed = Math.max(0, leadSpeed + approach);
    if (followSpeed < setSpeed || (gapError < 0.15 && leadSpeed <= setSpeed)) {
      following = lead.id;
      change = Math.min(change, Math.max(-comfortBraking * dt, followSpeed - speed));
      if (leadSpeed === 0 && gapError < 0.05 && speed < 0.1) change = -speed;
    }

    // A cut-in or a suddenly stopped lead can require firmer braking to keep the selected gap.
    const closingSpeed = Math.max(0, speed - leadSpeed);
    const requiredBraking = closingSpeed ** 2 / (2 * Math.max(gapError, 0.25));
    if (requiredBraking > comfortBraking) {
      following = lead.id;
      change = Math.min(change, -Math.min(requiredBraking, pedalBraking) * dt);
    }
  }
  return {speed: Math.max(0, speed + change), following};
}
