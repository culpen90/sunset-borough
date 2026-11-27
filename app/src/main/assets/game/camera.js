const MAX_FOOT_YAW_SPEED = Math.PI / 3; // 60 degrees per second
const FOOT_YAW_ACCELERATION = Math.PI; // 180 degrees per second squared

export class FollowCamera {
  constructor(initialHeading) {
    this.heading = initialHeading;
    this.freeLook = false;
    this.carOrbitTime = 0;
    this.footYawSpeed = 0;
  }

  orbit(deltaYaw, driving) {
    if (!Number.isFinite(deltaYaw) || deltaYaw === 0) return;
    this.heading += deltaYaw;
    if (driving) this.carOrbitTime = 2.4;
    else {
      this.freeLook = true;
      this.footYawSpeed = 0;
    }
  }

  update(game, dt, looking) {
    if (dt <= 0) return;
    const {player, car} = game;
    const delta = player.heading - this.heading;
    const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
    if (car) {
      this.footYawSpeed = 0;
      this.freeLook = false;
      this.carOrbitTime = Math.max(0, this.carOrbitTime - dt);
      if (this.carOrbitTime > 0) return;
      const followRate = Math.abs(car.speed) > 1 ? 4.5 : 2.2;
      this.heading += turn * (1 - Math.exp(-followRate * dt));
      return;
    }

    this.carOrbitTime = 0;
    if (looking || (this.freeLook && !player.moving)) {
      this.footYawSpeed = 0;
      return;
    }
    this.freeLook = false;

    // Ramp up from rest on each reversal, then ease out as the view aligns.
    const direction = Math.sign(turn);
    const speedAlongTurn = Math.max(0, direction * this.footYawSpeed);
    const speedLimit = Math.min(MAX_FOOT_YAW_SPEED, speedAlongTurn + FOOT_YAW_ACCELERATION * dt);
    const step = Math.min(speedLimit * dt, Math.abs(turn) * (1 - Math.exp(-4 * dt)));
    this.footYawSpeed = direction * step / dt;
    this.heading += direction * step;
  }
}
