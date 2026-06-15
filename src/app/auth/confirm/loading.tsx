import { SaleDockLoading } from "@/components/loading/saledock-loading";

export default function ConfirmLoading() {
  return (
    <SaleDockLoading
      title="Confirming your email..."
      description="Please wait while we verify your secure confirmation link."
    />
  );
}
