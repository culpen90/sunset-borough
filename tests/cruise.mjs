import assert from 'node:assert/strict';
import test from 'node:test';
import {Game} from '../app/src/main/assets/game/game.js';
import {signalAt} from '../app/src/main/assets/game/traffic-lights.js';

const frame = 1 / 60;

function run(game, seconds, input = {}) {
  for (let i = 0; i < Math.round(seconds * 60); i++) game.update(frame, input);
}

function driving(pose = {}) {
  const game = new Game();
  game.interact();
  game.cars = [game.car];
  game.peds = [];
  Object.assign(game.car, {x: 2.55, z: 100, heading: 0, speed: 0}, pose);
  return game;
}

function near(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`);
}

function startOnGreen(game, x, z, axis) {
  for (let t = 0; t < 60; t++) {
    if (signalAt(x, z, axis, t) === 'go' && signalAt(x, z, axis, t - 1) !== 'go') {
      game.time = t;
      return;
    }
  }
  assert.fail('Expected a green phase for the test approach');
}

test('set captures road speed and the speed buttons respect each vehicle limit', () => {
  for (const [type, limit] of [['coupe', 122], ['taxi', 97], ['sedan', 104]]) {
    const game = driving({type, speed: 15});
    game.toggleCruise();
    assert.equal(game.cruise.active, true);
    assert.equal(game.cruise.setSpeedKph, 54);
    game.adjustCruiseSpeed(5);
    run(game, 3);
    near(game.speedKph, 59, 1);
    for (let i = 0; i < 30; i++) game.adjustCruiseSpeed(5);
    assert.equal(game.cruise.setSpeedKph, limit);
    for (let i = 0; i < 30; i++) game.adjustCruiseSpeed(-5);
    assert.equal(game.cruise.setSpeedKph, 20);
    run(game, 5);
    near(game.speedKph, 20, 1);
  }
});

test('holds each painted lane straight through an intersection in all four directions', () => {
  for (const [heading, forwardX, forwardZ] of [
    [0, 0, -1], [Math.PI / 2, 1, 0], [Math.PI, 0, 1], [-Math.PI / 2, -1, 0],
  ]) {
    const rightX = -forwardZ, rightZ = forwardX;
    for (const [offset, center] of [[1.6, 2.55], [8.2, 7.1]]) {
      const game = driving({x: rightX * offset - 30 * forwardX, z: rightZ * offset - 30 * forwardZ,
        heading: heading + 0.1, speed: 10});
      startOnGreen(game, 0, 0, forwardX ? 'x' : 'z');
      game.toggleCruise();
      run(game, 6);
      const car = game.car;
      assert.equal(game.cruise.active, true);
      assert.ok(car.x * forwardX + car.z * forwardZ > 20);
      near(car.x * rightX + car.z * rightZ, center, 0.15);
      near(car.heading, heading, 0.025);
    }
  }
});

test('acquires a forward lane from the opposing lane, centerline and shoulder in all four directions', () => {
  for (const [heading, forwardX, forwardZ] of [
    [0, 0, -1], [Math.PI / 2, 1, 0], [Math.PI, 0, 1], [-Math.PI / 2, -1, 0],
  ]) {
    const rightX = -forwardZ, rightZ = forwardX;
    // Use an offset junction so lane selection also accounts for the street's position in the city.
    for (const [offset, yaw, speed, center] of [
      [-7.1, 0, 12, 2.55], [0, -0.25, 0, 2.55], [10.8, 0.05, 10, 7.11], [-2.55, 1.05, 8, 2.55],
    ]) {
      const x = 80 + offset * rightX - 35 * forwardX;
      const z = -80 + offset * rightZ - 35 * forwardZ;
      const game = driving({x, z, heading: heading + yaw, speed});
      startOnGreen(game, 80, -80, forwardX ? 'x' : 'z');
      const car = game.car;
      game.toggleCruise();
      assert.equal(game.cruise.active, true, `heading ${heading}, lateral offset ${offset}`);
      assert.deepEqual([car.x, car.z, car.heading], [x, z, heading + yaw]);
      game.update(frame);
      near(car.speed, speed, 0.55);
      run(game, 9);
      assert.equal(game.cruise.active, true);
      assert.ok((car.x - x) * forwardX + (car.z - z) * forwardZ > 25);
      near((car.x - 80) * rightX + (car.z + 80) * rightZ, center, 0.12);
      near(Math.cos(car.heading - heading), 1, 0.0003);
      near(game.speedKph, Math.max(20, Math.round(speed * 3.6)), 1);
    }
  }
});

test('acquires the forward cross street from an angled start in a junction', () => {
  for (const [offset, center] of [[0, 2.55], [10.1, 7.11]]) {
    const game = driving({x: 80, z: -80 + offset, heading: Math.PI / 3, speed: 12});
    game.toggleCruise();
    run(game, 7);
    assert.equal(game.cruise.active, true);
    assert.ok(game.car.x > 110);
    near(game.car.z, -80 + center, 0.12);
    near(Math.sin(game.car.heading), 1, 0.0003);
  }
});

test('regains a forward lane from a fast sideways approach toward the curb', () => {
  for (const [street, x, heading] of [[0, -9.8, -Math.PI / 2], [240, 252, Math.PI / 2]]) {
    const game = driving({x, z: 35, heading, speed: 24});
    const car = game.car;
    game.toggleCruise();
    run(game, 7);
    assert.equal(game.cruise.active, true);
    assert.equal(game.cruise.setSpeedKph, 86);
    const north = Math.sign(Math.cos(car.heading));
    const center = (car.x - street) * north;
    assert.ok([2.55, 7.11].some(offset => Math.abs(center - offset) <= 0.12));
    near(Math.sin(car.heading), 0, 0.025);
    const z = car.z;
    run(game, 0.5);
    assert.ok((z - car.z) * north > 2, 'continued along the recovered lane');
    near((car.x - street) * north, center, 0.12);
  }
});

test('keeps cruise unavailable when reversing or deep inside a city block', () => {
  for (const pose of [{x: 40, z: 40}, {speed: -2}]) {
    const game = driving(pose);
    game.toggleCruise();
    assert.equal(game.cruise.active, false);
  }
});

test('stops for a parked car, resumes when the lane clears and detects a new lead', () => {
  // This perimeter street has no signals to interrupt the following-distance check.
  const game = driving({x: 242.55, speed: 20});
  const car = game.car;
  const parked = {...car, id: 'parked', z: car.z - 62, speed: 0, owner: 'parked'};
  game.cars.push(parked);
  game.toggleCruise();
  run(game, 22);
  assert.equal(game.cruise.following, parked.id);
  assert.equal(car.speed, 0);
  near(car.z - parked.z, 15, 0.5);
  assert.equal(game.wanted, 0);

  parked.x = 247.1;
  run(game, 8);
  assert.equal(game.cruise.following, null);
  near(game.speedKph, 72, 1);
  const next = {...parked, id: 'next', x: car.x, z: car.z - 55};
  game.cars.push(next);
  run(game, 22);
  assert.equal(game.cruise.following, next.id);
  assert.equal(car.speed, 0);
  near(car.z - next.z, 15, 0.5);
});

test('chooses the nearest same-lane lead amid crossing, oncoming and adjacent cars', () => {
  const game = driving({speed: 18});
  const car = game.car;
  const other = (id, forward, lateral, heading) => ({...car, id,
    z: car.z - forward, x: car.x + lateral, heading, speed: 6, owner: 'traffic'});
  game.cars.push(
    other('oncoming', 10, 0, Math.PI),
    other('crossing', 14, 0, Math.PI / 2),
    other('next-lane', 17, 4.55, 0),
    other('behind', -12, 0, 0),
    other('farther', 60, 0, 0),
    other('lead', 30, 0, 0),
  );
  game.toggleCruise();
  game.update(frame);
  assert.equal(game.cruise.following, 'lead');
  assert.ok(car.speed < 18);
});

test('adjusts following distance behind moving traffic and stays straight when the lead turns', () => {
  const game = new Game();
  game.interact();
  const lead = game.cars.find(car => car.id === 'traffic-36');
  const straight = lead.route.segments.find(s => s.heading === 0 && s.size > 190);
  Object.assign(lead, straight.start, {heading: straight.heading, speed: lead.cruise, mileage: straight.from});
  const car = game.car;
  Object.assign(car, {x: lead.x, z: lead.z + 22, heading: 0, speed: 15});
  game.cars = [car, lead];
  game.peds = [];
  game.toggleCruise();
  assert.equal(game.cruise.gapCars, 2);
  run(game, 8);
  assert.equal(game.cruise.following, lead.id);
  near(car.speed, lead.speed, 1);
  near(car.z - lead.z, 15, 1);
  lead.cruise = 5;
  run(game, 8);
  near(car.speed, lead.speed, 0.5);
  near(car.z - lead.z, 15, 1);
  game.cycleCruiseGap();
  assert.equal(game.cruise.gapCars, 3);
  run(game, 7);
  near(car.z - lead.z, 20, 1);
  game.cycleCruiseGap();
  assert.equal(game.cruise.gapCars, 1);
  run(game, 7);
  near(car.z - lead.z, 10, 1);
  near(car.speed, lead.speed, 1);
  lead.cruise = 9;
  for (let i = 0; i < 15 * 60 && Math.abs(lead.heading) < Math.PI / 3; i++) game.update(frame);
  assert.ok(Math.abs(lead.heading) >= Math.PI / 3, 'lead took its scheduled turn');
  run(game, 4);
  assert.equal(game.cruise.following, null);
  assert.equal(game.cruise.active, true);
  near(car.heading, 0, 0.025);
  assert.ok(car.speed > lead.cruise + 2);
});

test('gives the driver control at the end of the road', () => {
  const game = driving({x: 82.55, z: -100, speed: 27});
  game.toggleCruise();
  assert.equal(game.cruise.active, true);
  run(game, 14);
  assert.equal(game.cruise.active, false);
  near(game.car.speed, 0, 0.1);
  near(game.car.z, -223.05, 1);
  near(game.car.x, 82.55, 0.1);
  game.toggleCruise();
  assert.equal(game.cruise.active, false);
});

test('can turn onto the cross street while cruise slows for the last junction', () => {
  const game = driving({z: -193, speed: 10});
  game.toggleCruise();
  for (let i = 0; i < 5 * 60 && game.car.z > -221.6; i++) game.update(frame);
  assert.ok(game.cruise.active && game.cruise.ending);
  run(game, 0.95, {x: 1});
  run(game, 8);
  assert.equal(game.cruise.active, true);
  assert.ok(game.car.x > 30);
  near(game.car.z, -240 + 2.55, 0.12);
  near(game.car.heading, Math.PI / 2, 0.025);
  near(game.speedKph, 36, 1);
});

test('keeps the selected bumper gap as stopped traffic starts moving again', () => {
  for (const gapCars of [1, 2, 3]) {
    const game = new Game();
    game.interact();
    const lead = game.cars.find(car => car.id === 'traffic-36');
    const straight = lead.route.segments.find(s => s.heading === 0 && s.size > 190);
    Object.assign(lead, straight.start, {heading: 0, speed: 0, cruise: 0, mileage: straight.from});
    const car = game.car;
    Object.assign(car, {x: lead.x, z: lead.z + 45, heading: 0, speed: 12});
    game.cars = [car, lead];
    game.peds = [];
    for (let i = 0; i < 2 && game.cruise.gapCars !== gapCars; i++) game.cycleCruiseGap();
    assert.equal(game.cruise.gapCars, gapCars);
    game.toggleCruise();
    run(game, 15);
    assert.equal(car.speed, 0);
    near(car.z - lead.z - 5, gapCars * 5, 0.15);
    lead.cruise = 7;
    run(game, 12);
    assert.equal(game.cruise.following, lead.id);
    near(car.speed, 7, 0.2);
    near(car.z - lead.z - 5, gapCars * 5, 0.25);
  }
});

test('steering mid-block keeps cruise active and centers the car again on release', () => {
  const game = driving({z: 120, speed: 10});
  game.toggleCruise();
  run(game, 0.25, {x: 0.8});
  assert.equal(game.cruise.active, true);
  assert.ok(game.car.heading > 0.1);
  run(game, 4);
  assert.equal(game.cruise.active, true);
  near(game.car.x, 2.55, 0.1);
  near(game.car.heading, 0, 0.02);
  near(game.speedKph, 36, 1);
});

test('recovers into the new forward lane when a mid-block U-turn ends on the wrong side', () => {
  const game = driving({x: 87.11, z: 120, speed: 5.5});
  const car = game.car;
  game.toggleCruise();
  for (let i = 0; i < 4 * 60 && car.heading > -Math.PI; i++) game.update(frame, {x: -1});
  assert.ok(car.x >= 80 && Math.cos(car.heading) < -0.99, 'finished facing south on the northbound side');

  const releaseZ = car.z;
  run(game, 8);
  assert.equal(game.cruise.active, true);
  assert.ok(car.z - releaseZ > 25);
  near(car.x, 80 - 2.55, 0.12);
  near(Math.cos(car.heading), -1, 0.0003);
});

test('held steering, a brief neutral pause and immediate countersteering match manual driving', () => {
  const pose = {z: 89, speed: 12};
  const game = driving(pose);
  const manual = driving(pose);
  game.toggleCruise();

  // A short release between steering inputs must preserve the driver's heading.
  for (const [x, frames] of [[1, 40], [0, 12], [1, 34], [-0.65, 12]]) {
    for (let i = 0; i < frames; i++) {
      game.update(frame, {x});
      manual.update(frame, {x});
      assert.equal(game.cruise.active, true);
      near(game.car.heading, manual.car.heading, 1e-8);
    }
  }
  assert.ok(game.car.heading > Math.PI / 2, 'the driver could steer past the cross street');
});

test('holding both steering buttons preserves heading until both are released', () => {
  const game = driving({z: 7, speed: 10});
  game.toggleCruise();
  run(game, 0.55, {x: 1});
  const heading = game.car.heading;
  for (let i = 0; i < 36; i++) {
    game.update(frame, {x: 0, steeringHeld: true});
    near(game.car.heading, heading, 1e-8);
    assert.equal(game.cruise.active, true);
  }
  run(game, 8);
  near(game.car.heading, Math.PI / 2, 0.025);
  near(game.car.z, 2.55, 0.12);
});

test('remembers the eastbound turn after a driver overshoots past 180 degrees', () => {
  const game = driving({x: 2.545, z: 7, speed: 10});
  game.toggleCruise();
  run(game, 2.5, {x: 1});
  assert.ok(game.car.heading > Math.PI);
  run(game, 8);
  assert.equal(game.cruise.active, true);
  assert.ok(game.car.x > 30);
  near(Math.sin(game.car.heading), 1, 0.001);
  near(Math.cos(game.car.heading), 0, 0.025);
  near(game.car.z, 2.55, 0.12);
});

test('reapplying steering takes the wheel back on the first frame of input during recovery', () => {
  const game = driving({z: 89, speed: 10});
  game.toggleCruise();
  run(game, 0.6, {x: 1});
  const releasedHeading = game.car.heading;
  run(game, 0.2);
  near(game.car.heading, releasedHeading, 1e-8);
  run(game, 0.2);
  assert.ok(game.car.heading > releasedHeading + 0.02, 'lane recovery has started turning right');

  const {x, z, heading, speed} = game.car;
  const manual = driving({x, z, heading, speed});
  for (let i = 0; i < 8; i++) {
    manual.update(frame, {x: -0.7});
    game.update(frame, {x: -0.7});
    near(game.car.heading, manual.car.heading, 1e-8);
    assert.equal(game.cruise.active, true);
  }
  const correctedHeading = game.car.heading;
  run(game, 0.2);
  near(game.car.heading, correctedHeading, 1e-8);
  run(game, 5);
  near(Math.cos(game.car.heading), 0, 0.025);
  assert.ok(game.car.x > 25, 'the car resumed the right turn after the final release');
});

test('finishes understeered and oversteered turns in a forward lane and follows traffic there', () => {
  const junctionZ = 80;
  for (const side of [-1, 1]) {
    // At 10 m/s full steering turns the car about 53 or 115 degrees before release.
    for (const steerSeconds of [0.6, 1.3]) {
      const game = driving({x: 2.55, z: junctionZ + (side < 0 ? 4 : 9), speed: 10});
      game.toggleCruise();
      run(game, steerSeconds, {x: side});
      assert.equal(game.cruise.active, true);
      run(game, 5);
      const car = game.car;
      assert.equal(game.cruise.active, true);
      assert.ok(car.x * side > 25, 'drove out along the selected cross street');
      near(Math.sin(car.heading), side, 0.001);
      near(Math.cos(car.heading), 0, 0.025);
      const offset = (car.z - junctionZ) * side;
      assert.ok([2.55, 7.11].some(center => Math.abs(offset - center) <= 0.12),
        `Expected a forward lane center after the turn, got signed offset ${offset}`);
      near(game.speedKph, 36, 1);

      const lead = {...car, id: 'destination-lead', x: car.x + side * 40, speed: 0, owner: 'parked'};
      game.cars.push(lead);
      run(game, 18);
      assert.equal(game.cruise.following, lead.id);
      assert.equal(car.speed, 0);
      near((lead.x - car.x) * side, 15, 0.5);
    }
  }
});

test('brake, reverse and cancel return control immediately', () => {
  // Gas and reverse pressed together produce zero net throttle plus the reverse-button signal.
  for (const input of [{brake: true}, {y: -1}, {y: 0, reverse: true}]) {
    const game = driving({speed: 10});
    game.toggleCruise();
    game.update(frame, input);
    assert.equal(game.cruise.active, false);
    assert.ok(game.car.speed < 10);
    run(game, 1);
    assert.equal(game.cruise.active, false);
  }
  const game = driving({speed: 10});
  game.toggleCruise();
  game.toggleCruise();
  assert.equal(game.cruise.active, false);
});

test('accelerator override keeps the set speed and restores it on release', () => {
  const game = driving({speed: 10});
  game.toggleCruise();
  run(game, 1.1, {y: 1});
  assert.equal(game.cruise.overriding, true);
  assert.equal(game.cruise.active, true);
  assert.equal(game.cruise.setSpeedKph, 36);
  assert.ok(game.speedKph > 40);
  run(game, 5);
  assert.equal(game.cruise.overriding, false);
  near(game.speedKph, 36, 1);
});

test('engages from rest in the starting coupe and clears on restore and exit', () => {
  const game = new Game();
  game.toggleCruise();
  assert.equal(game.cruise.active, false);
  game.interact();
  game.toggleCruise();
  assert.equal(game.cruise.active, true);
  game.cycleCruiseGap();
  const restored = new Game(JSON.parse(JSON.stringify(game.serialize())));
  assert.equal(restored.car.id, game.car.id);
  assert.equal(restored.cruise.active, false);
  assert.equal(restored.cruise.gapCars, 3);
  game.interact();
  assert.equal(game.car, null);
  assert.equal(game.cruise.active, false);
});

test('restores original saves with traffic near its old position on the new painted lane', () => {
  const save = new Game().serialize();
  save.version = 1;
  delete save.cruiseGapCars;
  save.cars = [{id: 'traffic-8', x: 4.4, z: 20, heading: 0, speed: 9, mileage: 585.906, owner: 'traffic'}];
  const game = new Game(save);
  const traffic = game.cars.find(car => car.id === 'traffic-8');
  near(traffic.x, 2.55, 0.01);
  near(traffic.z, 20, 0.01);
  assert.equal(game.cruise.gapCars, 2);
  const migrated = game.serialize();
  assert.deepEqual(new Game(migrated).serialize(), migrated);
});
