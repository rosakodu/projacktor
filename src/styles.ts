export const PROJACKTOR_STYLES = `
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

/* ───── Projacktor Top Header ───── */
.projacktor-top-header {
  display: flex !important;
  align-items: center !important;
  padding: calc(env(safe-area-inset-top, 0px) + 54px) 52px 14px 52px !important;
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
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  width: 100% !important;
  padding: 0 0 14px 0 !important;
  gap: 12px !important;
  flex-shrink: 0 !important;
  user-select: none !important;
  outline: none !important;
  border: none !important;
  background: transparent !important;
  box-sizing: border-box !important;
}

.projacktor-bumper-pill {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: #ffffff !important;
  color: #0b1016 !important;
  font-weight: 800 !important;
  font-size: 11px !important;
  letter-spacing: 0.5px !important;
  padding: 0 7px !important;
  height: 22px !important;
  line-height: 22px !important;
  border-radius: 4px !important;
  border: none !important;
  cursor: pointer !important;
  user-select: none !important;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4) !important;
  flex-shrink: 0 !important;
  margin: 0 !important;
  transition: all 0.12s ease !important;
}

.projacktor-bumper-pill:hover,
.projacktor-bumper-pill:active {
  background: #e2e8f0 !important;
  color: #000000 !important;
}

.projacktor-tabs-track {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  flex-shrink: 0 !important;
  outline: none !important;
  border-bottom: none !important;
  position: relative !important;
}

.projacktor-tab-item {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 32px !important;
  padding: 0 10px !important;
  font-size: 13.5px !important;
  font-weight: 600 !important;
  letter-spacing: 0.2px !important;
  color: #8b929a !important;
  background: transparent !important;
  border: none !important;
  border-bottom: 3px solid transparent !important;
  border-radius: 0px !important;
  margin: 0 !important;
  cursor: pointer !important;
  outline: none !important;
  box-shadow: none !important;
  transition: color 0.12s ease, border-color 0.12s ease !important;
  white-space: nowrap !important;
  user-select: none !important;
  box-sizing: border-box !important;
  flex-shrink: 0 !important;
}

.projacktor-tab-item:hover,
.projacktor-tab-item:focus,
.projacktor-tab-item.gpfocus,
.projacktor-tab-item.gpfocuswithin,
.projacktor-tab-item:focus-visible {
  color: #ffffff !important;
  background: transparent !important;
  outline: none !important;
  box-shadow: none !important;
}

.projacktor-tab-item.active {
  color: #ffffff !important;
  font-weight: 600 !important;
  background: transparent !important;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
  border-bottom: 3px solid #1a9fff !important;
  margin: 0 !important;
  outline: none !important;
  box-shadow: none !important;
}

.projacktor-tab-item.active:focus,
.projacktor-tab-item.active.gpfocus,
.projacktor-tab-item.active.gpfocuswithin,
.projacktor-tab-item.active:focus-visible {
  color: #ffffff !important;
  font-weight: 600 !important;
  background: transparent !important;
  border-top: none !important;
  border-left: none !important;
  border-right: none !important;
  border-bottom: 3px solid #1a9fff !important;
  margin: 0 !important;
  outline: none !important;
  box-shadow: none !important;
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
  background: var(--ds-surface-hi) !important;
  border-color: rgba(255, 255, 255, 0.4) !important;
  color: #fff !important;
  box-shadow: none !important;
  outline: none !important;
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
  background: var(--ds-surface-hi) !important;
  border-color: rgba(255, 255, 255, 0.45) !important;
  color: #fff !important;
  box-shadow: none !important;
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
.projacktor-content {
  width: 100% !important;
  flex: 1 1 0 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.projacktor-library-content {
  width: 100% !important;
  flex: 1 1 0 !important;
  min-height: 0 !important;
  overflow-y: auto !important;
  overflow-x: hidden !important;
  padding: 6px 52px 140px 52px !important;
  margin: 0 !important;
  box-sizing: border-box !important;
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

/* ───── Shelves ───── */
.projacktor-shelf {
  width: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  padding: 4px 0 24px 0 !important;
  margin: 0 !important;
  box-sizing: border-box !important;
}

.projacktor-shelf-title {
  font-size: 19px !important;
  font-weight: 700 !important;
  color: #ffffff !important;
  letter-spacing: 0.2px !important;
  padding: 0 52px !important;
  margin: 0 0 14px 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
}

.projacktor-shelf-row {
  position: relative !important;
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  gap: 14px !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  padding: 4px 52px 20px 52px !important;
  scroll-padding: 0 52px !important;
  margin: 0 !important;
  scroll-behavior: auto !important;
  outline: none !important;
  border: none !important;
  scrollbar-width: none !important;
  mask-image: linear-gradient(
    to right,
    transparent 0px,
    black 40px,
    black calc(100% - 60px),
    transparent 100%
  ) !important;
  -webkit-mask-image: linear-gradient(
    to right,
    transparent 0px,
    black 40px,
    black calc(100% - 60px),
    transparent 100%
  ) !important;
}

.projacktor-shelf-row::-webkit-scrollbar {
  display: none !important;
  height: 0px !important;
}

/* ───── Sharp Movie Capsule Card (Deck-Shelves Native Spec) ───── */
.projacktor-card {
  width: 140px !important;
  min-width: 140px !important;
  max-width: 140px !important;
  flex: 0 0 140px !important;
  height: 250px !important;
  display: flex !important;
  flex-direction: column !important;
  background: #141a23 !important;
  border: 2px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 0px !important;
  overflow: hidden !important;
  cursor: pointer !important;
  position: relative !important;
  outline: none !important;
  user-select: none !important;
  transform: none !important;
  box-sizing: border-box !important;
  transition: border-color 0.1s ease !important;
}

.projacktor-card::before,
.projacktor-card::after,
.projacktor-card:focus::before,
.projacktor-card:focus::after,
.projacktor-card.gpfocus::before,
.projacktor-card.gpfocus::after {
  display: none !important;
  content: none !important;
}

.projacktor-card [class*="focus-ring"],
.projacktor-card [class*="_1wPplsegQqCoe06wXPhzKT"],
.projacktor-card [class*="_3FIjYetykQsFYR08l1v7Ls"] {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}

.projacktor-card:focus,
.projacktor-card.gpfocus {
  transform: none !important;
  border-color: #ffffff !important;
  outline: none !important;
  box-shadow: none !important;
}

.projacktor-app-root.suppress-card-focus .projacktor-card,
.projacktor-app-root.suppress-card-focus .projacktor-card:focus,
.projacktor-app-root.suppress-card-focus .projacktor-card.gpfocus,
.projacktor-app-root.suppress-card-focus [class*="gpfocus"].projacktor-card {
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: none !important;
  outline: none !important;
}

.projacktor-card:hover {
  transform: none !important;
  outline: none !important;
}

.projacktor-card-poster {
  width: 100% !important;
  height: 186px !important;
  object-fit: cover !important;
  background: #0f141c !important;
  display: block !important;
}

.projacktor-card-rating {
  position: absolute !important;
  top: 6px !important;
  right: 6px !important;
  background: rgba(0, 0, 0, 0.78) !important;
  color: #fbbf24 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  padding: 2px 6px !important;
  border-radius: 2px !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  line-height: 1.2 !important;
  letter-spacing: 0.3px !important;
  z-index: 2 !important;
}

.projacktor-card-info {
  padding: 5px 8px 6px 8px !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  flex: 1 !important;
  min-height: 0 !important;
  background: #141a23 !important;
  box-sizing: border-box !important;
}

.projacktor-card-title {
  font-size: 11.5px !important;
  font-weight: 600 !important;
  color: #ffffff !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: normal !important;
  line-height: 1.25 !important;
  min-height: 28px !important;
  max-height: 28px !important;
  word-break: break-word !important;
}

.projacktor-card-year {
  font-size: 10.5px !important;
  color: #8b929a !important;
  margin-top: 3px !important;
  line-height: 1.1 !important;
}

/* ───── Sharp Downloads List Items ───── */
.projacktor-download-item {
  display: flex;
  flex-direction: column;
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: 0px !important;
  padding: 14px 18px;
  margin-bottom: 12px;
  gap: 10px;
  outline: none;
  position: relative;
}

.projacktor-download-item::before,
.projacktor-download-item::after,
.projacktor-download-item:focus::before,
.projacktor-download-item:focus::after,
.projacktor-download-item.gpfocus::before,
.projacktor-download-item.gpfocus::after {
  display: none !important;
  content: none !important;
}

.projacktor-download-item:focus-within {
  border-color: #ffffff !important;
  box-shadow: inset 0 0 0 1.5px #ffffff !important;
  background: var(--ds-surface-hi);
}

.projacktor-dl-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.projacktor-dl-title {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.projacktor-dl-badge {
  font-size: 11px;
  padding: 3px 8px;
  border-radius: 0px !important;
  font-weight: 600;
  text-transform: uppercase;
}

.projacktor-dl-badge.downloading {
  background: var(--ds-accent-soft);
  color: var(--ds-accent);
}

.projacktor-dl-badge.completed {
  background: rgba(16, 185, 129, 0.18);
  color: var(--ds-success);
}

.projacktor-dl-badge.paused {
  background: rgba(245, 158, 11, 0.18);
  color: var(--ds-warn);
}

.projacktor-dl-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--ds-text-dim);
}

.projacktor-dl-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

/* ───── Downloads Poster Grid (Native Steam UI Spec) ───── */
.projacktor-downloads-grid {
  display: flex !important;
  flex-wrap: wrap !important;
  gap: 14px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  justify-content: flex-start !important;
}

.projacktor-dl-grid-card {
  width: 140px !important;
  min-width: 140px !important;
  max-width: 140px !important;
  flex: 0 0 140px !important;
  display: flex !important;
  flex-direction: column !important;
  background: #141a23 !important;
  border: 2px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 0px !important;
  overflow: hidden !important;
  position: relative !important;
  outline: none !important;
  user-select: none !important;
  box-sizing: border-box !important;
  transition: border-color 0.1s ease !important;
}

.projacktor-dl-grid-card:focus-within {
  border-color: rgba(255, 255, 255, 0.3) !important;
}

.projacktor-dl-grid-card::before,
.projacktor-dl-grid-card::after,
.projacktor-dl-grid-card:focus::before,
.projacktor-dl-grid-card:focus::after,
.projacktor-dl-grid-card.gpfocus::before,
.projacktor-dl-grid-card.gpfocus::after {
  display: none !important;
  content: none !important;
}

.projacktor-dl-grid-card [class*="focus-ring"],
.projacktor-dl-grid-card [class*="_1wPplsegQqCoe06wXPhzKT"],
.projacktor-dl-grid-card [class*="_3FIjYetykQsFYR08l1v7Ls"] {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}

.projacktor-dl-poster-btn {
  width: 100% !important;
  height: 186px !important;
  position: relative !important;
  overflow: hidden !important;
  border: none !important;
  border-radius: 0px !important;
  background: #0f141c !important;
  cursor: pointer !important;
  outline: none !important;
  box-sizing: border-box !important;
  display: block !important;
  padding: 0 !important;
  margin: 0 !important;
}

.projacktor-dl-poster-btn:focus,
.projacktor-dl-poster-btn.gpfocus {
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
}

.projacktor-dl-poster-img {
  width: 100% !important;
  height: 186px !important;
  object-fit: cover !important;
  display: block !important;
  background: #0f141c !important;
}

.projacktor-dl-badge-status {
  position: absolute !important;
  top: 6px !important;
  left: 6px !important;
  font-size: 9.5px !important;
  font-weight: 700 !important;
  padding: 2px 5px !important;
  border-radius: 0px !important;
  color: #fff !important;
  z-index: 2 !important;
  line-height: 1.2 !important;
  letter-spacing: 0.3px !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
}

.projacktor-dl-badge-status.downloading {
  background: rgba(26, 159, 255, 0.9) !important;
}

.projacktor-dl-badge-status.completed {
  background: rgba(16, 185, 129, 0.9) !important;
}

.projacktor-dl-badge-status.paused {
  background: rgba(234, 179, 8, 0.9) !important;
  color: #000 !important;
}

.projacktor-dl-badge-status.queued {
  background: rgba(0, 0, 0, 0.78) !important;
}

.projacktor-dl-badge-quality {
  position: absolute !important;
  top: 6px !important;
  right: 6px !important;
  font-size: 8.5px !important;
  font-weight: 700 !important;
  padding: 1px 4px !important;
  border-radius: 0px !important;
  background: rgba(0, 0, 0, 0.78) !important;
  color: #fff !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  z-index: 2 !important;
  line-height: 1.2 !important;
}

.projacktor-dl-bar-bg {
  position: absolute !important;
  bottom: 0 !important;
  left: 0 !important;
  right: 0 !important;
  height: 3px !important;
  background: rgba(0, 0, 0, 0.75) !important;
  overflow: hidden !important;
  z-index: 2 !important;
}

.projacktor-dl-bar-fill {
  height: 100% !important;
  transition: width 0.2s ease !important;
}

.projacktor-dl-bar-fill.downloading {
  background: #1a9fff !important;
}

.projacktor-dl-bar-fill.paused {
  background: #eab308 !important;
}

.projacktor-dl-bar-fill.completed {
  background: #10b981 !important;
}

.projacktor-dl-info {
  padding: 5px 8px 4px 8px !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  background: #141a23 !important;
  box-sizing: border-box !important;
}

.projacktor-dl-title {
  font-size: 11.5px !important;
  font-weight: 600 !important;
  color: #ffffff !important;
  display: -webkit-box !important;
  -webkit-line-clamp: 2 !important;
  -webkit-box-orient: vertical !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: normal !important;
  line-height: 1.25 !important;
  min-height: 28px !important;
  max-height: 28px !important;
  word-break: break-word !important;
}

.projacktor-dl-subtext {
  font-size: 10.5px !important;
  color: #8b929a !important;
  margin-top: 2px !important;
  line-height: 1.15 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

.projacktor-dl-card-btns {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 0 6px 6px 6px !important;
  background: #141a23 !important;
  box-sizing: border-box !important;
}

.projacktor-dl-btn-play {
  flex: 1 !important;
  height: 26px !important;
  padding: 0 4px !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 4px !important;
  background: var(--ds-surface) !important;
  border: 1px solid var(--ds-border) !important;
  color: #fff !important;
  border-radius: 0px !important;
  cursor: pointer !important;
  outline: none !important;
  box-sizing: border-box !important;
}

.projacktor-dl-btn-play:focus,
.projacktor-dl-btn-play.gpfocus {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  color: #fff !important;
  outline: none !important;
  box-shadow: none !important;
}

.projacktor-dl-btn-icon {
  width: 26px !important;
  height: 26px !important;
  flex: 0 0 26px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: var(--ds-surface) !important;
  border: 1px solid var(--ds-border) !important;
  color: var(--ds-text) !important;
  border-radius: 0px !important;
  cursor: pointer !important;
  outline: none !important;
  box-sizing: border-box !important;
}

.projacktor-dl-btn-icon:focus,
.projacktor-dl-btn-icon.gpfocus {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  color: #fff !important;
  outline: none !important;
  box-shadow: none !important;
}

.projacktor-dl-btn-icon.danger:focus,
.projacktor-dl-btn-icon.danger.gpfocus {
  background: var(--ds-danger) !important;
  border-color: var(--ds-danger) !important;
  color: #fff !important;
  outline: none !important;
  box-shadow: none !important;
}

/* ───── Episodes Dialog Modal (Native Steam UI Spec) ───── */
.projacktor-episodes-modal-overlay {
  position: fixed !important;
  inset: 0 !important;
  background: rgba(0, 0, 0, 0.82) !important;
  backdrop-filter: blur(4px) !important;
  z-index: 9999 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 24px !important;
  box-sizing: border-box !important;
}

.projacktor-episodes-modal-box {
  background: #111722 !important;
  border: 1px solid var(--ds-border) !important;
  border-radius: 0px !important;
  max-width: 640px !important;
  width: 100% !important;
  max-height: 80vh !important;
  display: flex !important;
  flex-direction: column !important;
  box-shadow: none !important;
  overflow: hidden !important;
}

.projacktor-episodes-modal-header {
  padding: 12px 16px !important;
  background: #161e2b !important;
  border-bottom: 1px solid var(--ds-border) !important;
  border-radius: 0px !important;
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
}

.projacktor-episodes-modal-list {
  padding: 12px 16px !important;
  overflow-y: auto !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 6px !important;
  flex: 1 !important;
}

/* ───── Library Items with Poster & Action Badges ───── */
.projacktor-lib-card {
  display: flex;
  flex-direction: column;
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: 0px !important;
  padding: 12px;
  margin-bottom: 12px;
  gap: 10px;
  outline: none !important;
  position: relative;
}

.projacktor-lib-card::before,
.projacktor-lib-card::after,
.projacktor-lib-card:focus::before,
.projacktor-lib-card:focus::after,
.projacktor-lib-card.gpfocus::before,
.projacktor-lib-card.gpfocus::after {
  display: none !important;
  content: none !important;
}

.projacktor-lib-card [class*="focus-ring"],
.projacktor-lib-card [class*="_1wPplsegQqCoe06wXPhzKT"],
.projacktor-lib-card [class*="_3FIjYetykQsFYR08l1v7Ls"] {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}

.projacktor-lib-card:focus-within {
  border-color: #ffffff !important;
  box-shadow: inset 0 0 0 1.5px #ffffff !important;
  background: var(--ds-surface-hi);
  outline: none !important;
}

.projacktor-lib-main {
  display: flex;
  flex-direction: row;
  gap: 14px;
  align-items: center;
  width: 100%;
}

.projacktor-lib-poster {
  width: 54px;
  height: 80px;
  object-fit: cover;
  flex-shrink: 0;
  background: #151922;
  border: 1px solid var(--ds-border);
}

.projacktor-lib-details {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-width: 0;
  gap: 4px;
}

.projacktor-lib-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--ds-text-dim);
}

.projacktor-episodes-container {
  margin-top: 4px;
  border-top: 1px solid var(--ds-border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
}

.projacktor-episode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--ds-border);
  gap: 10px;
  outline: none;
}

.projacktor-episode-row:focus,
.projacktor-episode-row.gpfocus {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  box-shadow: inset 0 0 0 1.5px #ffffff !important;
  outline: none !important;
}

.projacktor-episode-title {
  font-size: 11.5px;
  color: #fff;
  font-weight: 500;
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ───── Sharp Modal & Ultra-compact Torrent Items (Deck Shelves Spec, Centered) ───── */
.DialogContent:has(.projacktor-modal-root),
[class*="DialogContent"]:has(.projacktor-modal-root),
.ModalPosition:has(.projacktor-modal-root),
[class*="ModalPosition"]:has(.projacktor-modal-root),
.DialogBody:has(.projacktor-modal-root),
[class*="DialogBody"]:has(.projacktor-modal-root),
div:has(> .projacktor-modal-root) {
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
  margin: 0 auto !important;
}

.projacktor-modal-root {
  display: flex !important;
  flex-direction: column !important;
  width: 520px !important;
  max-width: 90vw !important;
  max-height: 72vh !important;
  margin: auto !important;
  align-self: center !important;
  color: #fff;
  background: #0e141b !important;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: 0px !important;
  border: 1px solid var(--ds-border-strong) !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.85) !important;
}

.projacktor-torrents-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  outline: none !important;
  border: none !important;
  box-sizing: border-box;
  padding: 4px 6px !important;
}

.projacktor-torrent-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  background: var(--ds-surface);
  border: 1px solid var(--ds-border);
  border-radius: 0px !important;
  cursor: pointer;
  outline: none !important;
  transition: background 0.1s ease, border-color 0.1s ease;
  user-select: none;
  box-sizing: border-box;
  min-height: 30px;
  width: 100%;
  transform: none !important;
  position: relative;
}

.projacktor-torrent-item::before,
.projacktor-torrent-item::after,
.projacktor-torrent-item:focus::before,
.projacktor-torrent-item:focus::after,
.projacktor-torrent-item.gpfocus::before,
.projacktor-torrent-item.gpfocus::after {
  display: none !important;
  content: none !important;
}

.projacktor-torrent-item:focus,
.projacktor-torrent-item.gpfocus {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  outline: none !important;
  box-shadow: inset 0 0 0 2px #ffffff !important;
  transform: none !important;
}

.projacktor-torrent-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  padding-right: 4px;
}

.projacktor-torrent-title {
  font-size: 10.5px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.2;
}

.projacktor-torrent-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: var(--ds-text-dim);
  white-space: nowrap;
  overflow: hidden;
}

.projacktor-torrent-seeds {
  color: var(--ds-success);
  font-weight: 700;
}

.projacktor-torrent-peers {
  color: var(--ds-warn);
}

.projacktor-badge-quality {
  font-size: 8.5px;
  font-weight: 700;
  padding: 0 4px;
  border-radius: 0px !important;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  letter-spacing: 0.2px;
}

/* ───── Fixed Size Action Icon Buttons (Strict 30x30 and 26x26) ───── */
.projacktor-torrent-actions {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
  flex-shrink: 0 !important;
}

.projacktor-icon-btn {
  width: 30px !important;
  min-width: 30px !important;
  max-width: 30px !important;
  height: 30px !important;
  min-height: 30px !important;
  max-height: 30px !important;
  padding: 0 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  font-size: 13px !important;
  box-sizing: border-box !important;
  border-radius: 0px !important;
  background: var(--ds-surface) !important;
  border: 1px solid var(--ds-border) !important;
  color: #ffffff !important;
  cursor: pointer !important;
  outline: none !important;
  transform: none !important;
  flex-shrink: 0 !important;
  user-select: none !important;
}

.projacktor-icon-btn::before,
.projacktor-icon-btn::after,
.projacktor-icon-btn:focus::before,
.projacktor-icon-btn:focus::after,
.projacktor-icon-btn.gpfocus::before,
.projacktor-icon-btn.gpfocus::after {
  display: none !important;
  content: none !important;
}

.projacktor-icon-btn [class*="focus-ring"],
.projacktor-icon-btn [class*="_1wPplsegQqCoe06wXPhzKT"],
.projacktor-icon-btn [class*="_3FIjYetykQsFYR08l1v7Ls"],
.projacktor-episode-row [class*="focus-ring"],
.projacktor-episode-row [class*="_1wPplsegQqCoe06wXPhzKT"],
.projacktor-episode-row [class*="_3FIjYetykQsFYR08l1v7Ls"] {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
}

.projacktor-icon-btn:focus,
.projacktor-icon-btn.gpfocus {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  outline: none !important;
  box-shadow: inset 0 0 0 1.5px #ffffff !important;
  transform: none !important;
}

.projacktor-icon-btn--primary {
  color: var(--ds-accent) !important;
}

.projacktor-icon-btn--primary:focus,
.projacktor-icon-btn--primary.gpfocus {
  color: #ffffff !important;
  border-color: var(--ds-accent) !important;
}

.projacktor-icon-btn--compact {
  width: 26px !important;
  min-width: 26px !important;
  max-width: 26px !important;
  height: 26px !important;
  min-height: 26px !important;
  max-height: 26px !important;
  font-size: 11px !important;
}

.projacktor-torrent-card {
  display: flex !important;
  flex-direction: column !important;
  background: var(--ds-surface) !important;
  border: 1px solid var(--ds-border) !important;
  padding: 6px 10px !important;
  gap: 4px !important;
  box-sizing: border-box !important;
  width: 100% !important;
  position: relative !important;
}

.projacktor-torrent-card:focus-within {
  border-color: rgba(255, 255, 255, 0.4) !important;
  background: var(--ds-surface-hi) !important;
}

.projacktor-torrent-header-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  gap: 8px !important;
  width: 100% !important;
}

.projacktor-torrent-episodes {
  margin-top: 6px !important;
  border-top: 1px solid var(--ds-border) !important;
  padding-top: 6px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 4px !important;
  width: 100% !important;
  max-height: 160px !important;
  overflow-y: auto !important;
}

.projacktor-torrent-ep-row {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 4px 8px !important;
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid var(--ds-border) !important;
  gap: 8px !important;
  outline: none !important;
  box-sizing: border-box !important;
  min-height: 30px !important;
}

.projacktor-torrent-ep-row:focus,
.projacktor-torrent-ep-row.gpfocus {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  box-shadow: inset 0 0 0 1.5px #ffffff !important;
  outline: none !important;
}

.projacktor-torrent-ep-title {
  font-size: 11px !important;
  color: #fff !important;
  font-weight: 500 !important;
  flex: 1 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
}

/* ───── Fullscreen Player Modal Override ───── */
.DialogContent:has(.projacktor-player-fullscreen),
[class*="DialogContent"]:has(.projacktor-player-fullscreen),
.ModalPosition:has(.projacktor-player-fullscreen),
[class*="ModalPosition"]:has(.projacktor-player-fullscreen),
.DialogBody:has(.projacktor-player-fullscreen),
[class*="DialogBody"]:has(.projacktor-player-fullscreen),
[class*="ModalOverlay"]:has(.projacktor-player-fullscreen),
[class*="DialogOverlay"]:has(.projacktor-player-fullscreen),
div:has(.projacktor-player-fullscreen) {
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
`;

