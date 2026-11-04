import { FC, memo } from "react";
import { Focusable } from "@decky/ui";
import { useI18n } from "../../i18n";

export interface PlayerErrorOverlayProps {
  errorMsg: string | null;
  onRetry: () => void;
  onClose?: () => void;
}

export const PlayerErrorOverlay: FC<PlayerErrorOverlayProps> = memo(({
  errorMsg, onRetry, onClose,
}) => {
  const { t } = useI18n();
  if (!errorMsg) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 35,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(10, 13, 20, 0.92)",
        backdropFilter: "blur(8px)",
        textAlign: "center",
        padding: 32,
      }}
    >
      <div
        style={{
          maxWidth: 480,
          background: "rgba(22, 27, 38, 0.95)",
          border: "1px solid rgba(255, 255, 255, 0.12)",
          borderRadius: 12,
          padding: "24px 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.6)",
        }}
      >
        <div style={{ color: "var(--ds-danger, #e53e3e)", fontSize: 16, fontWeight: 600, lineHeight: 1.4 }}>
          {errorMsg}
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Focusable
            tabIndex={0}
            className="ds-btn ds-btn-primary gpfocus"
            onActivate={onRetry}
            onClick={onRetry}
            style={{
              padding: "8px 24px",
              fontSize: 14,
              fontWeight: 600,
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            {t("retry") || "Повторить"}
          </Focusable>
          {onClose && (
            <Focusable
              tabIndex={0}
              className="ds-btn ds-btn-secondary"
              onActivate={onClose}
              onClick={onClose}
              style={{
                padding: "8px 20px",
                fontSize: 14,
                fontWeight: 600,
                borderRadius: 8,
                cursor: "pointer",
                background: "rgba(255, 255, 255, 0.1)",
                color: "#fff",
              }}
            >
              {t("close") || "Закрыть"}
            </Focusable>
          )}
        </div>
      </div>
    </div>
  );
});
