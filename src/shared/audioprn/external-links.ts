// audioprn: links to other sites open in a new tab (Settings > "Open links in new tab", on by
// default; guests always). One listener covers every link: post text, comments, buttons.
import { IsoDataOptionalSite } from "@utils/types";

export function openExternalLinksInNewTab(isoData: () => IsoDataOptionalSite) {
  document.addEventListener(
    "click",
    e => {
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (
        !(a instanceof HTMLAnchorElement) ||
        !/^https?:$/.test(a.protocol) ||
        a.origin === location.origin
      ) {
        return;
      }
      const user = isoData().myUserInfo?.local_user_view.local_user;
      if (user && !user.open_links_in_new_tab) return;
      a.target = "_blank";
      if (!a.relList.contains("noopener")) a.relList.add("noopener");
    },
    true,
  );
}
