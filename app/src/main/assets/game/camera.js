export class FollowCamera {
  constructor(initialHeading) {
    this.heading = initialHeading;
    this.carOrbitTime = 0;
  }

  orbit(deltaYaw, driving) {
    if (!Number.isFinite(deltaYaw) || deltaYaw === 0) return;
    this.heading += deltaYaw;
    if (driving) this.carOrbitTime = 2.4;
  }

  update(game, dt) {
    if (dt <= 0) return;
    const {player, car} = game;
    if (!car) {
      this.carOrbitTime = 0;
      return;
    }
    this.carOrbitTime = Math.max(0, this.carOrbitTime - dt);
    if (this.carOrbitTime > 0) return;
    const delta = player.heading - this.heading;
    const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
    const followRate = Math.abs(car.speed) > 1 ? 4.5 : 2.2;
    this.heading += turn * (1 - Math.exp(-followRate * dt));
  }
}
