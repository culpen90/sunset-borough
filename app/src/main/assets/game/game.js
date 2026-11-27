import {carRadius, districtAt, isOpen, streetAt} from './city.js';
import {occupiedLane, recoveryLane, cruiseSteering, recoverySpeedLimit, laneEndDistance, laneOffsets} from './cruise-lane.js';
import {cruiseSpeed, pedalBraking} from './cruise-speed.js';

const TAU = 2 * Math.PI;
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));
const gap = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const finite = (n, fallback) => Number.isFinite(n) ? n : fallback;
const integer = (n, fallback, low, high) => clamp(Math.trunc(finite(n, fallback)), low, high);
const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const point = (x, z, label) => ({x, z, label});

const RECORD_SHOP = point(5, -71, 'Lido Records');
const LISTENING_ROOM = point(161, -81, 'Marina club');
const START_GATE = point(165, -144, 'Starting gate');
const GATES = [
  point(4, -160, 'Civic Center gate'),
  point(-159, -80, 'Palm Heights gate'),
  point(-155, 80, 'Finish line'),
];
const BOATHOUSE = point(165, 160, 'Marina boathouse');
const TITLES = ['Night Dispatch', 'Boulevard Run', 'Hot Property', 'Free roam'];
const CAR_PAINTS = [0xad464d, 0xf6cf91, 0x5394a7, 0x866682, 0xe79964, 0x537c75, 0xe4dbb8];
const COUPE = 'comet';
const HOT_CAR = 'gullwing';
const RACE_TIME = 75;
const SEARCH_TIME = 5.5;
const MAX_GAP_CARS = 3;
const MIN_CRUISE_KPH = 20;
const STEERING_RELEASE_DELAY = 0.25;
const END_BRAKING = 3.5;
const topSpeed = car => car.type === 'coupe' ? 34 : (car.type === 'taxi' ? 27 : 29);

function createCar(id, type, color, x, z, heading) {
  return {id, type, color, x, z, heading, speed: 0, owner: 'parked', route: null, mileage: 0, cooldown: 0};
}

// Sample a loop with rounded corners. Its accumulated length also defines a reproducible save position.
function makeLoop(corners, radius) {
  const points = [];
  corners.forEach((c, i) => {
    const before = corners[(i + corners.length - 1) % corners.length];
    const after = corners[(i + 1) % corners.length];
    const toEdge = neighbor => {
      const scale = radius / gap(c, neighbor);
      return {x: c.x + (neighbor.x - c.x) * scale, z: c.z + (neighbor.z - c.z) * scale};
    };
    const enter = toEdge(before);
    const leave = toEdge(after);
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      const a = (1 - t) ** 2, b = 2 * t * (1 - t), d = t * t;
      points.push({x: a * enter.x + b * c.x + d * leave.x, z: a * enter.z + b * c.z + d * leave.z});
    }
  });
  let length = 0;
  const segments = points.map((start, i) => {
    const end = points[(i + 1) % points.length];
    const size = gap(start, end);
    const from = length;
    length += size;
    return {start, end, from, size, heading: Math.atan2(end.x - start.x, start.z - end.z)};
  });
  return {segments, length};
}

function followLoop(actor) {
  const route = actor.route;
  actor.mileage %= route.length;
  const s = route.segments.find(seg => actor.mileage < seg.from + seg.size) || route.segments[0];
  const t = (actor.mileage - s.from) / s.size;
  actor.x = s.start.x + t * (s.end.x - s.start.x);
  actor.z = s.start.z + t * (s.end.z - s.start.z);
  actor.heading = s.heading;
}

// Older traffic saves used routes that ran along the lane dividers. Resume on the
// closest point of the newly centered route, even when its length has changed.
function nearestMileage(route, pose) {
  let mileage = 0, nearest = Infinity;
  for (const {start, end, from, size} of route.segments) {
    const dx = end.x - start.x, dz = end.z - start.z;
    const t = clamp(((pose.x - start.x) * dx + (pose.z - start.z) * dz) / (size * size), 0, 1);
    const distance = Math.hypot(start.x + t * dx - pose.x, start.z + t * dz - pose.z);
    if (distance < nearest) {
      nearest = distance;
      mileage = from + t * size;
    }
  }
  return mileage;
}

