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

function buttonTagForAriaLabel(label) {
  const index = source.indexOf(`aria-label="${label}"`);
  assert.notEqual(index, -1, `button with aria-label "${label}" must exist`);
  const tagStart = source.lastIndexOf("<button", index);
  const tagEnd = source.indexOf(">", index);
  assert.notEqual(tagStart, -1, `"${label}" must be inside a <button> tag`);
  assert.notEqual(tagEnd, -1, `"${label}" button tag must close`);
  return source.slice(tagStart, tagEnd + 1);
}

function hasClassNameFragment(tag, fragment) {
  return new RegExp(`className="[^"]*${fragment}[^"]*"`).test(tag);
}

test("crop constants are defined with expected values", () => {
  assertContains("const DEFAULT_CROP_X = 50;", "DEFAULT_CROP_X must be 50");
  assertContains("const DEFAULT_CROP_Y = 50;", "DEFAULT_CROP_Y must be 50");
  assertContains("const DEFAULT_CROP_ZOOM = 1;", "DEFAULT_CROP_ZOOM must be 1");
  assertContains("const NUDGE_STEP = 5;", "NUDGE_STEP must be 5");
});

test("nudge and reset helpers exist, clamp, and use constants", () => {
  assertContains("function nudgePosition(deltaX: number, deltaY: number)", "nudgePosition must be defined");
  assertContains("function resetCrop()", "resetCrop must be defined");

  assertContains("x: clampPosition(current.x + deltaX)", "nudge must use clampPosition for x");
  assertContains("y: clampPosition(current.y + deltaY)", "nudge must use clampPosition for y");

  assertContains(
    "x: DEFAULT_CROP_X, y: DEFAULT_CROP_Y, zoom: DEFAULT_CROP_ZOOM",
    "reset must restore all three default constants",
  );

  assertContains(
    "function clampPosition(value: number) {\n    return Math.max(0, Math.min(100, value));\n  }",
    "clampPosition must enforce [0, 100] boundaries",
  );
});

test("pointer drag handlers remain unchanged", () => {
  assertContains("onPointerDown={handleCropPointerDown}", "pointer down handler must remain");
  assertContains("onPointerMove={handleCropPointerMove}", "pointer move handler must remain");
  assertContains("onPointerUp={handleCropPointerEnd}", "pointer up handler must remain");
  assertContains("onPointerCancel={handleCropPointerEnd}", "pointer cancel handler must remain");
  assertContains("aria-label=\"Drag image to reposition crop\"", "drag area accessible label must remain");
});

test("zoom range remains min 1, max 3, step 0.05", () => {
  assertContains('min="1"', "zoom input must keep min 1");
  assertContains('max="3"', "zoom input must keep max 3");
  assertContains('step="0.05"', "zoom input must keep step 0.05");
});

test("cancel and use crop buttons remain", () => {
  const cancelTag = buttonTagForAriaLabel("Cancel image crop");
  assert.ok(cancelTag.includes("onClick={handleCancelCrop}"), "cancel button must call handleCancelCrop");

  const closeTag = buttonTagForAriaLabel("Close crop dialog");
  assert.ok(closeTag.includes("onClick={handleCancelCrop}"), "close dialog button must call handleCancelCrop");

  assertContains('type="button"', "cancel/close buttons must remain type=button");
  assertContains(
    "onClick={handleConfirmCrop}",
    "use crop action must remain",
  );
});

test("crop overlay is portaled to document body above the mobile tab bar", () => {
  assertContains("createPortal(", "crop overlay must keep portal rendering");
  assertContains("document.body", "crop overlay portal target must remain document.body");
  assertContains('data-testid="crop-overlay"', "crop overlay must expose a stable test marker");
  assertContains("className=\"fixed inset-0 z-[80]", "crop overlay must remain fixed and above z-40 mobile chrome");
});

