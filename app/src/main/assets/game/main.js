import { Game } from './game.js';
import { FollowCamera } from './camera.js';
import { drawMap } from './map.js';
import { Soundscape } from './sound.js';

const el = id => document.getElementById(id);
const saveKey = 'sunset-borough-save-v1';
const soundKey = 'sunset-borough-sound';
function read(key) { try { return localStorage.getItem(key); } catch (_) { return null; } }
function write(key, value) { try { localStorage.setItem(key, value); return true; } catch (_) { return false; } }
function savedGame() { try { return JSON.parse(read(saveKey)); } catch (_) { return null; } }
let game = new Game(savedGame()), view, panel = 'title', returnTo = 'title';
const camera = new FollowCamera(game.player.heading);
let loading = false, gameStarted = false, failedSave = false;
let previousFrame = 0, accumulator = 0, hudAfter = 0, nextSave = 0, savedRevision = game.revision;
let frameHandle = 0;
const sound = new Soundscape(read(soundKey) !== 'off');
const keys = new Set(), held = new Set();
const stick = { x: 0, y: 0, pointer: null };
let lookPointer = null, lookX = 0;

function setText(id, value) {
  const node = el(id);
  if (node.textContent !== value) node.textContent = value;
}
function icon(button, name) {
  const use = button.querySelector('use');
  if (use.getAttribute('href') !== '#' + name) use.setAttribute('href', '#' + name);
}
function setSoundButton() {
  for (const id of ['titleSound','pauseSound']) {
    icon(el(id), sound.enabled ? 'sound' : 'muted');
    el(id).setAttribute('aria-pressed', String(sound.enabled));
  }
  el('pauseSound').querySelector('span').textContent = sound.enabled ? 'Sound on' : 'Sound off';
}
function toggleSound() {
  sound.enabled = !sound.enabled;
  write(soundKey, sound.enabled ? 'on' : 'off');
  if (!sound.enabled) sound.stop();
  setSoundButton();
}
function save() {
  if (!gameStarted) return;
  const ok = write(saveKey, JSON.stringify(game.serialize()));
  if (!ok && !failedSave) game.message('Device storage is unavailable. Progress is temporary.', 6);
  failedSave = !ok;
  if (ok) savedRevision = game.revision;
  nextSave = game.time + 3;
}
function clearInput() {
  keys.clear();held.clear();stick.x=0;stick.y=0;stick.pointer=null;lookPointer=null;
  game.player.moving = game.player.running = false;
  el('stick').firstElementChild.style.transform = '';
  document.querySelectorAll('.pressed').forEach(btn => btn.classList.remove('pressed'));
}
function setPanel(next) {
  if (panel === 'play' && next !== 'play') { game.cancelCruise();save();sound.stop(); }
  clearInput();
  panel = next;
  el('titleScreen').hidden = next !== 'title';
  el('hud').hidden = next !== 'play';
  el('overlay').hidden = next === 'title' || next === 'play';
  for (const id of ['pause','map','help']) el(id+'Panel').hidden = next !== id;
  if (next === 'title') {
    el('play').firstChild.textContent = (gameStarted || savedGame() ? 'Continue' : 'Start game') + ' ';
  } else if (next === 'pause') {
    setText('pauseDistrict', game.district);
    el('replay').hidden = game.missionIndex < 3;
  } else if (next === 'map') {
    setText('mapDistrict', game.district);
    setText('mapGoal', game.target?.label || '');
    drawMap(el('atlas'), game, true);
  } else if (next === 'play') {
    previousFrame = 0;accumulator = 0;hudAfter = 0;
    sound.start();
    refreshHUD();
    if (!frameHandle) frameHandle = requestAnimationFrame(frame);
  }
}

// A fresh canvas is required when switching a WebGL element to a 2D context.
async function overhead() {
  const old = el('scene'), canvas = old.cloneNode(false);
  old.replaceWith(canvas);
  const { OverheadView } = await import('./overhead.js');
  return new OverheadView(canvas);
}
async function play() {
  if (loading) return;
  loading = true; el('play').disabled = true;
  el('play').firstChild.textContent = 'Loading city… ';
  el('loadError').hidden = true;
  try {
    if (!view) {
      try {
        const { CityView } = await import('./world.js');
        view = new CityView(el('scene'));
        view.render(game, 1/60, camera.heading);
      } catch (error) {
        console.warn('Switching to overhead view', error);
        view = await overhead();
        game.message('Overhead view · 3D graphics unavailable', 5);
      }
      el('scene').addEventListener('webglcontextlost', async event => {
        event.preventDefault();
        if (panel === 'play') setPanel('pause');
        view = await overhead();
        game.message('Overhead view · graphics context recovered', 4);
      }, { once: true });
    }
    gameStarted = true;
    setPanel(document.hidden ? 'pause' : 'play');
    save();
  } catch (error) {
    console.error(error);
    el('loadError').hidden = false;
    setPanel('title');
  } finally { loading = false;el('play').disabled = false; }
}
function pauseForSystem() { if (panel === 'play') setPanel('pause'); }
function subpanel(name) { returnTo = panel;setPanel(name); }
function back() {
  if (loading) return true;
  if (panel === 'title') return false;
  if (panel === 'play') setPanel('pause');
  else if (panel === 'pause') setPanel('play');
  else setPanel(returnTo);
  return true;
}
window.gameBack = back;
window.addEventListener('gamepause', pauseForSystem);
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseForSystem(); });
window.addEventListener('pagehide', save);
window.addEventListener('blur', clearInput);
window.addEventListener('resize', () => { if(panel==='map')drawMap(el('atlas'),game,true); });
document.addEventListener('contextmenu', e => e.preventDefault());

