import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import React from "react";
import * as runtime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

const page = readFileSync("src/app/invoices/[id]/page.tsx", "utf8");
const source = readFileSync(
  "src/app/invoices/[id]/invoice-document.tsx",
  "utf8",
);
const button = readFileSync("src/app/invoices/[id]/print-button.tsx", "utf8");
const css = readFileSync("src/app/globals.css", "utf8");
function load(source, dependencies = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText,
    {
      exports,
      ...globals,
      require: (name) => {
        if (name in dependencies) return dependencies[name];
        throw Error("Unexpected dependency: " + name);
      },
    },
  );
  return exports;
}
const formatters = load(readFileSync("src/lib/formatters.ts", "utf8"));
const document = load(source, {
  "react/jsx-runtime": runtime,
  "next/link": {
    default: ({ children, ...props }) =>
      React.createElement("a", props, children),
  },
  "@/lib/formatters": formatters,
  "@/components/shared/qr-code": {
    QrCodeImage: ({ alt, size }) =>
      React.createElement("img", { alt, width: size, height: size }),
  },
});
const sharing = load(button, {
  react: React,
  "react/jsx-runtime": runtime,
  "lucide-react": {},
  "@/lib/formatters": formatters,
  "@/components/ui/form-modal": {},
});
const invoice = {
  id: "synthetic-invoice",
  invoice_no: "INV-DESIGN",
  invoice_date: "2026-10-04T14:30:00Z",
  status: "paid",
  subtotal: 999,
  discount_total: 0,
  grand_total: 999,
  amount_paid: 999,
  amount_tendered: 1000,
  change_due: 1,
  balance_due: 0,
  note: "Customer note",
  cashier_name: "Synthetic salesperson",
  customer: null,
  payments: [
    {
      id: "payment",
      method: "bank_transfer",
      amount: 999,
      reference_no: "BANK-REF",
    },
  ],
  items: [
    {
      id: "item",
      product_name: "Precision equipment",
      product_type: "product",
      quantity: 3,
      unit_price: 333,
      item_discount: 0,
      line_total: 999,
      purchase_price: 773.21,
      service_transaction_amount: 0,
      service_commission: 0,
      service_total_charged: 0,
    },
  ],
};
const branding = {
  logoUrl: "/synthetic-logo.png",
  businessSubtitle: "Professional services",
  primaryColor: "#15665D",
  accentColor: "#CA7437",
  email: "hello@example.test",
  whatsappSupport: "",
  invoiceFooter: "Custom closing message",
  receiptTerms: "UNAPPROVED TERMS",
};
function render(overrides = {}, brand = {}) {
  return renderToStaticMarkup(
    React.createElement(document.InvoiceDocument, {
      invoice: { ...invoice, ...overrides },
      branding: { ...branding, ...brand },
      orgName: "Northline Studio",
      branchName: "Central branch",
      branchAddress: "Synthetic address",
      branchPhone: "03000000000",
      currency: "PKR",
      showLogo: true,
      mapLinkUrl: "https://maps.google.com/?q=0,0",
      showInvoiceQr: true,
    }),
  );
}
test("safe invoice accent accepts only six-digit hex, with a restrained fallback", () => {
  assert.equal(document.invoiceAccent("#15665D", "#CA7437"), "#15665D");
  for (const invalid of [
    "red;position:fixed",
    "url(javascript:alert(1))",
    "#fff",
    "",
    null,
  ])
    assert.equal(document.invoiceAccent(invalid, null), "#24665c");
  assert.equal(document.invoiceAccent(null, "#CA7437"), "#CA7437");
});
test("customer document is semantic, branded and contains no internal cost/profit/returns", () => {
  const html = render();
  for (const tag of [
    "article",
    "header",
    "section",
    "table",
    "thead",
    "tbody",
    "footer",
  ])
    assert.match(html, new RegExp("<" + tag));
  for (const text of [
    "Northline Studio",
    "INV-DESIGN",
    "Walk-in customer",
    "Synthetic salesperson",
    "Custom closing message",
    "Shop location QR code",
  ])
    assert.ok(html.includes(text));
  assert.doesNotMatch(
    html,
    /773\.21|purchase_price|Profitability|Gross profit|Total cost|ReturnForm|UNAPPROVED TERMS/,
  );
  assert.doesNotMatch(source, /purchase_price|grossProfit|reduce\(|Math\./);
  assert.match(
    page,
    /<InvoiceDocument[\s\S]*?<div className="print-hidden[^"]*" data-invoice-internal/,
  );
});
test("stored totals are rendered directly, zero discounts are quiet, mixed discounts stay visible", () => {
  const html = render({
    subtotal: 17,
    grand_total: 12345678.5,
    amount_paid: 9,
    balance_due: 12345669.5,
    status: "partial",
    discount_total: 8,
  });
  for (const value of [
    "PKR 17",
    "PKR 12,345,678.5",
    "PKR 9",
    "PKR 12,345,669.5",
  ])
    assert.ok(html.includes(value));
  assert.match(html, /aria-label="No discount"/);
  assert.match(html, /invoice-summary-due/);
  assert.equal((html.match(/<dt>Balance due<\/dt>/g) ?? []).length, 1);
  assert.match(
    render({ items: [{ ...invoice.items[0], item_discount: 25 }] }),
    /PKR 25/,
  );
  assert.doesNotMatch(render(), />Product</);
});
test("service snapshots retain useful provider/principal/commission/reference without a new accounting model", () => {
  const item = {
    ...invoice.items[0],
    product_type: "service",
    service_provider: "Example provider",
    service_transaction_amount: 500,
    service_commission: 50,
    service_reference_no: "SERVICE-REF",
    service_note: "Customer detail",
  };
  const html = render({ items: [item] });
  for (const text of [
    "Example provider",
    "PKR 500",
    "PKR 50",
    "SERVICE-REF",
    "Customer detail",
  ])
    assert.ok(html.includes(text));
  assert.ok(
    render({
      items: [
        { ...item, service_transaction_amount: 0, service_commission: 0 },
      ],
    }).includes("SERVICE-REF"),
  );
});
test("all four states remain textual; customer address, note and configured footer are preserved", () => {
  for (const status of ["paid", "unpaid", "partial", "void"])
    assert.ok(
      render({ status }).includes(status[0].toUpperCase() + status.slice(1)),
    );
  const html = render({
    customer: {
      id: "customer",
      name: "Alex Morgan",
      phone: "03000000001",
      address: "Long customer address",
    },
  });
  assert.ok(html.includes("Long customer address"));
  assert.ok(html.includes("Customer note"));
  assert.ok(
    render({}, { invoiceFooter: "" }).includes(
      "Thank you for shopping at Northline Studio.",
    ),
  );
  assert.doesNotMatch(
    render({}, { businessSubtitle: "Mobile & Accessories Hub" }),
    /Mobile &amp; Accessories Hub/,
  );
});
test("WhatsApp uses stored amounts, customer-facing wording and no unnecessary zero discount/due", () => {
  const paid = sharing.buildTextMessage(
    invoice,
    "Northline Studio",
    "PKR",
    "Custom closing message",
  );
  for (const text of [
    "Grand total: PKR 999",
    "Paid: PKR 999",
    "Change: PKR 1",
    "BANK-REF",
    "Custom closing message",
  ])
    assert.ok(paid.includes(text));
  assert.doesNotMatch(
    paid,
    /Discount: PKR 0|Balance due: PKR 0|773\.21|profit|purchase/i,
  );
  const unpaid = sharing.buildTextMessage(
    {
      ...invoice,
      status: "unpaid",
      amount_paid: 0,
      balance_due: 999,
      change_due: 0,
      discount_total: 25,
    },
    "Northline",
  );
  assert.ok(unpaid.includes("Balance due: PKR 999"));
  assert.ok(unpaid.includes("Discount: PKR 25"));
  assert.equal(sharing.buildTextMessage(null, "Shop"), "");
});
test("image capture is white, current, bounded to the customer article and excludes internal nodes", async () => {
  class Element {
    constructor(selector = "") {
      this.selector = selector;
    }
    matches(selector) {
      return selector.includes(this.selector) && !!this.selector;
    }
  }
  let options;
  const node = { querySelectorAll: () => [] };
  const captureModule = load(
    button,
    {
      react: React,
      "react/jsx-runtime": runtime,
      "lucide-react": {},
      "@/lib/formatters": formatters,
      "@/components/ui/form-modal": {},
      "html-to-image": {
        toBlob: async (target, config) => {
          assert.equal(target, node);
          options = config;
          return "synthetic-blob";
        },
      },
    },
    {
      Element,
      document: {
        getElementById: (id) => {
          assert.equal(id, "invoice-print");
          return node;
        },
        fonts: { ready: Promise.resolve() },
      },
      window: { setTimeout, clearTimeout },
    },
  );
  assert.equal(await captureModule.captureInvoiceImage(), "synthetic-blob");
  assert.equal(options.backgroundColor, "#ffffff");
  assert.deepEqual(JSON.parse(JSON.stringify(options.style)), {
    margin: "0", borderRadius: "0", boxShadow: "none",
  });
  assert.equal(options.filter(new Element(".print-hidden")), false);
  assert.equal(options.filter(new Element("[data-invoice-internal]")), false);
  assert.equal(options.filter(new Element()), true);
  assert.doesNotMatch(button, /resolvedTheme|backgroundColor: isDark/);
  assert.match(button, /imageCaptureRef\.current/);
  assert.match(
    page,
    /items: invoice\.items\.map\(item => \(\{[\s\S]*?service_reference_no: item.service_reference_no/,
  );
  const projection = page.slice(
    page.indexOf("invoice={{"),
    page.indexOf("shopName={orgName}"),
  );
  assert.doesNotMatch(projection, /purchase_price|grossProfit|totalCost/);
});
test("image capture absence/failure is explicit, never a silent successful download", async () => {
  const captureModule = load(
    button,
    {
      react: React,
      "react/jsx-runtime": runtime,
      "lucide-react": {},
      "@/lib/formatters": formatters,
      "@/components/ui/form-modal": {},
    },
    { document: { getElementById: () => null } },
  );
  await assert.rejects(captureModule.captureInvoiceImage(), /unavailable/);
  assert.match(
    button,
    /Unable to prepare the invoice image\. Please try again\./,
  );
});
test("reviewed thermal markup and thermal sizing remain byte-identical to starting main", () => {
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  let thermal;
  const ast = ts.createSourceFile(
    "page.tsx",
    page,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function walk(node) {
    if (
      ts.isJsxElement(node) &&
      node.openingElement.getText(ast).includes("thermal-print hidden")
    )
      thermal = hash(node.getText(ast));
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.equal(
    thermal,
    "6f13a9019090275c8bfb53ab614d913e3176b2b08ddc11aaeee71c2314485926",
  );
  const functions = {};
  const buttonAst = ts.createSourceFile(
    "button.tsx",
    button,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ["printA4", "printThermal"].includes(
        node.name.getText(buttonAst),
      )
    )
      functions[node.name.getText(buttonAst)] = hash(node.getText(buttonAst));
    ts.forEachChild(node, visit);
  }
  visit(buttonAst);
  assert.deepEqual(functions, {
    printA4: "6aa7842f3d7779ac7db099f9f377b4db21534ae9a31ad36eadce1d59cc08749e",
    printThermal:
      "44443f86908a3e55865aed411912ffd58f9bfa5a59685f72de10b133375a485b",
  });
});
test("white A4 ancestors and natural pagination are preserved; customer styling stays invoice-scoped", () => {
  assert.match(
    css,
    /body\[data-print-mode="a4"\]:has\(#invoice-print\) :is\([\s\S]*?background: #ffffff !important;/,
  );
  assert.match(
    css,
    /#invoice-print \.invoice-items-table \{ display: table !important;/,
  );
  assert.match(
    css,
    /#invoice-print \.invoice-items-mobile \{ display: none !important;/,
  );
  assert.match(
    css,
    /#invoice-print :is\(\.invoice-settlement, \.invoice-footer\) \{ break-inside: avoid;/,
  );
  assert.doesNotMatch(
    css.slice(
      css.indexOf(".customer-invoice {"),
      css.indexOf("@media print {", css.indexOf(".customer-invoice {")),
    ),
    /min-height:|position: fixed|gradient/,
  );
});

test("short A4 classification requires real print media, correct width and a complete safe natural height", () => {
  let print = false;
  let mode = "a4";
  let width = 186 * 96 / 25.4;
  let height = 180 * 96 / 25.4;
  const element = { dataset: {}, getBoundingClientRect: () => ({ width, height }) };
  const classification = load(button + "\nexport { prepareShortA4, clearShortA4 };", {
    react: React, "react/jsx-runtime": runtime, "lucide-react": {},
    "@/lib/formatters": formatters, "@/components/ui/form-modal": {},
  }, {
    window: { matchMedia: () => ({ matches: print }) },
    document: { body: { get dataset() { return { printMode: mode }; } },
      querySelectorAll: () => [element], querySelector: () => element },
  });
  classification.prepareShortA4(); assert.equal(element.dataset.invoiceA4Short, undefined);
  print = true;
  classification.prepareShortA4(); assert.equal(element.dataset.invoiceA4Short, "true");
  height = 263 * 96 / 25.4;
  classification.prepareShortA4(); assert.equal(element.dataset.invoiceA4Short, undefined);
  height = 180 * 96 / 25.4; width = 896;
  classification.prepareShortA4(); assert.equal(element.dataset.invoiceA4Short, undefined);
  width = 186 * 96 / 25.4; mode = "thermal";
  classification.prepareShortA4(); assert.equal(element.dataset.invoiceA4Short, undefined);
  mode = "a4"; height = NaN;
  classification.prepareShortA4(); assert.equal(element.dataset.invoiceA4Short, undefined);
  height = 180 * 96 / 25.4;
  classification.prepareShortA4(); classification.clearShortA4();
  assert.equal(element.dataset.invoiceA4Short, undefined);
  assert.match(button, /const onBeforePrint[\s\S]*?prepareShortA4\(\)/);
  assert.match(button, /if \(event.matches\)[\s\S]*?prepareShortA4\(\)/);
  assert.match(button, /if \(ownsActiveState\)[\s\S]*?clearShortA4\(\)/);
  assert.match(css, /body\[data-print-mode="a4"\] #invoice-print.customer-invoice\[data-invoice-a4-short="true"\][\s\S]*?min-height: 264mm/);
  assert.match(css, /\[data-invoice-a4-short="true"\] \.invoice-footer \{\s*margin-top: auto/);
  assert.doesNotMatch(button.slice(button.indexOf("function prepareShortA4"), button.indexOf("function nextAnimationFrame")), /items\.length|status|setTimeout/);
});
