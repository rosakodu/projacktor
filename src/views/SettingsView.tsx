import { FC, useState, useEffect, useCallback, memo } from "react";
import { Focusable, TextField } from "@decky/ui";
import { toaster } from "@decky/api";
import { FaTrash } from "react-icons/fa";
import {
  rpcGetSettings,
  rpcSaveSettings,
  rpcGetStatus,
  rpcCheckJacred,
  rpcClearCache,
  clearLocalCache,
} from "../api";

export const SettingsView: FC = memo(() => {
  const [jacredUrl, setJacredUrl] = useState("https://jac.red");
  const [jacredOk, setJacredOk] = useState<boolean | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);

  useEffect(() => {
    rpcGetSettings()
      .then((sett) => {
        if (sett && sett.jacred_url) {
          setJacredUrl(sett.jacred_url);
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
      const ok = await rpcCheckJacred(jacredUrl);
      setJacredOk(ok);
      await rpcSaveSettings(JSON.stringify({ jacred_url: jacredUrl }));
      toaster.toast({
        title: "Настройки",
        body: ok
          ? "Сохранено! Соединение с JacRed успешно."
          : "Сохранено, но JacRed недоступен.",
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
    <div className="projacktor-content" style={{ maxWidth: 520, padding: "12px 20px" }}>
      <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Настройки</div>

      <div
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.07)",
          padding: "8px 12px",
          fontSize: 12,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Статус парсера:</span>
          <span
            style={{
              color: jacredOk ? "#10b981" : "#ef4444",
              fontWeight: 600,
            }}
          >
            {jacredOk ? "Подключено" : "Не подключено"}
          </span>
        </div>
      </div>

      <div>
        <div
          style={{
            fontSize: 12,
            marginBottom: 4,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          Ссылка на парсер
        </div>
        <TextField
          value={jacredUrl}
          onChange={(e) => setJacredUrl(e.target.value)}
          {...({ placeholder: "https://jac.red" } as any)}
        />
        <div style={{ marginTop: 8 }}>
          <Focusable
            className="ds-btn ds-btn--primary ds-btn--compact"
            onActivate={handleSaveSettings}
            onClick={handleSaveSettings}
          >
            {settingsSaving ? "Сохранение..." : "Сохранить и проверить"}
          </Focusable>
        </div>
      </div>

      <div
        style={{
          marginTop: 18,
          paddingTop: 12,
          borderTop: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            marginBottom: 4,
            color: "rgba(255,255,255,0.8)",
          }}
        >
          Кэш каталога, стримов и загрузок
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--ds-text-dim)",
            marginBottom: 8,
          }}
        >
          Очищает метаданные TMDB, постеры, историю страниц и временные файлы онлайн-просмотра.
        </div>
        <Focusable
          className="ds-btn ds-btn--danger ds-btn--compact"
          onActivate={handleClearCache}
          onClick={handleClearCache}
        >
          <FaTrash style={{ marginRight: 6, fontSize: 10 }} />
          {clearingCache ? "Очистка..." : "Сбросить кэш"}
        </Focusable>
      </div>
    </div>
  );
});