function refreshCruiseHUD() {
  const { active, driverSteering, maneuver, following, overriding, ending, setSpeedKph, gapCars } = game.cruise;
  el('cruiseToggle').setAttribute('aria-pressed', String(active));
  el('cruiseTarget').hidden = el('cruiseSlower').hidden = el('cruiseFaster').hidden = !active;
  setText('cruiseDistance', gapCars === 1 ? '1 car' : gapCars + ' cars');
  const gapLabel = gapCars === 1 ? '1 car length' : gapCars + ' car lengths';
  el('cruiseGap').setAttribute('aria-label', 'Change following gap, currently ' + gapLabel);
  if (!active) {
    setText('cruiseMode', 'Set cruise');
    setText('cruiseTarget', '');
    return;
  }
  const mode = driverSteering ? 'You steer' : overriding ? 'Gas override' : ending ? 'Road end'
    : following ? 'Following' : maneuver ? 'Centering' : 'Cruising';
  setText('cruiseMode', mode);
  setText('cruiseTarget', 'Set ' + setSpeedKph + ' km/h');
  el('cruiseSlower').disabled = setSpeedKph <= 20;
  el('cruiseFaster').disabled = setSpeedKph >= game.maxCruiseKph;
}

function refreshHUD() {
  const driving = game.player.carId != null;
  const action = game.actionLabel;
  el('stick').hidden = driving;el('steer').hidden = !driving;
  el('brake').hidden = el('reverse').hidden = !driving;
  el('strike').hidden = driving;el('speed').hidden = !driving;
  el('action').hidden = !action;
  el('action').querySelector('span').textContent = action;
  el('boost').querySelector('span').textContent = driving ? 'Gas' : 'Sprint';
  icon(el('boost'), driving ? 'pedal' : 'runIcon');
  icon(el('action'), driving ? 'exitIcon' : 'enterIcon');
  setText('wallet', '$' + game.cash.toLocaleString('en-US'));
  setText('heat', '★'.repeat(game.wanted) + '☆'.repeat(3-game.wanted));
  el('heat').setAttribute('aria-label', 'Wanted level ' + game.wanted + ' of 3');
  setText('jobName', game.missionTitle);setText('goal', game.objective);
  const range = game.distance == null ? '' : game.distance + ' m';
  const seconds = game.remainingTime == null ? null : Math.max(0, Math.ceil(game.remainingTime));
  const timer = seconds == null ? '' : Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0');
  setText('range', [range, timer].filter(Boolean).join('  ·  '));
  setText('district', game.district);
  if (driving) refreshCruiseHUD();
  if (driving && el('speed').dataset.value !== String(game.speedKph)) {
    el('speed').dataset.value = String(game.speedKph);
    el('speed').textContent = game.speedKph;
    const unit = document.createElement('small');unit.textContent='KM/H';el('speed').appendChild(unit);
  }
  el('notice').hidden = !game.notice;setText('notice', game.notice);
  el('capture').hidden = game.capture < .05;
  el('capture').querySelector('progress').value = game.capture;
  drawMap(el('radar'), game);
}
function frame(stamp) {
  frameHandle = 0;
  if (panel !== 'play') return;
  const dt = previousFrame ? Math.max(0, Math.min(.20, (stamp-previousFrame)/1000)) : 1/60;
  previousFrame = stamp;accumulator += dt;
  const driving = game.player.carId != null;
  const down = (...codes) => codes.some(code => keys.has(code) || held.has(code)) ? 1 : 0;
  const left = down('ArrowLeft','KeyA','left'), right = down('ArrowRight','KeyD','right');
  const input = {
    x: Math.min(1, Math.max(-1, stick.x + right - left)),
    steeringHeld: !!(right || left),
    y: Math.min(1, Math.max(-1, stick.y + down('ArrowUp','KeyW') - down('ArrowDown','KeyS','reverse') + (driving ? down('boost') : 0))),
    run: !!down('ShiftLeft','ShiftRight','boost'), brake: !!down('Space','brake'),
    reverse: !!down('ArrowDown','KeyS','reverse')
  };
  while (accumulator >= 1/60) { game.update(1/60, input); accumulator -= 1/60; }
  camera.update(game, Math.min(dt, .10), lookPointer !== null);
  view.render(game, dt, camera.heading);sound.update(game);
  if (game.time >= hudAfter) { refreshHUD(); hudAfter = game.time + .085; }
  if (game.time >= nextSave || game.revision !== savedRevision && !failedSave) save();
  frameHandle = requestAnimationFrame(frame);
}

