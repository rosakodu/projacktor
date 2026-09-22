import { FC, useRef, useEffect, useCallback, CSSProperties, KeyboardEvent } from "react";
import { TextField } from "@decky/ui";

export interface GamepadTextFieldProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  onGamepadDirection?: (e: any) => boolean | undefined;
  onFocus?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
}

export const GamepadTextField: FC<GamepadTextFieldProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
  style,
  onKeyDown,
  onGamepadDirection,
  onFocus,
  onBlur,
  disabled,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<any>(null);

  const getInputElement = useCallback((): HTMLInputElement | null => {
    if (containerRef.current) {
      const input = containerRef.current.querySelector<HTMLInputElement>("input");
      if (input) return input;
    }
    const el = fieldRef.current;
    if (el?.m_elInput) return el.m_elInput;
    if (el?.querySelector) {
      const input = el.querySelector("input");
      if (input) return input;
    }
    if (el instanceof HTMLInputElement) return el;
    return null;
  }, []);

  // При монтировании инпута вешаем обработчик нативного события vgp_onactivate от SteamOS.
  // Поскольку инпут внутри TextField уже является нативным Focusable в Steam,
  // при нажатии кнопки 'A' SteamOS шлёт vgp_onactivate напрямую на input.
  // Без внешнего контейнера-Focusable фокус не сбрасывается обратно, и клавиатура не закрывается.
  useEffect(() => {
    const input = getInputElement();
    if (!input) return;

    const onActivate = (e: Event) => {
      e.stopPropagation();
      try {
        input.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {}
      input.click();
    };

    const onOk = () => {
      onSubmit?.();
    };

    input.addEventListener("vgp_onactivate", onActivate);
    input.addEventListener("vgp_onok", onOk);

    let dirHandler: any = null;
    if (onGamepadDirection) {
      dirHandler = (e: any) => {
        const res = onGamepadDirection(e);
        if (res === false) {
          e.stopPropagation();
          e.preventDefault?.();
        }
      };
      input.addEventListener("vgp_ondirection", dirHandler);
    }

    return () => {
      input.removeEventListener("vgp_onactivate", onActivate);
      input.removeEventListener("vgp_onok", onOk);
      if (dirHandler) {
        input.removeEventListener("vgp_ondirection", dirHandler);
      }
    };
  }, [getInputElement, onSubmit, onGamepadDirection]);

  const handleKeyDownInternal = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || (e as any).keyCode === 13) {
        onSubmit?.();
      }
      onKeyDown?.(e);
    },
    [onSubmit, onKeyDown]
  );

  const handleChange = useCallback(
    (e: any) => {
      const val =
        e && e.target !== undefined
          ? e.target.value
          : typeof e === "string"
          ? e
          : "";
      onChange(val);
    },
    [onChange]
  );

  const handleContainerClick = useCallback(
    (e: any) => {
      if (disabled) return;
      const input = getInputElement();
      // Если клик пришелся мимо самого input (по краям контейнера) — передаем клик в input
      if (input && e.target !== input && !input.contains(e.target as Node)) {
        try {
          input.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {}
        input.focus();
        input.click();
      }
    },
    [disabled, getInputElement]
  );

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`projacktor-gamepad-textfield ${className || ""}`}
      style={{
        flex: 1,
        position: "relative",
        cursor: "text",
        ...style,
      }}
    >
      <TextField
        ref={fieldRef}
        value={value}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDownInternal}
        disabled={disabled}
        {...({
          placeholder,
          spellCheck: false,
          autoCorrect: "off",
          autoCapitalize: "off",
        } as any)}
      />
    </div>
  );
};
