export const DEFAULT_PLAYER_VALUES = Object.freeze({
  health: 100,
  stamina: 100
});

export function createInitialPlayerPayload(playerId, playerState, animation, health = DEFAULT_PLAYER_VALUES.health, stamina = DEFAULT_PLAYER_VALUES.stamina) {
  return {
    id: playerId,
    x: playerState.pos.x,
    y: playerState.pos.y,
    z: playerState.pos.z,
    rotation: playerState.rot,
    moving: false,
    animation,
    timestamp: Date.now(),
    health,
    stamina
  };
}

export function createPlayerTickPayload(playerState, animation, health = DEFAULT_PLAYER_VALUES.health, stamina = DEFAULT_PLAYER_VALUES.stamina) {
  return {
    x: playerState.pos.x,
    y: playerState.pos.y,
    z: playerState.pos.z,
    rotation: playerState.rot,
    moving: playerState.moving,
    animation,
    timestamp: Date.now(),
    health,
    stamina
  };
}

export function normalizeRemotePlayerData(data) {
  return {
    animation: data.animation || "idle",
    x: data.x || 0,
    y: data.y || 0,
    z: data.z || 0,
    rotation: data.rotation || 0,
    moving: data.moving || false,
    health: data.health || DEFAULT_PLAYER_VALUES.health,
    stamina: data.stamina || DEFAULT_PLAYER_VALUES.stamina
  };
}
