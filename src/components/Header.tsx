import { FC, memo } from "react";
import { Focusable, Navigation } from "@decky/ui";
import { FaChevronLeft } from "react-icons/fa";

interface HeaderProps {
  title?: string;
  onBack?: () => void;
}

export const Header: FC<HeaderProps> = memo(({ title = "Projacktor", onBack }) => {
  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      try {
        Navigation.NavigateBack();
      } catch {}
    }
  };

  return (
    <Focusable
      flow-children="row"
      className="ds-page-header"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "calc(env(safe-area-inset-top, 0px) + 40px) 24px 10px",
        flexShrink: 0,
      }}
    >
      <Focusable
        onClick={handleBack}
        onOKButton={handleBack}
        onActivate={handleBack}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: 999,
          background: "var(--ds-surface, rgba(255, 255, 255, 0.06))",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <FaChevronLeft size={16} />
      </Focusable>
      <h1
        style={{
          flex: 1,
          margin: 0,
          fontSize: "clamp(18px, 2.2vw, 22px)",
          fontWeight: 700,
          color: "var(--ds-text, #fff)",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </h1>
    </Focusable>
  );
});
