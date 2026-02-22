import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";

const loader = new GLTFLoader();
const glbPromiseCache = new Map();

const REMOTE_ANIMATIONS = Object.freeze({
  idle: "./model/idle.glb",
  walk: "./model/walk.glb",
  run: "./model/run.glb",
  idleSpecial: "./model/idle_special1.glb",
  emoteWave: "./model/emote_wave.glb",
  emoteLaugh: "./model/emote_laugh.glb",
  emotePoint: "./model/emote_point.glb"
});

function loadGlb(path) {
  if (glbPromiseCache.has(path)) return glbPromiseCache.get(path);

  const promise = new Promise((resolve) => {
    loader.load(
      path,
      (glb) => resolve(glb),
      undefined,
      () => resolve(null)
    );
  });
  glbPromiseCache.set(path, promise);
  return promise;
}

export async function loadRemoteAnimationSet() {
  const entries = await Promise.all(
    Object.entries(REMOTE_ANIMATIONS).map(async ([key, path]) => [key, await loadGlb(path)])
  );
  return Object.fromEntries(entries);
}
