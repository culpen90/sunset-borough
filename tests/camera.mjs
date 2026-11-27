import assert from 'node:assert/strict';
import test from 'node:test';
import {FollowCamera} from '../app/src/main/assets/game/camera.js';
import {Game} from '../app/src/main/assets/game/game.js';

const frame = 1 / 60;
const radians = degrees => degrees * Math.PI / 180;

function facing(actual, expected, tolerance = 0.01) {
  const difference = Math.atan2(Math.sin(actual - expected), Math.cos(actual - expected));
  assert.ok(Math.abs(difference) < tolerance, `Expected heading ${actual} to face ${expected}`);
}

function simulation(game, initialHeading = 0) {
  const {player} = game;
  const camera = new FollowCamera(initialHeading);
  function advance(frames, input = {}) {
    for (let i = 0; i < frames; i++) {
      game.update(frame, {...input, cameraHeading: camera.heading});
      camera.update(game, frame);
    }
  }
  function travel(frames, input) {
    const {x, z} = player;
    advance(frames, input);
    assert.ok(Math.hypot(player.x - x, player.z - z) > 0.001, 'Expected the character to move');
    return Math.atan2(player.x - x, z - player.z);
  }
  return {player, camera, advance, travel};
}

function onFoot(heading = 0) {
  const game = new Game();
  Object.assign(game.player, {x: 0, z: 0, heading});
  game.cars = [];
  game.peds = [];
  return simulation(game, heading);
}

test('a held forward input follows a swipe through the yaw boundary and keeps the view on release', () => {
  const start = radians(170);
  const {camera, advance, travel} = onFoot(start);
  facing(travel(12, {y: 1}), start);
  for (let i = 1; i <= 30; i++) {
    camera.orbit(radians(3), false);
    facing(travel(1, {y: 1}), start + radians(i * 3));
  }
  facing(travel(45, {y: 1}), start + radians(90));
  advance(90);
  facing(camera.heading, start + radians(90));
});

test('a swipe while idle sets the direction of the next diagonal step', () => {
  const {player, camera, advance, travel} = onFoot();
  camera.orbit(2 * Math.PI / 3, false);
  advance(60, {x: 0.02});
  assert.deepEqual([player.x, player.z], [0, 0]);
  facing(travel(30, {x: 0.5, y: 0.5}), 2 * Math.PI / 3 + Math.PI / 4);
  facing(camera.heading, 2 * Math.PI / 3);
});

test('switching from forward to backward and repeating a backstep preserves facing and view', () => {
  const heading = Math.PI / 2;
  const {player, camera, advance, travel} = onFoot(heading);
  facing(travel(30, {y: 1}), heading);
  for (let pull = 0; pull < 2; pull++) {
    facing(travel(90, {y: -1}), heading + Math.PI);
    facing(player.heading, heading);
    facing(camera.heading, heading);
    advance(1);
  }
});

for (const [side, sign] of [['left', -1], ['right', 1]]) {
  test(`sliding from ${side} to up after a swipe moves forward in the new view`, () => {
    const {camera, travel} = onFoot();
    facing(travel(45, {x: sign}), sign * Math.PI / 2);
    facing(camera.heading, 0);
    const yaw = sign * radians(100);
    camera.orbit(yaw, false);
    facing(travel(12, {x: sign}), yaw + sign * Math.PI / 2);
    facing(travel(24, {y: 1}), yaw);
    facing(camera.heading, yaw);
  });

  test(`sweeping from near-horizontal into a ${side} backstep keeps movement and facing smooth`, () => {
    const {player, camera, travel} = onFoot();
    const yaw = radians(-35);
    camera.orbit(yaw, false);
    function steer(degrees, frames) {
      const angle = sign * radians(degrees);
      facing(travel(frames, {x: 0.4 * Math.sin(angle), y: 0.4 * Math.cos(angle)}), yaw + angle);
    }
    function nudge(degrees) {
      const before = player.heading;
      steer(degrees, 1);
      facing(player.heading, before, radians(10));
      facing(camera.heading, yaw);
    }
    steer(90, 45);
    for (let degrees = 91; degrees <= 135; degrees++) nudge(degrees);
    for (let degrees = 134; degrees >= 90; degrees--) nudge(degrees);
  });
}

test('the driving camera follows a steered turn and recenters after a manual orbit', () => {
  const game = new Game();
  game.interact();
  assert.ok(game.car);
  const {camera, advance} = simulation(game, game.car.heading);
  advance(40, {y: 1});
  advance(40, {y: 1, x: 0.5});
  assert.ok(camera.heading > 0.1 && game.car.heading > camera.heading);
  advance(90, {brake: true});
  facing(camera.heading, game.car.heading);
  camera.orbit(Math.PI / 2, true);
  const manualView = camera.heading;
  advance(90);
  facing(camera.heading, manualView);
  advance(240);
  facing(camera.heading, game.car.heading);
});