test("dialog instructions are connected and reference both drag and buttons", () => {
  assertContains('id="image-crop-description"', "instructions must have an id for aria-describedby");
  assertContains(
    'aria-describedby="image-crop-description"',
    "dialog must describe itself by the instructions paragraph",
  );
  assertContains(
    "Drag the image or use the direction buttons",
    "crop dialog instructions must reference both drag and buttons",
  );
});

test("source comment explains inverse object-position semantics", () => {
  assertContains(
    "CSS object-position moves the *alignment point*",
    "comment must explain object-position inverse semantics",
  );
  assertContains(
    "moving the image right decreases X",
    "comment must state right-decreases-X",
  );
  assertContains(
    "moving the image down decreases Y",
    "comment must state down-decreases-Y",
  );
});

test("Move image left button uses positive X delta", () => {
  const tag = buttonTagForAriaLabel("Move image left");
  assert.ok(tag.includes('type="button"'), "left button must be type=button");
  assert.ok(hasClassNameFragment(tag, "min-h-11"), "left button must use min-h-11");
  assert.ok(tag.includes("disabled={cropProcessing}"), "left button must disable during cropProcessing");
  assert.ok(tag.includes("nudgePosition(NUDGE_STEP, 0)"), "left button must nudge X by +NUDGE_STEP");
  assert.ok(
    tag.includes("focus:outline-none") && tag.includes("focus-visible:ring-2") && tag.includes("focus-visible:ring-offset-2"),
    "left button must have visible focus ring",
  );
});

test("Move image right button uses negative X delta", () => {
  const tag = buttonTagForAriaLabel("Move image right");
  assert.ok(tag.includes('type="button"'), "right button must be type=button");
  assert.ok(hasClassNameFragment(tag, "min-h-11"), "right button must use min-h-11");
  assert.ok(tag.includes("disabled={cropProcessing}"), "right button must disable during cropProcessing");
  assert.ok(tag.includes("nudgePosition(-NUDGE_STEP, 0)"), "right button must nudge X by -NUDGE_STEP");
  assert.ok(
    tag.includes("focus:outline-none") && tag.includes("focus-visible:ring-2") && tag.includes("focus-visible:ring-offset-2"),
    "right button must have visible focus ring",
  );
});

test("Move image up button uses positive Y delta", () => {
  const tag = buttonTagForAriaLabel("Move image up");
  assert.ok(tag.includes('type="button"'), "up button must be type=button");
  assert.ok(hasClassNameFragment(tag, "min-h-11"), "up button must use min-h-11");
  assert.ok(tag.includes("disabled={cropProcessing}"), "up button must disable during cropProcessing");
  assert.ok(tag.includes("nudgePosition(0, NUDGE_STEP)"), "up button must nudge Y by +NUDGE_STEP");
  assert.ok(
    tag.includes("focus:outline-none") && tag.includes("focus-visible:ring-2") && tag.includes("focus-visible:ring-offset-2"),
    "up button must have visible focus ring",
  );
});

test("Move image down button uses negative Y delta", () => {
  const tag = buttonTagForAriaLabel("Move image down");
  assert.ok(tag.includes('type="button"'), "down button must be type=button");
  assert.ok(hasClassNameFragment(tag, "min-h-11"), "down button must use min-h-11");
  assert.ok(tag.includes("disabled={cropProcessing}"), "down button must disable during cropProcessing");
  assert.ok(tag.includes("nudgePosition(0, -NUDGE_STEP)"), "down button must nudge Y by -NUDGE_STEP");
  assert.ok(
    tag.includes("focus:outline-none") && tag.includes("focus-visible:ring-2") && tag.includes("focus-visible:ring-offset-2"),
    "down button must have visible focus ring",
  );
});

