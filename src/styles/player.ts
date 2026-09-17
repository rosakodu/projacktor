export const PLAYER_STYLES = `
/* ───── Video Player High-Contrast Focus (Steam Deck Signature Blue) ───── */
.projacktor-player-fullscreen .ds-btn {
  transition: all 0.15s cubic-bezier(0.2, 0.9, 0.4, 1.1) !important;
  border: 1px solid rgba(255, 255, 255, 0.2) !important;
  border-radius: 4px !important;
}

.projacktor-player-fullscreen .ds-btn:focus,
.projacktor-player-fullscreen .ds-btn.gpfocus,
.projacktor-player-fullscreen .ds-btn--primary:focus,
.projacktor-player-fullscreen .ds-btn--primary.gpfocus,
.projacktor-player-fullscreen [tabindex="0"]:focus,
.projacktor-player-fullscreen [tabindex="0"].gpfocus {
  background: #1a9fff !important;
  border-color: #ffffff !important;
  color: #ffffff !important;
  box-shadow: 0 0 16px rgba(26, 159, 255, 0.85), inset 0 0 0 1.5px #ffffff !important;
  outline: 2px solid #60baff !important;
  outline-offset: 2px !important;
  transform: scale(1.12) !important;
  z-index: 10 !important;
}

.projacktor-player-fullscreen .ds-btn:focus svg,
.projacktor-player-fullscreen .ds-btn.gpfocus svg,
.projacktor-player-fullscreen .ds-btn--primary:focus svg,
.projacktor-player-fullscreen .ds-btn--primary.gpfocus svg {
  fill: #ffffff !important;
  color: #ffffff !important;
  filter: drop-shadow(0 0 4px rgba(255, 255, 255, 0.9)) !important;
}

/* ───── Video Player Dropdown Menus Focus ───── */
.projacktor-player-dropdown-menu .ds-btn {
  border-radius: 4px !important;
  transition: background 0.12s ease, border-color 0.12s ease, transform 0.12s ease !important;
}

.projacktor-player-dropdown-menu .ds-btn:focus,
.projacktor-player-dropdown-menu .ds-btn.gpfocus,
.projacktor-player-dropdown-menu .ds-btn.active-nav {
  background: #1a9fff !important;
  border-color: #ffffff !important;
  color: #ffffff !important;
  box-shadow: 0 0 12px rgba(26, 159, 255, 0.75), inset 0 0 0 1px #ffffff !important;
  outline: 2px solid #60baff !important;
  outline-offset: 1px !important;
  transform: scale(1.02) !important;
}

.projacktor-player-dropdown-menu .ds-btn:focus svg,
.projacktor-player-dropdown-menu .ds-btn.gpfocus svg,
.projacktor-player-dropdown-menu .ds-btn.active-nav svg {
  fill: #ffffff !important;
  color: #ffffff !important;
}

/* ───── Fullscreen Player Modal Override ───── */
.DialogContent:has(.projacktor-player-fullscreen),
[class*="DialogContent"]:has(.projacktor-player-fullscreen),
.ModalPosition:has(.projacktor-player-fullscreen),
[class*="ModalPosition"]:has(.projacktor-player-fullscreen),
.DialogBody:has(.projacktor-player-fullscreen),
[class*="DialogBody"]:has(.projacktor-player-fullscreen),
[class*="ModalOverlay"]:has(.projacktor-player-fullscreen),
[class*="DialogOverlay"]:has(.projacktor-player-fullscreen) {
  display: block !important;
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  max-width: 100vw !important;
  max-height: 100vh !important;
  background: #000 !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 !important;
  z-index: 2147483647 !important;
  overflow: hidden !important;
}

.projacktor-player-fullscreen {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: #000 !important;
  z-index: 2147483647 !important;
}

@keyframes projacktor-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* ───── Buffering Heartbeat Animation ───── */
@keyframes projacktor-heartbeat {
  0% {
    transform: scale(1);
    opacity: 0.88;
  }
  14% {
    transform: scale(1.06);
    opacity: 1;
  }
  28% {
    transform: scale(1);
    opacity: 0.9;
  }
  42% {
    transform: scale(1.04);
    opacity: 1;
  }
  70% {
    transform: scale(1);
    opacity: 0.88;
  }
  100% {
    transform: scale(1);
    opacity: 0.88;
  }
}

.projacktor-buffering-heartbeat {
  animation: projacktor-heartbeat 1.6s ease-in-out infinite !important;
  transform-origin: center center !important;
}

/* ───── Video Subtitles (::cue) - disabled to avoid duplicate rendering ───── */
video::cue,
.projacktor-player-fullscreen video::cue {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  font-size: 0 !important;
  height: 0 !important;
  width: 0 !important;
  background: transparent !important;
}

/* ───── Custom Subtitle Overlay (Zoom-independent & High Contrast) ───── */
.projacktor-subtitle-overlay {
  position: absolute !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  max-width: 88% !important;
  text-align: center !important;
  pointer-events: none !important;
  z-index: 90 !important;
  transition: bottom 0.2s cubic-bezier(0.2, 0.9, 0.4, 1.1) !important;
}

.projacktor-subtitle-text {
  display: inline-block !important;
  background-color: rgba(0, 0, 0, 0.82) !important;
  color: #ffffff !important;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  font-size: clamp(17px, 2.25vh, 46px) !important;
  font-weight: 600 !important;
  line-height: 1.35 !important;
  padding: clamp(3px, 0.4vh, 8px) clamp(10px, 1.1vw, 24px) !important;
  border-radius: clamp(5px, 0.6vh, 12px) !important;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95), 0 0 2px #000 !important;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) !important;
  white-space: pre-wrap !important;
}

/* ───── Volume HUD Overlay ───── */
.projacktor-volume-hud {
  position: fixed !important;
  top: 64px !important;
  left: 24px !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  background: rgba(0, 0, 0, 0.82) !important;
  padding: 10px 16px !important;
  border-radius: 8px !important;
  z-index: 100 !important;
  pointer-events: none !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6) !important;
}

.projacktor-volume-bar-track {
  width: 100px !important;
  height: 6px !important;
  background: rgba(255, 255, 255, 0.15) !important;
  border-radius: 3px !important;
  overflow: hidden !important;
}

.projacktor-volume-bar-fill {
  height: 100% !important;
  background: var(--ds-accent, #1a9fff) !important;
  border-radius: 3px !important;
  transition: width 0.08s ease !important;
}

/* ───── Zoom HUD Overlay ───── */
.projacktor-zoom-hud {
  position: fixed !important;
  top: 64px !important;
  right: 24px !important;
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  background: rgba(0, 0, 0, 0.82) !important;
  padding: 10px 16px !important;
  border-radius: 8px !important;
  z-index: 100 !important;
  pointer-events: none !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6) !important;
}

.projacktor-zoom-bar-track {
  width: 100px !important;
  height: 6px !important;
  background: rgba(255, 255, 255, 0.15) !important;
  border-radius: 3px !important;
  overflow: hidden !important;
}

.projacktor-zoom-bar-fill {
  height: 100% !important;
  border-radius: 3px !important;
  transition: width 0.08s ease !important;
}
`;
