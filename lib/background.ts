"use strict";
// License: MIT

import { ALLOWED_SCHEMES, TRANSFERABLE_PROPERTIES } from "./constants";
import { API } from "./api";
import { Finisher, makeUniqueItems } from "./item";
import { Prefs } from "./prefs";
import { _ } from "./i18n";
import { openPrefs, openManager } from "./windowutils";
import { filters } from "./filters";
import { getManager } from "./manager/man";
import {
  browserAction as action,
  menus as _menus, contextMenus as _cmenus,
  tabs,
  webNavigation as nav
} from "./browser";

const menus = typeof (_menus) !== "undefined" && _menus || _cmenus;


async function runContentJob(tab: any, file: string, msg: any) {
  try {
    const res = await tabs.executeScript(tab.id, {
      file,
      allFrames: true,
      runAt: "document_start"
    });
    if (!msg) {
      return res;
    }
    const promises = [];
    const results: any[] = [];
    for (const frame of await nav.getAllFrames({ tabId: tab.id })) {
      promises.push(tabs.sendMessage(tab.id, msg, {
        frameId: frame.frameId}
      ).then(function(res: any) {
        results.push(res);
      }).catch(console.error));
    }
    await Promise.all(promises);
    return results;
  }
  catch (ex) {
    console.error("Failed to execute content script", file,
      ex.message || ex.toString(), ex);
    return [];
  }
}

class Handler {
  async processResults(turbo = false, results: any[]) {
    const links = this.makeUnique(results, "links");
    const media = this.makeUnique(results, "media");
    await API[turbo ? "turbo" : "regular"](links, media);
  }

  makeUnique(results: any[], what: string) {
    return makeUniqueItems(
      results.filter(e => e[what]).map(e => {
        const finisher = new Finisher(e);
        return e[what].
          map((item: any) => finisher.finish(item)).
          filter((i: any) => i);
      }));
  }
}

new class Action extends Handler {
  constructor() {
    super();
    this.onClicked = this.onClicked.bind(this);
    action.onClicked.addListener(this.onClicked);
  }

  async onClicked(tab: {id: number}) {
    if (!tab.id) {
      return;
    }
    try {
      await this.processResults(
        await Prefs.get("global-turbo"),
        await runContentJob(
          tab, "/bundles/content-gather.js", {
            type: "DTA:gather",
            selectionOnly: false,
            textLinks: await Prefs.get("text-links", true),
            schemes: Array.from(ALLOWED_SCHEMES.values()),
            transferable: TRANSFERABLE_PROPERTIES,
          }));
    }
    catch (ex) {
      console.error(ex);
    }
  }
}();

