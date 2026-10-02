/**
 * normalize.test.ts
 * Tests for the tidying of question and answer texts: capitals,
 * punctuation and spacing, which must look the same whatever the source.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllCaps, isTitleCase, normalizeAnswerText, normalizeQuestionText } from "../src/questions/normalize";

test("every question starts with a capital letter", () => {
    assert.equal(normalizeQuestionText("what is the capital of France?", "en"), "What is the capital of France?");
    assert.equal(normalizeQuestionText("¿cuál es la capital de Francia?", "es"), "¿Cuál es la capital de Francia?");
    assert.equal(normalizeQuestionText('"the sun" is a star?', "en"), '"The sun" is a star?');
});

test("questions end with a question mark and statements with a full stop", () => {
    assert.equal(normalizeQuestionText("What is the capital of France", "en"), "What is the capital of France?");
    assert.equal(normalizeQuestionText("The Earth orbits the Sun", "en"), "The Earth orbits the Sun.");
    assert.equal(normalizeQuestionText("Which of these is not a planet", "en"), "Which of these is not a planet?");
    assert.equal(normalizeQuestionText("Complete the saying: a rolling stone", "en"), "Complete the saying: a rolling stone.");
    // Already punctuated texts are left alone.
    assert.equal(normalizeQuestionText("Is it true?", "en"), "Is it true?");
    assert.equal(normalizeQuestionText("Name this song!", "en"), "Name this song!");
});

test("Spanish questions get their opening mark in the right place", () => {
    assert.equal(normalizeQuestionText("cuál es la capital de Francia", "es"), "¿Cuál es la capital de Francia?");
    assert.equal(normalizeQuestionText("Cuál es la capital de Francia?", "es"), "¿Cuál es la capital de Francia?");
    assert.equal(normalizeQuestionText("En 1990 se celebró un mundial. Quién ganó?", "es"), "En 1990 se celebró un mundial. ¿Quién ganó?");
    assert.equal(normalizeQuestionText("¿Quién pintó Las Meninas?", "es"), "¿Quién pintó Las Meninas?");
});

test("SHOUTING texts turn into normal sentences", () => {
    assert.ok(isAllCaps("WHAT IS THE CAPITAL OF FRANCE"));
    assert.ok(!isAllCaps("NASA"));
    assert.ok(!isAllCaps("What is NASA"));
    // All-caps source text carries no case information for proper nouns, so
    // only the first letter can be restored with confidence.
    assert.equal(normalizeQuestionText("WHAT IS THE CAPITAL OF FRANCE", "en"), "What is the capital of france?");
    assert.equal(normalizeAnswerText("THE BIG APPLE"), "The big apple");
    assert.equal(normalizeAnswerText("NASA"), "NASA");
});

test("Title Case questions are lowered before translating", () => {
    assert.ok(isTitleCase("Who Was The First Man On The Moon"));
    assert.ok(!isTitleCase("Who was the first man on the Moon"));
    assert.equal(normalizeQuestionText("Who Was The First Man On The Moon?", "en", true), "Who was the first man on the moon?");
    // Acronyms and brand names keep their capitals.
    assert.equal(normalizeQuestionText("Which Company Created The iPhone And The NASA Logo?", "en", true), "Which company created the iPhone and the NASA logo?");
});

test("answers start with a capital letter, except words like iPhone", () => {
    assert.equal(normalizeAnswerText("paris"), "Paris");
    assert.equal(normalizeAnswerText("  madrid  "), "Madrid");
    assert.equal(normalizeAnswerText("iPhone"), "iPhone");
    assert.equal(normalizeAnswerText("1969"), "1969");
});

test("spaces and spacing before punctuation are tidied", () => {
    assert.equal(normalizeQuestionText("  What   is  it ?  ", "en"), "What is it?");
    assert.equal(normalizeQuestionText("¿ Qué es esto ?", "es"), "¿Qué es esto?");
    assert.equal(normalizeQuestionText("", "en"), "");
});
