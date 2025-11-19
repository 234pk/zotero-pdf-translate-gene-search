import { SVGIcon } from "../utils/config";
import { config } from "../../package.json";
import { getString } from "../utils/locale";
import { getPref, setPref } from "../utils/prefs";
import { addTranslateTask, getLastTranslateTask, TranslateTask } from "../utils/task";
import { slice } from "../utils/str";

function updatePopupSize(
  selectionMenu: HTMLDivElement,
  textarea: HTMLTextAreaElement,
  resetSize: boolean = true,
): void {
  const keepSize = getPref("keepPopupSize") as boolean;
  if (keepSize) {
    return;
  }
  if (resetSize) {
    textarea.style.width = "-moz-available";
    textarea.style.height = "30px";
  }
  const viewer = selectionMenu.ownerDocument.body;
  // Get current H & W
  const textHeight = textarea.scrollHeight;
  const textWidth = textarea.scrollWidth;
  const newWidth = textWidth + 20;
  // Check until H/W<0.75 and don't overflow viewer border
  if (
    textHeight / textWidth > 0.75 &&
    selectionMenu.offsetLeft + newWidth < viewer.offsetWidth
  ) {
    // Update width
    textarea.style.width = `${newWidth}px`;
    updatePopupSize(selectionMenu, textarea, false);
    return;
  }
  // Update height
  textarea.style.height = `${textHeight + 3}px`;
}

export function updateReaderPopup() {
  const popup = addon.data.popup.currentPopup;
  if (!popup) {
    return;
  }
  const enablePopup = getPref("enablePopup");
  const hidePopupTextarea = getPref("enableHidePopupTextarea") as boolean;
  Array.from(popup.querySelectorAll(`.${config.addonRef}-readerpopup`)).forEach(
    (elem) => ((elem as HTMLElement).hidden = !enablePopup),
  );

  const idPrefix = popup?.getAttribute(`${config.addonRef}-prefix`);
  const makeId = (type: string) => `${idPrefix}-${type}`;
  const audiobox = popup?.querySelector(
    `#${makeId("audiobox")}`,
  ) as HTMLDivElement;
  const translateButton = popup?.querySelector(
    `#${makeId("translate")}`,
  ) as HTMLDivElement;
  const textarea = popup?.querySelector(
    `#${makeId("text")}`,
  ) as HTMLTextAreaElement;
  const addToNoteButton = popup?.querySelector(
    `#${makeId("addtonote")}`,
  ) as HTMLDivElement;

  const updateHidden = (elem: HTMLElement, hidden: boolean) => {
    if (hidden) {
      elem.style.display = "none";
    } else {
      elem.style.removeProperty("display");
    }
  };

  if (!enablePopup) {
    updateHidden(audiobox, true);
    updateHidden(translateButton, true);
    updateHidden(textarea, true);
    updateHidden(addToNoteButton, true);
    return;
  }
  // 获取当前活动选项卡
  const activeTab = popup?.querySelector(`.tab-button.active`)?.getAttribute("data-tab");
  
  // 根据活动选项卡获取对应类型的任务
  let task;
  if (activeTab === "uniprot") {
    task = getLastTranslateTask({ type: "uniprot" });
  } else {
    task = getLastTranslateTask({ type: "text" });
  }
  
  if (!task) {
    return;
  }
  popup.setAttribute("translate-task-id", task.id);

  if (task.audio.length > 0 && getPref("showPlayBtn")) {
    audiobox.innerHTML = "";
    updateHidden(audiobox, false);
    ztoolkit.UI.appendElement(
      {
        tag: "fragment",
        children: task.audio.map((audioData) => ({
          tag: "button",
          namespace: "html",
          classList: ["toolbar-button", "wide-button"],
          attributes: {
            tabindex: "-1",
            title: audioData.text,
          },
          properties: {
            innerHTML: `🔊 ${audioData.text}`,
            onclick: () => {
              new (ztoolkit.getGlobal("Audio"))(audioData.url).play();
            },
          },
          styles: { whiteSpace: "nowrap", flexGrow: "1" },
        })),
      },
      audiobox,
    );
  }

  if (task.audio.length > 0 && getPref("showPlayBtn") && getPref("autoPlay")) {
    const firstAudio = task.audio[0];
    const audio = new (ztoolkit.getGlobal("Audio"))(firstAudio.url);
    audio.play();
  }

  const hideTranslateButton = task.status !== "waiting";
  updateHidden(translateButton, hideTranslateButton);

  textarea.hidden = hidePopupTextarea || !hideTranslateButton;
  textarea.value = task.result || task.raw;
  textarea.style.fontSize = `${getPref("fontSize")}px`;
  textarea.style.lineHeight = `${
    Number(getPref("lineHeight")) * Number(getPref("fontSize"))
  }px`;

  const enableAddToNote = getPref("enableNote") as boolean;
  // @ts-ignore
  const mainWindows = Zotero.getMainWindows();
  if (
    !mainWindows[0]?.ZoteroContextPane?.activeEditor ||
    !enableAddToNote
  ) {
    updateHidden(addToNoteButton, true);
  }

  // 处理UniProt搜索结果的显示
  const uniprotResults = popup?.querySelector(
    `#${makeId("uniprot-results")}`,
  ) as HTMLDivElement;
  
  if (uniprotResults && task.type === "uniprot") {
    // 显示UniProt搜索结果
    uniprotResults.innerHTML = task.result || "Search results will appear here...";
    // 确保UniProt结果容器可见
    uniprotResults.style.display = "block";
  }

  updatePopupSize(popup, textarea);
}

