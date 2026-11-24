export function toArenaDetailPath(arenaId?: string): string {
  return arenaId ? `/arenas/${encodeURIComponent(arenaId)}` : "/arenas";
}
