// Presentational invoice card (Belgisch-conform) — gebruikt door /beheer/factuur én /coach/factuur.
// Verplichte vermeldingen: "Factuur", oplopend nr, factuur- + leveringsdatum, verkoper (naam, adres,
// ondernemings-/btw-nr, IBAN), klant (naam/bedrijf, adres, btw-nr), omschrijving + aantal, btw-split
// (of vrijstellingsvermelding) + totalen.
const euro = (c) => "€ " + ((c || 0) / 100).toFixed(2).replace(".", ",");

export default function Invoice({ gym, title = "Factuur", number, dateLabel, supplyLabel, billTo = {}, lines = [], vatRate = 0, vatNote }) {
  const grossTotal = lines.reduce((a, l) => a + (l.gross || 0), 0);
  const hasVat = vatRate > 0;
  const net = hasVat ? Math.round(grossTotal / (1 + vatRate)) : grossTotal;
  const vat = grossTotal - net;

  return (
    <div className="mx-auto max-w-2xl rounded-2xl border border-borderc bg-white p-10 print:border-0 print:p-0">
      <div className="flex items-start justify-between gap-6">
        <div>
          <p className="text-2xl font-black text-brand">{gym.legal_name || gym.name}</p>
          {gym.address && <p className="mt-1 whitespace-pre-line text-sm text-brand/60">{gym.address}</p>}
          <p className="mt-1 text-sm text-brand/60">{gym.vat_number ? `Ondernemings-/btw-nr ${gym.vat_number}` : "Ondernemingsnr. —"}</p>
          {gym.iban && <p className="text-sm text-brand/60">IBAN {gym.iban}</p>}
          {gym.invoice_email && <p className="text-sm text-brand/60">{gym.invoice_email}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-black text-brand">{title}</p>
          <p className="mt-1 text-sm text-brand/60">Nr. {number}</p>
          <p className="text-sm text-brand/60">Factuurdatum: {dateLabel}</p>
          {supplyLabel && <p className="text-sm text-brand/60">Leveringsdatum: {supplyLabel}</p>}
        </div>
      </div>

      <div className="mt-8 rounded-xl bg-paper p-4 print:bg-transparent print:p-0">
        <p className="text-xs font-bold uppercase tracking-widest text-lav">Factuur aan</p>
        <p className="mt-1 font-bold text-brand">{billTo.company || billTo.name || "—"}</p>
        {billTo.company && billTo.name && billTo.name !== billTo.company && <p className="text-sm text-brand/60">t.a.v. {billTo.name}</p>}
        {billTo.address && <p className="whitespace-pre-line text-sm text-brand/60">{billTo.address}</p>}
        {billTo.vat && <p className="text-sm font-semibold text-brand/70">Btw {billTo.vat}</p>}
        {billTo.email && <p className="text-sm text-brand/60">{billTo.email}</p>}
        {billTo.sub && <p className="text-sm text-brand/60">{billTo.sub}</p>}
      </div>

      <table className="mt-8 w-full text-sm">
        <thead>
          <tr className="border-b border-borderc text-left text-xs uppercase tracking-wide text-lav">
            <th className="pb-2">Omschrijving</th>
            <th className="pb-2 text-right">Aantal</th>
            <th className="pb-2 text-right">Bedrag</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-borderc/60">
              <td className="py-2"><span className="font-semibold text-brand">{l.desc}</span>{l.sub && <span className="block text-xs text-brand/50">{l.sub}</span>}</td>
              <td className="py-2 text-right tabular-nums text-brand/70">{l.qty ?? 1}</td>
              <td className="py-2 text-right tabular-nums text-brand">{euro(l.gross)}</td>
            </tr>
          ))}
          {lines.length === 0 && <tr><td colSpan={3} className="py-4 text-center text-brand/50">Geen lijnen.</td></tr>}
        </tbody>
      </table>

      <div className="mt-6 ml-auto max-w-xs space-y-1 text-sm">
        {hasVat ? (
          <>
            <Row label="Netto (excl. btw)" value={euro(net)} />
            <Row label={`Btw ${Math.round(vatRate * 100)}%`} value={euro(vat)} />
          </>
        ) : (
          <Row label="Btw" value="vrijgesteld / n.v.t." />
        )}
        <div className="mt-1 flex items-center justify-between border-t border-borderc pt-2 text-base font-black text-brand">
          <span>Totaal</span><span className="tabular-nums">{euro(grossTotal)}</span>
        </div>
      </div>

      {vatNote && <p className="mt-8 text-xs text-brand/50">{vatNote}</p>}
    </div>
  );
}

function Row({ label, value }) {
  return <div className="flex items-center justify-between text-brand/70"><span>{label}</span><span className="tabular-nums">{value}</span></div>;
}