// Clockwise traffic keeps right on the inner track, counterclockwise traffic on the outer track.
function rectangle(x0, z0, x1, z1, clockwise, inset, radius) {
  const d = clockwise ? inset : -inset;
  const corners = [point(x0 + d, z0 + d), point(x1 - d, z0 + d), point(x1 - d, z1 - d), point(x0 + d, z1 - d)];
  if (!clockwise) corners.reverse();
  return makeLoop(corners, radius);
}

function ambientCars() {
  const cars = [];
  for (let i = 0; i < 25; i++) {
    const x0 = -240 + (i % 5) * 80;
    const z0 = -240 + (Math.floor(i / 5)) * 80;
    const x1 = Math.min(240, x0 + 80 * (2 + (i % 3 === 0)));
    const z1 = Math.min(240, z0 + 80 * (2 + (i % 4 === 0)));
    const taxi = i % 6 === 0;
    const car = createCar('traffic-' + i, taxi ? 'taxi' : (i % 3 ? 'sedan' : 'coupe'),
      taxi ? 0xf1ab39 : CAR_PAINTS[i % CAR_PAINTS.length], 0, 0, 0);
    car.route = rectangle(x0, z0, x1, z1, i % 2 === 0, laneOffsets[Math.floor(i / 2) % 2], 6);
    car.owner = 'traffic';
    car.cruise = 6 + (i * 3 % 7);
    car.mileage = (i * 109.3 + 10) % car.route.length;
    followLoop(car);
    if (Math.hypot(car.x - 5, car.z) < 18) {
      car.mileage += 38;
      followLoop(car);
    }
    cars.push(car);
  }
  return cars;
}

function pedestrians() {
  const peds = [];
  for (let i = 0; i < 40; i++) {
    const block = (i * 13 + 21) % 36;
    const x = -240 + (block % 6) * 80, z = -240 + Math.floor(block / 6) * 80;
    const clockwise = i % 3 !== 0;
    const ped = {id: 'resident-' + i, speed: 0.85 + (i % 5) * 0.18, cooldown: 0, stunTime: 0,
      route: rectangle(x, z, x + 80, z + 80, clockwise, clockwise ? 12.5 : -12.5, 2.5),
      mileage: (i * 17 + 31) % 200};
    followLoop(ped);
    peds.push(ped);
  }
  return peds;
}

function restorePose(subject, data, radius) {
  if (!data || !Number.isFinite(data.x) || !Number.isFinite(data.z) || !isOpen(data.x, data.z, radius)) return;
  subject.x = data.x;
  subject.z = data.z;
  subject.heading = finite(data.heading, subject.heading) % TAU;
}

function clearLine(a, b, radius = 1.6) {
  const steps = Math.ceil(gap(a, b) / 4);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!isOpen(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t, radius)) return false;
  }
  return true;
}

function closestStreet(p) {
  const x = streetAt(p.x), z = streetAt(p.z);
  if (Math.abs(x - p.x) < Math.abs(z - p.z)) {
    const next = clamp(Math.floor(p.z / 80) * 80, -240, 160);
    return [point(x, next), point(x, next + 80)];
  }
  const next = clamp(Math.floor(p.x / 80) * 80, -240, 160);
  return [point(next, z), point(next + 80, z)];
}

function patrolRoute(car, player) {
  if (gap(car, player) < 95 && clearLine(car, player)) return [point(player.x, player.z)];
  let best = null;
  let shortest = Infinity;
  for (const start of closestStreet(car)) {
    for (const end of closestStreet(player)) {
      const distance = gap(car, start) + Math.abs(end.x - start.x) + Math.abs(end.z - start.z) + gap(end, player);
      if (distance >= shortest) continue;
      shortest = distance;
      const middle = Math.abs(car.z - start.z) > Math.abs(car.x - start.x)
        ? point(start.x, end.z) : point(end.x, start.z);
      best = [start, middle, end, point(player.x, player.z)];
    }
  }
  return best.filter((p, i) => gap(p, i ? best[i - 1] : car) > 2.8);
}

