/**
 * D2: Fiscalization adapter interface (9.7 - ODLUCENO: model now, implement
 * before first trials expire, not before launch).
 *
 * The canonical invoice lives in wagen (public.invoices, B8); the concrete
 * intermediary (Solo, e-racuni, FINA, Moj-eRacun...) is a swappable
 * implementation behind this interface. The choice of provider is an open
 * item (sekcija 20) - nothing here presupposes it.
 */

export interface FiscalInvoiceLineItem {
  description: string;
  quantity: number;
  /** Net unit price in cents. */
  unitPriceCents: number;
  /** VAT rate in percent, e.g. 25. */
  vatRatePercent: number;
}

/** What the adapter needs to fiscalize one invoice - mirrors public.invoices. */
export interface FiscalInvoiceInput {
  /** wagen invoice id (public.invoices.id). */
  invoiceId: string;
  /** Human-readable invoice number per Croatian numbering rules. */
  number: string;
  issuedAt: Date;
  lineItems: FiscalInvoiceLineItem[];
  netAmountCents: number;
  vatAmountCents: number;
  totalAmountCents: number;
  currency: string;
  /** B2B: buyer tax id (OIB) for eRacun routing; null for B2C (boost). */
  buyerTaxId: string | null;
}

export type FiscalizationResult =
  | {
      status: 'fiscalized';
      /** Jedinstveni identifikator racuna from Porezna uprava. */
      jir: string;
      /** Zastitni kod izdavatelja, when the flow produces one. */
      zki: string | null;
      raw: unknown;
    }
  | { status: 'failed'; error: string; retryable: boolean; raw: unknown }
  | {
      /** Dev/no-op outcome - the invoice stays fiscalization_status='pending'. */
      status: 'skipped';
      reason: string;
    };

export interface FiscalizationAdapter {
  /** Stable provider key once chosen, e.g. 'solo', 'moj-eracun'. */
  readonly provider: string;
  fiscalize(invoice: FiscalInvoiceInput): Promise<FiscalizationResult>;
}

/**
 * No-op implementation for development and for the period before the
 * intermediary is chosen (9.7: implementation lands before the first trials
 * expire). Invoices remain 'pending' - nothing is silently marked fiscal.
 */
export class NoopFiscalizationAdapter implements FiscalizationAdapter {
  readonly provider = 'noop';

  fiscalize(invoice: FiscalInvoiceInput): Promise<FiscalizationResult> {
    return Promise.resolve({
      status: 'skipped',
      reason: `Fiskalizacijski posrednik nije odabran (racun ${invoice.number} ostaje pending)`,
    });
  }
}
