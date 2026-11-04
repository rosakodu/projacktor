export function computeCenteredScrollLeft(
  container: { width: number; scrollWidth: number },
  item: { left: number; width: number }
): number {
  const target = item.left - container.width / 2 + item.width / 2;
  const maxScroll = Math.max(0, container.scrollWidth - container.width);
  return Math.max(0, Math.min(target, maxScroll));
}

export const SECTION_COOLDOWN_MS = 250;
export const CARD_STEP_COOLDOWN_MS = 110;
