import type { CSSProperties } from "react";
import Link from "next/link";
import type { InvoiceDetail, InvoiceItemRow } from "@/lib/data/invoices";
import type { BrandingSettings } from "@/lib/data/settings";
import { formatCurrency } from "@/lib/formatters";
import { QrCodeImage } from "@/components/shared/qr-code";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  easypaisa: "EasyPaisa",
  jazzcash: "JazzCash",
  bank_transfer: "Bank transfer",
  customer_credit: "Customer credit",
};

export function invoiceAccent(
  primary: string | null,
  accent: string | null,
): string {
  return (
    [primary, accent].find(
      (value) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value),
    ) ?? "#24665c"
  );
}

function ServiceDetails({
  item,
  currency,
}: {
  item: InvoiceItemRow;
  currency: string;
}) {
  if (item.product_type !== "service") return null;
  const fields = [
    item.service_provider && ["Provider", item.service_provider],
    item.service_transaction_amount > 0 && [
      "Principal",
      formatCurrency(item.service_transaction_amount, currency),
    ],
    item.service_commission > 0 && [
      "Commission",
      formatCurrency(item.service_commission, currency),
    ],
    item.service_reference_no && ["Ref", item.service_reference_no],
    item.service_note && ["Note", item.service_note],
  ].filter(Boolean) as string[][];
  if (!fields.length) return null;
  return (
    <dl className="invoice-service-details">
      {fields.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InvoiceDocument({
  invoice,
  branding,
  orgName,
  branchName,
  branchAddress,
  branchPhone,
  currency,
  showLogo,
  mapLinkUrl,
  showInvoiceQr,
}: {
  invoice: InvoiceDetail;
  branding: BrandingSettings;
  orgName: string;
  branchName: string;
  branchAddress: string;
  branchPhone: string;
  currency: string;
  showLogo: boolean;
  mapLinkUrl: string | null;
  showInvoiceQr: boolean;
}) {
  const date = new Date(invoice.invoice_date).toLocaleDateString("en-PK", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });
  const hasDue = invoice.balance_due > 0;
  const status =
    invoice.status.charAt(0).toUpperCase() + invoice.status.slice(1);
  // The legacy branding fallback is not a configured, industry-neutral subtitle.
  const subtitle =
    branding.businessSubtitle === "Mobile & Accessories Hub"
      ? ""
      : branding.businessSubtitle;
  return (
    <article
      id="invoice-print"
      className="customer-invoice"
      aria-label={`Invoice ${invoice.invoice_no}`}
      style={
        {
          "--invoice-accent": invoiceAccent(
            branding.primaryColor,
            branding.accentColor,
          ),
        } as CSSProperties
      }
    >
      <header className="invoice-header">
        <div className="invoice-issuer">
          {showLogo && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={branding.logoUrl}
              alt={`${orgName} logo`}
              className="invoice-logo"
            />
          )}
          <h2>{orgName}</h2>
          {subtitle && <p className="invoice-subtitle">{subtitle}</p>}
          <div className="invoice-branch">
            <p>{branchName}</p>
            {branchAddress && <p>{branchAddress}</p>}
          </div>
        </div>
        <div className="invoice-identity">
          <p className="invoice-label">INVOICE</p>
          <h1>{invoice.invoice_no}</h1>
          <p className="invoice-date">{date}</p>
          <p className={`invoice-status invoice-status-${invoice.status}`}>
            <span aria-hidden="true" />
            {status}
          </p>
          {hasDue && (
            <dl className="invoice-balance-due">
              <dt>Balance due</dt>
              <dd>{formatCurrency(invoice.balance_due, currency)}</dd>
            </dl>
          )}
        </div>
      </header>

      <section
        className="invoice-details-band"
        aria-label="Customer and document details"
      >
        <div className="invoice-customer">
          <h3>Bill to</h3>
          {invoice.customer ? (
            <>
              <p className="invoice-customer-name">
                <Link href={`/customers/${invoice.customer.id}`}>
                  {invoice.customer.name}
                </Link>
              </p>
              {invoice.customer.phone && <p>{invoice.customer.phone}</p>}
              {invoice.customer.address && <p>{invoice.customer.address}</p>}
            </>
          ) : (
            <p className="invoice-customer-name">Walk-in customer</p>
          )}
        </div>
        <dl className="invoice-document-details">
          <div>
            <dt>Salesperson</dt>
            <dd>{invoice.cashier_name || "Staff"}</dd>
          </div>
        </dl>
      </section>

      <section className="invoice-items" aria-label="Invoice items">
        <table className="invoice-items-table">
          <colgroup>
            <col className="invoice-item-column" />
            <col className="invoice-qty-column" />
            <col className="invoice-price-column" />
            <col className="invoice-discount-column" />
            <col className="invoice-total-column" />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Item</th>
              <th scope="col">Qty</th>
              <th scope="col">Unit price</th>
              <th scope="col">Discount</th>
              <th scope="col">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>
                  <p className="invoice-item-name">{item.product_name}</p>
                  <ServiceDetails item={item} currency={currency} />
                </td>
                <td>{item.quantity}</td>
                <td>{formatCurrency(item.unit_price, currency)}</td>
                <td>
                  {item.item_discount > 0 ? (
                    formatCurrency(item.item_discount, currency)
                  ) : (
                    <span
                      className="invoice-zero-discount"
                      aria-label="No discount"
                    >
                      &mdash;
                    </span>
                  )}
                </td>
                <td className="invoice-line-total">
                  {formatCurrency(item.line_total, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="invoice-items-mobile">
          {invoice.items.map((item) => (
            <div className="invoice-mobile-item" key={item.id}>
              <div className="invoice-mobile-item-heading">
                <p className="invoice-item-name">{item.product_name}</p>
                <span>Qty {item.quantity}</span>
              </div>
              <ServiceDetails item={item} currency={currency} />
              <div className="invoice-mobile-item-pricing">
                <div>
                  <p>
                    Unit price{" "}
                    <span>{formatCurrency(item.unit_price, currency)}</span>
                  </p>
                  {item.item_discount > 0 && (
                    <p>
                      Discount{" "}
                      <span>
                        {formatCurrency(item.item_discount, currency)}
                      </span>
                    </p>
                  )}
                </div>
                <strong>{formatCurrency(item.line_total, currency)}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section
        className="invoice-settlement"
        aria-label="Payment and financial summary"
      >
        <div className="invoice-payment-notes">
          {invoice.payments.length > 0 && (
            <section
              className="invoice-payments"
              aria-label="Recorded payments"
            >
              <h3>Payment{invoice.payments.length > 1 ? "s" : ""}</h3>
              <dl>
                {invoice.payments.map((payment) => (
                  <div key={payment.id}>
                    <dt>
                      {PAYMENT_LABELS[payment.method] ?? payment.method}
                      {payment.reference_no && (
                        <span>Ref: {payment.reference_no}</span>
                      )}
                    </dt>
                    <dd>{formatCurrency(payment.amount, currency)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {invoice.note && (
            <section className="invoice-note">
              <h3>Note</h3>
              <p>{invoice.note}</p>
            </section>
          )}
        </div>
        <dl
          className={`invoice-summary${hasDue ? " invoice-summary-due" : ""}`}
        >
          <div>
            <dt>Subtotal</dt>
            <dd>{formatCurrency(invoice.subtotal, currency)}</dd>
          </div>
          {invoice.discount_total > 0 && (
            <div>
              <dt>Cart discount</dt>
              <dd>&minus;{formatCurrency(invoice.discount_total, currency)}</dd>
            </div>
          )}
          <div className="invoice-grand-total">
            <dt>Grand total</dt>
            <dd>{formatCurrency(invoice.grand_total, currency)}</dd>
          </div>
          <div className="invoice-paid">
            <dt>Paid</dt>
            <dd>{formatCurrency(invoice.amount_paid, currency)}</dd>
          </div>
          {invoice.change_due > 0 && (
            <>
              <div>
                <dt>Tendered</dt>
                <dd>{formatCurrency(invoice.amount_tendered, currency)}</dd>
              </div>
              <div className="invoice-change">
                <dt>Change</dt>
                <dd>{formatCurrency(invoice.change_due, currency)}</dd>
              </div>
            </>
          )}
        </dl>
      </section>

      <footer className="invoice-footer">
        <div className="invoice-closing">
          <p className="invoice-footer-message">
            {branding.invoiceFooter || `Thank you for shopping at ${orgName}.`}
          </p>
          {(branchPhone || branding.email || branding.whatsappSupport) && (
            <p className="invoice-contact">
              {branchPhone && <span>{branchPhone}</span>}
              {branding.email && <span>{branding.email}</span>}
              {branding.whatsappSupport &&
                branding.whatsappSupport !== branchPhone && (
                  <span>WhatsApp {branding.whatsappSupport}</span>
                )}
            </p>
          )}
        </div>
        {showInvoiceQr && mapLinkUrl && (
          <a
            href={mapLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="invoice-location"
          >
            <QrCodeImage
              value={mapLinkUrl}
              size={112}
              alt="Shop location QR code"
            />
            <span>Scan for directions</span>
          </a>
        )}
      </footer>
    </article>
  );
}