export function buildReaderPopup(
  event: any,
) {
  const { reader, doc, append } = event;
  const annotation = event.params.annotation;
  const popup = doc.querySelector(".selection-popup") as HTMLDivElement;
  addon.data.popup.currentPopup = popup;
  popup.style.maxWidth = "none";
  popup.setAttribute(
    `${config.addonRef}-prefix`,
    `${config.addonRef}-${reader._instanceID}`,
  );

  // @ts-ignore
  const mainWindows = Zotero.getMainWindows();
  const ZoteroContextPane = mainWindows[0]?.ZoteroContextPane;

  const colors = popup.querySelector(".colors") as HTMLDivElement;
  colors.style.width = "100%";
  colors.style.justifyContent = "space-evenly";

  const keepSize = getPref("keepPopupSize") as boolean;

  const makeId = (type: string) =>
    `${config.addonRef}-${reader._instanceID}-${type}`;

  const hidePopupTextarea = getPref("enableHidePopupTextarea") as boolean;

  // 检查是否已经存在选项卡容器，避免重复创建
  const existingTabContainer = doc.querySelector(`#${makeId("tab-container")}`);
  if (existingTabContainer) {
    // 如果已存在，只更新内容而不重新创建选项卡
    return;
  }

  // 添加选项卡容器
  append(
    (ztoolkit.UI.createElement(doc, "div", {
      namespace: "html",
      children: [
        {
          tag: "div",
          namespace: "html",
          id: makeId("tab-container"),
          classList: [`${config.addonRef}-readerpopup`],
          styles: {
            display: "flex",
            width: "100%",
            marginBottom: "8px",
            borderBottom: "1px solid var(--color-border)",
          },
          children: [
            {
              tag: "button",
              namespace: "html",
              id: makeId("translate-tab"),
              classList: ["tab-button", "active", `${config.addonRef}-tab-button`],
              attributes: {
                "data-tab": "translate"
              },
              properties: {
                innerHTML: "Translate",
              },
              styles: {
                flex: "1",
                padding: "4px 8px",
                border: "none",
                background: "transparent",
                borderBottom: "2px solid var(--color-accent)",
                cursor: "pointer",
              },
              listeners: [
                {
                  type: "click",
                  listener: (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    switchTab("translate");
                  },
                },
              ],
            },
            {
              tag: "button",
              namespace: "html",
              id: makeId("uniprot-tab"),
              classList: ["tab-button", `${config.addonRef}-tab-button`],
              attributes: {
                "data-tab": "uniprot"
              },
              properties: {
                innerHTML: "UniProt Search",
              },
              styles: {
                flex: "1",
                padding: "4px 8px",
                border: "none",
                background: "transparent",
                borderBottom: "2px solid transparent",
                cursor: "pointer",
              },
              listeners: [
                {
                  type: "click",
                  listener: (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    switchTab("uniprot");
                  },
                },
              ],
            },
          ],
        },
      ],
    }) as any),
  );
  // 翻译内容容器
  append(
    (ztoolkit.UI.createElement(doc, "div", {
      children: [
        {
          tag: "div",
          id: makeId("translate-content"),
          classList: [`${config.addonRef}-readerpopup`],
          styles: {
            display: "block",
          },
          ignoreIfExists: true,
          children: [
            {
              tag: "div",
              id: makeId("audiobox"),
              classList: [`${config.addonRef}-readerpopup`],
              styles: {
                display: "flex",
                width: "calc(100% - 4px)",
                marginLeft: "2px",
                justifyContent: "space-evenly",
              },
              ignoreIfExists: true,
            },
            {
              tag: "button",
              id: makeId("translate"),
              classList: [
                "toolbar-button",
                "wide-button",
                `${config.addonRef}-readerpopup`,
              ],
              properties: {
                innerHTML: `${SVGIcon}${getString("readerpopup-translate-label")}`,
                hidden: getPref("enableAuto"),
              },
              listeners: [
                {
                  type: "click",
                  listener: (ev: Event) => {
                    addon.hooks.onTranslate({
                      noCheckZoteroItemLanguage: true,
                      noCache: true,
                    });
                    const button = ev.target as HTMLDivElement;
                    button.hidden = true;
                    (
                      button.ownerDocument.querySelector(
                        `#${makeId("text")}`,
                      ) as HTMLTextAreaElement
                    ).hidden = hidePopupTextarea;
                  },
                },
              ],
              ignoreIfExists: true,
            },
            {
              tag: "textarea",
              id: makeId("text"),
              attributes: {
                rows: "3",
                columns: "10",
              },
              classList: [
                `${config.addonRef}-popup-textarea`,
                `${config.addonRef}-readerpopup`,
              ],
              styles: {
                fontSize: `${getPref("fontSize")}px`,
                fontFamily: "inherit",
                lineHeight: `${
                  Number(getPref("lineHeight")) * Number(getPref("fontSize"))
                }px`,
                width: keepSize ? `${getPref("popupWidth")}px` : "-moz-available",
                // Minimum width to prevent the textarea from being smaller than the popup
                minWidth: "184px",
                height: `${Math.max(
                  keepSize ? Number(getPref("popupHeight")) : 30,
                )}px`,
                marginInline: "2px",
                border: "none",
                background: "var(--color-sidepane)",
                borderRadius: "6px",
                padding: "5px",
              },
              properties: {
                onpointerup: (e: Event) => e.stopPropagation(),
                ondragstart: (e: Event) => e.stopPropagation(),
                spellcheck: false,
                value: addon.data.translate.selectedText,
              },
              ignoreIfExists: true,
              listeners: [
                {
                  type: "mousedown",
                  listener: (_ev) => {
                    _ev.target?.addEventListener(
                      "mousemove",
                      onTextAreaResize as (ev: Event) => void,
                    );
                  },
                },
                {
                  type: "mouseup",
                  listener: (_ev) => {
                    _ev.target?.removeEventListener(
                      "mousemove",
                      onTextAreaResize as (ev: Event) => void,
                    );
                  },
                },
                {
                  type: "dblclick",
                  listener: (_ev) => {
                    const textarea = popup.querySelector(
                      `#${makeId("text")}`,
                    ) as HTMLTextAreaElement;
                    textarea.selectionStart = 0;
                    textarea.selectionEnd = textarea.value.length;
                    const text = textarea.value.slice(
                      textarea.selectionStart,
                      textarea.selectionEnd,
                    );
                    new ztoolkit.Clipboard().addText(text, "text/plain").copy();
                    new ztoolkit.ProgressWindow("Copied to Clipboard")
                      .createLine({
                        text: slice(text, 50),
                        progress: 100,
                        type: "default",
                      })
                      .show();
                  },
                },
              ],
            },
            {
              tag: "button",
              namespace: "html",
              id: makeId("addtonote"),
              classList: [
                "toolbar-button",
                "wide-button",
                `${config.addonRef}-readerpopup`,
              ],
              styles: {
                marginTop: "8px",
              },
              properties: {
                innerHTML: `${SVGIcon}${getString("readerpopup-addToNote-label")}`,
              },
              ignoreIfExists: true,
              listeners: [
                {
                  type: "click",
                  listener: async (ev) => {
                    const noteEditor =
                      ZoteroContextPane && ZoteroContextPane.activeEditor;
                    if (!noteEditor) {
                      return;
                    }
                    const editorInstance = noteEditor.getCurrentInstance();
                    if (!editorInstance) {
                      return;
                    }
                    const task = addTranslateTask(
                      addon.data.translate.selectedText,
                      reader.itemID,
                      "addtonote",
                    );
                    if (!task) {
                      return;
                    }
                    await addon.hooks.onTranslate(task, {
                      noCheckZoteroItemLanguage: true,
                      noDisplay: true,
                    });
                    if (task.status !== "success") {
                      return;
                    }
                    const replaceMode = getPref("enableNoteReplaceMode") as boolean;
                    if (replaceMode) {
                      annotation.text = task.result;
                    } else {
                      annotation.comment = task.result;
                    }
                    // @ts-ignore should be fixed in the zotero-types
                    reader._addToNote([annotation]);
                  },
                },
              ],
            },
          ],
        },
      ],
    }) as any),
  );

  // UniProt 搜索内容容器
  append(
    (ztoolkit.UI.createElement(doc, "div", {
      children: [
        {
          tag: "div",
          id: makeId("uniprot-content"),
          classList: [`${config.addonRef}-readerpopup`],
          styles: {
            display: "none",
          },
          ignoreIfExists: true,
          children: [
            // 搜索输入框
            {
              tag: "input",
              namespace: "html",
              id: makeId("uniprot-input"),
              classList: [`${config.addonRef}-uniprot-input`],
              attributes: {
                type: "text",
                placeholder: "Enter gene name or protein ID...",
              },
              styles: {
                width: "calc(100% - 10px)",
                padding: "5px",
                margin: "5px",
                border: "1px solid #ccc",
                borderRadius: "3px",
                fontSize: "12px",
              },
              properties: {
                value: addon.data.translate.selectedText || "",
              },
            },
            // 物种选择和搜索按钮容器
            {
              tag: "div",
              namespace: "html",
              styles: {
                display: "flex",
                justifyContent: "space-between",
                margin: "0 5px 5px 5px",
              },
              children: [
                // 物种选择下拉框
                {
                  tag: "select",
                  namespace: "html",
                  id: makeId("uniprot-species"),
                  classList: [`${config.addonRef}-uniprot-species`],
                  attributes: {
                    title: "Select organism to narrow search results",
                  },
                  styles: {
                    flex: "1",
                    marginRight: "5px",
                    padding: "5px",
                    border: "1px solid #666",
                    borderRadius: "3px",
                    fontSize: "12px",
                    backgroundColor: "white",
                    cursor: "pointer",
                    zIndex: "9999",
                    position: "relative",
                    userSelect: "none",
                    pointerEvents: "auto",
                    minWidth: "150px",
                  },
                  children: [
                    {
                      tag: "option",
                      namespace: "html",
                      attributes: {
                        value: "",
                      },
                      properties: {
                        innerHTML: "All Species",
                      },
                    },
                    {
                      tag: "option",
                      namespace: "html",
                      attributes: {
                        value: "9606",
                      },
                      properties: {
                        innerHTML: "Human (9606)",
                      },
                    },
                    {
                      tag: "option",
                      namespace: "html",
                      attributes: {
                        value: "10090",
                      },
                      properties: {
                        innerHTML: "Mouse (10090)",
                      },
                    },
                    {
                      tag: "option",
                      namespace: "html",
                      attributes: {
                        value: "10116",
                      },
                      properties: {
                        innerHTML: "Rat (10116)",
                      },
                    },
                    {
                      tag: "option",
                      namespace: "html",
                      attributes: {
                        value: "7227",
                      },
                      properties: {
                        innerHTML: "Fruit Fly (7227)",
                      },
                    },
                    {
                      tag: "option",
                      namespace: "html",
                      attributes: {
                        value: "6239",
                      },
                      properties: {
                        innerHTML: "C. elegans (6239)",
                      },
                    },
                  ],
                },
                // 搜索按钮
                {
                  tag: "button",
                  namespace: "html",
                  id: makeId("uniprot-search"),
                  classList: ["toolbar-button", `${config.addonRef}-uniprot-search`],
                  attributes: {
                    title: "Search UniProt",
                  },
                  properties: {
                    innerHTML: "🔍 Search",
                  },
                  styles: {
                    padding: "3px 8px",
                    border: "1px solid #ccc",
                    borderRadius: "3px",
                    fontSize: "12px",
                    cursor: "pointer",
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                  },
                  listeners: [
                    {
                      type: "click",
                      listener: async (ev: Event) => {
                        const input = popup.querySelector(`#${makeId("uniprot-input")}`) as HTMLInputElement;
                        const species = popup.querySelector(`#${makeId("uniprot-species")}`) as HTMLSelectElement;
                        const resultsContainer = popup.querySelector(`#${makeId("uniprot-results")}`) as HTMLDivElement;
                        
                        if (!input.value.trim()) {
                          resultsContainer.innerHTML = "<p style='color: red; padding: 8px;'>Please enter a search term</p>";
                          return;
                        }
                        
                        // 显示加载状态
                        resultsContainer.innerHTML = "<p style='padding: 8px;'>Searching UniProt...</p>";
                        
                        try {
                          // 创建搜索任务
                          const task = addTranslateTask(
                            input.value.trim(),
                            reader.itemID,
                            "uniprot",
                            "uniprot"
                          );
                          
                          if (!task) {
                            throw new Error("Failed to create search task");
                          }
                          
                          // 设置taxonomyId
                          task.taxonomyId = species.value;
                          
                          // 获取UI刷新处理器
                          const refreshHandler = addon.api.getTemporaryRefreshHandler({ task });
                          
                          // 直接调用服务运行任务，而不是通过钩子
                          const success = await addon.data.translate.services.runTranslationTask(task, {
                            noCheckZoteroItemLanguage: true,
                            noDisplay: false
                          });
                          
                          if (success) {
                            // 任务完成后刷新UI
                            refreshHandler();
                          } else {
                            resultsContainer.innerHTML = `<p style='color: red; padding: 8px;'>Search failed: ${task.result || "Unknown error"}</p>`;
                          }
                        } catch (error) {
                          // 错误处理
                          resultsContainer.innerHTML = `<p style='color: red; padding: 8px;'>Search failed: ${error}</p>`;
                        }
                      },
                    },
                  ],
                },
              ],
            },
            // 结果显示区域
            {
              tag: "div",
              namespace: "html",
              id: makeId("uniprot-results"),
              styles: {
                width: "300px",
                padding: "8px",
                fontSize: "12px",
                whiteSpace: "pre-wrap",
                wordWrap: "break-word",
                background: "var(--color-sidepane)",
                border: "1px solid #ccc",
                maxHeight: "300px",
                overflowY: "auto",
              },
              properties: {
                innerHTML: "Search results will appear here...",
              },
            },
          ],
        },
      ],
    }) as any))
}

