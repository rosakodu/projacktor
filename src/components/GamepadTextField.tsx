import { FC, useRef, useEffect, useCallback, CSSProperties, KeyboardEvent } from "react";
import { Focusable, TextField } from "@decky/ui";

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

  const focusAndOpenKeyboard = useCallback(() => {
    if (disabled) return;
    const input = getInputElement();
    if (input) {
      try {
        input.scrollIntoView({ block: "center", behavior: "smooth" });
      } catch {}
      input.focus();
      input.click();
    }
  }, [disabled, getInputElement]);

  // При закрытии виртуальной клавиатуры (OK или Cancel) возвращаем фокус на контейнер Focusable
  useEffect(() => {
    const input = getInputElement();
    if (!input) return;

    const onCancel = (e: Event) => {
      e.stopPropagation();
      containerRef.current?.focus();
    };

    const onOk = (e: Event) => {
      e.stopPropagation();
      containerRef.current?.focus();
      onSubmit?.();
    };

    input.addEventListener("vgp_oncancel", onCancel);
    input.addEventListener("vgp_onok", onOk);

    return () => {
      input.removeEventListener("vgp_oncancel", onCancel);
      input.removeEventListener("vgp_onok", onOk);
    };
  }, [getInputElement, onSubmit]);

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

  return (
    <Focusable
      ref={containerRef}
      onActivate={focusAndOpenKeyboard}
      onClick={focusAndOpenKeyboard}
      onGamepadDirection={onGamepadDirection}
      noFocusRing
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
    </Focusable>
  );
};
