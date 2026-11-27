import assert from 'node:assert/strict';
import test from 'node:test';
import {Game} from '../app/src/main/assets/game/game.js';
import {signalAt, signalJunctions, stopLineOffset} from '../app/src/main/assets/game/traffic-lights.js';

const frame = 1 / 60;
const centralSignal = time => signalAt(0, 0, 'z', time);

function advance(game, seconds, input) {
  for (let step = 0; step < Math.round(seconds / frame); step++) game.update(frame, input);
}

function startOf(phase) {
  for (let time = 0.25; time <= 60; time += 0.25) {
    if (centralSignal(time) === phase && centralSignal(time - 0.25) !== phase) return time;
  }
  assert.fail('Missing ' + phase + ' phase at the central intersection');
}

function northboundTraffic(game, z, speed) {
  for (const car of game.cars.filter(car => car.owner === 'traffic')) {
    const segment = car.route.segments.find(({start, end, heading}) =>
      heading === 0 && start.x > 0 && start.x < 9 && start.z >= z && end.z < -25);
    if (segment) {
      return {...car, x: segment.start.x, z, heading: 0, speed, cruise: speed,
        mileage: segment.from + segment.start.z - z};
    }
  }
  assert.fail('Expected a northbound traffic route through the central intersection');
}

test('each signal warns before stopping and clears the junction before releasing cross traffic', () => {
  assert.ok(signalJunctions.length > 0);
  for (const {x, z} of signalJunctions) {
    for (const axis of ['x', 'z']) {
      const other = axis === 'x' ? 'z' : 'x';
      let prior = signalAt(x, z, axis, 0);
      const seen = new Set([prior]);
      for (let time = 0.25; time <= 60; time += 0.25) {
        const phase = signalAt(x, z, axis, time);
        const cross = signalAt(x, z, other, time);
        if (phase !== 'stop') assert.equal(cross, 'stop');
        if (phase !== prior) {
          assert.equal(phase, {go: 'yield', yield: 'stop', stop: 'go'}[prior]);
          if (phase === 'go') assert.equal(signalAt(x, z, other, time - 0.25), 'stop');
        }
        seen.add(phase);
        prior = phase;
      }
      assert.deepEqual(seen, new Set(['go', 'yield', 'stop']));
    }
  }
  assert.equal(signalAt(240, 240, 'x', 0), null);
});

test('moving traffic reaches the starting block in groups with quiet periods between them', () => {
  const game = new Game();
  const drivers = new Set();
  let peak = 0, quietSeconds = 0, longestLull = 0;
  for (let tick = 0; tick < 5 * 60; tick++) {
    game.update(0.2);
    const nearby = game.cars.filter(car => car.owner === 'traffic' && car.speed > 0.5 &&
      Math.hypot(car.x - game.player.x, car.z - game.player.z) < 32);
    for (const car of nearby) drivers.add(car.id);
    peak = Math.max(peak, nearby.length);
    quietSeconds = nearby.length ? 0 : quietSeconds + 0.2;
    longestLull = Math.max(longestLull, quietSeconds);
  }
  assert.ok(drivers.size >= 4 && peak >= 2, 'several distinct drivers passed, some together');
  assert.ok(longestLull > 3, 'traffic cleared for a few seconds');
});

test('traffic queues behind the stop line on red and both drivers leave on green', () => {
  const game = new Game();
  const front = northboundTraffic(game, 35, 10);
  const back = {...northboundTraffic(game, 53, 12), id: 'follower'};
  game.cars = [front, back];
  game.peds = [];
  Object.assign(game.player, {x: 13, z: 25});
  game.time = startOf('stop');

  let closestGap = Infinity;
  while (centralSignal(game.time + frame) === 'stop') {
    game.update(frame);
    closestGap = Math.min(closestGap, back.z - front.z);
    assert.ok(front.z - 2.5 >= stopLineOffset - 0.1, 'front bumper stayed behind the stop line');
  }
  assert.ok(front.speed < 0.1 && back.speed < 0.1);
  assert.ok(front.z < stopLineOffset + 5, 'first car reached the line');
  assert.ok(closestGap >= 5 && back.z - front.z < 16, 'queued cars kept a bumper gap');
  advance(game, 8);
  assert.ok(front.z < -5 && back.z < 0, 'both cars drove into the intersection');
});

test('amber lets an already committed driver clear while a driver with room to brake stops', () => {
  for (const [start, shouldClear] of [[stopLineOffset + 3, true], [stopLineOffset + 24, false]]) {
    const game = new Game();
    const car = northboundTraffic(game, start, 10);
    game.cars = [car];
    game.peds = [];
    Object.assign(game.player, {x: 13, z: 25});
    game.time = startOf('yield');
    advance(game, 5);
    assert.equal(centralSignal(game.time), 'stop');
    if (shouldClear) assert.ok(car.z < -5, 'driver too close to stop continued through');
    else assert.ok(car.z - 2.5 >= stopLineOffset - 0.1 && car.speed < 0.1, 'driver stopped before the line');
  }
});

test('adaptive cruise waits on red, resumes on green, and keeps the gas override', () => {
  for (const override of [false, true]) {
    const game = new Game();
    game.interact();
    const car = game.car;
    Object.assign(car, {x: 2.545, z: 37, heading: 0, speed: 9});
    game.cars = [car];
    game.peds = [];
    game.time = startOf('stop');
    game.toggleCruise();
    advance(game, 7);
    assert.equal(game.cruise.active, true);
    assert.equal(centralSignal(game.time), 'stop');
    assert.ok(car.speed < 0.1 && car.z - 2.5 >= stopLineOffset - 0.1);
    if (override) {
      advance(game, 2, {y: 1});
      assert.equal(centralSignal(game.time), 'stop');
      assert.ok(car.z < stopLineOffset && game.cruise.overriding);
    } else {
      while (centralSignal(game.time + frame) === 'stop') game.update(frame);
      advance(game, 5);
      assert.ok(car.z < 0 && car.speed > 5);
    }
  }
});

test('a car taken from the expanded traffic fleet keeps its driver and position on continue', () => {
  const game = new Game();
  const car = game.cars.filter(c => c.owner === 'traffic').at(-1);
  Object.assign(game.player, {x: car.x, z: car.z});
  game.interact();
  assert.equal(game.car, car);
  advance(game, 0.3, {y: 1});
  const restored = new Game(JSON.parse(JSON.stringify(game.serialize())));
  assert.equal(restored.car.id, car.id);
  assert.equal(restored.car.owner, 'personal');
  assert.equal(restored.car.route, null);
  assert.deepEqual([restored.car.x, restored.car.z, restored.car.speed], [car.x, car.z, car.speed]);
});

test('new traffic leaves space for a driver continuing a save made with the original fleet', () => {
  const game = new Game();
  game.interact();
  const {x, z, heading} = game.cars.find(car => car.id === 'traffic-25');
  Object.assign(game.car, {x, z, heading});
  Object.assign(game.player, {x, z, heading});
  const save = game.serialize();
  save.cars = save.cars.filter(car => car.owner !== 'traffic' || Number(car.id.slice(8)) < 25);

  const restored = new Game(save);
  assert.deepEqual([restored.car.x, restored.car.z], [x, z]);
  const additions = restored.cars.filter(car => !save.cars.some(saved => saved.id === car.id));
  assert.ok(additions.length > 0);
  for (const car of additions) assert.ok(Math.hypot(car.x - x, car.z - z) > 6);
});
