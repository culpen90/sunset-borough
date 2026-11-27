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
  function advance(frames, input = {}, looking = false, stepsPerRender = 1) {
    for (let i = 0; i < frames; i++) {
      for (let step = 0; step < stepsPerRender; step++) game.update(frame, input);
      camera.update(game, stepsPerRender * frame, looking);
    }
  }
  return {player: game.player, camera, advance};
}

function facing(actual, expected, tolerance = 0.01) {
  assert.ok(Math.abs(difference(actual, expected)) < tolerance,
    `Expected heading ${actual} to face ${expected}`);
}

function gentleTurn(before, after, dt) {
  const degrees = Math.abs(difference(after, before)) * 180 / Math.PI;
  assert.ok(degrees <= 60 * dt + 1e-6,
    `Camera turned ${degrees.toFixed(2)}° in ${(1000 * dt).toFixed(1)} ms`);
}

test('reversing the stick eases the view behind the character at 60 and 10 FPS', () => {
  for (const stepsPerRender of [1, 6]) {
    const {player, camera, advance} = onFoot();
    advance(30, {y: 1});
    const initial = camera.heading;
    const dt = stepsPerRender * frame;
    for (let steps = 0; steps < 360; steps += stepsPerRender) {
      const before = camera.heading;
      advance(1, {y: -1}, false, stepsPerRender);
      gentleTurn(before, camera.heading, dt);
      if (steps + stepsPerRender === 6) facing(camera.heading, initial, 4 * Math.PI / 180);
    }
    facing(player.heading, Math.PI);
    facing(camera.heading, player.heading);
  }
});

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
  advance(300);
  facing(camera.heading, player.heading);
});

test('a held swipe overrides follow while walking and releasing it restores follow', () => {
  const {player, camera, advance} = onFoot();
  advance(15, {x: 1});
  const pressed = camera.heading;
  advance(15, {x: 1}, true);
  facing(camera.heading, pressed);
  camera.orbit(-Math.PI / 2, false);
  advance(90, {x: 1}, true);
  facing(camera.heading, pressed - Math.PI / 2);
  facing(player.heading, Math.PI / 2);
  assert.ok(player.x > 5 && Math.abs(player.z) < 0.001);
  const release = camera.heading;
  advance(1, {x: 1}, false, 6);
  gentleTurn(release, camera.heading, 6 * frame);
  advance(300, {x: 1});
  facing(camera.heading, player.heading);
});

test('holding sideways or backward walks straight as the camera follows the turn', () => {
  for (const [input, heading] of [[{x: 1}, Math.PI / 2], [{y: -1}, Math.PI]]) {
    const {player, camera, advance} = onFoot();
    advance(360, input);
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
