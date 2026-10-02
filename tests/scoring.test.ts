/**
 * scoring.test.ts
 * Tests for the points of each hit, the slot multiplier and the number format.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { drawMultiplier, MAX_MULTIPLIER, MULTIPLIERS } from "../src/config/multipliers";
import { formatPoints, hitPoints } from "../src/game/scoring";

test("a hit without streak or clock is worth 100", () => {
    assert.equal(hitPoints({ streak: 1 }), 100);
});

test("the streak adds 20 per consecutive hit, up to +100", () => {
    assert.equal(hitPoints({ streak: 2 }), 120);
    assert.equal(hitPoints({ streak: 4 }), 160);
    assert.equal(hitPoints({ streak: 6 }), 200);
    assert.equal(hitPoints({ streak: 30 }), 200);
});

test("speed adds up to 50 depending on the time left", () => {
    assert.equal(hitPoints({ streak: 1, secondsLeft: 10, secondsPerQuestion: 10 }), 150);
    assert.equal(hitPoints({ streak: 1, secondsLeft: 5, secondsPerQuestion: 10 }), 125);
    assert.equal(hitPoints({ streak: 1, secondsLeft: -2, secondsPerQuestion: 10 }), 100);
    assert.equal(hitPoints({ streak: 1, secondsLeft: 8, secondsPerQuestion: null }), 100);
});

test("the multiplier scales the points and the maximum matches the database (2,500)", () => {
    assert.equal(hitPoints({ streak: 1, multiplier: 2 }), 200);
    assert.equal(hitPoints({ streak: 1, multiplier: 5 }), 500);
    // Most a hit can be worth: Double or nothing (×2) with the ×5 reel.
    assert.equal(hitPoints({ streak: 99, secondsLeft: 20, secondsPerQuestion: 20, multiplier: 2 * MAX_MULTIPLIER }), 2500);
});

test("formats thousands according to the language", () => {
    assert.equal(formatPoints(0, "es"), "0");
    assert.equal(formatPoints(1234, "es"), "1.234");
    assert.equal(formatPoints(1234567, "en"), "1,234,567");
});

test("the multiplier reel goes from ×1 to ×5 and higher ones are rarer", () => {
    assert.deepEqual(MULTIPLIERS.map((item) => item.value), [1, 2, 3, 4, 5]);
    for (let i = 1; i < MULTIPLIERS.length; i++) assert.ok(MULTIPLIERS[i].weight < MULTIPLIERS[i - 1].weight);
    assert.equal(drawMultiplier(0), 1);
    assert.equal(drawMultiplier(0.999999), 5);
    // Over many draws every value comes up and ×1 is the most common.
    const counts = new Map<number, number>();
    for (let i = 0; i < 4000; i++) {
        const value = drawMultiplier(i / 4000);
        counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    assert.equal(counts.size, 5);
    assert.ok((counts.get(1) ?? 0) > (counts.get(5) ?? 0) * 3);
});
