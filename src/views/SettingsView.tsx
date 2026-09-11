import { FC, useState, useEffect, useCallback, useRef, memo } from "react";
import {
  PanelSection,
  PanelSectionRow,
  Field,
  ButtonItem,
  TextField,
  Focusable,
} from "@decky/ui";
import { FaTrash, FaCheck, FaTimes, FaSpinner } from "react-icons/fa";
import {
  rpcGetSettings,
  rpcSaveSettings,
  rpcGetStatus,
  rpcCheckJacred,
  rpcClearCache,
  clearLocalCache,
} from "../api";
import { getActiveDocument } from "../runtime/activeDoc";

// Модульный кэш статуса и URL, чтобы при переключении между вкладками статус не сбрасывался и не мигал красным
let cachedJacredUrl: string | null = null;
let cachedJacredOk: boolean | null = null;

export const SettingsView: FC = memo(() => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [jacredUrl, setJacredUrl] = useState<string>(() => cachedJacredUrl ?? "");
  const [jacredOk, setJacredOk] = useState<boolean | null>(() => cachedJacredOk);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    let isMounted = true;

    rpcGetSettings()
      .then((sett) => {
        if (!isMounted) return;
        if (sett && sett.jacred_url) {
          const url = sett.jacred_url.trim();
          cachedJacredUrl = url;
          setJacredUrl(url);
        }
      })
      .catch(() => {});

    rpcGetStatus()
      .then((st) => {
        if (!isMounted) return;
        if (st) {
          const ok = !!st.jacred_status;
          cachedJacredOk = ok;
          setJacredOk(ok);
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, []);

  // Авто-фокус на первом интерактивном элементе при переходе в настройки (если фокус не на табах)
  useEffect(() => {
    let cancelled = false;
    const focusSett = () => {
      if (cancelled) return true;
      const root = rootRef.current;
      const doc = getActiveDocument(root);
      const active = doc?.activeElement;
      const inTabs = !!(
        active &&
        (active.classList?.contains("projacktor-tab-item") ||
          doc?.querySelector(".projacktor-nav-bar")?.contains(active))
      );
      if (inTabs) return true;

      const firstInteractive = root
        ? root.querySelector<HTMLElement>(
            "input, button, .DialogButton, [tabindex='0']"
          )
        : null;
      if (firstInteractive) {
        try {
          firstInteractive.focus();
        } catch {}
        return true;
      }
      return false;
    };

    if (!focusSett()) {
      const t1 = setTimeout(focusSett, 40);
      const t2 = setTimeout(focusSett, 120);
      const t3 = setTimeout(focusSett, 260);
      return () => {
        cancelled = true;
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSaveSettings = useCallback(async () => {
    setSettingsSaving(true);
    try {
      let cleanUrl = jacredUrl.trim();
      if (cleanUrl) {
        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
          cleanUrl = `https://${cleanUrl}`;
        }
        cleanUrl = cleanUrl.replace(/\/+$/, "");
        setJacredUrl(cleanUrl);
      }
      const ok = cleanUrl ? await rpcCheckJacred(cleanUrl) : false;
      cachedJacredOk = ok;
      cachedJacredUrl = cleanUrl;
      setJacredOk(ok);
      await rpcSaveSettings(JSON.stringify({ jacred_url: cleanUrl }));
    } catch (err) {
      console.error("Не удалось сохранить настройки:", err);
    } finally {
      setSettingsSaving(false);
    }
  }, [jacredUrl]);

  const handleClearCache = useCallback(async () => {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      clearLocalCache();
      await rpcClearCache();
    } catch (err) {
      console.error("Не удалось полностью очистить кэш:", err);
    } finally {
      setClearingCache(false);
    }
  }, [clearingCache]);

  return (
    <Focusable
      ref={rootRef}
      flow-children="vertical"
      noFocusRing
      className="projacktor-content"
      style={{
        width: "100%",
        padding: "6px 52px 24px 52px",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 840, width: "100%", margin: "0 auto" }}>
        <PanelSection title="Парсер Jackett">
          <PanelSectionRow>
            <Field
              label="Статус подключения"
              description={
                jacredOk === null
                  ? "Проверка соединения..."
                  : jacredOk
                  ? "Связь с парсером установлена"
                  : "Парсер недоступен или не настроен"
              }
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                {jacredOk === null ? (
                  <span
                    style={{
                      color: "rgba(255, 255, 255, 0.5)",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <FaSpinner
                      style={{
                        fontSize: 11,
                        animation: "projacktor-spin 1s linear infinite",
                      }}
                    />
                    Проверка...
                  </span>
                ) : jacredOk ? (
                  <span
                    style={{
                      color: "#10b981",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <FaCheck style={{ fontSize: 11 }} /> Подключено
                  </span>
                ) : (
                  <span
                    style={{
                      color: "#ef4444",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                    }}
                  >
                    <FaTimes style={{ fontSize: 11 }} /> Не подключено
                  </span>
                )}
              </div>
            </Field>
          </PanelSectionRow>

          <PanelSectionRow>
            <div style={{ width: "100%", marginTop: 2, marginBottom: 4 }}>
              <TextField
                value={jacredUrl}
                onChange={(e) => setJacredUrl(e.target.value)}
                {...({ placeholder: "URL парсера" } as any)}
              />
            </div>
          </PanelSectionRow>

          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={handleSaveSettings}
              disabled={settingsSaving}
            >
              {settingsSaving ? "Сохранение..." : "Сохранить и проверить"}
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>

        <PanelSection title="Хранилище и кэш">
          <PanelSectionRow>
            <ButtonItem
              layout="below"
              onClick={handleClearCache}
              disabled={clearingCache}
            >
              <FaTrash style={{ marginRight: 8, fontSize: 12 }} />
              {clearingCache
                ? "Очистка..."
                : "Сбросить кэш"}
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      </div>
    </Focusable>
  );
});