function onTextAreaResize(ev: MouseEvent) {
  if (getPref("keepPopupSize")) {
    const textarea = ev.target as HTMLTextAreaElement;
    setPref("popupWidth", textarea.offsetWidth);
    setPref("popupHeight", textarea.offsetHeight);
  }
}

function getOnTextAreaCopy(selectionMenu: HTMLElement, targetId: string) {
  return (ev: KeyboardEvent) => {
    const textarea = selectionMenu.querySelector(
      `#${targetId}`,
    ) as HTMLTextAreaElement;
    const isMod = ev.ctrlKey || ev.metaKey;
    if (ev.key === "c" && isMod) {
      ztoolkit.getGlobal("setTimeout")(() => {
        new ztoolkit.Clipboard()
          .addText(
            textarea.value.slice(
              textarea.selectionStart,
              textarea.selectionEnd,
            ),
            "text/plain",
          )
          .copy();
      }, 10);
      ev.stopPropagation();
    } else if (ev.key === "a" && isMod) {
      textarea.selectionStart = 0;
      textarea.selectionEnd = textarea.value.length;
      ev.stopPropagation();
    } else if (ev.key === "x" && isMod) {
      new ztoolkit.Clipboard()
        .addText(
          textarea.value.slice(textarea.selectionStart, textarea.selectionEnd),
          "text/plain",
        )
        .copy();
      textarea.value = `${textarea.value.slice(
        0,
        textarea.selectionStart,
      )}${textarea.value.slice(textarea.selectionEnd)}`;
      ev.stopPropagation();
    }
  };
}

