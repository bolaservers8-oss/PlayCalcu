const WIDTH = 960;
const HEIGHT = 540;
const PLAYER_RADIUS = 12;
const PLAYER_SPEED = 190;
const ENEMY_RADIUS = 12;
const PLAYER_COLORS = ['#52f0d0', '#ffb65c'];

const ARENA = {
  width: WIDTH,
  height: HEIGHT,
  walls: [
    { x: 0, y: 0, width: WIDTH, height: 18 },
    { x: 0, y: HEIGHT - 18, width: WIDTH, height: 18 },
    { x: 0, y: 0, width: 18, height: HEIGHT },
    { x: WIDTH - 18, y: 0, width: 18, height: HEIGHT },
    { x: 208, y: 88, width: 20, height: 160 },
    { x: 208, y: 326, width: 20, height: 126 },
    { x: 385, y: 18, width: 20, height: 114 },
    { x: 385, y: 210, width: 20, height: 132 },
    { x: 562, y: 88, width: 20, height: 160 },
    { x: 562, y: 326, width: 20, height: 126 },
    { x: 278, y: 266, width: 90, height: 18 },
    { x: 454, y: 266, width: 90, height: 18 },
    { x: 715, y: 168, width: 105, height: 18 }
  ],
  doors: [
    { id: 'door-west', x: 208, y: 248, width: 20, height: 78, open: false },
    { id: 'door-center', x: 385, y: 132, width: 20, height: 78, open: false },
    { id: 'door-east', x: 562, y: 248, width: 20, height: 78, open: false }
  ],
  cover: [
    { x: 96, y: 176, width: 58, height: 22 },
    { x: 284, y: 124, width: 52, height: 30 },
    { x: 292, y: 384, width: 68, height: 22 },
    { x: 466, y: 112, width: 62, height: 22 },
    { x: 466, y: 388, width: 62, height: 22 },
    { x: 642, y: 334, width: 72, height: 22 },
    { x: 812, y: 284, width: 54, height: 30 }
  ],
  exit: { x: 900, y: 270, radius: 25 }
};

export function createNexoGame(room) {
  room.game = {
    map: structuredClone(ARENA),
    enemies: [
      { id: 'guard-a', x: 126, y: 94, homeX: 126, homeY: 94, hp: 1, alert: 0, cooldown: 0, phase: 0, type: 'scout' },
      { id: 'guard-b', x: 318, y: 190, homeX: 318, homeY: 190, hp: 1, alert: 0, cooldown: 0.5, phase: 1.4, type: 'scout' },
      { id: 'guard-c', x: 486, y: 78, homeX: 486, homeY: 78, hp: 2, alert: 0, cooldown: 1, phase: 2.8, type: 'heavy' },
      { id: 'guard-d', x: 664, y: 236, homeX: 664, homeY: 236, hp: 1, alert: 0, cooldown: 0.2, phase: 4.2, type: 'scout' },
      { id: 'guard-e', x: 814, y: 410, homeX: 814, homeY: 410, hp: 2, alert: 0, cooldown: 1.4, phase: 5.2, type: 'heavy' }
    ],
    playerShots: [],
    enemyShots: [],
    pickups: [
      { id: 'ammo-a', type: 'ammo', x: 296, y: 310, amount: 8, collected: false },
      { id: 'ammo-b', type: 'ammo', x: 690, y: 100, amount: 8, collected: false }
    ],
    score: 0,
    nextProjectileId: 0,
    lastSnapshotAt: 0,
    result: null,
    exitUnlocked: false
  };
  room.players.forEach((player, index) => {
    player.ready = false;
    player.spawnX = 72 + index * 44;
    player.spawnY = 270 + (index ? 22 : -22);
    player.x = player.spawnX;
    player.y = player.spawnY;
    player.angle = 0;
    player.lives = 3;
    player.score = 0;
    player.ammo = 10;
    player.weapon = 'sidearm';
    player.invulnerable = 0;
    player.fireCooldown = 0;
    player.meleeCooldown = 0;
    player.previousInteract = false;
    player.input = emptyInput();
    player.lastInputAt = Date.now();
  });
  room.phase = 'running';
}

function emptyInput() {
  return { moveX: 0, moveY: 0, aimX: 0, aimY: 0, shoot: false, melee: false, interact: false };
}

export function nexoGameSnapshot(room) {
  const game = room.game;
  if (!game) return null;
  return {
    map: game.map,
    enemies: game.enemies.map((enemy) => ({ ...enemy })),
    playerShots: game.playerShots.map((shot) => ({ ...shot })),
    enemyShots: game.enemyShots.map((shot) => ({ ...shot })),
    pickups: game.pickups.map((pickup) => ({ ...pickup })),
    score: game.score,
    exitUnlocked: game.exitUnlocked,
    result: game.result,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: PLAYER_COLORS[room.players.indexOf(player) % PLAYER_COLORS.length],
      x: player.x,
      y: player.y,
      angle: player.angle,
      lives: player.lives,
      score: player.score,
      ammo: player.ammo,
      weapon: player.weapon,
      invulnerable: player.invulnerable,
      connected: player.connected
    }))
  };
}

