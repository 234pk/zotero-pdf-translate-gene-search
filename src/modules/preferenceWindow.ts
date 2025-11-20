import { config, homepage } from "../../package.json";
import { LANG_CODE } from "../utils/config";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import { setServiceSecret, validateServiceSecret } from "../utils/secret";
import { createServiceSettingsDialog } from "../utils";
import { services } from "./services";

// 添加rootURI定义，使用chrome URI格式
const rootURI = `chrome://${config.addonRef}/`;

export function registerPrefsWindow() {
  Zotero.PreferencePanes.register({
    pluginID: config.addonID,
    src: rootURI + "chrome/content/preferences.xhtml",
    label: getString("pref-title"),
    image: `chrome://${config.addonRef}/content/icons/favicon.png`,
    helpURL: homepage,
  });
}

export function registerPrefsScripts(_window: Window) {
  // This function is called when the prefs window is opened
  addon.data.prefs.window = _window;
  buildPrefsPane();
  updatePrefsPaneDefault();
}

function buildPrefsPane() {
  const doc = addon.data.prefs.window?.document;
  if (!doc) {
    return;
  }

  // menus
  ztoolkit.UI.replaceElement(
    {
      tag: "menulist",
      id: makeId("sentenceServices"),
      attributes: {
        value: getPref("translateSource") as string,
        native: "true",
      },
      listeners: [
        {
          type: "command",
          listener: (e: Event) => {
            onPrefsEvents("setSentenceService");
          },
        },
      ],
      children: [
        {
          tag: "menupopup",
          children: services.getAllServicesWithType("sentence").map((s) => ({
            tag: "menuitem",
            attributes: {
              label: services.getServiceNameByID(s.id),
              value: s.id,
            },
          })),
        },
      ],
    },
    doc.querySelector(`#${makeId("sentenceServices-placeholder")}`)!,
  );

  ztoolkit.UI.replaceElement(
    {
      tag: "menulist",
      id: makeId("wordServices"),
      attributes: {
        value: getPref("dictSource") as string,
        native: "true",
      },
      classList: ["use-word-service"],
      listeners: [
        {
          type: "command",
          listener: (e: Event) => {
            onPrefsEvents("setWordService");
          },
        },
      ],
      children: [
        {
          tag: "menupopup",
          children: services.getAllServicesWithType("word").map((s) => ({
            tag: "menuitem",
            attributes: {
              label: services.getServiceNameByID(s.id),
              value: s.id,
            },
          })),
        },
      ],
    },
    doc.querySelector(`#${makeId("wordServices-placeholder")}`)!,
  );

  ztoolkit.UI.replaceElement(
    {
      tag: "menulist",
      id: makeId("langfrom"),
      attributes: {
        value: getPref("sourceLanguage") as string,
        native: "true",
      },
      listeners: [
        {
          type: "command",
          listener: (e: Event) => {
            onPrefsEvents("setSourceLanguage");
          },
        },
      ],
      styles: {
        maxWidth: "250px",
      },
      children: [
        {
          tag: "menupopup",
          children: LANG_CODE.map((lang) => ({
            tag: "menuitem",
            attributes: {
              label: lang.name,
              value: lang.code,
            },
          })),
        },
      ],
    },
    doc.querySelector(`#${makeId("langfrom-placeholder")}`)!,
  );

  ztoolkit.UI.replaceElement(
    {
      tag: "menulist",
      id: makeId("langto"),
      attributes: {
        value: getPref("targetLanguage") as string,
        native: "true",
      },
      listeners: [
        {
          type: "command",
          listener: (e: Event) => {
            onPrefsEvents("setTargetLanguage");
          },
        },
      ],
      styles: {
        maxWidth: "250px",
      },
      children: [
        {
          tag: "menupopup",
          children: LANG_CODE.map((lang) => ({
            tag: "menuitem",
            attributes: {
              label: lang.name,
              value: lang.code,
            },
          })),
        },
      ],
    },
    doc.querySelector(`#${makeId("langto-placeholder")}`)!,
  );

  doc
    .querySelector(`#${makeId("manageKeys")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("manageKeys");
    });
  doc
    .querySelector(`#${makeId("renameServices")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("renameServices");
    });

  doc
    .querySelector(`#${makeId("enableAuto")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setAutoTranslateSelection");
    });

  doc
    .querySelector(`#${makeId("enableComment")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setAutoTranslateAnnotation");
    });

  doc
    .querySelector(`#${makeId("enablePopup")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setEnablePopup");
    });

  doc
    .querySelector(`#${makeId("enableAddToNote")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setEnableAddToNote");
    });

  doc
    .querySelector(`#${makeId("showPlayBtn")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowPlayBtn");
    });

  doc
    .querySelector(`#${makeId("useWordService")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setUseWordService");
    });

  doc
    .querySelector(`#${makeId("enableHidePopupTextarea")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setEnableHidePopupTextarea");
    });

  doc
    .querySelector(`#${makeId("enableNoteReplaceMode")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setEnableNoteReplaceMode");
    });

  doc
    .querySelector(`#${makeId("attachPaperContext")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setAttachPaperContext");
    });

  doc
    .querySelector(`#${makeId("enableMathRendering")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setEnableMathRendering");
    });

  doc
    .querySelector(`#${makeId("stripEmptyLines")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setStripEmptyLines");
    });

  doc
    .querySelector(`#${makeId("enableAutoDetectLanguage")}`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setEnableAutoDetectLanguage");
    });

  // 界面设置复选框事件绑定
  doc
    .querySelector(`[preference="__prefsPrefix__.showItemMenuTitleTranslation"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowItemMenuTitleTranslation");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showItemMenuAbstractTranslation"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowItemMenuAbstractTranslation");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showSidebarEngine"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowSidebarEngine");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showSidebarLanguage"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowSidebarLanguage");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showSidebarRaw"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowSidebarRaw");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.rawResultOrder"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setRawResultOrder");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showSidebarSettings"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowSidebarSettings");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showSidebarConcat"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowSidebarConcat");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.enableConcatKey"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setEnableConcatKey");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showSidebarCopy"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowSidebarCopy");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showItemBoxTitleTranslation"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowItemBoxTitleTranslation");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.showItemBoxAbstractTranslation"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setShowItemBoxAbstractTranslation");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.keepWindowTop"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setKeepWindowTop");
    });

  doc
    .querySelector(`[preference="__prefsPrefix__.keepPopupSize"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setKeepPopupSize");
    });

  // 其他复选框事件绑定
  doc
    .querySelector(`[preference="__prefsPrefix__.autoPlay"]`)
    ?.addEventListener("command", (e: Event) => {
      onPrefsEvents("setAutoPlay");
    });

  doc
    .querySelector(`#${makeId("sentenceServicesSecret")}`)
    ?.addEventListener("input", (e: Event) => {
      onPrefsEvents("updateSentenceSecret");
    });

  doc
    .querySelector(`#${makeId("wordServicesSecret")}`)
    ?.addEventListener("input", (e: Event) => {
      onPrefsEvents("updateWordSecret");
    });

  doc
    .querySelector(`#${makeId("fontSize")}`)
    ?.addEventListener("input", (e: Event) => {
      onPrefsEvents("updateFontSize");
    });

  doc
    .querySelector(`#${makeId("lineHeight")}`)
    ?.addEventListener("input", (e: Event) => {
      onPrefsEvents("updatelineHeight");
    });

  doc
    .querySelector(`#${makeId("reset-titleTranslation")}`)
    ?.addEventListener("command", (e: Event) => {
      ztoolkit
        .getGlobal("ZoteroPane")
        .getSelectedItems()
        .forEach((item) => {
          ztoolkit.ExtraField.setExtraField(item, "titleTranslation", "");
        });
    });

  doc
    .querySelector(`#${makeId("reset-abstractTranslation")}`)
    ?.addEventListener("command", (e: Event) => {
      ztoolkit
        .getGlobal("ZoteroPane")
        .getSelectedItems()
        .forEach((item) => {
          ztoolkit.ExtraField.setExtraField(item, "abstractTranslation", "");
        });
    });
}

