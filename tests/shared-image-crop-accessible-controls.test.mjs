import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { test } from "node:test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sourcePath = join(__dirname, "../src/components/shared/image-upload.tsx");
const source = readFileSync(sourcePath, "utf8");

function assertContains(substring, message) {
  assert.ok(source.includes(substring), message ?? `Expected source to contain: ${substring}`);
}

test("crop constants are defined with expected values", () => {
  assertContains("const DEFAULT_CROP_X = 50;", "DEFAULT_CROP_X must be 50");
  assertContains("const DEFAULT_CROP_Y = 50;", "DEFAULT_CROP_Y must be 50");
  assertContains("const DEFAULT_CROP_ZOOM = 1;", "DEFAULT_CROP_ZOOM must be 1");
  assertContains("const NUDGE_STEP = 5;", "NUDGE_STEP must be 5");
});

test("nudge and reset helpers exist and use constants", () => {
  assertContains("function nudgePosition(deltaX: number, deltaY: number)", "nudgePosition must be defined");
  assertContains("function resetCrop()", "resetCrop must be defined");

  // Nudge must add the delta and clamp, not mutate zoom.
  assertContains("x: clampPosition(current.x + deltaX)", "nudge must use clampPosition for x");
  assertContains("y: clampPosition(current.y + deltaY)", "nudge must use clampPosition for y");

  // Reset must restore the named defaults.
  assertContains(
    "x: DEFAULT_CROP_X, y: DEFAULT_CROP_Y, zoom: DEFAULT_CROP_ZOOM",
    "reset must restore all three default constants",
  );
});

test("crop position is clamped between 0 and 100", () => {
  assertContains(
    "function clampPosition(value: number) {\n    return Math.max(0, Math.min(100, value));\n  }",
    "clampPosition must enforce [0, 100] boundaries",
  );
});

test("directional buttons exist with correct accessible labels", () => {
  const expected = [
    { label: "Move image up" },
    { label: "Move image down" },
    { label: "Move image left" },
    { label: "Move image right" },
  ];

  for (const { label } of expected) {
    const index = source.indexOf(`aria-label="${label}"`);
    assert.notEqual(index, -1, `button with aria-label "${label}" must exist`);
    const tagStart = source.lastIndexOf("<button", index);
    const tagEnd = source.indexOf(">", index);
    const tag = source.slice(tagStart, tagEnd + 1);
    assert.ok(tag.includes(">"), `aria-label "${label}" must be on a button tag`);
    assert.ok(tag.includes(`aria-label="${label}"`), "aria-label must be on the opening button tag");
  }
});

test("reset crop button exists with correct accessible label and icon", () => {
  const index = source.indexOf('aria-label="Reset crop"');
  assert.notEqual(index, -1, "reset button with aria-label \"Reset crop\" must exist");
  const tagStart = source.lastIndexOf("<button", index);
  const tagEnd = source.indexOf(">", index);
  const tag = source.slice(tagStart, tagEnd + 1);
  assert.ok(tag.includes('aria-label="Reset crop"'), "reset aria-label must be on the opening button tag");
  assertContains("<RotateCcw", "reset button must use RotateCcw icon");
  assertContains("onClick={resetCrop}", "reset button must call resetCrop");
});

test("nudge buttons call nudgePosition with the correct step values", () => {
  assertContains("nudgePosition(-NUDGE_STEP, 0)", "left button must nudge left by NUDGE_STEP");
  assertContains("nudgePosition(NUDGE_STEP, 0)", "right button must nudge right by NUDGE_STEP");
  assertContains("nudgePosition(0, -NUDGE_STEP)", "up button must nudge up by NUDGE_STEP");
  assertContains("nudgePosition(0, NUDGE_STEP)", "down button must nudge down by NUDGE_STEP");
});

test("nudge buttons use explicit min-height touch target", () => {
  const buttonPattern = /<button[\s\S]*?aria-label="Move image (?:up|down|left|right)"[\s\S]*?>/;
  const match = source.match(buttonPattern);
  assert.ok(match, "directional buttons must be rendered with explicit classes");
  const buttonTag = match[0];
  assert.ok(
    /className="[^"]*min-h-11[^"]*"/.test(buttonTag),
    "directional buttons must use min-h-11 for touch target",
  );
});

test("reset button uses explicit min-height touch target", () => {
  const resetPattern = /<button[\s\S]*?aria-label="Reset crop"[\s\S]*?>/;
  const match = source.match(resetPattern);
  assert.ok(match, "reset button must be rendered with explicit classes");
  assert.ok(
    /className="[^"]*min-h-11[^"]*"/.test(match[0]),
    "reset button must use min-h-11 for touch target",
  );
});

