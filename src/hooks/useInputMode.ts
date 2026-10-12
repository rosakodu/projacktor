import { useState, useEffect } from "react";
import { InputMode, getInputMode, subscribeInputMode, initDeviceState } from "../runtime/deviceState";

export function useInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(getInputMode);

  useEffect(() => {
    initDeviceState();
    const unsub = subscribeInputMode((nextMode) => {
      setMode(nextMode);
    });
    return unsub;
  }, []);

  return mode;
}