export class Game {
  constructor(save = null) {
    this.player = {x: 5, z: 7, heading: 0, carId: null, moving: false, running: false, backpedaling: false, strikeTime: 0};
    const hero = createCar(COUPE, 'coupe', 0x0dafa6, 5, 0, 0);
    hero.owner = 'personal';
    this.cars = [hero, ...ambientCars()];
    this.cruise = {lane: null, maneuver: null, get active() { return this.lane !== null; },
      get driverSteering() { return this.maneuver !== null && this.maneuver.releasedFor < STEERING_RELEASE_DELAY; },
      setSpeedKph: 0, gapCars: 2, following: null, overriding: false, ending: false};
    this.peds = pedestrians();
    this.time = 0;
    this.cash = 0;
    this.wanted = 0;
    this.capture = 0;
    this.missionIndex = 0;
    this.stage = 0;
    this.completed = 0;
    this.remainingTime = null;
    this.notice = '';
    this.noticeUntil = 0;
    this.revision = 0;
    this.cooldown = 0;
    this.nextStrike = 0;
    this.escape = 0;
    this.sirenDelay = 0;
    this.patrolSerial = 0;
    this.lastOffense = -100;
    if (save?.version === 1 || save?.version === 2) this.restore(save);
  }

  get car() { return this.player.carId ? this.cars.find(c => c.id === this.player.carId) : null; }
  get missionTitle() { return TITLES[this.missionIndex]; }
  get district() { return districtAt(this.player.x, this.player.z); }
  get speedKph() { return Math.round(Math.abs(this.car?.speed || 0) * 3.6); }
  get maxCruiseKph() { return this.car ? Math.floor(topSpeed(this.car) * 3.6) : 0; }

  toggleCruise() {
    if (this.cruise.active) {
      this.cancelCruise();
      return;
    }
    const car = this.car;
    if (!car) return;
    const stoppingDistance = 1 + car.speed ** 2 / (2 * END_BRAKING);
    const occupied = occupiedLane(car);
    const lane = occupied ?? recoveryLane(car, stoppingDistance);
    if (!lane) {
      this.message(car.speed < 0 ? 'Cruise unavailable · Stop reversing' : 'Cruise unavailable · Move closer to a street', 2.5);
      return;
    }
    if (laneEndDistance(car, lane) <= stoppingDistance) {
      this.message('Road ends ahead · Take the turn manually', 2.5);
      return;
    }
    this.cruise.lane = lane;
    if (!occupied) this.cruise.maneuver = {entry: lane, crossing: null, releasedFor: STEERING_RELEASE_DELAY};
    this.cruise.setSpeedKph = clamp(this.speedKph, MIN_CRUISE_KPH, this.maxCruiseKph);
  }

  cancelCruise(reason) {
    if (!this.cruise.active) return;
    Object.assign(this.cruise, {lane: null, maneuver: null, following: null, overriding: false, ending: false});
    if (reason) this.message(reason, 2.5);
  }

  adjustCruiseSpeed(deltaKph) {
    if (!this.cruise.active || !Number.isFinite(deltaKph)) return;
    this.cruise.setSpeedKph = clamp(this.cruise.setSpeedKph + Math.round(deltaKph), MIN_CRUISE_KPH, this.maxCruiseKph);
  }

  cycleCruiseGap() {
    if (!this.car) return;
    this.cruise.gapCars = this.cruise.gapCars % MAX_GAP_CARS + 1;
  }

  get target() {
    const stage = this.stage;
    switch (this.missionIndex) {
      case 0:
        if (stage === 0) return this.carPoint(COUPE, 'Your coupe');
        return stage === 1 ? RECORD_SHOP : LISTENING_ROOM;
      case 1: return stage === 0 ? START_GATE : GATES[stage - 1];
      case 2:
        if (!stage || this.player.carId !== HOT_CAR) return this.carPoint(HOT_CAR, 'Amber coupe');
        return stage === 2 && !this.wanted ? BOATHOUSE : null;
      default: return null;
    }
  }

  carPoint(id, label) {
    const car = this.cars.find(c => c.id === id);
    return car ? point(car.x, car.z, label) : null;
  }

  get distance() { const t = this.target; return t ? Math.round(gap(this.player, t)) : null; }

  get objective() {
    switch (this.missionIndex) {
      case 0: return ['Enter the teal coupe', 'Pick up the case at Lido Records', 'Deliver the case to the marina club'][this.stage];
      case 1: return this.stage ? 'Pass gate ' + this.stage + ' of ' + GATES.length : 'Drive to the starting gate';
      case 2:
        if (this.stage === 0) return 'Take the amber coupe at South Docks';
        if (this.player.carId !== HOT_CAR) return 'Get back in the amber coupe';
        return this.wanted ? 'Lose the patrols' : 'Deliver the coupe to the boathouse';
      default: return this.wanted ? 'Lose the patrols' : 'Explore the city';
    }
  }

