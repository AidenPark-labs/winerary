const PLACEHOLDER_MAP: Record<string, string> = {
  red: "/wine-placeholder-red.svg",
  white: "/wine-placeholder-white.svg",
  rose: "/wine-placeholder-rose.svg",
};

export function getWineImage(
  image: string | null | undefined,
  wineType: string | null | undefined,
): string {
  return image || PLACEHOLDER_MAP[wineType ?? ""] || "/wine-placeholder-default.svg";
}
