import { FC, useState, useEffect } from "react";
import {
  ButtonItem,
  staticClasses,
  Navigation,
} from "@decky/ui";
import { callable, definePlugin, routerHook } from "@decky/api";
import { FaVideo } from "react-icons/fa";
import { ProjacktorApp } from "./views/ProjacktorApp";
import { GlobalMagicBlackOverlay } from "./components/GlobalMagicBlackOverlay";
import { cleanupControllerInput } from "./runtime/controllerInput";
import { detectSteamLanguage } from "./i18n";

// ── RPC-вызовы Python бэкенда ────────────────────────────────
const getSteamLanguage = callable<[], string>("get_steam_language");

// ── Локализации ──────────────────────────────────────────────
const T: Record<string, Record<string, string>> = {
  english: {
    title:            "Projacktor",
    openCatalog:      "Open Catalog",
    support:          "Support",
  },
  en: {
    title:            "Projacktor",
    openCatalog:      "Open Catalog",
    support:          "Support",
  },
  russian: {
    title:            "Projacktor",
    openCatalog:      "Открыть каталог",
    support:          "Поддержка",
  },
  ru: {
    title:            "Projacktor",
    openCatalog:      "Открыть каталог",
    support:          "Поддержка",
  },
};

// ── Основной контент панели Decky (QAM) ──────────────────────
const Content: FC = () => {
  const [lang, setLang] = useState<string>(() => {
    const cl = detectSteamLanguage();
    return cl.startsWith("en") || cl === "english" ? "english" : "russian";
  });
  const t = T[lang] ?? T.russian;

  useEffect(() => {
    const cl = detectSteamLanguage();
    if (cl) {
      setLang(cl.startsWith("en") || cl === "english" ? "english" : "russian");
      return;
    }

    getSteamLanguage()
      .then((l: unknown) => {
        const steamLang = (typeof l === "string" ? l : "").toLowerCase();
        if (steamLang.startsWith("en") || steamLang === "english") {
          setLang("english");
        } else if (T[steamLang]) {
          setLang(steamLang);
        } else {
          setLang("russian");
        }
      })
      .catch(() => {});
  }, []);

  const openCatalog = () => {
    try {
      Navigation.Navigate("/projacktor");
    } catch {}
    try {
      Navigation.CloseSideMenus();
    } catch {}
    setTimeout(() => {
      try {
        Navigation.CloseSideMenus();
      } catch {}
    }, 50);
  };

  const openSupport = () => {
    try {
      Navigation.CloseSideMenus();
    } catch {}
    Navigation.NavigateToExternalWeb("https://vk.ru/valvesteamdeck");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 0" }}>
      {/* Открыть каталог */}
      <ButtonItem layout="below" onClick={openCatalog}>
        {t.openCatalog}
      </ButtonItem>

      {/* Поддержка */}
      <ButtonItem layout="below" onClick={openSupport}>
        {t.support}
      </ButtonItem>
    </div>
  );
};

// ── Регистрация плагина ──────────────────────────────────────
export default definePlugin(() => {
  try {
    routerHook.addRoute("/projacktor", ProjacktorApp);
  } catch (e) {
    console.error("Projacktor addRoute error:", e);
  }

  try {
    routerHook.addGlobalComponent("ProjacktorMagicBlack", GlobalMagicBlackOverlay);
  } catch (e) {
    console.error("Projacktor addGlobalComponent error:", e);
  }

  return {
    name:      "Projacktor",
    titleView: <div className={staticClasses.Title}>Projacktor</div>,
    content:   <Content />,
    icon:      <FaVideo />,
    onDismount() {
      try {
        routerHook.removeRoute("/projacktor");
      } catch (e) {
        console.error("Projacktor removeRoute error:", e);
      }
      try {
        routerHook.removeGlobalComponent("ProjacktorMagicBlack");
      } catch (e) {
        console.error("Projacktor removeGlobalComponent error:", e);
      }
      try {
        cleanupControllerInput();
      } catch (e) {
        console.error("Projacktor cleanupControllerInput error:", e);
      }
    },
  };
});
