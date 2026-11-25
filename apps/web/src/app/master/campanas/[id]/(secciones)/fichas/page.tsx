import { RoleCards } from "@/features/cards/components/RoleCards";

export const dynamic = "force-dynamic";

// #78: Fichas, the base cards of the campaign. Creating and editing open in their own screen.
export default async function CampaignCardsTab({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <RoleCards scope={{ kind: "campaign", id }} />;
}
