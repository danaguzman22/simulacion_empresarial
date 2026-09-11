export function canReadGames(role: string): boolean {
  return role === "master" || role === "co_master" || role === "observer";
}

export function canCreateGame(role: string): boolean {
  return role === "master" || role === "co_master";
}
