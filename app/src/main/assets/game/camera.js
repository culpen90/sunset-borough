export class FollowCamera {
  constructor(initialHeading) {
    this.heading = initialHeading;
    this.freeLook = false;
    this.carOrbitTime = 0;
  }

  orbit(deltaYaw, driving) {
    if (!Number.isFinite(deltaYaw) || deltaYaw === 0) return;
    this.heading += deltaYaw;
    if (driving) this.carOrbitTime = 2.4;
    else this.freeLook = true;
  }

  update(game, dt, looking) {
    const {player, car} = game;
    let followRate = 8;
    if (car) {
      this.freeLook = false;
      this.carOrbitTime = Math.max(0, this.carOrbitTime - dt);
      if (this.carOrbitTime > 0) return;
      followRate = Math.abs(car.speed) > 1 ? 4.5 : 2.2;
    } else {
      this.carOrbitTime = 0;
      if (this.freeLook && (looking || !player.moving)) return;
      this.freeLook = false;
    }
    const delta = player.heading - this.heading;
    const turn = Math.atan2(Math.sin(delta), Math.cos(delta));
    this.heading += turn * (1 - Math.exp(-followRate * dt));
  }
}