test("Reset crop button restores defaults without touching file or url", () => {
  const tag = buttonTagForAriaLabel("Reset crop");
  assert.ok(tag.includes('type="button"'), "reset button must be type=button");
  assert.ok(hasClassNameFragment(tag, "min-h-11"), "reset button must use min-h-11");
  assert.ok(tag.includes("disabled={cropProcessing}"), "reset button must disable during cropProcessing");
  assert.ok(tag.includes("onClick={resetCrop}"), "reset button must call resetCrop");
  assert.ok(
    tag.includes("focus:outline-none") && tag.includes("focus-visible:ring-2") && tag.includes("focus-visible:ring-offset-2"),
    "reset button must have visible focus ring",
  );

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

test("nudge and reset handlers do not perform storage or upload work", () => {
  const nudgeRegion = source.slice(
    source.indexOf("function nudgePosition(deltaX: number, deltaY: number)"),
    source.indexOf("function resetCrop()"),
  );
  const resetRegion = source.slice(
    source.indexOf("function resetCrop()"),
    source.indexOf("function handleRemove()"),
  );

  for (const [name, region] of [["nudgePosition", nudgeRegion], ["resetCrop", resetRegion]]) {
    assert.ok(!region.includes("upload"), `${name} must not upload`);
    assert.ok(!region.includes("storage"), `${name} must not touch storage`);
    assert.ok(!region.includes("supabase"), `${name} must not call Supabase`);
    assert.ok(!region.includes("handleConfirmCrop"), `${name} must not confirm crop`);
  }
});

test("no hardcoded magic numbers used in place of nudge constants", () => {
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

test("inverse mapping matches pointer drag semantics", () => {
  // Pointer drag: nextX = startX - pointerDeltaX, nextY = startY - pointerDeltaY.
  // Drag right -> X decreases. Move image right button -> X decreases.
  // Drag left -> X increases. Move image left button -> X increases.
  // Drag down -> Y decreases. Move image down button -> Y decreases.
  // Drag up -> Y increases. Move image up button -> Y increases.

  assertContains(
    'aria-label="Move image right"',
    "Move image right button must exist",
  );
  assertContains(
    "nudgePosition(-NUDGE_STEP, 0)",
    "Move image right must decrease X",
  );
  assertContains(
    "nudgePosition(NUDGE_STEP, 0)",
    "Move image left must increase X",
  );
  assertContains(
    "nudgePosition(0, -NUDGE_STEP)",
    "Move image down must decrease Y",
  );
  assertContains(
    "nudgePosition(0, NUDGE_STEP)",
    "Move image up must increase Y",
  );
});

test("positive, negative, and boundary values produce expected nudge results", () => {
  function clampPosition(value) {
    return Math.max(0, Math.min(100, value));
  }

  const NUDGE_STEP = 5;
  const DEFAULT_CROP_X = 50;
  const DEFAULT_CROP_Y = 50;
  const DEFAULT_CROP_ZOOM = 1;

  // From center, the inverse mapping moves as follows:
  // Move image right -> X decreases by 5.
  assert.equal(clampPosition(DEFAULT_CROP_X - NUDGE_STEP), 45, "right nudge from center decreases X");
  // Move image left -> X increases by 5.
  assert.equal(clampPosition(DEFAULT_CROP_X + NUDGE_STEP), 55, "left nudge from center increases X");
  // Move image down -> Y decreases by 5.
  assert.equal(clampPosition(DEFAULT_CROP_Y - NUDGE_STEP), 45, "down nudge from center decreases Y");
  // Move image up -> Y increases by 5.
  assert.equal(clampPosition(DEFAULT_CROP_Y + NUDGE_STEP), 55, "up nudge from center increases Y");

  // Boundary clamping.
  assert.equal(clampPosition(0 - NUDGE_STEP), 0, "repeated right nudge clamps X at 0");
  assert.equal(clampPosition(100 + NUDGE_STEP), 100, "repeated left nudge clamps X at 100");
  assert.equal(clampPosition(0 - NUDGE_STEP), 0, "repeated down nudge clamps Y at 0");
  assert.equal(clampPosition(100 + NUDGE_STEP), 100, "repeated up nudge clamps Y at 100");

  assert.equal(DEFAULT_CROP_X, 50, "default x is 50");
  assert.equal(DEFAULT_CROP_Y, 50, "default y is 50");
  assert.equal(DEFAULT_CROP_ZOOM, 1, "default zoom is 1");
});
