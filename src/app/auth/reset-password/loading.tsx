import { SaleDockLoading } from "@/components/loading/saledock-loading";

export default function ResetPasswordLoading() {
  return (
    <SaleDockLoading
      title="Preparing password reset..."
      description="Please wait while we prepare the secure reset form."
    />
  );
}
