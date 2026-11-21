const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function load(path, dependencies, globals = {}) {
  const exports = {};
  const { outputText } = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  });
  vm.runInNewContext(outputText, { exports, require: (name) => dependencies[name], ...globals });
  return exports;
}

test("the episode queue retains the online episode between two downloaded episodes", async () => {
  const api = load("src/api/utils.ts", { "../i18n/state": { getLocale: () => "ru" } });
  const requests = [];
  let streamReady = false;
  const { buildEpisodePlaylist, preparePlaylistEpisode } = load("src/services/episodePlaylist.ts", {
    "../api/utils": api,
    "../api/client": {
      rpcPrepareStream: async (...args) => {
        requests.push(args);
        return streamReady ? {
          success: true, stream_url: "http://localhost/api/stream?url=episode-2", torrent_hash: "torrent", duration: 900,
        } : { success: false };
      },
    },
  });
  const playlist = buildEpisodePlaylist([
    { index: 8, name: "S01E03.mp4", path: "/media/S01E03.mp4", downloaded: true },
    { index: 2, name: "S01E01.mp4", path: "/media/S01E01.mp4", downloaded: true },
    { index: 3, name: "S01E02.mp4", path: "S01E02.mp4", downloaded: false },
  ], { mediaId: 19, title: "Series", mediaType: "tv", duration: 800 }, "magnet");

  assert.equal(Array.from(playlist, (episode) => episode.episodeIndex).join(","), "2,3,8");
  assert.equal(playlist[0].downloaded, true);
  assert.equal((await preparePlaylistEpisode(playlist[0])).filePath, "/media/S01E01.mp4");
  assert.equal(requests.length, 0);
  assert.equal(playlist[1].downloaded, false);
  assert.equal(await preparePlaylistEpisode(playlist[1]), null);
  streamReady = true;
  const next = await preparePlaylistEpisode(playlist[1]);
  assert.deepEqual(requests, [[19, 3, true, "magnet"], [19, 3, true, "magnet"]]);
  assert.equal(next.isOnline, true);
  assert.equal(next.mediaInfo.episodeName, "S01E02.mp4");
  assert.equal(next.mediaInfo.duration, 900);
});

test("ending a video saves progress and notifies the end screen", () => {
  const video = new EventTarget();
  const saved = [];
  const removed = [];
  let cleanedUp;
  let ended = 0;
  const { useVideoEvents } = load("src/components/player/useVideoEvents.ts", {
    react: {
      useRef: (current) => ({ current }),
      useEffect: (effect) => { cleanedUp = effect(); },
    },
  }, { localStorage: { removeItem: (key) => removed.push(key) } });

  useVideoEvents({
    videoRef: { current: video },
    filePath: "/media/S01E01.mp4",
    title: "Series - S01E01",
    durationRef: { current: 900 },
    saveProgress: (...args) => saved.push(args),
    setErrorMsg: () => {},
    setIsPlaying: () => {},
    setIsBuffering: () => {},
    onPlaybackEnded: () => { ended++; },
  });
  video.dispatchEvent(new Event("ended"));
  assert.equal(ended, 1);
  assert.deepEqual(saved, [[0, 900]]);
  assert.ok(removed.includes("projacktor_progress_S01E01.mp4"));

  cleanedUp();
  video.dispatchEvent(new Event("ended"));
  assert.equal(ended, 1);
});