function overlapsCircleRect(x, y, radius, rect) {
  const closestX = Math.max(rect.x, Math.min(x, rect.x + rect.width));
  const closestY = Math.max(rect.y, Math.min(y, rect.y + rect.height));
  const dx = x - closestX;
  const dy = y - closestY;
  return dx * dx + dy * dy < radius * radius;
}

function solidRects(game) {
  return [...game.map.walls, ...game.map.doors.filter((door) => !door.open), ...game.map.cover];
}

function blocked(game, x, y, radius) {
  return solidRects(game).some((rect) => overlapsCircleRect(x, y, radius, rect));
}

function moveEntity(game, entity, dx, dy, radius) {
  const nextX = Math.max(radius + 18, Math.min(WIDTH - radius - 18, entity.x + dx));
  if (!blocked(game, nextX, entity.y, radius)) entity.x = nextX;
  const nextY = Math.max(radius + 18, Math.min(HEIGHT - radius - 18, entity.y + dy));
  if (!blocked(game, entity.x, nextY, radius)) entity.y = nextY;
}

function lineBlocked(game, x1, y1, x2, y2) {
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(distance / 12);
  const solids = solidRects(game);
  for (let step = 1; step < steps; step++) {
    const x = x1 + (x2 - x1) * step / steps;
    const y = y1 + (y2 - y1) * step / steps;
    if (solids.some((rect) => x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height)) {
      return true;
    }
  }
  return false;
}

function damagePlayer(player) {
  if (player.lives <= 0 || player.invulnerable > 0) return;
  player.lives -= 1;
  player.invulnerable = 1.2;
  if (player.lives > 0) {
    player.x = player.spawnX;
    player.y = player.spawnY;
  }
}

function knockOutEnemy(game, index, room) {
  const [enemy] = game.enemies.splice(index, 1);
  game.score += enemy.type === 'heavy' ? 180 : 100;
  const scorer = room.players.find((player) => player.id === enemy.lastHitBy);
  if (scorer) scorer.score += enemy.type === 'heavy' ? 180 : 100;
}

function finishNexoGame(room, result, finishGame) {
  if (room.game.result) return;
  room.game.result = result;
  finishGame(room);
}