function interact() { game.interact(); clearInput(); refreshHUD();save(); }
function strike() { game.strike();refreshHUD(); }
for (const id of ['left','right','boost','reverse','brake']) {
  const button = el(id);
  button.addEventListener('pointerdown', ev => {
    ev.preventDefault();button.setPointerCapture(ev.pointerId);held.add(id);button.classList.add('pressed');
  });
  const release = () => {held.delete(id);button.classList.remove('pressed');};
  button.addEventListener('pointerup',release);button.addEventListener('lostpointercapture',release);
}
const joystick = el('stick');
function moveStick(ev) {
  const rect = joystick.getBoundingClientRect();
  const dx = (ev.clientX - rect.left - rect.width/2) / (rect.width*.36);
  const dy = (ev.clientY - rect.top - rect.height/2) / (rect.height*.36);
  const norm = Math.max(1,Math.hypot(dx,dy));
  stick.x = dx/norm;stick.y = -dy/norm;
  joystick.firstElementChild.style.transform = 'translate('+stick.x*65+'%,'+(-stick.y*65)+'%)';
}
joystick.addEventListener('pointerdown',ev => {
  if (stick.pointer !== null) return;
  ev.preventDefault();joystick.setPointerCapture(ev.pointerId);stick.pointer=ev.pointerId;moveStick(ev);
});
joystick.addEventListener('pointermove',ev => { if(stick.pointer===ev.pointerId)moveStick(ev); });
joystick.addEventListener('lostpointercapture',ev => {
  if(stick.pointer!==ev.pointerId)return;
  stick.pointer=null;stick.x=0;stick.y=0;joystick.firstElementChild.style.transform='';
});
const look = el('lookZone');
look.addEventListener('pointerdown',ev => {
  if(lookPointer!==null)return;
  lookPointer=ev.pointerId;lookX=ev.clientX;look.setPointerCapture(ev.pointerId);
});
look.addEventListener('pointermove',ev => {
  if(ev.pointerId!==lookPointer)return;
  camera.orbit((lookX-ev.clientX)*.007, game.player.carId !== null);lookX=ev.clientX;
});
look.addEventListener('lostpointercapture',ev => {
  if(ev.pointerId===lookPointer)lookPointer=null;
});

el('play').onclick=play;
el('resume').onclick=() => setPanel('play');
el('titleHelp').onclick=el('helpOpen').onclick=() => subpanel('help');
el('radarButton').onclick=el('mapOpen').onclick=() => subpanel('map');
el('pauseButton').onclick=pauseForSystem;
el('action').onclick=interact;el('strike').onclick=strike;
const cruiseActions = {
  cruiseToggle: () => game.toggleCruise(),
  cruiseSlower: () => game.adjustCruiseSpeed(-5),
  cruiseFaster: () => game.adjustCruiseSpeed(5),
  cruiseGap: () => game.cycleCruiseGap()
};
for (const [id, action] of Object.entries(cruiseActions)) {
  el(id).onclick = () => { action(); refreshHUD(); };
}
const cruiseShortcuts = {
  KeyC: 'cruiseToggle', BracketLeft: 'cruiseSlower', BracketRight: 'cruiseFaster', KeyG: 'cruiseGap'
};
el('toTitle').onclick=() => {save();setPanel('title');};
el('titleSound').onclick=el('pauseSound').onclick=toggleSound;
el('replay').onclick=() => {game.replayJobs();save();setPanel('play');};
document.querySelectorAll('.back').forEach(button => {button.onclick=back;});
document.addEventListener('keydown',ev => {
  if (ev.code === 'Escape' && !ev.repeat) { ev.preventDefault();back();return; }
  if (ev.code === 'KeyM' && panel === 'map' && !ev.repeat) {back();return;}
  if (panel !== 'play') return;
  const cruiseButton = cruiseShortcuts[ev.code];
  if (cruiseButton && !el(cruiseButton).closest('[hidden]')) {
    ev.preventDefault();
    if (!ev.repeat) el(cruiseButton).click();
    return;
  }
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(ev.code)) ev.preventDefault();
  if (!ev.repeat) {
    if(ev.code==='KeyE')interact();
    if(ev.code==='KeyF')strike();
    if(ev.code==='KeyM'){subpanel('map');return;}
  }
  keys.add(ev.code);
});
document.addEventListener('keyup',ev => keys.delete(ev.code));
setSoundButton();setPanel('title');
