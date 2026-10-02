/**
 * questions.test.ts
 * Tests for the topics and their sources, the local question files and the
 * packing of questions for Versus challenges.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { ALL_LOCAL_FILES, TOPICS } from "../src/config/topics";
import { packQuestions, unpackQuestions } from "../src/questions/fixed";
import type { Question } from "../src/questions/model";

/** Minimum local questions per topic (to play offline). */
const MINIMUM_PER_TOPIC = 20;

test("every topic has its local file and a unique id", () => {
    for (const file of ALL_LOCAL_FILES) assert.ok(existsSync(`public/${file}`), `Missing public/${file}`);
    assert.equal(new Set(TOPICS.map((topic) => topic.id)).size, TOPICS.length, "Duplicate topic ids");
    assert.equal(TOPICS.length, 30);
});

test("every topic has an online source, so questions never have to come from the JSON files", () => {
    for (const topic of TOPICS) {
        assert.ok(topic.sources.length > 0, `${topic.id} has no online source`);
        assert.ok(topic.short.es.length <= 9 && topic.short.en.length <= 9, `${topic.id}: the short name doesn't fit on the plate`);
    }
});

test("local questions are well formed and not repeated", () => {
    const seen = new Set<string>();
    for (const name of readdirSync("public/questions")) {
        const questions: unknown = JSON.parse(readFileSync(`public/questions/${name}`, "utf8"));
        assert.ok(Array.isArray(questions), `${name} isn't a list`);
        assert.ok(questions.length >= MINIMUM_PER_TOPIC, `${name} has fewer than ${MINIMUM_PER_TOPIC} questions`);
        for (const question of questions as unknown[]) {
            assert.ok(Array.isArray(question) && question.length === 5, `${name}: ${JSON.stringify(question)}`);
            const texts = question as string[];
            assert.ok(texts.every((text) => typeof text === "string" && text.trim().length > 0), `${name}: empty text`);
            assert.equal(new Set(texts.slice(1)).size, 4, `${name}: repeated answers in "${texts[0]}"`);
            const key = texts[0].toLowerCase();
            assert.ok(!seen.has(key), `Repeated question: "${texts[0]}"`);
            seen.add(key);
        }
    }
});

test("Versus questions are packed from their original text and unpacked identically", () => {
    const original: Question = {
        text: "What is the capital of France?",
        answers: [
            { text: "Madrid", correct: false },
            { text: "Paris", correct: true },
            { text: "Rome", correct: false },
        ],
        language: "en",
        source: "trivia-api",
    };
    const translated: Question = {
        text: "¿Cuál es la capital de Francia?",
        answers: [
            { text: "Madrid", correct: false },
            { text: "París", correct: true },
            { text: "Roma", correct: false },
        ],
        language: "es",
        source: "trivia-api",
        original,
    };
    const packed = packQuestions([translated]);
    assert.deepEqual(packed, [{ e: original.text, r: ["Madrid", "Paris", "Rome"], c: 1, i: "en", s: "trivia-api" }]);
    assert.deepEqual(unpackQuestions(JSON.parse(JSON.stringify(packed))), [original]);
});

test("unpacking drops anything that isn't shaped like a question", () => {
    assert.deepEqual(unpackQuestions(null), []);
    assert.deepEqual(unpackQuestions({ e: "x" }), []);
    const questions = unpackQuestions([
        { e: "Good", r: ["a", "b"], c: 0, i: "es" },
        { e: "Correct out of range", r: ["a", "b"], c: 5, i: "es" },
        { e: "Single answer", r: ["a"], c: 0, i: "es" },
        { e: 3, r: ["a", "b"], c: 0 },
    ]);
    assert.equal(questions.length, 1);
    assert.equal(questions[0].text, "Good");
    assert.equal(questions[0].source, "local");
});
