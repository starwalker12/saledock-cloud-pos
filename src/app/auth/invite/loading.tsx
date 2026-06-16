import { SaleDockLoading } from "@/components/loading/saledock-loading";

export default function InviteLoading() {
  return (
    <SaleDockLoading
      title="Accepting staff invite..."
      description="Please wait while SaleDock verifies this invite."
    />
  );
}
