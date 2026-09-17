export const CARDS_STYLES = `
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

/* ───── Downloads Shelf Row (Infinite Single Line matching Catalog) ───── */
.projacktor-downloads-grid {
  position: relative !important;
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: nowrap !important;
  align-items: flex-start !important;
  gap: 14px !important;
  width: 100% !important;
  box-sizing: border-box !important;
  overflow-x: auto !important;
  overflow-y: hidden !important;
  padding: 8px 52px 24px 52px !important;
  scroll-padding: 0 52px !important;
  margin: 0 !important;
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

.projacktor-downloads-grid::-webkit-scrollbar {
  display: none !important;
  height: 0px !important;
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
  transform: none !important;
  transition: border-color 0.1s ease !important;
  height: auto !important;
  min-height: fit-content !important;
}

.projacktor-dl-grid-card:hover,
.projacktor-dl-grid-card:focus,
.projacktor-dl-grid-card:focus-within {
  transform: none !important;
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
  transform: none !important;
}

.projacktor-dl-poster-btn {
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
  height: 186px !important;
  min-height: 186px !important;
  max-height: 186px !important;
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
  transform: none !important;
  transform-origin: center !important;
  perspective: none !important;
  backface-visibility: hidden !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
  transition: none !important;
}

.projacktor-dl-poster-btn:focus,
.projacktor-dl-poster-btn.gpfocus,
.projacktor-dl-poster-btn:hover {
  transform: none !important;
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
  box-shadow: none !important;
}

.projacktor-dl-poster-btn::before,
.projacktor-dl-poster-btn::after,
.projacktor-dl-poster-btn:focus::before,
.projacktor-dl-poster-btn:focus::after,
.projacktor-dl-poster-btn.gpfocus::before,
.projacktor-dl-poster-btn.gpfocus::after {
  display: none !important;
  content: none !important;
}

.projacktor-dl-poster-btn [class*="focus-ring"],
.projacktor-dl-poster-btn [class*="_1wPplsegQqCoe06wXPhzKT"],
.projacktor-dl-poster-btn [class*="_3FIjYetykQsFYR08l1v7Ls"] {
  display: none !important;
  opacity: 0 !important;
  visibility: hidden !important;
  outline: none !important;
  border: none !important;
  box-shadow: none !important;
  transform: none !important;
}

.projacktor-dl-poster-img {
  width: 100% !important;
  min-width: 100% !important;
  max-width: 100% !important;
  height: 186px !important;
  min-height: 186px !important;
  max-height: 186px !important;
  object-fit: cover !important;
  display: block !important;
  background: #0f141c !important;
  transform: none !important;
  user-select: none !important;
  -webkit-user-drag: none !important;
  pointer-events: none !important;
}

.projacktor-dl-badge-status {
  position: absolute !important;
  top: 6px !important;
  left: 6px !important;
  font-size: 9px !important;
  font-weight: 700 !important;
  padding: 2px 5px !important;
  border-radius: 0px !important;
  color: #fff !important;
  z-index: 2 !important;
  line-height: 1.2 !important;
  letter-spacing: 0.2px !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  white-space: nowrap !important;
  max-width: 105px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  pointer-events: none !important;
}

.projacktor-dl-badge-status.downloading {
  background: rgba(26, 159, 255, 0.92) !important;
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
  font-size: 8px !important;
  font-weight: 700 !important;
  padding: 1px 4px !important;
  border-radius: 0px !important;
  background: rgba(0, 0, 0, 0.78) !important;
  color: #fff !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  z-index: 2 !important;
  line-height: 1.2 !important;
  white-space: nowrap !important;
  max-width: 42px !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  pointer-events: none !important;
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
  padding: 5px 8px 3px 8px !important;
  display: flex !important;
  flex-direction: column !important;
  justify-content: flex-start !important;
  background: #141a23 !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 46px !important;
  min-height: 46px !important;
  max-height: 46px !important;
  position: relative !important;
  z-index: 1 !important;
  flex-shrink: 0 !important;
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
  width: 100% !important;
  max-width: 100% !important;
}

.projacktor-dl-year {
  font-size: 10px !important;
  color: #8b929a !important;
  margin-top: 1px !important;
  line-height: 1.15 !important;
  white-space: nowrap !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  width: 100% !important;
  max-width: 100% !important;
}

.projacktor-dl-card-btns {
  display: flex !important;
  align-items: center !important;
  gap: 4px !important;
  padding: 4px 6px 7px 6px !important;
  background: #141a23 !important;
  box-sizing: border-box !important;
  width: 100% !important;
  max-width: 100% !important;
  height: 35px !important;
  min-height: 35px !important;
  overflow: visible !important;
  position: relative !important;
  z-index: 3 !important;
  flex-shrink: 0 !important;
}

.projacktor-dl-btn-play {
  flex: 1 !important;
  min-width: 0 !important;
  height: 24px !important;
  padding: 0 !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  background: var(--ds-surface) !important;
  border: 1px solid var(--ds-border) !important;
  color: #fff !important;
  border-radius: 0px !important;
  cursor: pointer !important;
  outline: none !important;
  box-sizing: border-box !important;
  transform: none !important;
  user-select: none !important;
  position: relative !important;
  transition: none !important;
}

.projacktor-dl-btn-play:focus,
.projacktor-dl-btn-play.gpfocus,
.projacktor-dl-btn-play:hover {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
  color: #fff !important;
  box-shadow: none !important;
  transform: none !important;
  position: relative !important;
  z-index: 10 !important;
}

.projacktor-dl-btn-play.success,
.projacktor-dl-btn-play.is-watch {
  background: #10b981 !important;
  border-color: #059669 !important;
  color: #fff !important;
}

.projacktor-dl-btn-play.success:focus,
.projacktor-dl-btn-play.success.gpfocus,
.projacktor-dl-btn-play.success:hover,
.projacktor-dl-btn-play.is-watch:focus,
.projacktor-dl-btn-play.is-watch.gpfocus,
.projacktor-dl-btn-play.is-watch:hover {
  background: #34d399 !important;
  border-color: #ffffff !important;
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
  color: #fff !important;
  box-shadow: 0 0 10px rgba(16, 185, 129, 0.45) !important;
  position: relative !important;
  z-index: 10 !important;
}

.projacktor-dl-btn-icon {
  width: 24px !important;
  height: 24px !important;
  min-width: 24px !important;
  max-width: 24px !important;
  flex: 0 0 24px !important;
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
  transform: none !important;
  user-select: none !important;
  position: relative !important;
  transition: none !important;
}

.projacktor-dl-btn-icon:focus,
.projacktor-dl-btn-icon.gpfocus,
.projacktor-dl-btn-icon:hover {
  background: var(--ds-surface-hi) !important;
  border-color: #ffffff !important;
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
  color: #fff !important;
  box-shadow: none !important;
  transform: none !important;
  position: relative !important;
  z-index: 10 !important;
}

.projacktor-dl-btn-icon.danger:focus,
.projacktor-dl-btn-icon.danger.gpfocus,
.projacktor-dl-btn-icon.danger:hover {
  background: var(--ds-danger) !important;
  border-color: #ffffff !important;
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
  color: #fff !important;
  box-shadow: 0 0 8px rgba(225, 29, 72, 0.45) !important;
  transform: none !important;
  position: relative !important;
  z-index: 10 !important;
}

.projacktor-dl-btn-icon.download:focus,
.projacktor-dl-btn-icon.download.gpfocus,
.projacktor-dl-btn-icon.download:hover {
  background: #0284c7 !important;
  border-color: #ffffff !important;
  outline: 2px solid #ffffff !important;
  outline-offset: -2px !important;
  color: #fff !important;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.45) !important;
  transform: none !important;
  position: relative !important;
  z-index: 10 !important;
}

.projacktor-history-card-btns > * {
  flex: 1 1 0% !important;
  min-width: 0 !important;
  width: 100% !important;
  max-width: none !important;
  height: 24px !important;
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  gap: 5px !important;
  padding: 0 8px !important;
  box-sizing: border-box !important;
  font-size: 11px !important;
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
`;
