import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const controls = [
  {
    file: "src/app/reports/print-button.tsx",
    label: "Print Report",
  },
  {
    file: "src/app/repairs/[id]/print-button.tsx",
    label: "Print A4",
  },
  {
    file: "src/app/repairs/[id]/print-button.tsx",
    label: "Print 80mm",
  },
  {
    file: "src/app/repairs/[id]/print-button.tsx",
    label: "Share WhatsApp",
  },
  {
    file: "src/app/returns/[id]/print-button.tsx",
    label: "Print A4",
  },
  {
    file: "src/app/returns/[id]/print-button.tsx",
    label: "Print 80mm",
  },
  {
    file: "src/app/returns/[id]/print-button.tsx",
    label: "Share WhatsApp",
  },
  {
    file: "src/app/daily-closing/print-button.tsx",
    label: "Print A4",
  },
  {
    file: "src/app/daily-closing/print-button.tsx",
    label: "Print 80mm",
  },
  {
    file: "src/app/daily-closing/print-button.tsx",
    label: "Print shift report",
  },
  {
    file: "src/app/suppliers/[id]/statement/print-button.tsx",
    label: "Print A4 / Save PDF",
  },
  {
    file: "src/app/suppliers/[id]/statement/print-button.tsx",
    label: "Print 80mm",
  },
  {
    file: "src/app/suppliers/[id]/statement/print-button.tsx",
    label: "Share WhatsApp",
  },
];

function classNameForControl(source, file, label) {
  const labelIndex = source.indexOf(label);
  assert.notEqual(labelIndex, -1, `${file}: could not find control label "${label}"`);

  const buttonStart = source.lastIndexOf("<button", labelIndex);
  const linkStart = source.lastIndexOf("<a", labelIndex);
  const tagStart = Math.max(buttonStart, linkStart);
  assert.notEqual(tagStart, -1, `${file}: "${label}" is not inside a button or link`);

  const classStart = source.indexOf('className="', tagStart);
  assert.notEqual(classStart, -1, `${file}: "${label}" is missing a className`);
  assert.ok(
    classStart < labelIndex,
    `${file}: "${label}" className was not found on the enclosing interactive control`,
  );

  const valueStart = classStart + 'className="'.length;
  const valueEnd = source.indexOf('"', valueStart);
  assert.notEqual(valueEnd, -1, `${file}: "${label}" has an unterminated className`);

  return source.slice(valueStart, valueEnd);
}

function hasAcceptedTouchHeight(className) {
  return /(?:^|\s)min-h-\[44px\](?:\s|$)/.test(className) || /(?:^|\s)h-11(?:\s|$)/.test(className);
}

for (const control of controls) {
  test(`${control.file} ${control.label} has an explicit 44px touch target`, () => {
    const source = readFileSync(control.file, "utf8");
    const className = classNameForControl(source, control.file, control.label);

    assert.ok(
      hasAcceptedTouchHeight(className),
      `${control.file}: "${control.label}" must use min-h-[44px] or h-11. Current className: ${className}`,
    );
    assert.ok(
      !/\bh-(?:9|10)\b/.test(className),
      `${control.file}: "${control.label}" must not rely on h-9 or h-10 as its touch target. Current className: ${className}`,
    );
  });
}
