import assert from 'node:assert/strict';
import test from 'node:test';
import {Game} from '../app/src/main/assets/game/game.js';

const frame = 1 / 60;

function run(game, seconds, input = {}) {
  for (let n = 0; n < seconds * 60; n++) game.update(frame, input);
}

// Exercise the same input as the touch controls, including the time spent braking and cornering.
function driveTo(game, x, z) {
  for (let n = 0; n < 60 * 60; n++) {
    const car = game.car;
    assert.ok(car, 'Driver must still be in the vehicle');
    const distance = Math.hypot(x - car.x, z - car.z);
    if (distance < 3.7) return;
    const bearing = Math.atan2(x - car.x, car.z - z);
    const difference = bearing - car.heading;
    const turn = Math.atan2(Math.sin(difference), Math.cos(difference));
    const speed = Math.max(3.5, Math.min(26, distance * 0.72, 26 / (1 + Math.abs(turn) * 4)));
    game.update(frame, {
      x: Math.max(-1, Math.min(1, turn * 3)),
      y: speed > car.speed ? 1 : 0,
      brake: car.speed > speed + 1.25,
    });
  }
  assert.fail('Failed to reach (' + x + ', ' + z + ') during ' + game.objective);
}

function resume(game) {
  const data = JSON.parse(JSON.stringify(game.serialize()));
  const restored = new Game(data);
  assert.deepEqual(restored.serialize(), data);
  return restored;
}

test('complete every job through the controls, save mid-race and mid-pursuit, then replay', () => {
  let game = new Game();
  assert.equal(game.actionLabel, 'Enter car');
  game.interact();
  assert.equal(game.player.carId, 'comet');
  driveTo(game, 5, -73);
  assert.equal(game.target.label, 'Marina club');
  driveTo(game, 5, -80);
  driveTo(game, 161, -80);
  assert.equal(game.cash, 450);
  assert.equal(game.cruiseUnlocked, false);

  driveTo(game, 165, -145);
  assert.ok(game.remainingTime > 0);
  game = resume(game);
  assert.equal(game.cruiseUnlocked, false);
  driveTo(game, 165, -160);
  driveTo(game, 4, -160);
  driveTo(game, -156, -160);
  driveTo(game, -156, -80);
  driveTo(game, -155, 80);
  assert.equal(game.cash, 1230);
  assert.equal(game.missionTitle, 'Hot Property');
  assert.equal(game.cruiseUnlocked, true);
  assert.match(game.notice, /Adaptive Cruise Control unlocked/);

  driveTo(game, -155, 151);
  run(game, 2, {brake: true});
  game.interact();
  assert.equal(game.player.carId, null);
  const pickup = game.cars.find(car => car.id === 'gullwing');
  const bearing = Math.atan2(pickup.x - game.player.x, game.player.z - pickup.z);
  const direction = bearing - game.player.heading;
  run(game, 1, {x: Math.sin(direction), y: Math.cos(direction)});
  game.interact();
  assert.equal(game.player.carId, 'gullwing');
  assert.equal(game.wanted, 2);
  game = resume(game);
  assert.equal(game.cruiseUnlocked, true);
  driveTo(game, 165, 160);
  if (game.wanted) {
    driveTo(game, 165, 238);
    driveTo(game, -155, 238);
    driveTo(game, 165, 238);
    driveTo(game, 165, 160);
  }
  assert.equal(game.wanted, 0);
  assert.equal(game.missionTitle, 'Free roam');
  assert.equal(game.completed, 3);
  assert.equal(game.cash, 2430);
  game.replayJobs();
  assert.equal(game.missionTitle, 'Night Dispatch');
  assert.equal(game.cash, 2430);
  assert.equal(game.cruiseUnlocked, true);
  assert.equal(resume(game).cruiseUnlocked, true);
});

test('cruise and its gap control are locked in a new game', () => {
  const game = new Game();
  game.interact();
  assert.ok(game.car);
  assert.equal(game.cruiseUnlocked, false);
  game.toggleCruise();
  game.cycleCruiseGap();
  assert.equal(game.cruise.active, false);
  assert.equal(game.cruise.gapCars, 2);
});

test('an expired Boulevard Run leaves cruise control locked', () => {
  const game = new Game({version: 2, missionIndex: 1, stage: 1, remainingTime: 0.5});
  game.interact();
  run(game, 1);
  assert.equal(game.remainingTime, null);
  assert.equal(game.stage, 0);
  assert.equal(game.cruiseUnlocked, false);
  game.toggleCruise();
  assert.equal(game.cruise.active, false);
});

test('legacy saves credit a completed Boulevard Run toward the cruise unlock', () => {
  const raceWon = new Game({version: 1, missionIndex: 2, completed: 2});
  const replaying = new Game({version: 1, missionIndex: 0, completed: 3});
  assert.equal(raceWon.cruiseUnlocked, true);
  assert.equal(replaying.cruiseUnlocked, true);
});
