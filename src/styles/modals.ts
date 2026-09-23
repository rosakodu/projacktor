export const MODALS_STYLES = `
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
  position: relative;
  width: 100%;
}

.projacktor-torrent-title-inner {
  display: inline-block;
  white-space: nowrap;
  transform: translateX(0px);
}

.projacktor-torrent-title--marquee {
  text-overflow: ellipsis;
}

/* ONLY run marquee when the torrent card has focus or is hovered */
.projacktor-torrent-card:focus-within .projacktor-torrent-title--marquee,
.projacktor-torrent-card.gpfocus .projacktor-torrent-title--marquee,
.projacktor-torrent-card--focused .projacktor-torrent-title--marquee,
.projacktor-torrent-card:hover .projacktor-torrent-title--marquee,
.projacktor-torrent-title--active.projacktor-torrent-title--marquee {
  text-overflow: clip;
}

.projacktor-torrent-card:focus-within .projacktor-torrent-title--marquee .projacktor-torrent-title-inner,
.projacktor-torrent-card.gpfocus .projacktor-torrent-title--marquee .projacktor-torrent-title-inner,
.projacktor-torrent-card--focused .projacktor-torrent-title--marquee .projacktor-torrent-title-inner,
.projacktor-torrent-card:hover .projacktor-torrent-title--marquee .projacktor-torrent-title-inner,
.projacktor-torrent-title--active.projacktor-torrent-title--marquee .projacktor-torrent-title-inner {
  will-change: transform;
  animation: projacktor-marquee var(--marquee-dur, 8s) cubic-bezier(0.4, 0, 0.2, 1) infinite alternate;
}

@keyframes projacktor-marquee {
  0%, 18% {
    transform: translateX(0px);
  }
  82%, 100% {
    transform: translateX(var(--marquee-dist, -40px));
  }
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

.projacktor-badge-quality--screener {
  background: rgba(234, 138, 0, 0.28) !important;
  color: #ffb84d !important;
  border: 1px solid rgba(234, 138, 0, 0.5) !important;
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
`;
