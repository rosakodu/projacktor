import { FC, useState, useEffect, useCallback, memo } from "react";
import {
  PanelSection,
  PanelSectionRow,
  Field,
  ButtonItem,
  TextField,
} from "@decky/ui";
import { toaster } from "@decky/api";
import { FaTrash, FaCheck, FaTimes } from "react-icons/fa";
import {
  rpcGetSettings,
  rpcSaveSettings,
  rpcGetStatus,
  rpcCheckJacred,
  rpcClearCache,
  clearLocalCache,
} from "../api";

export const SettingsView: FC = memo(() => {
  const [jacredUrl, setJacredUrl] = useState("");
  const [jacredOk, setJacredOk] = useState<boolean | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    rpcGetSettings()
      .then((sett) => {
        if (sett && sett.jacred_url) {
          const url = sett.jacred_url.trim();
          if (
            url !== "https://jac.red" &&
            url !== "https://jac.red/" &&
            url !== "jac.red"
          ) {
            setJacredUrl(url);
          } else {
            setJacredUrl("");
          }
        }
      })
      .catch(() => {});

    rpcGetStatus()
      .then((st) => {
        if (st) {
          setJacredOk(!!st.jacred_status);
        }
      })
      .catch(() => {});
  }, []);

  const handleSaveSettings = useCallback(async () => {
    setSettingsSaving(true);
    try {
      const cleanUrl = jacredUrl.trim();
      const ok = cleanUrl ? await rpcCheckJacred(cleanUrl) : false;
      setJacredOk(ok);
      await rpcSaveSettings(JSON.stringify({ jacred_url: cleanUrl }));
      toaster.toast({
        title: "Настройки",
        body: !cleanUrl
          ? "Настройки сохранены (URL парсера очищен)"
          : ok
          ? "Сохранено! Соединение с Jackett успешно."
          : "Сохранено, но сервер Jackett недоступен.",
      });
    } catch {
      toaster.toast({ title: "Ошибка", body: "Не удалось сохранить настройки" });
    } finally {
      setSettingsSaving(false);
    }
  }, [jacredUrl]);

  const handleClearCache = useCallback(async () => {
    if (clearingCache) return;
    setClearingCache(true);
    try {
      clearLocalCache();
      const res = await rpcClearCache();
      if (res) {
        toaster.toast({
          title: "Очистка кэша",
          body: "Кэш каталога и изображений успешно сброшен.",
        });
      } else {
        toaster.toast({
          title: "Очистка кэша",
          body: "Локальный кэш очищен, ошибка очистки дискового кэша.",
        });
      }
    } catch {
      toaster.toast({
        title: "Ошибка",
        body: "Не удалось полностью очистить кэш",
      });
    } finally {
      setClearingCache(false);
    }
  }, [clearingCache]);

  return (
    <div
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
                {jacredOk ? (
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
                {...({ placeholder: "URL парсера (например: http://192.168.1.50:9117)" } as any)}
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
                : "Сбросить кэш (TMDB, постеры, стримы)"}
            </ButtonItem>
          </PanelSectionRow>
        </PanelSection>
      </div>
    </div>
  );
});