new class Menus extends Handler {
  constructor() {
    super();
    this.onClicked = this.onClicked.bind(this);
    menus.create({
      id: "DTARegular",
      contexts: ["all", "browser_action", "tools_menu"],
      icons: {
        16: "/style/button-regular.png",
        32: "/style/button-regular@2x.png",
      },
      title: _("dta.regular"),
    });
    menus.create({
      id: "DTATurbo",
      contexts: ["all", "browser_action", "tools_menu"],
      icons: {
        16: "/style/button-turbo.png",
        32: "/style/button-turbo@2x.png",
      },
      title: _("dta.turbo"),
    });
    menus.create({
      id: "DTARegularLink",
      contexts: ["link"],
      icons: {
        16: "/style/button-regular.png",
        32: "/style/button-regular@2x.png",
      },
      title: _("dta.regular.link"),
    });
    menus.create({
      id: "DTATurboLink",
      contexts: ["link"],
      icons: {
        16: "/style/button-turbo.png",
        32: "/style/button-turbo@2x.png",
      },
      title: _("dta.turbo.link"),
    });
    menus.create({
      id: "DTARegularImage",
      contexts: ["image"],
      icons: {
        16: "/style/button-regular.png",
        32: "/style/button-regular@2x.png",
      },
      title: _("dta.regular.image"),
    });
    menus.create({
      id: "DTATurboImage",
      contexts: ["image"],
      icons: {
        16: "/style/button-turbo.png",
        32: "/style/button-turbo@2x.png",
      },
      title: _("dta.turbo.image"),
    });
    menus.create({
      id: "DTARegularMedia",
      contexts: ["video", "audio"],
      icons: {
        16: "/style/button-regular.png",
        32: "/style/button-regular@2x.png",
      },
      title: _("dta.regular.media"),
    });
    menus.create({
      id: "DTATurboMedia",
      contexts: ["video", "audio"],
      icons: {
        16: "/style/button-turbo.png",
        32: "/style/button-turbo@2x.png",
      },
      title: _("dta.turbo.media"),
    });
    menus.create({
      id: "DTARegularSelection",
      contexts: ["selection"],
      icons: {
        16: "/style/button-regular.png",
        32: "/style/button-regular@2x.png",
      },
      title: _("dta.regular.selection"),
    });
    menus.create({
      id: "DTATurboSelection",
      contexts: ["selection"],
      icons: {
        16: "/style/button-turbo.png",
        32: "/style/button-turbo@2x.png",
      },
      title: _("dta.turbo.selection"),
    });
    menus.create({
      id: "sep-1",
      contexts: ["all", "browser_action", "tools_menu"],
      type: "separator"
    });
    menus.create({
      id: "DTAManager",
      contexts: ["all", "browser_action", "tools_menu"],
      icons: {
        16: "/style/button-manager.png",
        32: "/style/button-manager@2x.png",
      },
      title: _("manager.short"),
    });
    menus.create({
      id: "DTAPrefs",
      contexts: ["all", "browser_action", "tools_menu"],
      icons: {
        16: "/style/settings.svg",
        32: "/style/settings.svg",
        64: "/style/settings.svg",
        128: "/style/settings.svg",
      },
      title: _("prefs.short"),
    });
    menus.onClicked.addListener(this.onClicked);
  }

  *makeSingleItemList(url: string, results: any[]) {
    for (const result of results) {
      const finisher = new Finisher(result);
      for (const list of [result.links, result.media]) {
        for (const e of list) {
          if (e.url !== url) {
            continue;
          }
          const finished = finisher.finish(e);
          if (!finished) {
            continue;
          }
          yield finished;
        }
      }
    }
  }

  async findSingleItem(tab: any, url: string, turbo = false) {
    if (!url) {
      return;
    }
    const results = await runContentJob(
      tab, "/bundles/content-gather.js", {
        type: "DTA:gather",
        selectionOnly: false,
        schemes: Array.from(ALLOWED_SCHEMES.values()),
        transferable: TRANSFERABLE_PROPERTIES,
      });
    const found = Array.from(this.makeSingleItemList(url, results));
    const unique = makeUniqueItems([found]);
    if (!unique.length) {
      return;
    }
    const [item] = unique;
    API[turbo ? "singleTurbo" : "singleRegular"](item);
  }

  onClicked(info: any, tab: any) {
    if (!tab.id) {
      return;
    }
    const {menuItemId} = info;
    const {[`onClicked${menuItemId}`]: handler}: any = this;
    if (!handler) {
      console.error("Invalid Handler for", menuItemId);
      return;
    }
    handler.call(this, info, tab).catch(console.error);
  }

  async onClickedDTARegularInternal(
      selectionOnly: boolean, info: any, tab: any) {
    try {
      await this.processResults(
        false,
        await runContentJob(
          tab, "/bundles/content-gather.js", {
            type: "DTA:gather",
            selectionOnly,
            textLinks: await Prefs.get("text-links", true),
            schemes: Array.from(ALLOWED_SCHEMES.values()),
            transferable: TRANSFERABLE_PROPERTIES,
          }));
    }
    catch (ex) {
      console.error(ex);
    }
  }

  async onClickedDTARegular(info: any, tab: any) {
    return await this.onClickedDTARegularInternal(false, info, tab);
  }

  async onClickedDTARegularSelection(info: any, tab: any) {
    return await this.onClickedDTARegularInternal(true, info, tab);
  }

  async onClickedDTATurboInternal(selectionOnly: boolean, info: any, tab: any) {
    try {
      await this.processResults(
        true,
        await runContentJob(
          tab, "/bundles/content-gather.js", {
            type: "DTA:gather",
            selectionOnly,
            textLinks: await Prefs.get("text-links", true),
            schemes: Array.from(ALLOWED_SCHEMES.values()),
            transferable: TRANSFERABLE_PROPERTIES,
          }));
    }
    catch (ex) {
      console.error(ex);
    }
  }

  async onClickedDTATurbo(info: any, tab: any) {
    return await this.onClickedDTATurboInternal(false, info, tab);
  }

  async onClickedDTATurboSelection(info: any, tab: any) {
    return await this.onClickedDTATurboInternal(false, info, tab);
  }

  async onClickedDTARegularLink(info: any, tab: any) {
    return await this.findSingleItem(tab, info.linkUrl, false);
  }

  async onClickedDTATurboLink(info: any, tab: any) {
    return await this.findSingleItem(tab, info.linkUrl, true);
  }

  async onClickedDTARegularImage(info: any, tab: any) {
    return await this.findSingleItem(tab, info.srcUrl, false);
  }

  async onClickedDTATurboImage(info: any, tab: any) {
    return await this.findSingleItem(tab, info.srcUrl, true);
  }

  async onClickedDTARegularMedia(info: any, tab: any) {
    return await this.findSingleItem(tab, info.srcUrl, false);
  }

  async onClickedDTATurboMedia(info: any, tab: any) {
    return await this.findSingleItem(tab, info.srcUrl, true);
  }

  async onClickedDTAManager() {
    await openManager();
  }

  async onClickedDTAPrefs() {
    await openPrefs();
  }
}();

(async function init() {
  await Prefs.set("last-run", new Date());
  await filters();
  await getManager();
})().catch(ex => {
  console.error("Failed to init components", ex.toString(), ex.stack, ex);
});