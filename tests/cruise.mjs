import assert from 'node:assert/strict';
import test from 'node:test';
import {Game} from '../app/src/main/assets/game/game.js';

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
      game.toggleCruise();
      run(game, 6);
      const car = game.car;
      assert.equal(game.cruise.active, true);
      assert.ok(car.x * forwardX + car.z * forwardZ > 20);
      near(car.x * rightX + car.z * rightZ, center, 0.15);
      near(car.heading, heading, 0.025);
    }
  }
  for (const pose of [{x: -3}, {x: 18, z: 25}, {heading: Math.PI / 4}, {speed: -2}]) {
    const game = driving(pose);
    game.toggleCruise();
    assert.equal(game.cruise.active, false);
  }
});

test('stops for a parked car, resumes when the lane clears and detects a new lead', () => {
  const game = driving({speed: 20});
  const car = game.car;
  const parked = {...car, id: 'parked', z: car.z - 62, speed: 0, owner: 'parked'};
  game.cars.push(parked);
  game.toggleCruise();
  run(game, 22);
  assert.equal(game.cruise.following, parked.id);
  assert.equal(car.speed, 0);
  near(car.z - parked.z, 15, 0.5);
  assert.equal(game.wanted, 0);

  parked.x = 7.1;
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
  const lead = game.cars.find(car => car.id === 'traffic-8');
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
  const game = driving({z: -100, speed: 27});
  game.toggleCruise();
  assert.equal(game.cruise.active, true);
  run(game, 14);
  assert.equal(game.cruise.active, false);
  near(game.car.speed, 0, 0.1);
  near(game.car.z, -223.05, 1);
  near(game.car.x, 2.55, 0.1);
  game.toggleCruise();
  assert.equal(game.cruise.active, false);
});

test('keeps the selected bumper gap as stopped traffic starts moving again', () => {
  for (const gapCars of [1, 2, 3]) {
    const game = new Game();
    game.interact();
    const lead = game.cars.find(car => car.id === 'traffic-8');
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

test('brake, reverse, steering and cancel return control immediately', () => {
  // Gas and reverse pressed together produce zero net throttle plus the reverse-button signal.
  for (const input of [{brake: true}, {y: -1}, {y: 0, reverse: true}, {x: 0.8}]) {
    const game = driving({speed: 10});
    game.toggleCruise();
    game.update(frame, input);
    assert.equal(game.cruise.active, false);
    if (input.x) assert.ok(game.car.heading > 0);
    else assert.ok(game.car.speed < 10);
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