// switchTab 函数：处理选项卡切换
function switchTab(tabName: "translate" | "uniprot") {
  const popup = addon.data.popup.currentPopup;
  if (!popup) {
    return;
  }

  // 获取选项卡前缀
  const idPrefix = popup?.getAttribute(`${config.addonRef}-prefix`);
  if (!idPrefix) {
    return;
  }

  const makeId = (type: string) => `${idPrefix}-${type}`;

  // 获取所有选项卡按钮和内容容器
  const tabContainer = popup.querySelector(`#${makeId("tab-container")}`);
  if (!tabContainer) {
    return;
  }

  const tabButtons = tabContainer.querySelectorAll(".tab-button");
  const translateContent = popup.querySelector(`#${makeId("translate-content")}`);
  const uniprotContent = popup.querySelector(`#${makeId("uniprot-content")}`);

  // 移除所有选项卡的 active 类
  tabButtons.forEach(btn => {
    btn.classList.remove("active");
    (btn as HTMLElement).style.borderBottom = "2px solid transparent";
  });

  // 隐藏所有内容
  if (translateContent) {
    (translateContent as HTMLElement).style.display = "none";
  }
  if (uniprotContent) {
    (uniprotContent as HTMLElement).style.display = "none";
  }

  // 显示指定的内容并激活对应按钮
  if (tabName === "translate") {
    const translateButton = tabContainer.querySelector(`[data-tab="translate"]`) as HTMLButtonElement;
    const translateContent = popup.querySelector(`#${makeId("translate-content")}`) as HTMLElement;
    
    if (translateButton) {
      translateButton.classList.add("active");
      translateButton.style.borderBottom = "2px solid var(--color-accent)";
    }
    if (translateContent) {
      translateContent.style.display = "block";
    }
  } else if (tabName === "uniprot") {
    const uniprotButton = tabContainer.querySelector(`[data-tab="uniprot"]`) as HTMLButtonElement;
    const uniprotContent = popup.querySelector(`#${makeId("uniprot-content")}`) as HTMLElement;
    
    if (uniprotButton) {
      uniprotButton.classList.add("active");
      uniprotButton.style.borderBottom = "2px solid var(--color-accent)";
    }
    if (uniprotContent) {
      uniprotContent.style.display = "block";
    }
  }
}