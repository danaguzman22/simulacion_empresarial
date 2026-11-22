import { getSession } from "../application/get-session";
import { roleLabel, type CampaignRole, type SessionArea } from "../domain/session";
import { readBestCampaignRole } from "../repositories/session.repository";
import { UserMenu } from "./UserMenu";

// #72: top right of every screen with a session (not the projection): "<name> · <role>" with the user menu.
// campaignRole is the person's role in the campaign of the screen (game or campaign pages of the panel).
export async function UserBar({ area, campaignRole = null }: { area: SessionArea; campaignRole?: CampaignRole | null }) {
  const session = await getSession();
  if (!session) return null;
  const needsBestRole = area === "panel" && !campaignRole && session.active?.role !== "teacher";
  const bestRole = needsBestRole ? await readBestCampaignRole(session.userId, session.active?.id ?? null) : null;
  return <div className="flex justify-end bg-slate-950 px-5 pt-3">
    <UserMenu area={area} name={session.name} role={roleLabel({ area, active: session.active, campaignRole, bestRole })}
      active={session.active ? { id: session.active.id, name: session.active.name } : null}
      institutions={session.memberships.map(m => ({ id: m.id, name: m.name }))} nexusAdmin={session.nexusAdmin} />
  </div>;
}
