import type { Metadata } from "next";

import AppShell from "@/components/AppShell";
import { RequestForm, ResetForm } from "@/components/recovery/RecoveryForms";

export const metadata: Metadata = { title: "Recovery — riasly" };
export const dynamic = "force-dynamic";

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return <AppShell>{token ? <ResetForm token={token} /> : <RequestForm />}</AppShell>;
}
