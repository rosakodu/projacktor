/**
 * Sound utility for Steam Deck Gamepad UI navigation
 * Plays native Steam tab transition sound / navigation sound
 */

let navAudio: HTMLAudioElement | null = null;

export function playNavSound() {
  try {
    if (!navAudio) {
      navAudio = new Audio("/sounds/deck_ui_tab_transition_01.wav");
      navAudio.volume = 0.6;
      navAudio.onerror = () => {
        try {
          navAudio = new Audio("/sounds/deck_ui_navigation.wav");
          navAudio.volume = 0.6;
        } catch {}
      };
    }
    navAudio.currentTime = 0;
    const playPromise = navAudio.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  } catch {}
}
