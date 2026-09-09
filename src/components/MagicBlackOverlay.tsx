import { FC, memo } from "react";
import { Focusable } from "@decky/ui";

interface MagicBlackOverlayProps {
  onDismiss: () => void;
}

export const MagicBlackOverlay: FC<MagicBlackOverlayProps> = memo(({ onDismiss }) => {
  return (
    <Focusable
      noFocusRing
      className="projacktor-magicblack-overlay"
      onActivate={onDismiss}
      onClick={onDismiss}
      onTouchStart={onDismiss}
      onCancelButton={onDismiss}
      onButtonDown={onDismiss}
    >
      <div className="projacktor-magicblack-hint">
        ФОНОВАЯ ЗАГРУЗКА (ЭКРАН ПОГАСЕН) • НАЖМИТЕ ЛЮБУЮ КНОПКУ ДЛЯ ПРОБУЖДЕНИЯ
      </div>
    </Focusable>
  );
});
