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
  const lastActivateTimeRef = useRef<number>(0);
  const activateTimerRef = useRef<any>(null);

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

  const handleActivate = useCallback(() => {
    if (disabled) return;

    const now = Date.now();
    if (now - lastActivateTimeRef.current < 400) {
      return;
    }
    lastActivateTimeRef.current = now;

    if (activateTimerRef.current) {
      clearTimeout(activateTimerRef.current);
    }

    // Делаем небольшую задержку (50мс), чтобы обработчик кнопки 'A' в навигации SteamOS
    // успел завершить свой цикл на контейнере Focusable и не перехватил фокус обратно с input
    activateTimerRef.current = setTimeout(() => {
      const input = getInputElement();
      if (input) {
        try {
          input.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {}
        input.focus();
        input.click();
      }
    }, 50);
  }, [disabled, getInputElement]);

  const handleClick = useCallback(
    (e: any) => {
      if (disabled) return;
      const input = getInputElement();
      // Если клик пришёлся прямо на сам <input>, браузер и SteamOS уже открывают клавиатуру нативно!
      // Повторный вызов input.click() приводит к мгновенному закрытию клавиатуры в SteamOS.
      if (input && (e?.target === input || input.contains(e?.target as Node))) {
        try {
          input.scrollIntoView({ block: "center", behavior: "smooth" });
        } catch {}
        return;
      }
      handleActivate();
    },
    [disabled, getInputElement, handleActivate]
  );

  useEffect(() => {
    return () => {
      if (activateTimerRef.current) {
        clearTimeout(activateTimerRef.current);
      }
    };
  }, []);

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
      onActivate={handleActivate}
      onClick={handleClick}
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
        onClick={(e: any) => {
          // Предотвращаем всплытие клика от input к контейнеру
          e?.stopPropagation?.();
        }}
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