export function tickNexoGame(room, delta, now, finishGame) {
  if (room.phase !== 'running' || !room.game) return;
  const game = room.game;
  const connectedPlayers = room.players.filter((player) => player.connected && player.lives > 0);

  for (const player of room.players) {
    if (!player.connected || player.lives <= 0) continue;
    if (now - player.lastInputAt > 300) player.input = emptyInput();
    const input = player.input;
    const moveLength = Math.hypot(input.moveX, input.moveY);
    if (moveLength > 0) {
      moveEntity(game, player, input.moveX / moveLength * PLAYER_SPEED * delta,
        input.moveY / moveLength * PLAYER_SPEED * delta, PLAYER_RADIUS);
    }
    if (Number.isFinite(input.aimX) && Number.isFinite(input.aimY)) {
      player.angle = Math.atan2(input.aimY - player.y, input.aimX - player.x);
    }
    player.invulnerable = Math.max(0, player.invulnerable - delta);
    player.fireCooldown = Math.max(0, player.fireCooldown - delta);
    player.meleeCooldown = Math.max(0, player.meleeCooldown - delta);
    if (input.interact && !player.previousInteract) {
      const door = game.map.doors.find((entry) =>
        Math.hypot(player.x - (entry.x + entry.width / 2), player.y - (entry.y + entry.height / 2)) < 58
      );
      if (door) door.open = !door.open;
    }
    player.previousInteract = input.interact;

    if (input.shoot && player.ammo > 0 && player.fireCooldown <= 0) {
      const speed = 520;
      game.playerShots.push({
        id: ++game.nextProjectileId,
        ownerId: player.id,
        x: player.x + Math.cos(player.angle) * 18,
        y: player.y + Math.sin(player.angle) * 18,
        vx: Math.cos(player.angle) * speed,
        vy: Math.sin(player.angle) * speed,
        life: 1.5
      });
      player.ammo -= 1;
      player.fireCooldown = 0.22;
      game.enemies.forEach((enemy) => {
        if (Math.hypot(enemy.x - player.x, enemy.y - player.y) < 280) enemy.alert = 5;
      });
    }

    if (input.melee && player.meleeCooldown <= 0) {
      player.meleeCooldown = 0.48;
      const target = game.enemies.find((enemy) => {
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const distance = Math.hypot(dx, dy);
        const angleDifference = Math.atan2(Math.sin(Math.atan2(dy, dx) - player.angle),
          Math.cos(Math.atan2(dy, dx) - player.angle));
        return distance < 38 && Math.abs(angleDifference) < 0.95;
      });
      if (target) {
        target.hp -= 1;
        target.lastHitBy = player.id;
        target.alert = 5;
        if (target.hp <= 0) knockOutEnemy(game, game.enemies.indexOf(target), room);
      }
    }
  }

  for (let index = game.playerShots.length - 1; index >= 0; index--) {
    const shot = game.playerShots[index];
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    shot.life -= delta;
    if (shot.life <= 0 || blocked(game, shot.x, shot.y, 3)) {
      game.playerShots.splice(index, 1);
      continue;
    }
    const enemyIndex = game.enemies.findIndex((enemy) =>
      Math.hypot(enemy.x - shot.x, enemy.y - shot.y) < ENEMY_RADIUS + 4
    );
    if (enemyIndex !== -1) {
      const enemy = game.enemies[enemyIndex];
      enemy.hp -= 1;
      enemy.lastHitBy = shot.ownerId;
      enemy.alert = 5;
      game.playerShots.splice(index, 1);
      if (enemy.hp <= 0) knockOutEnemy(game, enemyIndex, room);
    }
  }

  for (const enemy of game.enemies) {
    enemy.alert = Math.max(0, enemy.alert - delta);
    enemy.cooldown = Math.max(0, enemy.cooldown - delta);
    const target = connectedPlayers
      .filter((player) => player.lives > 0)
      .sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y))[0];
    if (!target) continue;
    const distance = Math.hypot(target.x - enemy.x, target.y - enemy.y);
    const seesTarget = distance < 340 && !lineBlocked(game, enemy.x, enemy.y, target.x, target.y);
    if (seesTarget) enemy.alert = Math.max(enemy.alert, 1.5);
    if (enemy.alert > 0) {
      if (distance > 120) {
        const dx = (target.x - enemy.x) / Math.max(distance, 1);
        const dy = (target.y - enemy.y) / Math.max(distance, 1);
        moveEntity(game, enemy, dx * 54 * delta, dy * 54 * delta, ENEMY_RADIUS);
      } else if (enemy.cooldown <= 0 && seesTarget) {
        const angle = Math.atan2(target.y - enemy.y, target.x - enemy.x);
        const speed = enemy.type === 'heavy' ? 240 : 285;
        game.enemyShots.push({
          id: ++game.nextProjectileId,
          x: enemy.x + Math.cos(angle) * 16,
          y: enemy.y + Math.sin(angle) * 16,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 2
        });
        enemy.cooldown = enemy.type === 'heavy' ? 1.1 : 0.85;
      }
    } else {
      enemy.phase += delta;
      enemy.x = enemy.homeX + Math.sin(enemy.phase * 0.6) * 12;
      enemy.y = enemy.homeY + Math.cos(enemy.phase * 0.5) * 8;
    }
  }

  for (let index = game.enemyShots.length - 1; index >= 0; index--) {
    const shot = game.enemyShots[index];
    shot.x += shot.vx * delta;
    shot.y += shot.vy * delta;
    shot.life -= delta;
    if (shot.life <= 0 || blocked(game, shot.x, shot.y, 3)) {
      game.enemyShots.splice(index, 1);
      continue;
    }
    const target = room.players.find((player) =>
      player.connected && player.lives > 0 && player.invulnerable <= 0 &&
      Math.hypot(player.x - shot.x, player.y - shot.y) < PLAYER_RADIUS + 4
    );
    if (target) {
      damagePlayer(target);
      game.enemyShots.splice(index, 1);
    }
  }

  for (const player of room.players) {
    if (!player.connected || player.lives <= 0) continue;
    for (const pickup of game.pickups) {
      if (pickup.collected || Math.hypot(player.x - pickup.x, player.y - pickup.y) > 24) continue;
      pickup.collected = true;
      player.ammo = Math.min(30, player.ammo + pickup.amount);
    }
    if (inputCanInteract(player) && game.enemies.length === 0 &&
        Math.hypot(player.x - game.map.exit.x, player.y - game.map.exit.y) < game.map.exit.radius + 22) {
      game.exitUnlocked = true;
      finishNexoGame(room, 'victory', finishGame);
      return;
    }
  }

  if (!room.players.some((player) => player.connected && player.lives > 0)) {
    finishNexoGame(room, 'defeat', finishGame);
    return;
  }
  game.exitUnlocked = game.enemies.length === 0;
}

function inputCanInteract(player) {
  return Boolean(player.input && player.input.interact);
}
