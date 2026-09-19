export const THEME_STYLES = `
/* ───── Projacktor Deck Shelves Design Tokens (Sharp / No-radius) ───── */
:where(:root, .projacktor-app-root, .projacktor-modal-root) {
  --ds-surface:        rgba(255, 255, 255, 0.05);
  --ds-surface-hi:     rgba(255, 255, 255, 0.10);
  --ds-surface-card:   rgba(20, 24, 32, 0.92);
  --ds-surface-row:    rgba(255, 255, 255, 0.03);
  --ds-border:         rgba(255, 255, 255, 0.08);
  --ds-border-strong:  rgba(255, 255, 255, 0.16);
  --ds-border-focus:   #1a9fff;
  --ds-text:           #ffffff;
  --ds-text-dim:       rgba(255, 255, 255, 0.70);
  --ds-text-faint:     rgba(255, 255, 255, 0.45);
  --ds-accent:         var(--gpSystemLighterStill, #1a9fff);
  --ds-accent-soft:    rgba(26, 159, 255, 0.20);
  --ds-success:        #10b981;
  --ds-danger:         rgba(255, 90, 90, 0.95);
  --ds-danger-soft:    rgba(255, 80, 80, 0.15);
  --ds-warn:           rgba(255, 200, 90, 0.95);
  --ds-radius-sm:      0px;
  --ds-radius-md:      0px;
  --ds-radius-lg:      0px;
}

/* ───── SteamOS Native Animated Focus Ring (Constraint to Element Inset) ───── */
/* Valve's GamepadUI defines @keyframes _2o99ScTho-Rc-AQV-VR68h with '0% { outline: solid 12px; }',
   which causes the animated white focus ring to explode 12px outside element boundaries for 400ms.
   We override the keyframes to keep outline-width at 2px throughout the animation, and lock
   outline-offset: -2px so the focus ring is strictly constrained within the element's border box. */
@keyframes _2o99ScTho-Rc-AQV-VR68h {
  0% {
    outline-width: 2px !important;
  }
  100% {
    outline-width: 2px !important;
  }
}

._1wPplsegQqCoe06wXPhzKT,
[class*="_1wPplsegQqCoe06wXPhzKT"],
._3FIjYetykQsFYR08l1v7Ls > div,
[class*="_3FIjYetykQsFYR08l1v7Ls"] > div {
  outline-width: 2px !important;
  outline-offset: -2px !important;
  border-radius: 0px !important;
  box-sizing: border-box !important;
}

.projacktor-app-root {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  display: flex;
  flex-direction: column;
  background: #0b1016 !important;
  color: var(--ds-text);
  box-sizing: border-box;
  overflow: hidden !important;
  contain: strict !important;
  z-index: 10;
}

/* ───── Projacktor Header Container & Top Header ───── */
.projacktor-header-container {
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  padding: calc(env(safe-area-inset-top, 0px) + 38px) 52px 14px 52px !important;
  box-sizing: border-box !important;
  gap: 14px !important;
  flex-shrink: 0 !important;
  z-index: 2 !important;
}

.projacktor-top-header {
  position: relative !important;
  z-index: 2 !important;
  display: flex !important;
  align-items: center !important;
  padding: 0 !important;
  flex-shrink: 0 !important;
  background: transparent !important;
  user-select: none !important;
}

.projacktor-top-header h1 {
  margin: 0 !important;
  font-size: 26px !important;
  font-weight: 800 !important;
  color: #ffffff !important;
  letter-spacing: 0.2px !important;
}

/* ───── Projacktor Nav Bar (L1 / Tabs / R1) ───── */
.projacktor-nav-bar {
  position: relative !important;
  z-index: 2 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  width: 100% !important;
  padding: 0 !important;
  gap: 16px !important;
  height: 38px !important;
  flex-shrink: 0 !important;
  user-select: none !important;
  outline: none !important;
  border: none !important;
  background: transparent !important;
  box-sizing: border-box !important;
}

.projacktor-bumper-pill {
  position: relative !important;
  z-index: 2 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #ffffff !important;
  color: #0b1016 !important;
  font-weight: 800 !important;
  font-size: 13.5px !important;
  letter-spacing: 0.3px !important;
  padding: 0 10px !important;
  height: 34px !important;
  min-width: 44px !important;
  line-height: 34px !important;
  border-radius: 4px !important;
  border: none !important;
  cursor: pointer !important;
  user-select: none !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
  flex-shrink: 0 !important;
  margin: 0 !important;
  box-sizing: border-box !important;
  transition: background 0.12s ease, transform 0.08s ease !important;
}

.projacktor-bumper-pill.l1 {
  border-radius: 8px 4px 4px 4px !important;
}

.projacktor-bumper-pill.r1 {
  border-radius: 4px 8px 4px 4px !important;
}

.projacktor-bumper-pill:hover,
.projacktor-bumper-pill:active {
  background: #e2e8f0 !important;
  color: #000000 !important;
  transform: scale(0.97) !important;
}

.projacktor-tabs-track {
  flex: 1 1 auto !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  height: 38px !important;
  min-width: 0 !important;
  outline: none !important;
  border-bottom: none !important;
  position: relative !important;
  box-sizing: border-box !important;
}

.projacktor-tab-item {
  flex: 1 1 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  text-align: center !important;
  height: 38px !important;
  line-height: 34px !important;
  padding: 0 6px !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  letter-spacing: 0.15px !important;
  color: #8b929a !important;
  background: transparent !important;
  border: none !important;
  border-bottom: 3.5px solid transparent !important;
  border-radius: 0px !important;
  margin: 0 !important;
  cursor: pointer !important;
  outline: none !important;
  box-shadow: none !important;
  transition: color 0.12s ease, border-color 0.12s ease !important;
  white-space: nowrap !important;
  user-select: none !important;
  box-sizing: border-box !important;
  min-width: 0 !important;
}

.projacktor-tab-item:hover {
  color: #ffffff !important;
  background: transparent !important;
}

.projacktor-tab-item.active {
  color: #ffffff !important;
  font-weight: 700 !important;
  background: transparent !important;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
  border-bottom: 3.5px solid #1a9fff !important;
  border-radius: 0px !important;
  margin: 0 !important;
  outline: none !important;
  box-shadow: none !important;
}

/* ───── Дополнительный масштаб для сверхвысоких разрешений 4K ───── */
@media (min-width: 2200px) {
  .projacktor-top-header h1 {
    font-size: 40px !important;
  }

  .projacktor-nav-bar {
    height: 48px !important;
    gap: 14px !important;
  }

  .projacktor-bumper-pill {
    height: 44px !important;
    min-width: 58px !important;
    font-size: 16px !important;
    padding: 0 16px !important;
    line-height: 44px !important;
    border-radius: 6px !important;
  }

  .projacktor-tabs-track {
    height: 48px !important;
    gap: 12px !important;
  }

  .projacktor-tab-item {
    height: 48px !important;
    line-height: 44px !important;
    padding: 0 18px !important;
    font-size: 19px !important;
    border-bottom-width: 4px !important;
  }
}

/* ───── Main Scroll Container (Below Fixed Tab Bar) ───── */
.projacktor-content-scroll {
  width: 100% !important;
  flex: 1 1 0 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  background: #0e141b !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  box-sizing: border-box !important;
  scroll-behavior: smooth !important;
  scroll-padding-top: 14px !important;
  scroll-padding-bottom: 120px !important;
  position: relative !important;
  z-index: 1 !important;
}

/* ───── Sharp Universal Buttons (Deck Shelves ds-btn) ───── */
.ds-btn {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 14px !important;
  height: 34px !important;
  min-width: 0 !important;
  font-size: 12.5px !important;
  font-weight: 600;
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: 0px !important;
  color: var(--ds-text);
  cursor: pointer;
  outline: none !important;
  box-shadow: none !important;
  transition: background 0.1s ease, border-color 0.1s ease;
  user-select: none;
  box-sizing: border-box;
}

.ds-btn::before,
.ds-btn::after {
  display: none !important;
  content: none !important;
}

.ds-btn:focus,
.ds-btn.gpfocus {
  background: rgba(26, 159, 255, 0.25) !important;
  border-color: #1a9fff !important;
  color: #fff !important;
  box-shadow: 0 0 10px rgba(26, 159, 255, 0.5) !important;
  outline: 2px solid #1a9fff !important;
  outline-offset: 1px !important;
  transform: none !important;
}

.ds-btn--compact {
  height: 28px !important;
  padding: 0 10px !important;
  font-size: 12px !important;
  border-radius: 0px !important;
}

.ds-btn--icon {
  width: 32px !important;
  height: 32px !important;
  padding: 0 !important;
  border-radius: 0px !important;
}

.ds-btn--primary {
  background: var(--ds-surface-hi) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
  color: #fff !important;
  border-radius: 0px !important;
}

.ds-btn--primary:focus,
.ds-btn--primary.gpfocus {
  background: #1a9fff !important;
  border-color: #ffffff !important;
  color: #fff !important;
  box-shadow: 0 0 14px rgba(26, 159, 255, 0.75), inset 0 0 0 1px #ffffff !important;
  outline: 2px solid #60baff !important;
  outline-offset: 1px !important;
  transform: none !important;
}

.ds-btn--success {
  background: #10b981 !important;
  border-color: #059669 !important;
  color: #fff !important;
  border-radius: 0px !important;
}

.ds-btn--success:focus,
.ds-btn--success.gpfocus,
.ds-btn--success:hover {
  background: #34d399 !important;
  border-color: #ffffff !important;
  color: #fff !important;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.45) !important;
  outline: none !important;
  transform: none !important;
}

.ds-btn--danger {
  color: var(--ds-danger) !important;
  border-color: rgba(255, 90, 90, 0.25) !important;
  border-radius: 0px !important;
}

.ds-btn--danger:focus,
.ds-btn--danger.gpfocus {
  background: var(--ds-danger) !important;
  border-color: var(--ds-danger) !important;
  color: #fff !important;
  box-shadow: none !important;
  outline: none !important;
  transform: none !important;
}

/* ───── Page Body ───── */
.projacktor-view-container {
  position: relative !important;
  z-index: 1 !important;
  width: 100% !important;
  flex: 1 1 0 !important;
  min-height: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.projacktor-content {
  position: relative !important;
  z-index: 1 !important;
  width: 100% !important;
  flex: 1 1 0 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.projacktor-library-content {
  position: relative !important;
  z-index: 1 !important;
  width: 100% !important;
  flex: 1 1 0 !important;
  min-height: 0 !important;
  overflow-y: hidden !important;
  overflow-x: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  padding: 16px 0 32px 0 !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.projacktor-settings-card {
  background: rgba(255, 255, 255, 0.035) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 8px !important;
  padding: 14px 18px !important;
  box-sizing: border-box !important;
}

.projacktor-settings-card [class*="PanelSection"],
.projacktor-settings-card > div {
  margin: 0 !important;
  padding: 0 !important;
}

/* ───── Посекторная навигация (Sector Architecture) ───── */
.projacktor-sector-container {
  width: 100% !important;
  height: 100% !important;
  flex: 1 1 0 !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
  position: relative !important;
  box-sizing: border-box !important;
}

.projacktor-sector-nav {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  gap: 8px !important;
  padding: 10px 56px 4px 56px !important;
  outline: none !important;
  user-select: none !important;
  flex-shrink: 0 !important;
}

.projacktor-sector-nav-pill {
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
  padding: 3px 10px !important;
  font-size: 11.5px !important;
  font-weight: 600 !important;
  color: var(--ds-text-dim) !important;
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid var(--ds-border) !important;
  cursor: pointer !important;
  border-radius: 0px !important;
  outline: none !important;
  transition: all 0.15s ease !important;
}

.projacktor-sector-nav-pill.active {
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.14) !important;
  border-color: var(--ds-accent) !important;
}

.projacktor-sector-nav-number {
  font-size: 9.5px !important;
  font-weight: 700 !important;
  color: var(--ds-accent) !important;
  opacity: 0.9 !important;
}

.projacktor-sector-nav-name {
  white-space: nowrap !important;
}

.projacktor-sector-stage {
  flex: 1 1 0 !important;
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: center !important;
  align-items: stretch !important;
  box-sizing: border-box !important;
  padding-bottom: 54px !important; /* Безопасный отступ от нижнего бара Steam Deck */
  overflow: hidden !important;
}

.projacktor-sector-shelf {
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  box-sizing: border-box !important;
  animation: projacktor-sector-fade 0.15s ease-out !important;
}

@keyframes projacktor-sector-fade {
  from {
    opacity: 0.4;
    transform: translateY(4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.projacktor-sector-shelf-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 0 56px 8px 56px !important;
}

.projacktor-sector-shelf-title {
  font-size: 17px !important;
  font-weight: 700 !important;
  color: #fff !important;
  letter-spacing: 0.3px !important;
}

.projacktor-sector-loading {
  font-size: 11.5px !important;
  color: var(--ds-text-dim) !important;
}

.projacktor-sector-empty {
  padding: 40px 56px !important;
  font-size: 13px !important;
  color: rgba(255, 255, 255, 0.4) !important;
}

/* ───── MagicBlack OLED Background Download Mode ───── */
.projacktor-magicblack-overlay {
  position: fixed !important;
  top: 0 !important;
  left: 0 !important;
  right: 0 !important;
  bottom: 0 !important;
  width: 100vw !important;
  height: 100vh !important;
  background: #000000 !important;
  color: #111111 !important;
  z-index: 2147483647 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  cursor: none !important;
  user-select: none !important;
  overflow: hidden !important;
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}

.projacktor-magicblack-overlay:focus,
.projacktor-magicblack-overlay.gpfocus {
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}

body.projacktor-magicblack-active,
body.projacktor-magicblack-active * {
  outline: none !important;
  box-shadow: none !important;
}

body.projacktor-magicblack-active [class*="focus-ring"],
body.projacktor-magicblack-active [class*="_1wPplsegQqCoe06wXPhzKT"],
body.projacktor-magicblack-active [class*="_3FIjYetykQsFYR08l1v7Ls"] {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
}

.projacktor-magicblack-banner {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 8px !important;
  color: rgba(255, 255, 255, 0.4) !important;
  user-select: none !important;
  pointer-events: none !important;
  animation: projacktor-magicblack-fadeout 3.5s forwards !important;
}

.projacktor-magicblack-title {
  font-size: 15px !important;
  font-weight: 700 !important;
  color: #38bdf8 !important;
  letter-spacing: 0.3px !important;
}

.projacktor-magicblack-sub {
  font-size: 11.5px !important;
  color: rgba(255, 255, 255, 0.3) !important;
  letter-spacing: 0.2px !important;
}

@keyframes projacktor-magicblack-fadeout {
  0% { opacity: 0.9; }
  75% { opacity: 0.9; }
  100% { opacity: 0; }
}

.projacktor-magicblack-btn {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  color: #38bdf8 !important;
  transition: all 0.12s ease !important;
}

.projacktor-magicblack-btn:hover,
.projacktor-magicblack-btn:focus,
.projacktor-magicblack-btn.gpfocus {
  background: rgba(56, 189, 248, 0.15) !important;
  border-color: #38bdf8 !important;
  color: #ffffff !important;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.3) !important;
}

/* ───── Bumper L1/R1 Fallback Badge ───── */
.projacktor-bumper-badge {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: rgba(255, 255, 255, 0.12) !important;
  border: 1px solid rgba(255, 255, 255, 0.25) !important;
  border-radius: 3px !important;
  padding: 1px 6px !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  color: #ffffff !important;
  letter-spacing: 0.5px !important;
  line-height: 1 !important;
  user-select: none !important;
}

/* ───── Settings View Controls ───── */
.projacktor-content .DialogButton,
.projacktor-content button {
  color: #ffffff !important;
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  border-radius: 6px !important;
  transition: all 0.15s ease !important;
}

.projacktor-content .DialogButton:hover,
.projacktor-content button:hover {
  background: rgba(255, 255, 255, 0.15) !important;
  border-color: rgba(255, 255, 255, 0.3) !important;
}

.projacktor-content .DialogButton:focus,
.projacktor-content .DialogButton.gpfocus,
.projacktor-content button:focus,
.projacktor-content button.gpfocus,
.projacktor-content .ds-btn:focus,
.projacktor-content .ds-btn.gpfocus {
  background: rgba(26, 159, 255, 0.25) !important;
  color: #ffffff !important;
  border-color: #1a9fff !important;
  box-shadow: 0 0 12px rgba(26, 159, 255, 0.5) !important;
  outline: 2px solid #1a9fff !important;
  outline-offset: 1px !important;
}

.projacktor-content input,
.projacktor-content .DialogInput {
  background: rgba(255, 255, 255, 0.06) !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.15) !important;
  border-radius: 6px !important;
}

.projacktor-content input:focus,
.projacktor-content .DialogInput:focus,
.projacktor-content input.gpfocus,
.projacktor-content .DialogInput.gpfocus,
.projacktor-content .DialogTextInputBase:focus-within {
  border-color: #1a9fff !important;
  box-shadow: 0 0 10px rgba(26, 159, 255, 0.5) !important;
  outline: 2px solid #1a9fff !important;
  outline-offset: 1px !important;
}

/* ───── Search View Input (Убираем обводку по углам, рамки и свечение у поиска) ───── */
.projacktor-search-bar-row,
.projacktor-search-bar-row:focus,
.projacktor-search-bar-row.gpfocus,
.projacktor-search-bar-row:focus-within {
  background: transparent !important;
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
}

.projacktor-search-view input,
.projacktor-search-view input:focus,
.projacktor-search-view input.gpfocus,
.projacktor-search-view .DialogInput,
.projacktor-search-view .DialogInput:focus,
.projacktor-search-view .DialogInput.gpfocus,
.projacktor-search-view .DialogTextInputBase,
.projacktor-search-view .DialogTextInputBase:focus,
.projacktor-search-view .DialogTextInputBase:focus-within,
.projacktor-search-view .DialogTextInputBase.gpfocus,
.projacktor-search-bar-row input,
.projacktor-search-bar-row input:focus,
.projacktor-search-bar-row input.gpfocus,
.projacktor-search-bar-row .DialogInput,
.projacktor-search-bar-row .DialogInput:focus,
.projacktor-search-bar-row .DialogInput.gpfocus,
.projacktor-search-bar-row .DialogTextInputBase,
.projacktor-search-bar-row .DialogTextInputBase:focus,
.projacktor-search-bar-row .DialogTextInputBase:focus-within,
.projacktor-search-bar-row .DialogTextInputBase.gpfocus {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  border-radius: 0px !important;
  background: rgba(255, 255, 255, 0.08) !important;
}

.projacktor-search-view input:focus,
.projacktor-search-view input.gpfocus,
.projacktor-search-view .DialogInput:focus,
.projacktor-search-view .DialogInput.gpfocus,
.projacktor-search-view .DialogTextInputBase:focus,
.projacktor-search-view .DialogTextInputBase:focus-within,
.projacktor-search-view .DialogTextInputBase.gpfocus,
.projacktor-search-bar-row input:focus,
.projacktor-search-bar-row input.gpfocus,
.projacktor-search-bar-row .DialogInput:focus,
.projacktor-search-bar-row .DialogInput.gpfocus,
.projacktor-search-bar-row .DialogTextInputBase:focus,
.projacktor-search-bar-row .DialogTextInputBase:focus-within,
.projacktor-search-bar-row .DialogTextInputBase.gpfocus {
  border: none !important;
  outline: none !important;
  box-shadow: none !important;
  border-radius: 0px !important;
  background: rgba(255, 255, 255, 0.12) !important;
}

/* ───── Section Header Rows (Избранное / Просмотрено / Загрузки) ───── */
.projacktor-section-header-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 8px 52px 4px 52px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  flex-shrink: 0 !important;
  user-select: none !important;
}

.projacktor-section-title {
  font-size: 17px !important;
  font-weight: 700 !important;
  letter-spacing: 0.2px !important;
  color: #ffffff !important;
}

.projacktor-watchlist-btn {
  transition: all 0.15s ease !important;
}

.projacktor-watchlist-btn:hover,
.projacktor-watchlist-btn:focus,
.projacktor-watchlist-btn.gpfocus {
  background: rgba(255, 255, 255, 0.2) !important;
  border-color: #ffffff !important;
  color: #ffffff !important;
}

.projacktor-watchlist-btn.active:hover,
.projacktor-watchlist-btn.active:focus,
.projacktor-watchlist-btn.active.gpfocus {
  background: rgba(34, 197, 94, 0.35) !important;
  border-color: #4ade80 !important;
  color: #ffffff !important;
}

.projacktor-clear-hist-btn {
  background: #dc2626 !important;
  color: #ffffff !important;
  border: 1px solid rgba(255, 255, 255, 0.25) !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  padding: 4px 10px !important;
  border-radius: 4px !important;
  cursor: pointer !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  box-sizing: border-box !important;
  transition: background 0.15s ease, box-shadow 0.15s ease !important;
  outline: none !important;
}

.projacktor-clear-hist-btn:hover,
.projacktor-clear-hist-btn:focus,
.projacktor-clear-hist-btn.gpfocus {
  background: #ef4444 !important;
  border-color: #ffffff !important;
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
  color: #ffffff !important;
  box-shadow: 0 0 10px rgba(239, 68, 68, 0.65) !important;
}
`;
