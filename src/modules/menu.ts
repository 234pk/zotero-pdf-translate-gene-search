import { config } from "../../package.json";
import { getPref } from "../utils/prefs";
import {
  addTranslateAbstractTask,
  addTranslateTitleTask,
  TranslateTask,
} from "../utils/task";

export function registerMenu() {
  const menuIcon = `chrome://${config.addonRef}/content/icons/favicon.png`;

  // Zotero 7兼容性检查
  if (typeof Zotero.MenuManager === 'undefined') {
    // Zotero 7使用新的菜单API
    // 使用类型断言绕过TypeScript检查
    const zoteroUI = (Zotero as any).ui;
    if (zoteroUI && typeof zoteroUI.registerMenu === 'function') {
      zoteroUI.registerMenu({
        id: `${config.addonRef}-translate-title`,
        label: "Translate Title",
        command: (event: any, context: any) => {
          if (!context.items?.length) {
            return;
          }
          addon.hooks.onTranslateInBatch(
            context.items
              .map((item: any) => addTranslateTitleTask(item.id, true))
              .filter((task: any) => task) as TranslateTask[],
            { noDisplay: true, noCache: true },
          );
        }
      });
      
      zoteroUI.registerMenu({
        id: `${config.addonRef}-translate-abstract`,
        label: "Translate Abstract",
        command: (event: any, context: any) => {
          if (!context.items?.length) {
            return;
          }
          addon.hooks.onTranslateInBatch(
            context.items
              .map((item: any) => addTranslateAbstractTask(item.id, true))
              .filter((task: any) => task) as TranslateTask[],
            { noDisplay: true, noCache: true },
          );
        }
      });
    }
    return;
  }

  // Zotero 6及以下版本使用MenuManager
  Zotero.MenuManager.registerMenu({
    menuID: `${config.addonRef}-translate-title`,
    pluginID: config.addonID,
    target: "main/library/item",
    menus: [
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-itemmenu-translateTitle`,
        icon: menuIcon,
        onCommand: (event, context) => {
          if (!context.items?.length) {
            return;
          }
          addon.hooks.onTranslateInBatch(
            context.items
              .map((item) => addTranslateTitleTask(item.id, true))
              .filter((task) => task) as TranslateTask[],
            { noDisplay: true, noCache: true },
          );
        },
        onShowing: (event, context) => {
          context.setVisible(
            !!(
              getPref("showItemMenuTitleTranslation") &&
              context.items?.every((item) => item.isRegularItem())
            ),
          );
        },
      },
      {
        menuType: "menuitem",
        l10nID: `${config.addonRef}-itemmenu-translateAbstract`,
        icon: menuIcon,
        onCommand: (event, context) => {
          if (!context.items?.length) {
            return;
          }
          addon.hooks.onTranslateInBatch(
            context.items
              .map((item) => addTranslateAbstractTask(item.id, true))
              .filter((task) => task) as TranslateTask[],
            { noDisplay: true, noCache: true },
          );
        },
        onShowing: (event, context) => {
          context.setVisible(
            !!(
              getPref("showItemMenuTitleTranslation") &&
              context.items?.every((item) => item.isRegularItem())
            ),
          );
        },
      },
    ],
  });
}
