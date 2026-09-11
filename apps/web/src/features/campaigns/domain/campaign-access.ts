export function canViewCampaignDetail(role: string): boolean {
  return role === "master" || role === "co_master" || role === "observer";
}
