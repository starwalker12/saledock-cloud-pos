type PrintLetterheadProps = {
  branding: {
    shopName?: string | null;
    branchName?: string | null;
    branchAddress?: string | null;
    address?: string | null;
    branchPhone?: string | null;
    phone?: string | null;
    logoUrl?: string | null;
  };
  organizationName?: string;
  branchName?: string;
  start: string;
  end: string;
  fmtDay: (d: string) => string;
};

export function PrintLetterhead({ branding, organizationName, branchName, start, end, fmtDay }: PrintLetterheadProps) {
  return (
    <div className="hidden print:block border-b-2 border-slate-950 pb-4 mb-6 text-left">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-slate-950">{branding.shopName || organizationName || "Gadget Zone Online POS"}</h1>
          <p className="text-sm font-semibold text-slate-600">Branch: {branding.branchName || branchName || "All Branches"}</p>
          {(branding.branchAddress || branding.address) && (
            <p className="text-xs text-slate-500">{branding.branchAddress || branding.address}</p>
          )}
          {(branding.branchPhone || branding.phone) && (
            <p className="text-xs text-slate-500">Phone: {branding.branchPhone || branding.phone}</p>
          )}
        </div>
        {branding.logoUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={branding.logoUrl}
              alt={`${branding.shopName} logo`}
              className="h-16 w-auto max-w-[120px] object-contain"
            />
          </>
        )}
      </div>
      <p className="text-sm text-slate-500">Report Date Range: {fmtDay(start)} to {fmtDay(end)}</p>
      <p className="text-xs text-slate-400 mt-1">Generated: {new Date().toLocaleString()}</p>
    </div>
  );
}
