/**
 * links.test.ts
 * Tests for the recognition of YouTube and Spotify links.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMusicLink } from "../src/audio/links";

test("recognises YouTube videos in all their formats", () => {
    const expected = { platform: "youtube", videoId: "dQw4w9WgXcQ", playlistId: undefined };
    for (const link of [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
        "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://music.youtube.com/watch?v=dQw4w9WgXcQ&feature=share",
        "https://youtu.be/dQw4w9WgXcQ?si=abc123",
        "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
        "https://www.youtube.com/live/dQw4w9WgXcQ",
        "  www.youtube.com/watch?v=dQw4w9WgXcQ  ",
    ]) {
        assert.deepEqual(parseMusicLink(link), expected, link);
    }
});

test("recognises YouTube playlists", () => {
    assert.deepEqual(parseMusicLink("https://www.youtube.com/playlist?list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI"), {
        platform: "youtube",
        videoId: undefined,
        playlistId: "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    });
    assert.deepEqual(parseMusicLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI&index=2"), {
        platform: "youtube",
        videoId: "dQw4w9WgXcQ",
        playlistId: "PLFgquLnL59alCl_2TQvOiD5Vgm1hCaGSI",
    });
});

test("recognises Spotify links and URIs", () => {
    assert.deepEqual(parseMusicLink("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M?si=1234"), { platform: "spotify", type: "playlist", id: "37i9dQZF1DXcBWIGoYBM5M" });
    assert.deepEqual(parseMusicLink("https://open.spotify.com/intl-es/track/4uLU6hMCjMI75M1A2tKUQC"), { platform: "spotify", type: "track", id: "4uLU6hMCjMI75M1A2tKUQC" });
    assert.deepEqual(parseMusicLink("spotify:album:1DFixLWuPkv3KT3TnV35m3"), { platform: "spotify", type: "album", id: "1DFixLWuPkv3KT3TnV35m3" });
});

test("rejects links that aren't YouTube or Spotify music", () => {
    for (const link of ["", "hello", "https://www.google.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=short", "https://www.youtube.com/@channel", "https://open.spotify.com/user/abc", "https://open.spotify.com/track/badid", "javascript:alert(1)"]) {
        assert.equal(parseMusicLink(link), null, link);
    }
});
