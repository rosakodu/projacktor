import { FC, useState, useEffect, useCallback, useRef, memo } from "react";
import {
  PanelSection,
  PanelSectionRow,
  Focusable,
} from "@decky/ui";
import { FaTrash, FaCheck, FaTimes, FaSpinner, FaHdd, FaSdCard } from "react-icons/fa";
import { GamepadTextField } from "../components";
import {
  rpcGetSettings,
  rpcSaveSettings,
  rpcGetStatus,
  rpcCheckJacred,
  rpcClearCache,
  clearLocalCache,
  formatBytes,
  StorageDrive,
} from "../api";
import { getActiveDocument } from "../runtime/activeDoc";
import { useI18n } from "../i18n";

// Модульный кэш статуса и URL, чтобы при переключении между вкладками статус не сбрасывался и не мигал красным
let cachedJacredUrl: string | null = null;
let cachedJacredOk: boolean | null = null;
let cachedTorrServerOk: boolean | null = null;
let cachedTorrServerPort: number = 8095;

const LOCAL_STORAGE_JACRED_KEY = "projacktor_jacred_url";

export const SettingsView: FC = memo(() => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [jacredUrl, setJacredUrl] = useState<string>(() => {
    if (cachedJacredUrl) return cachedJacredUrl;
    try {
      const local = localStorage.getItem(LOCAL_STORAGE_JACRED_KEY);
      if (local && local.trim()) return local.trim();
    } catch {}
    return "";
  });
  const [jacredOk, setJacredOk] = useState<boolean | null>(() => cachedJacredOk);
  const [torrServerOk, setTorrServerOk] = useState<boolean | null>(() => cachedTorrServerOk);
  const [torrServerPort, setTorrServerPort] = useState<number>(() => cachedTorrServerPort);
  const [downloadPath, setDownloadPath] = useState<string>("");
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [pathSaving, setPathSaving] = useState(false);
  const [pathSavedSuccess, setPathSavedSuccess] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [cacheClearedSuccess, setCacheClearedSuccess] = useState(false);
  const [drives, setDrives] = useState<StorageDrive[]>([]);

  useEffect(() => {
    let isMounted = true;

    rpcGetSettings()
      .then((sett) => {
        if (!isMounted) return;
        let url = sett && sett.jacred_url ? sett.jacred_url.trim() : "";
        if (!url) {
          // Если на бэкенде ссылка пустая, проверяем localStorage
          try {
            const local = localStorage.getItem(LOCAL_STORAGE_JACRED_KEY);
            if (local && local.trim()) {
              url = local.trim();
              rpcSaveSettings(JSON.stringify({ jacred_url: url })).catch(() => {});
            }
          } catch {}
        }
        if (url) {
          cachedJacredUrl = url;
          setJacredUrl(url);
          try {
            localStorage.setItem(LOCAL_STORAGE_JACRED_KEY, url);
          } catch {}
        }
        if (sett && sett.download_path) {
          setDownloadPath(sett.download_path);
        }
      })
      .catch(() => {});

    const statusTimeout = new Promise<any>((resolve) => setTimeout(() => resolve(null), 6000));
    Promise.race([rpcGetStatus(), statusTimeout])
      .then((st: any) => {
        if (!isMounted) return;
        if (st) {
          const ok = !!st.jacred_status;
          cachedJacredOk = ok;
          setJacredOk(ok);
          const tsOk = !!st.torrserver_running;
          cachedTorrServerOk = tsOk;
          setTorrServerOk(tsOk);
          if (st.torrserver_port) {
            cachedTorrServerPort = st.torrserver_port;
            setTorrServerPort(st.torrserver_port);
          }
          if (Array.isArray(st.drives)) {
            setDrives(st.drives);
          }
          if (st.download_path && !downloadPath) {
            setDownloadPath(st.download_path);
          }
        } else {
          if (cachedJacredOk === null) {
            cachedJacredOk = false;
            setJacredOk(false);
          }
          if (cachedTorrServerOk === null) {
            cachedTorrServerOk = false;
            setTorrServerOk(false);
          }
        }
      })
      .catch(() => {
        if (!isMounted) return;
        if (cachedJacredOk === null) {
          cachedJacredOk = false;
          setJacredOk(false);
        }
        if (cachedTorrServerOk === null) {
          cachedTorrServerOk = false;
          setTorrServerOk(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Авто-фокус на первом интерактивном элементе при переходе в настройки
  useEffect(() => {
    let cancelled = false;
    const focusSett = () => {
      if (cancelled) return true;
      const root = rootRef.current;
      const doc = getActiveDocument(root);

      const firstInteractive = root
        ? root.querySelector<HTMLElement>(
            "input, .DialogInput, button, .DialogButton, [tabindex='0']"
          )
        : null;
      if (firstInteractive) {
        try {
          doc?.querySelectorAll(".gpfocus").forEach((el) => el.classList.remove("gpfocus"));
          firstInteractive.focus();
          firstInteractive.classList.add("gpfocus");
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
    if (settingsSaving) return;
    setSettingsSaving(true);
    try {
      let cleanUrl = jacredUrl.trim();
      if (cleanUrl) {
        // Очищаем от путей API, если пользователь скопировал полную ссылку
        cleanUrl = cleanUrl.replace(/\/api\/v2\.0\/.*$/i, "");
        cleanUrl = cleanUrl.replace(/\/api\/.*$/i, "");
        cleanUrl = cleanUrl.replace(/\/+$/, "");

        if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
          const isLocal =
            /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.)/i.test(cleanUrl) ||
            /:(9117|8090|8095|8080|80)\b/.test(cleanUrl);
          cleanUrl = isLocal ? `http://${cleanUrl}` : `https://${cleanUrl}`;
        }
        setJacredUrl(cleanUrl);
      }

      // Защита от бесконечного ожидания ответа от бэкенда
      const checkPromise = cleanUrl ? rpcCheckJacred(cleanUrl) : Promise.resolve(false);
      const timeoutPromise = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 7000));
      const ok = await Promise.race([checkPromise, timeoutPromise]).catch(() => false);

      cachedJacredOk = ok;
      cachedJacredUrl = cleanUrl;
      setJacredOk(ok);
      try {
        if (cleanUrl) {
          localStorage.setItem(LOCAL_STORAGE_JACRED_KEY, cleanUrl);
        }
      } catch {}
      await rpcSaveSettings(JSON.stringify({ jacred_url: cleanUrl })).catch(() => {});
    } catch (err) {
      console.error("Не удалось сохранить настройки:", err);
      cachedJacredOk = false;
      setJacredOk(false);
    } finally {
      setSettingsSaving(false);
    }
  }, [jacredUrl, settingsSaving]);

  const handleSaveDownloadPath = useCallback(async (customPath?: string) => {
    const pathToSave = (customPath ?? downloadPath).trim();
    if (!pathToSave) return;
    setPathSaving(true);
    setPathSavedSuccess(false);
    try {
      await rpcSaveSettings(JSON.stringify({ download_path: pathToSave }));
      setDownloadPath(pathToSave);
      setPathSavedSuccess(true);
      setTimeout(() => setPathSavedSuccess(false), 2500);
    } catch (err) {
      console.error("Не удалось сохранить путь:", err);
    } finally {
      setPathSaving(false);
    }
  }, [downloadPath]);

  const handleSelectDrivePreset = useCallback((drive: StorageDrive) => {
    const targetPath = drive.path
      ? (drive.path.endsWith("/Projacktor") ? drive.path : `${drive.path}/Videos/Projacktor`)
      : "";
    if (targetPath) {
      setDownloadPath(targetPath);
      handleSaveDownloadPath(targetPath);
    }
  }, [handleSaveDownloadPath]);


  const handleClearCache = useCallback(async () => {
    if (clearingCache) return;
    setClearingCache(true);
    setCacheClearedSuccess(false);
    try {
      clearLocalCache();
      await rpcClearCache();
      setCacheClearedSuccess(true);
      setTimeout(() => setCacheClearedSuccess(false), 2500);
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
      onGamepadDirection={(evt: any) => {
        const btn = evt?.detail?.button;
        if (btn === 9) {
          // DPAD_UP: блокируем переход вверх, если фокус в первом блоке настроек
          const doc = getActiveDocument(rootRef.current);
          const active = doc?.activeElement;
          const firstSection = rootRef.current?.querySelector(".PanelSectionRow, [flow-children='row']");
          if (active && firstSection && (firstSection === active || firstSection.contains(active))) {
            try {
              evt?.preventDefault?.();
              evt?.stopPropagation?.();
            } catch {}
            return false;
          }
        }
        return undefined;
      }}
      style={{
        width: "100%",
        padding: "12px 36px 240px 36px",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>
        
        {/* Карточка 1: Сеть и TorrServer */}
        <div className="projacktor-settings-card">
          <PanelSection>
            <PanelSectionRow>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("jackettParserUrl")}</span>
                <div>
                  {jacredOk === null ? (
                    <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <FaSpinner style={{ fontSize: 10, animation: "projacktor-spin 1s linear infinite" }} /> {t("checking")}
                    </span>
                  ) : jacredOk ? (
                    <span style={{ color: "#1a9fff", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <FaCheck style={{ fontSize: 10 }} /> {t("connected")}
                    </span>
                  ) : (
                    <span style={{ color: "#ef4444", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <FaTimes style={{ fontSize: 10 }} /> {t("notConnected")}
                    </span>
                  )}
                </div>
              </div>
            </PanelSectionRow>

            <PanelSectionRow>
              <Focusable noFocusRing flow-children="row" style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", marginBottom: 8 }}>
                <GamepadTextField
                  value={jacredUrl}
                  onChange={setJacredUrl}
                  onSubmit={handleSaveSettings}
                  onBlur={handleSaveSettings}
                  placeholder={t("enterParserUrl")}
                />
                <Focusable
                  noFocusRing
                  onActivate={handleSaveSettings}
                  onClick={handleSaveSettings}
                  className="ds-btn ds-btn--compact ds-btn--primary"
                  style={{
                    padding: "6px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    height: 36,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0
                  }}
                >
                  {settingsSaving ? <FaSpinner style={{ fontSize: 10, animation: "projacktor-spin 1s linear infinite" }} /> : null}
                  {settingsSaving ? t("checking") : t("check")}
                </Focusable>
              </Focusable>
            </PanelSectionRow>

            <PanelSectionRow>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8, marginTop: 2, width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{t("torrserverStatus")}</div>
                  <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>
                    {t("port")}: {torrServerPort}
                  </div>
                </div>
                <div>
                  {torrServerOk === null ? (
                    <span style={{ color: "rgba(255, 255, 255, 0.5)", fontSize: 11, display: "inline-flex", alignItems: "center", gap: 5 }}>
                      <FaSpinner style={{ fontSize: 10, animation: "projacktor-spin 1s linear infinite" }} /> {t("checking")}
                    </span>
                  ) : torrServerOk ? (
                    <span style={{ color: "#1a9fff", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <FaCheck style={{ fontSize: 10 }} /> {t("running")}
                    </span>
                  ) : (
                    <span style={{ color: "#ef4444", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <FaTimes style={{ fontSize: 10 }} /> {t("stopped")}
                    </span>
                  )}
                </div>
              </div>
            </PanelSectionRow>
          </PanelSection>
        </div>

        {/* Карточка 2: Путь сохранения и Накопители */}
        <div className="projacktor-settings-card">
          <PanelSection>
            <PanelSectionRow>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", marginBottom: 4 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{t("downloadDirectory")}</span>
                {pathSavedSuccess && (
                  <span style={{ color: "#1a9fff", fontSize: 11, fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <FaCheck style={{ fontSize: 10 }} /> {t("saved")}
                  </span>
                )}
              </div>
            </PanelSectionRow>

            <PanelSectionRow>
              <Focusable noFocusRing flow-children="row" style={{ display: "flex", gap: 8, alignItems: "center", width: "100%", marginBottom: 6 }}>
                <GamepadTextField
                  value={downloadPath}
                  onChange={setDownloadPath}
                  placeholder="~/Videos/Projacktor"
                />
                <Focusable
                  noFocusRing
                  onActivate={() => handleSaveDownloadPath()}
                  onClick={() => handleSaveDownloadPath()}
                  className="ds-btn ds-btn--compact ds-btn--primary"
                  style={{
                    padding: "6px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                    whiteSpace: "nowrap",
                    height: 36,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    flexShrink: 0
                  }}
                >
                  {pathSaving ? "..." : t("save")}
                </Focusable>
              </Focusable>
            </PanelSectionRow>

            {/* Быстрые пресеты накопителей */}
            {drives.length > 0 && (
              <PanelSectionRow>
                <Focusable noFocusRing flow-children="row" style={{ display: "flex", flexWrap: "wrap", gap: 6, width: "100%", marginBottom: 8 }}>
                  {drives.map((d) => {
                    const isCurrent =
                      downloadPath === d.path ||
                      downloadPath.startsWith(d.path) ||
                      (d.id === "internal" && !downloadPath.includes("/run/media"));
                    return (
                      <Focusable
                        noFocusRing
                        key={d.id}
                        onActivate={() => handleSelectDrivePreset(d)}
                        onClick={() => handleSelectDrivePreset(d)}
                        className="ds-btn ds-btn--compact"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "5px 10px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          backgroundColor: isCurrent ? "rgba(26, 159, 255, 0.2)" : "rgba(255, 255, 255, 0.05)",
                          border: isCurrent ? "1px solid #1a9fff" : "1px solid rgba(255, 255, 255, 0.1)",
                          borderRadius: 5,
                          color: isCurrent ? "#60baff" : "#ffffff",
                        }}
                      >
                        {d.is_removable ? (
                          <FaSdCard style={{ fontSize: 11, color: isCurrent ? "#60baff" : "#60a5fa" }} />
                        ) : (
                          <FaHdd style={{ fontSize: 11, color: isCurrent ? "#60baff" : "#94a3b8" }} />
                        )}
                        <span>{d.id === "internal" ? t("internalStorage") : d.is_removable ? t("microSDCard") : d.name}</span>
                        <span style={{ fontSize: 10, opacity: 0.65 }}>({formatBytes(d.free)} {t("freeSpace")})</span>
                      </Focusable>
                    );
                  })}
                </Focusable>
              </PanelSectionRow>
            )}

            {/* Сброс кэша */}
            <PanelSectionRow>
              <Focusable
                noFocusRing
                flow-children="row"
                style={{
                  borderTop: "1px solid rgba(255,255,255,0.06)",
                  paddingTop: 8,
                  marginTop: 2,
                  width: "100%",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center"
                }}
              >
                <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{t("cachePostersMetadata")}</span>
                <Focusable
                  noFocusRing
                  onActivate={handleClearCache}
                  onClick={handleClearCache}
                  className="ds-btn ds-btn--compact ds-btn--danger"
                  style={{
                    padding: "5px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                  }}
                >
                  <FaTrash style={{ fontSize: 10 }} />
                  {clearingCache ? t("clearing") : cacheClearedSuccess ? `✓ ${t("cleared")}` : t("clearCache")}
                </Focusable>
              </Focusable>
            </PanelSectionRow>
          </PanelSection>
        </div>

      </div>
    </Focusable>
  );
});