  nearestCar() {
    let closest = null;
    let nearest = 8.8;
    for (const car of this.cars) {
      if (car.owner === 'patrol') continue;
      const distance = gap(car, this.player);
      if (distance < 8.8 && this.missionIndex === 2 && car.id === HOT_CAR) return car;
      if (distance < nearest) {
        closest = car;
        nearest = distance;
      }
    }
    return closest;
  }

  get actionLabel() {
    if (this.player.carId) return 'Exit car';
    const car = this.nearestCar();
    if (!car) return '';
    return car.owner === 'traffic' || (this.missionIndex === 2 && !this.stage && car.id === HOT_CAR) ? 'Take car' : 'Enter car';
  }

  message(text, duration = 3.8) {
    this.notice = text;
    this.noticeUntil = this.time + duration;
  }

  interact() {
    const current = this.car;
    if (current) {
      if (Math.abs(current.speed) > 6) {
        this.message('Slow down to exit', 1.8);
        return;
      }
      for (const angle of [-Math.PI / 2, Math.PI / 2, Math.PI, 0]) {
        const x = current.x + Math.sin(current.heading + angle) * 3;
        const z = current.z - Math.cos(current.heading + angle) * 3;
        if (!isOpen(x, z, 0.48) || this.cars.some(c => c !== current && Math.hypot(x - c.x, z - c.z) < 2)) continue;
        Object.assign(this.player, {x, z, carId: null, heading: current.heading, moving: false, running: false, backpedaling: false});
        this.cancelCruise();
        current.speed = 0;
        this.revision++;
        return;
      }
      this.message('Move the car into an open space', 2);
      return;
    }
    const car = this.nearestCar();
    if (!car) return;
    const taken = car.owner === 'traffic';
    car.route = null;
    car.owner = 'personal';
    car.speed = 0;
    Object.assign(this.player, {x: car.x, z: car.z, heading: car.heading, carId: car.id, moving: false, running: false, backpedaling: false});
    this.revision++;
    if (this.missionIndex === 0 && this.stage === 0) {
      this.stage = 1;
      this.message('Dispatch • A record case is ready for pickup.');
    }
    if (this.missionIndex === 2 && this.stage === 0 && car.id === HOT_CAR) {
      this.stage = 1;
      this.addHeat(2);
      this.message('The coupe is flagged. Lose the patrols.');
    } else if (taken) {
      this.addHeat(1);
      this.message('Vehicle reported missing');
    }
  }

  addHeat(level = 1) {
    if (this.time - this.lastOffense > 4 || this.wanted < level) {
      this.wanted = Math.min(3, Math.max(level, this.wanted + 1));
      this.revision++;
    }
    this.lastOffense = this.time;
    this.escape = 0;
  }

  update(dt, input = {}) {
    let remaining = clamp(finite(dt, 0), 0, 0.2);
    while (remaining > 0.000001) {
      const step = Math.min(remaining, 1 / 40);
      this.step(step, input);
      remaining -= step;
    }
  }

