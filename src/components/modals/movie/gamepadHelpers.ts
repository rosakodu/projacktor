import { GamepadButton } from "@decky/ui";

export const isEvtUp = (evt: any) => {
  const dir = evt?.detail?.dir;
  const btn = evt?.detail?.button;
  return dir === "up" || btn === 9 || btn === GamepadButton.DIR_UP;
};

export const isEvtDown = (evt: any) => {
  const dir = evt?.detail?.dir;
  const btn = evt?.detail?.button;
  return dir === "down" || btn === 10 || btn === GamepadButton.DIR_DOWN;
};

export const isEvtLeft = (evt: any) => {
  const dir = evt?.detail?.dir;
  const btn = evt?.detail?.button;
  return dir === "left" || btn === 11 || btn === GamepadButton.DIR_LEFT;
};

export const isEvtRight = (evt: any) => {
  const dir = evt?.detail?.dir;
  const btn = evt?.detail?.button;
  return dir === "right" || btn === 12 || btn === GamepadButton.DIR_RIGHT;
};

export function scrollContainerToElement(container: HTMLElement, target: HTMLElement) {
  const cRect = container.getBoundingClientRect();
  const iRect = target.getBoundingClientRect();
  if (iRect.top < cRect.top) container.scrollTop -= (cRect.top - iRect.top + 6);
  else if (iRect.bottom > cRect.bottom) container.scrollTop += (iRect.bottom - cRect.bottom + 6);
}
