import { FC, memo } from "react";

interface HeaderProps {
  title?: string;
  onBack?: () => void;
}

export const Header: FC<HeaderProps> = memo(({ title = "Projecktor" }) => {
  return (
    <div
      className="ds-page-header"
      style={{
        display: "flex",
        alignItems: "center",
        padding: "calc(env(safe-area-inset-top, 0px) + 36px) 56px 8px 56px",
        flexShrink: 0,
      }}
    >
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(22px, 2.6vw, 26px)",
          fontWeight: 800,
          color: "var(--ds-text, #fff)",
          letterSpacing: 0.3,
        }}
      >
        {title}
      </h1>
    </div>
  );
});
