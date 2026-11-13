// audioprn: a clear error popup at the top of the screen, for mistakes when posting.
import { I18NextService } from "@services/index";
import { isBrowser } from "@utils/browser";
import { NoOptionI18nKeys } from "i18next";
import Toastify from "toastify-js";
import { registerErrorMessage } from "./creator-api";

export function errorPopup(text: string) {
  if (isBrowser()) {
    Toastify({
      text,
      gravity: "top",
      position: "center",
      duration: 10000,
      close: true,
      style: { background: "var(--bs-danger)", fontSize: "1.1rem" },
    }).showToast();
  }
}

/** The popup for an error the backend returned. */
export function backendErrorPopup(err: { name: string; message?: string }) {
  errorPopup(
    registerErrorMessage(err) ??
      I18NextService.i18n.t(err.name as NoOptionI18nKeys),
  );
}