  step(dt, input) {
    this.time += dt;
    this.player.strikeTime = Math.max(0, this.player.strikeTime - dt);
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.notice && this.time > this.noticeUntil) this.notice = '';
    const car = this.car;
    if (car) this.drive(car, dt, input);
    else this.walk(dt, input);
    this.moveTraffic(dt, car);
    this.moveResidents(dt, car);
    if (this.wanted) this.pursuit(dt);
    this.advanceMission(dt);
  }

  walk(dt, input) {
    const x = clamp(finite(input.x, 0), -1, 1), y = clamp(finite(input.y, 0), -1, 1);
    const magnitude = Math.hypot(x, y);
    const p = this.player;
    const moving = magnitude > 0.08;
    if (!p.moving) this.walkBasis = p.heading;
    const viewHeading = finite(input.cameraHeading, this.walkBasis);
    p.moving = moving;
    p.running = moving && !!input.run;
    if (!moving) {
      p.backpedaling = false;
      return;
    }
    const stickAngle = Math.atan2(x, y);
    const heading = viewHeading + stickAngle;
    const distance = (p.running ? 9.3 : 5.5) * dt * Math.min(1, magnitude);
    const dx = Math.sin(heading) * distance, dz = -Math.cos(heading) * distance;
    // From sideways to diagonally back, ease from facing travel to facing the view.
    const rear = clamp((Math.abs(stickAngle) - Math.PI / 2) / (Math.PI / 4), 0, 1);
    const blend = rear * rear * (3 - 2 * rear);
    const facing = viewHeading + stickAngle * (1 - blend);
    p.heading += angleDiff(facing, p.heading) * (1 - Math.exp(-18 * dt));
    p.backpedaling = Math.cos(heading - p.heading) < 0;
    const open = (x, z) => isOpen(x, z, 0.46) && !this.cars.some(c => Math.hypot(c.x - x, c.z - z) < 1.55);
    if (open(p.x + dx, p.z)) p.x += dx;
    if (open(p.x, p.z + dz)) p.z += dz;
  }

  cruiseControls(car, dt, input, steer, throttle) {
    const cruise = this.cruise;
    if (input.brake || input.reverse || throttle < -0.04 || car.speed < 0) {
      this.cancelCruise();
      return null;
    }
    const correction = cruiseSteering(car, cruise, steer, input.steeringHeld || steer !== 0, dt);
    const remaining = laneEndDistance(car, cruise.lane);
    const endSpeed = Math.sqrt(2 * END_BRAKING * Math.max(0, remaining));
    cruise.overriding = throttle >= 0.04;
    if (cruise.overriding) {
      if (remaining <= 1 || car.speed >= endSpeed) {
        this.cancelCruise('Road ends ahead · Take the wheel');
        return null;
      }
      cruise.following = null;
      cruise.ending = false;
      return {steer: correction};
    }
    if (remaining <= 0.15 && car.speed < 1.5) {
      this.cancelCruise('Road ends here · Steer to turn');
      return {steer: correction, speed: 0};
    }
    let cornerSpeed = Infinity;
    if (cruise.maneuver) {
      const yaw = Math.abs(angleDiff(car.heading, cruise.maneuver.entry.heading));
      // Slow a tight turn enough to leave room to straighten out after the driver lets go.
      if (yaw > Math.PI * 5 / 8) cornerSpeed = 4;
      else if (yaw > Math.PI / 12 || (cruise.maneuver.crossing !== null && Math.abs(steer) > 0.25)) cornerSpeed = 10;
    }
    const target = Math.min(cruise.setSpeedKph, endSpeed * 3.6, cornerSpeed * 3.6);
    const result = cruiseSpeed(car, this.cars, cruise.lane, target, cruise.gapCars, dt);
    cruise.following = result.following;
    cruise.ending = !result.following && endSpeed < Math.min(cruise.setSpeedKph / 3.6, cornerSpeed);
    const curbLimit = cruise.maneuver && !cruise.driverSteering
      ? recoverySpeedLimit(car, cruise.lane) : Infinity;
    const speed = Math.min(result.speed, Math.max(cornerSpeed, car.speed - pedalBraking * dt), curbLimit);
    return {steer: correction, speed, pivot: curbLimit < result.speed};
  }

  drive(car, dt, input) {
    const steer = clamp(finite(input.x, 0), -1, 1), throttle = clamp(finite(input.y, 0), -1, 1);
    const assist = this.cruise.active ? this.cruiseControls(car, dt, input, steer, throttle) : null;
    if (assist?.speed != null) {
      car.speed = assist.speed;
    } else {
      let acceleration = throttle * (throttle * car.speed < 0 ? 27 : 12.5);
      if (Math.abs(throttle) < 0.04) acceleration = 0;
      car.speed = clamp(car.speed + acceleration * dt, -9, topSpeed(car));
      const drag = (input.brake ? pedalBraking : acceleration ? 0.6 : 3.8) * dt;
      car.speed = Math.sign(car.speed) * Math.max(0, Math.abs(car.speed) - drag);
    }
    // At the curb the centering assist can finish rotating even from a standstill.
    const steeringRate = assist?.pivot ? 1 : clamp(car.speed / 4, -1, 1);
    car.heading += (assist?.steer ?? steer) * (input.brake ? 2.2 : 1.55) * steeringRate * dt;
    const x = car.x + Math.sin(car.heading) * car.speed * dt;
    const z = car.z - Math.cos(car.heading) * car.speed * dt;
    if (isOpen(x, z, carRadius)) { car.x = x; car.z = z; }
    else if (Math.abs(car.speed) > 1.6) {
      this.cancelCruise('Cruise off · Take the wheel');
      car.speed *= -0.22;
    } else {
      car.speed = 0;
    }
    const p = this.player;
    Object.assign(p, {x: car.x, z: car.z, heading: car.heading, moving: false, running: false, backpedaling: false});
  }

  moveTraffic(dt, current) {
    const player = this.player;
    for (const car of this.cars) {
      if (car === current || car.owner === 'patrol') continue;
      if (car.route) {
        const dx = player.x - car.x, dz = player.z - car.z;
        const ahead = dx * Math.sin(car.heading) - dz * Math.cos(car.heading);
        const lateral = Math.abs(dx * Math.cos(car.heading) + dz * Math.sin(car.heading));
        const yielding = ahead > -1 && ahead < 10 && lateral < 2.7;
        const targetSpeed = yielding ? 0 : car.cruise;
        car.speed += clamp(targetSpeed - car.speed, -25 * dt, 8 * dt);
        car.mileage += Math.max(0, car.speed) * dt;
        followLoop(car);
      }
      if (!current || gap(car, current) > 3.3 || this.cooldown > 0) continue;
      const impact = Math.abs(current.speed);
      if (impact < 0.1) continue;
      this.cancelCruise('Cruise off · Take the wheel');
      const dx = current.x - car.x, dz = current.z - car.z;
      const length = Math.max(0.01, Math.hypot(dx, dz));
      const x = car.x + dx / length * 3.45, z = car.z + dz / length * 3.45;
      if (isOpen(x, z, 1.5)) Object.assign(current, {x, z});
      current.speed *= -0.25;
      Object.assign(player, {x: current.x, z: current.z});
      this.cooldown = 0.75;
      if (impact > 10 && car.owner === 'traffic') this.addHeat();
    }
  }

  moveResidents(dt, car) {
    for (const ped of this.peds) {
      ped.cooldown = Math.max(0, ped.cooldown - dt);
      ped.stunTime = Math.max(0, ped.stunTime - dt);
      if (ped.stunTime > 0) continue;
      ped.mileage += dt * ped.speed * (ped.cooldown > 0 ? 3.2 : 1);
      followLoop(ped);
      if (!car || ped.cooldown > 0 || Math.abs(car.speed) < 7 || gap(car, ped) > 2.2) continue;
      ped.cooldown = 4;
      ped.mileage += 3.8;
      followLoop(ped);
      car.speed *= 0.7;
      this.addHeat();
      this.message('Reckless driving reported', 2);
    }
  }

  strike() {
    const p = this.player;
    if (p.carId || this.time < this.nextStrike) return false;
    this.nextStrike = this.time + 0.6;
    p.strikeTime = 0.34;
    let victim = null;
    let closest = 2.45;
    for (const ped of this.peds) {
      const dx = ped.x - p.x, dz = ped.z - p.z;
      const distance = Math.hypot(dx, dz);
      const forward = dx * Math.sin(p.heading) - dz * Math.cos(p.heading);
      if (distance < closest && forward > -0.3 && ped.stunTime <= 0) {
        closest = distance;
        victim = ped;
      }
    }
    if (victim) {
      p.heading = Math.atan2(victim.x - p.x, p.z - victim.z);
      victim.stunTime = 1.1;
      victim.cooldown = 6;
      this.addHeat();
      this.message('Disturbance reported', 2);
    }
    return true;
  }

  spawnPatrol() {
    const player = this.player;
    const candidates = [];
    for (let x = -240; x <= 240; x += 80) {
      for (let z = -240; z <= 240; z += 80) {
        const distance = Math.hypot(x - player.x, z - player.z);
        if (distance >= 52 && distance < 150 && !this.cars.some(c => Math.hypot(c.x - x, c.z - z) < 9)) {
          candidates.push(point(x, z));
        }
      }
    }
    if (candidates.length === 0) return;
    const start = candidates[(this.patrolSerial * 13 + 1) % candidates.length];
    const car = createCar('patrol-' + ++this.patrolSerial, 'police', 0xebe7dd, start.x, start.z, 0);
    this.preparePatrol(car);
    car.heading = Math.atan2(player.x - car.x, car.z - player.z);
    this.cars.push(car);
  }

  preparePatrol(car) {
    car.owner = 'patrol';
    car.path = [];
    car.replan = 0;
  }

  movePatrol(car, dt) {
    car.replan -= dt;
    if (car.replan <= 0 || car.path.length === 0) {
      car.path = patrolRoute(car, this.player);
      car.replan = 0.95;
    }
    while (car.path.length > 1 && gap(car, car.path[0]) < 2.8) car.path.shift();
    const destination = car.path[0];
    if (!destination) { car.speed = 0; return; }
    const distance = gap(car, destination);
    const heading = Math.atan2(destination.x - car.x, car.z - destination.z);
    car.heading += angleDiff(heading, car.heading) * (1 - Math.exp(-6 * dt));
    const speed = 12 + 2 * this.wanted;
    car.speed = Math.min(car.speed + dt * 12, speed, distance / dt);
    if (distance < 2.8 && car.path.length === 1) { car.speed = 0; return; }
    const dx = Math.sin(heading) * car.speed * dt, dz = -Math.cos(heading) * car.speed * dt;
    if (isOpen(car.x + dx, car.z + dz, 1.5)) {
      car.x += dx;
      car.z += dz;
    } else {
      car.replan = 0;
      car.speed = 0;
    }
  }

  pursuit(dt) {
    const patrols = this.cars.filter(c => c.owner === 'patrol');
    this.sirenDelay -= dt;
    if (patrols.length < this.wanted && this.sirenDelay <= 0) {
      this.spawnPatrol();
      this.sirenDelay = 2.4;
    }
    let near = Infinity, seen = false;
    for (const car of patrols) {
      this.movePatrol(car, dt);
      const distance = gap(car, this.player);
      near = Math.min(near, distance);
      if (distance < 28 || (distance < 68 && clearLine(car, this.player, 0.1))) seen = true;
    }
    const cornered = near < 5.8 && (!this.car || Math.abs(this.car.speed) < 5.2);
    this.capture = clamp(this.capture + dt * (cornered ? 0.24 : -0.5), 0, 1);
    if (this.capture >= 1) {
      this.busted();
      return;
    }
    if (seen || this.time - this.lastOffense < 4.5) this.escape = 0;
    else this.escape += dt;
    if (this.escape >= SEARCH_TIME) {
      this.clearHeat();
      this.message('Patrols lost', 2.5);
    }
  }

  clearHeat() {
    this.cars = this.cars.filter(c => c.owner !== 'patrol');
    this.wanted = 0;
    this.escape = 0;
    this.capture = 0;
    this.sirenDelay = 0;
    this.lastOffense = -100;
    this.revision++;
  }

  busted() {
    this.cancelCruise();
    this.clearHeat();
    const fine = Math.min(this.cash, 100);
    this.cash -= fine;
    if (this.car) this.car.speed = 0;
    const hero = this.cars.find(c => c.id === COUPE);
    Object.assign(hero, {x: 5, z: 0, heading: 0, speed: 0});
    Object.assign(this.player, {x: 5, z: 7, heading: 0, carId: null, moving: false, running: false, backpedaling: false});
    if (this.missionIndex === 1) {
      this.stage = 0;
      this.remainingTime = null;
    }
    if (this.missionIndex === 2) {
      this.stage = 0;
      this.prepareHotCar();
    }
    this.message(fine ? 'Busted • $' + fine + ' fine' : 'Busted • Released in Lido', 4.5);
    this.revision++;
  }

  prepareHotCar() {
    let car = this.cars.find(c => c.id === HOT_CAR);
    if (!car) {
      car = createCar(HOT_CAR, 'coupe', 0xed9f3c, -153, 160, Math.PI / 2);
      this.cars.push(car);
    }
    Object.assign(car, {x: -153, z: 160, heading: Math.PI / 2, speed: 0, owner: 'parked', route: null});
  }

  finishJob(reward) {
    this.message(this.missionTitle + ' complete  +$' + reward, 5);
    this.cash += reward;
    this.missionIndex++;
    this.completed = Math.max(this.completed, this.missionIndex);
    this.stage = 0;
    this.remainingTime = null;
    if (this.missionIndex === 2) this.prepareHotCar();
    this.revision++;
  }

  advanceMission(dt) {
    if (this.missionIndex === 3) return;
    if (this.missionIndex === 1 && this.remainingTime !== null) {
      this.remainingTime = Math.max(0, this.remainingTime - dt);
      if (this.remainingTime <= 0) {
        this.remainingTime = null;
        this.stage = 0;
        this.message('Time up • Return to the starting gate');
        this.revision++;
        return;
      }
    }
    if (!this.player.carId) return;
    if (this.missionIndex === 2 && this.stage === 1 && this.player.carId === HOT_CAR && !this.wanted) {
      this.stage = 2;
      this.message('Coast clear • Head for the boathouse');
      this.revision++;
    }
    const target = this.target;
    if (!target || gap(this.player, target) >= 8) return;
    if (this.missionIndex === 0 && this.stage > 0) {
      if (this.stage === 2) this.finishJob(450);
      else {
        this.stage = 2;
        this.message('Case collected • Next stop, the marina club');
        this.revision++;
      }
    } else if (this.missionIndex === 1) {
      if (this.stage === GATES.length) this.finishJob(780);
      else {
        this.stage++;
        if (this.stage === 1) {
          this.remainingTime = RACE_TIME;
          this.message('Clock started • Cross all three gates');
        } else this.message('Gate cleared', 1.8);
        this.revision++;
      }
    } else if (this.missionIndex === 2 && this.stage === 2 && !this.wanted && this.player.carId === HOT_CAR) {
      this.finishJob(1200);
    }
  }

  replayJobs() {
    if (this.missionIndex !== 3) return;
    this.missionIndex = 0;
    this.stage = this.player.carId ? 1 : 0;
    this.message('New dispatch from Lido Records');
    this.revision++;
  }

  serialize() {
    const pose = ({x, z, heading}) => ({x, z, heading});
    return {version: 2, cruiseGapCars: this.cruise.gapCars, cash: this.cash, completed: this.completed, missionIndex: this.missionIndex,
      stage: this.stage, remainingTime: this.remainingTime, time: this.time, wanted: this.wanted,
      lastOffense: this.lastOffense, capture: this.capture, escape: this.escape,
      player: {...pose(this.player), carId: this.player.carId},
      cars: this.cars.map(c => ({...pose(c), id: c.id, mileage: c.mileage, owner: c.owner, speed: c.speed}))};
  }

  restore(s) {
    this.cancelCruise();
    this.cruise.gapCars = integer(s.cruiseGapCars, 2, 1, MAX_GAP_CARS);
    this.time = clamp(finite(s.time, 0), 0, 1e9);
    this.cash = integer(s.cash, 0, 0, 1e9);
    this.missionIndex = integer(s.missionIndex, 0, 0, 3);
    this.completed = integer(s.completed, this.missionIndex, this.missionIndex, 3);
    this.stage = integer(s.stage, 0, 0, [2, GATES.length, 2, 0][this.missionIndex]);
    this.remainingTime = this.missionIndex === 1 && this.stage > 0 ? clamp(finite(s.remainingTime, RACE_TIME), 0, RACE_TIME) : null;
    this.wanted = integer(s.wanted, 0, 0, 3);
    this.lastOffense = clamp(finite(s.lastOffense, -100), -100, this.time);
    this.escape = clamp(finite(s.escape, 0), 0, SEARCH_TIME);
    this.capture = clamp(finite(s.capture, 0), 0, 1);
    const savedCars = Array.isArray(s.cars) ? s.cars.slice(0, 32) : [];
    if (this.missionIndex >= 2 || savedCars.some(c => c?.id === HOT_CAR)) this.prepareHotCar();
    let patrols = 0;
    for (const saved of savedCars) {
      if (!saved || typeof saved.id !== 'string') continue;
      let car = this.cars.find(c => c.id === saved.id);
      if (!car && /^patrol-\d{1,9}$/.test(saved.id) && patrols < this.wanted) {
        car = createCar(saved.id, 'police', 0xebe7dd, 0, -80, 0);
        this.preparePatrol(car);
        this.patrolSerial = Math.max(this.patrolSerial, Number(saved.id.slice(7)));
        this.cars.push(car);
        patrols++;
      }
      if (!car) continue;
      if (car.route && saved.owner === 'traffic' && s.player?.carId !== car.id) {
        car.mileage = clamp(finite(saved.mileage, car.mileage), 0, car.route.length);
        if (s.version === 1 && Number.isFinite(saved.x) && Number.isFinite(saved.z)) car.mileage = nearestMileage(car.route, saved);
        followLoop(car);
      } else {
        if (car.owner === 'traffic' || saved.owner === 'personal') {
          car.route = null;
          if (car.owner !== 'patrol') car.owner = 'personal';
        }
        restorePose(car, saved, 1.45);
      }
      car.speed = clamp(finite(saved.speed, 0), -9, 34);
    }
    const current = this.cars.find(c => c.id === s.player?.carId && c.owner !== 'patrol');
    if (current) {
      current.route = null;
      current.owner = 'personal';
      Object.assign(this.player, {x: current.x, z: current.z, heading: current.heading, carId: current.id});
      if (this.missionIndex === 0 && this.stage === 0) this.stage = 1;
    } else restorePose(this.player, s.player, 0.46);
    for (const p of this.peds) {
      p.mileage += this.time * p.speed;
      followLoop(p);
    }
  }
}
