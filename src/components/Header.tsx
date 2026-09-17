import { FC, memo } from "react";

interface HeaderProps {
  title?: string;
  onBack?: () => void;
}

export const Header: FC<HeaderProps> = memo(({ title = "Projacktor" }) => {
  return (
    <div
      className="projacktor-top-header"
    >
      <h1
        style={{
          margin: 0,
          fontSize: "26px",
          fontWeight: 800,
          color: "#ffffff",
          letterSpacing: 0.2,
        }}
      >
        {title}
      </h1>
    </div>
  );
});
