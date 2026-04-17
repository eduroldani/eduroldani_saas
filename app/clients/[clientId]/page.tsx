import { ClientDetailApp } from "@/components/client-detail-app";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  return <ClientDetailApp clientId={clientId} />;
}
