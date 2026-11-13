import { I18NextService } from "@services/I18NextService";

type RegistrationCheckboxesProps = {
  form: {
    show_nsfw: boolean;
    honeypot?: string;
    stay_logged_in: boolean;
  };
  onRegisterShowNsfwChange: (checked: boolean) => void;
  onStayLoggedInChange: (checked: boolean) => void;
  onHoneyPotChange?: (value: string) => void;
};

// audioprn: no "Show NSFW content" checkbox. The whole site is adult content,
// so new accounts are always registered with show_nsfw = true (see signup.tsx).
export function RegistrationCheckboxes({
  onHoneyPotChange,
  onStayLoggedInChange,
  form: { honeypot, stay_logged_in },
}: RegistrationCheckboxesProps) {
  return (
    <>
      <input
        tabIndex={-1}
        autoComplete="false"
        name="a_password"
        type="text"
        className="form-control honeypot"
        id="register-honey"
        value={honeypot}
        onInput={e => onHoneyPotChange && onHoneyPotChange(e.target.value)}
      />
      <div className="input-group mb-3">
        <div className="form-check">
          <input
            className="form-check-input"
            id="register-stay-logged-in"
            type="checkbox"
            checked={stay_logged_in}
            onChange={e => onStayLoggedInChange(e.target.checked)}
          />
          <label className="form-check-label" htmlFor="register-stay-logged-in">
            {I18NextService.i18n.t("stay_logged_in")}
          </label>
        </div>
      </div>
    </>
  );
}
