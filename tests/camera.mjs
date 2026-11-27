import assert from 'node:assert/strict';
import test from 'node:test';
import {FollowCamera} from '../app/src/main/assets/game/camera.js';
import {Game} from '../app/src/main/assets/game/game.js';

const frame = 1 / 60;
const difference = (to, from) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

function onFoot(heading = 0) {
  const game = new Game();
  Object.assign(game.player, {x: 0, z: 0, heading});
  game.cars = [];
  game.peds = [];
  const camera = new FollowCamera(heading);
  function advance(frames, input = {}, looking = false) {
    for (let i = 0; i < frames; i++) {
      game.update(frame, input);
      camera.update(game, frame, looking);
    }
  }
  return {player: game.player, camera, advance};
}

function facing(actual, expected, tolerance = 0.01) {
  assert.ok(Math.abs(difference(actual, expected)) < tolerance,
    `Expected heading ${actual} to face ${expected}`);
}

test('idle free look holds until a step, then finishes recentering after the player stops', () => {
  const {player, camera, advance} = onFoot(Math.PI / 2);
  facing(camera.heading, player.heading);
  camera.orbit(Math.PI / 2, false);
  advance(300, {x: 0.02});
  facing(camera.heading, Math.PI);
  facing(player.heading, Math.PI / 2);

  advance(1, {y: 1});
  assert.ok(player.x > 0 && Math.abs(player.z) < 0.001);
  assert.ok(Math.abs(difference(camera.heading, player.heading)) < Math.PI / 2);
  advance(120);
  facing(camera.heading, player.heading);
});

test('a held swipe overrides follow while walking and releasing it restores follow', () => {
  const {player, camera, advance} = onFoot();
  advance(15, {y: 1});
  camera.orbit(-Math.PI / 2, false);
  advance(90, {y: 1}, true);
  facing(camera.heading, -Math.PI / 2);
  facing(player.heading, 0);
  assert.ok(Math.abs(player.x) < 0.001 && player.z < -5);
  advance(120, {y: 1});
  facing(camera.heading, player.heading);
});

test('holding sideways or backward walks straight as the camera follows the turn', () => {
  for (const [input, heading] of [[{x: 1}, Math.PI / 2], [{y: -1}, Math.PI]]) {
    const {player, camera, advance} = onFoot();
    advance(120, input);
    assert.ok(Math.abs(player.x * Math.cos(heading) + player.z * Math.sin(heading)) < 0.01);
    assert.ok(player.x * Math.sin(heading) - player.z * Math.cos(heading) > 8);
    facing(player.heading, heading);
    facing(camera.heading, heading);

    advance(1);
    const {x, z} = player;
    advance(30, {y: 1});
    assert.ok((player.x - x) * Math.sin(heading) - (player.z - z) * Math.cos(heading) > 2);
  }
});

test('following a stationary turn across the angle boundary takes the shorter path', () => {
  const start = Math.PI - 0.1;
  const {player, camera, advance} = onFoot(start);
  player.heading = -Math.PI + 0.1;
  advance(1);
  const turn = difference(camera.heading, start);
  assert.ok(turn > 0 && turn <= 0.201);
  advance(120);
  facing(camera.heading, player.heading);
});