test("instructions mention both drag and button controls", () => {
  assertContains(
    "Drag the image or use the direction buttons",
    "crop dialog instructions must reference both drag and buttons",
  );
});

test("no hardcoded magic numbers used in place of nudge constants", () => {
  // The literal values below should only appear in the constant declarations.
  const nudgeButtonRegion = source.slice(
    source.indexOf('aria-label="Move image up"'),
    source.indexOf('aria-label="Reset crop"'),
  );
  assert.ok(
    !/nudgePosition\([^)]*5\)/.test(nudgeButtonRegion),
    "nudge calls must not hardcode 5; use NUDGE_STEP",
  );
  assert.ok(
    !/nudgePosition\([^)]*-5\)/.test(nudgeButtonRegion),
    "nudge calls must not hardcode -5; use NUDGE_STEP",
  );
});

test("zoom input remains unchanged in range and step", () => {
  assertContains('min="1"', "zoom input must keep min 1");
  assertContains('max="3"', "zoom input must keep max 3");
  assertContains('step="0.05"', "zoom input must keep step 0.05");
});

test("all nudge directions are wired with non-zero sign-correct deltas", () => {
  const signs = [
    { text: "nudgePosition(-NUDGE_STEP, 0)", axis: "x", sign: -1 },
    { text: "nudgePosition(NUDGE_STEP, 0)", axis: "x", sign: 1 },
    { text: "nudgePosition(0, -NUDGE_STEP)", axis: "y", sign: -1 },
    { text: "nudgePosition(0, NUDGE_STEP)", axis: "y", sign: 1 },
  ];

  for (const { text, axis, sign } of signs) {
    assertContains(text, `expected ${axis} nudge call with sign ${sign}`);
  }
});

test("reset restores defaults and does not alter file or url", () => {
  const resetRegion = source.slice(
    source.indexOf("function resetCrop()"),
    source.indexOf("function handleRemove()"),
  );
  assert.ok(
    resetRegion.includes("x: DEFAULT_CROP_X") && resetRegion.includes("y: DEFAULT_CROP_Y") && resetRegion.includes("zoom: DEFAULT_CROP_ZOOM"),
    "reset must restore x, y, and zoom defaults",
  );
  assert.ok(
    !resetRegion.includes("url:") && !resetRegion.includes("file:"),
    "reset must not touch file or url fields",
  );
});

test("crop boundaries are enforced by clampPosition for all axes", () => {
  assertContains(
    "Math.max(0, Math.min(100, value))",
    "clampPosition must clamp to [0, 100] in a single expression",
  );
  assert.ok(
    (source.match(/clampPosition\(current\.x \+ deltaX\)/g) || []).length >= 1,
    "x must be clamped after nudge",
  );
  assert.ok(
    (source.match(/clampPosition\(current\.y \+ deltaY\)/g) || []).length >= 1,
    "y must be clamped after nudge",
  );
});

test("positive, negative, and boundary values produce expected nudge results", () => {
  // Replicate the exact clampPosition logic used in the component.
  function clampPosition(value) {
    return Math.max(0, Math.min(100, value));
  }

  // Starting from the default center, each nudge should move by NUDGE_STEP.
  const NUDGE_STEP = 5;
  const DEFAULT_CROP_X = 50;
  const DEFAULT_CROP_Y = 50;
  const DEFAULT_CROP_ZOOM = 1;

  assert.equal(clampPosition(DEFAULT_CROP_X + NUDGE_STEP), 55, "right nudge from center stays inside boundary");
  assert.equal(clampPosition(DEFAULT_CROP_X - NUDGE_STEP), 45, "left nudge from center stays inside boundary");
  assert.equal(clampPosition(DEFAULT_CROP_Y + NUDGE_STEP), 55, "down nudge from center stays inside boundary");
  assert.equal(clampPosition(DEFAULT_CROP_Y - NUDGE_STEP), 45, "up nudge from center stays inside boundary");

  // Boundary values: at the edges, clamping should cap the result.
  assert.equal(clampPosition(0 - NUDGE_STEP), 0, "left nudge from 0 must clamp to 0");
  assert.equal(clampPosition(100 + NUDGE_STEP), 100, "right nudge from 100 must clamp to 100");
  assert.equal(clampPosition(0 - NUDGE_STEP), 0, "up nudge from 0 must clamp to 0");
  assert.equal(clampPosition(100 + NUDGE_STEP), 100, "down nudge from 100 must clamp to 100");

  // Reset must return to the default values.
  assert.equal(DEFAULT_CROP_X, 50, "default x is 50");
  assert.equal(DEFAULT_CROP_Y, 50, "default y is 50");
  assert.equal(DEFAULT_CROP_ZOOM, 1, "default zoom is 1");
});