function updatePrefsPaneDefault() {
  onPrefsEvents("setAutoTranslateAnnotation", false);
  onPrefsEvents("setEnablePopup", false);
  onPrefsEvents("setShowPlayBtn", false);
  onPrefsEvents("setUseWordService", false);
  onPrefsEvents("setSentenceSecret", false);
  onPrefsEvents("setWordSecret", false);
}

function onPrefsEvents(type: string, fromElement: boolean = true) {
  const doc = addon.data.prefs.window?.document;
  if (!doc) {
    return;
  }

  const setDisabled = (className: string, disabled: boolean) => {
    doc
      .querySelectorAll(`.${className}`)
      .forEach(
        (elem) => ((elem as XUL.Element & XUL.IDisabled).disabled = disabled),
      );
  };
  switch (type) {
    case "setAutoTranslateSelection":
      addon.hooks.onReaderTabPanelRefresh();
      break;
    case "setAutoTranslateAnnotation":
      {
        addon.hooks.onReaderTabPanelRefresh();
      }
      break;
    case "setEnablePopup":
      {
        const elemValue = fromElement
          ? (doc.querySelector(`#${makeId("enablePopup")}`) as XUL.Checkbox)
              .checked
          : (getPref("enablePopup") as boolean);
        const hidden = !elemValue;
        setDisabled("enable-popup", hidden);
        if (!hidden) {
          onPrefsEvents("setEnableAddToNote", fromElement);
        }
      }
      break;
    case "setEnableAddToNote":
      {
        const elemValue = fromElement
          ? (doc.querySelector(`#${makeId("enableAddToNote")}`) as XUL.Checkbox)
              .checked
          : (getPref("enableNote") as boolean);
        const hidden = !elemValue;
        setDisabled("enable-popup-addtonote", hidden);
      }
      break;
    case "setShowPlayBtn":
      {
        const elemValue = fromElement
          ? (doc.querySelector(`#${makeId("showPlayBtn")}`) as XUL.Checkbox)
              .checked
          : (getPref("showPlayBtn") as boolean);
        const hidden = !elemValue;
        setDisabled("show-play-btn", hidden);
      }
      break;
    case "setUseWordService":
      {
        const elemValue = fromElement
          ? (doc.querySelector(`#${makeId("useWordService")}`) as XUL.Checkbox)
              .checked
          : (getPref("enableDict") as boolean);
        const hidden = !elemValue;
        setDisabled("use-word-service", hidden);
        if (!hidden) {
          onPrefsEvents("setShowPlayBtn", fromElement);
        }
      }
      break;
    case "setSentenceService":
      {
        setPref(
          "translateSource",
          (
            doc.querySelector(`#${makeId("sentenceServices")}`) as XUL.MenuList
          ).getAttribute("value")!,
        );
        onPrefsEvents("setSentenceSecret", fromElement);
        addon.hooks.onReaderTabPanelRefresh();
      }
      break;
    case "updateSentenceSecret":
      {
        setServiceSecret(
          getPref("translateSource") as string,
          (
            doc.querySelector(
              `#${makeId("sentenceServicesSecret")}`,
            ) as HTMLInputElement
          ).value,
        );
      }
      break;
    case "setSentenceSecret":
      {
        const serviceId = getPref("translateSource") as string;
        const secretCheckResult = validateServiceSecret(
          serviceId,
          (validateResult) => {
            if (fromElement && !validateResult.status) {
              addon.data.prefs.window?.alert(
                `You see this because the translation service ${serviceId} requires SECRET, which is NOT correctly set.\n\nDetails:\n${validateResult.info}`,
              );
            }
          },
        );
        (
          doc.querySelector(
            `#${makeId("sentenceServicesSecret")}`,
          ) as HTMLInputElement
        ).value = secretCheckResult.secret;

        // Update secret status button
        const statusButton = doc.querySelector(
          `#${makeId("sentenceServicesStatus")}`,
        ) as XUL.Button;
        const service =
          addon.data.translate.services.getServiceById(serviceId)!;
        if (service.config) {
          statusButton.hidden = false;
          statusButton.label = getString("service-dialog-config");
          statusButton.onclick = (ev) => {
            createServiceSettingsDialog(service);
          };
        } else {
          statusButton.hidden = true;
        }
      }
      break;
    case "setWordService":
      {
        setPref(
          "dictSource",
          (
            doc.querySelector(`#${makeId("wordServices")}`) as XUL.MenuList
          ).getAttribute("value")!,
        );
        onPrefsEvents("setWordSecret", fromElement);
      }
      break;
    case "updateWordSecret":
      {
        setServiceSecret(
          getPref("dictSource") as string,
          (
            doc.querySelector(
              `#${makeId("wordServicesSecret")}`,
            ) as HTMLInputElement
          ).value,
        );
      }
      break;
    case "setWordSecret":
      {
        const serviceId = getPref("dictSource") as string;
        const secretCheckResult = validateServiceSecret(
          serviceId,
          (validateResult) => {
            if (fromElement && !validateResult.status) {
              addon.data.prefs.window?.alert(
                `You see this because the translation service ${serviceId} requires SECRET, which is NOT correctly set.\n\nDetails:\n${validateResult.info}`,
              );
            }
          },
        );
        (
          doc.querySelector(
            `#${makeId("wordServicesSecret")}`,
          ) as HTMLInputElement
        ).value = secretCheckResult.secret;
      }
      break;
    case "setSourceLanguage":
      {
        setPref(
          "sourceLanguage",
          (
            doc.querySelector(`#${makeId("langfrom")}`) as XUL.MenuList
          ).getAttribute("value")!,
        );
        addon.hooks.onReaderTabPanelRefresh();
      }
      break;
    case "setTargetLanguage":
      {
        setPref(
          "targetLanguage",
          (
            doc.querySelector(`#${makeId("langto")}`) as XUL.MenuList
          ).getAttribute("value")!,
        );
        addon.hooks.onReaderTabPanelRefresh();
      }
      break;
    case "updateFontSize":
      addon.api.getTemporaryRefreshHandler()();
      break;
    case "updatelineHeight":
      addon.api.getTemporaryRefreshHandler()();
      break;
    case "setEnableHidePopupTextarea":
      addon.api.getTemporaryRefreshHandler()();
      break;
    case "setEnableNoteReplaceMode":
      addon.api.getTemporaryRefreshHandler()();
      break;
    case "setAttachPaperContext":
      addon.api.getTemporaryRefreshHandler()();
      break;
    case "setEnableMathRendering":
      addon.api.getTemporaryRefreshHandler()();
      break;
    case "setStripEmptyLines":
      addon.api.getTemporaryRefreshHandler()();
      break;
    case "setEnableAutoDetectLanguage":
      addon.api.getTemporaryRefreshHandler()();
      break;

    // 界面设置复选框事件处理
    case "setShowItemMenuTitleTranslation":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowItemMenuAbstractTranslation":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowSidebarEngine":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowSidebarLanguage":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowSidebarRaw":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setRawResultOrder":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowSidebarSettings":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowSidebarConcat":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setEnableConcatKey":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowSidebarCopy":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowItemBoxTitleTranslation":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setShowItemBoxAbstractTranslation":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setKeepWindowTop":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setKeepPopupSize":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "setAutoPlay":
      addon.api.getTemporaryRefreshHandler()();
      break;

    case "manageKeys":
      {
        import("../modules/settings/manageKeys").then(
          ({ manageKeysDialog }) => {
            manageKeysDialog();
          },
        );
      }
      break;
    case "renameServices":
      {
        import("../modules/settings/renameServices").then(
          ({ renameServicesDialog }) => {
            renameServicesDialog();
          },
        );
      }
      break;
    default:
      return;
  }
}

function makeId(type: string) {
  return `${config.addonRef}-${type}`;
}
