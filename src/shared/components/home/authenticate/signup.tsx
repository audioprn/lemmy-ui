import { setIsoData, updateMyUserInfo, WithHead } from "@utils/app";
import { isBrowser, refreshTheme } from "@utils/browser";
import { resourcesSettled } from "@utils/helpers";
import { Component, FormEvent, InfernoNode } from "inferno";
import {
  CaptchaResponse,
  GetCaptchaResponse,
  LoginResponse,
  Register,
  SiteView,
} from "lemmy-js-client";
import {
  CONTENT_LINKS_REQUIRED,
  MAX_SOCIAL_LINKS,
  creatorErrorMessage,
  registerErrorMessage,
} from "../../../audioprn/creator-api";
import { validActorRegexPattern } from "@utils/config";
import { NoOptionI18nKeys } from "i18next";
import { I18NextService } from "@services/I18NextService";
import { UserService } from "@services/UserService";
import {
  EMPTY_REQUEST,
  HttpService,
  LOADING_REQUEST,
  RequestState,
} from "@services/HttpService";
import { toast } from "@utils/app";
import { htmlTags } from "../../common/html-tags";
import { Icon, Spinner } from "../../common/icon";
import PasswordInput from "../../common/password-input";
import { scrollMixin } from "@components/mixins/scroll-mixin";
import { RouteData } from "@utils/types";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";
import { IRoutePropsWithFetch } from "@utils/routes";
import { OAuthLogin } from "../oauth/oauth-login";
import { RegistrationApplicationInput } from "./registration-application-input";
import { RegistrationLegalInfo } from "./registration-legal-info";
import { RegistrationCheckboxes } from "./registration-checkboxes";
import { removeLocalStorageMarkdown } from "@components/common/markdown-textarea";

interface State {
  registerRes: RequestState<LoginResponse>;
  captchaRes: RequestState<GetCaptchaResponse>;
  form: {
    username?: string;
    email?: string;
    password?: string;
    password_verify?: string;
    show_nsfw: boolean;
    captcha_uuid?: string;
    captcha_answer?: string;
    honeypot?: string;
    answer?: string;
    stay_logged_in: boolean;
    token?: string;
    // audioprn: creator signup only
    content_links: string[];
    social_links: string[];
  };
  captchaPlaying: boolean;
}

// audioprn: the creator signup form lives at /signup/creator.
const CREATOR_SIGNUP_PATH = "/signup/creator";

type SignupRouteProps = RouteComponentProps<Record<string, never>> & WithHead;
export type SignupFetchConfig = IRoutePropsWithFetch<
  RouteData,
  Record<string, never>,
  object
>;

@scrollMixin
export class Signup extends Component<SignupRouteProps, State> {
  public isoData = setIsoData(this.context);
  public audio?: HTMLAudioElement;

  state: State = {
    registerRes: EMPTY_REQUEST,
    captchaRes: EMPTY_REQUEST,
    form: {
      // audioprn: adult-only site, so NSFW is always shown (the checkbox is removed).
      show_nsfw: true,
      stay_logged_in: false,
      content_links: Array(CONTENT_LINKS_REQUIRED).fill(""),
      social_links: [""], // one to start; "Add another link" adds more
    },
    captchaPlaying: false,
  };

  get isCreator(): boolean {
    return this.props.location.pathname.startsWith(CREATOR_SIGNUP_PATH);
  }

  loadingSettled() {
    return (
      !this.isoData.siteRes?.captcha_enabled ||
      resourcesSettled([this.state.captchaRes])
    );
  }

  async componentWillMount() {
    if (isBrowser()) {
      extractInviteToken(this);
      if (this.isoData.siteRes?.captcha_enabled) {
        await this.fetchCaptcha();
      }
    }
  }

  async fetchCaptcha() {
    this.setState({ captchaRes: LOADING_REQUEST });
    this.setState({
      captchaRes: await HttpService.client.getCaptcha(),
    });

    this.setState(s => {
      if (s.captchaRes.state === "success") {
        s.form.captcha_uuid = s.captchaRes.data.ok?.uuid;
      }
      return s;
    });
  }

  get documentTitle(): string {
    const siteView = this.isoData.siteRes?.site_view;
    return `${this.titleName} - ${siteView?.site.name}`;
  }

  get titleName(): string {
    return this.isCreator
      ? "Sign up as a creator"
      : signupTitleName(this.isoData.siteRes?.site_view);
  }

  // audioprn: listener signup links to the creator form, and back.
  creatorSwitch() {
    return this.isCreator ? (
      <p className="mb-4">
        Just here to listen and read?{" "}
        <Link to="/signup">Sign up as a listener</Link>
      </p>
    ) : (
      <p className="mb-4">
        Do you make audios or write scripts?{" "}
        <Link to={CREATOR_SIGNUP_PATH}>Sign up as a creator</Link>
      </p>
    );
  }

  // audioprn: 3 required content links + up to 3 optional social links.
  creatorLinks() {
    const { content_links, social_links } = this.state.form;
    return (
      <>
        <fieldset className="mb-3">
          <legend className="h6">Your work</legend>
          <p className="text-muted small">
            Link to 3 of your audios or scripts on the sites where they're
            hosted. An admin checks them before you can post.
          </p>
          {content_links.map((link, idx) => (
            <div className="mb-2" key={`content-${idx}`}>
              <label
                className="form-label small mb-1"
                htmlFor={`creator-content-${idx}`}
              >
                Link {idx + 1}
              </label>
              <input
                type="url"
                id={`creator-content-${idx}`}
                className="form-control"
                placeholder="https://"
                value={link}
                required
                maxLength={512}
                onInput={e => handleContentLinkChange(this, idx, e)}
              />
            </div>
          ))}
        </fieldset>
        <fieldset className="mb-3">
          <legend className="h6">
            Social media <span className="text-muted small">(optional)</span>
          </legend>
          <p className="text-muted small">
            Links to your profiles, for example on X, Reddit or Bluesky. Add as
            many as you like.
          </p>
          {social_links.map((link, idx) => (
            <div className="input-group mb-2" key={`social-${idx}`}>
              <input
                type="url"
                id={`creator-social-${idx}`}
                className="form-control"
                placeholder="https://"
                aria-label={`Social media link ${idx + 1}`}
                value={link}
                maxLength={512}
                onInput={e => handleSocialLinkChange(this, idx, e)}
              />
              {social_links.length > 1 && (
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  aria-label={`Remove social media link ${idx + 1}`}
                  title="Remove"
                  onClick={() => handleRemoveSocialLink(this, idx)}
                >
                  <Icon icon="x" classes="icon-inline" />
                </button>
              )}
            </div>
          ))}
          {social_links.length < MAX_SOCIAL_LINKS && (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              onClick={() => handleAddSocialLink(this)}
            >
              <Icon icon="add" classes="icon-inline me-1" />
              Add another link
            </button>
          )}
        </fieldset>
      </>
    );
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: this.documentTitle,
      context: this.context as RouterContext,
    });
    return (
      <div className="home-signup container-lg">
        <div className="row">
          <div className="col-12 col-lg-6 offset-lg-3">
            {this.registerForm()}
          </div>
        </div>
        <OAuthLogin oauth_providers={this.isoData.siteRes.oauth_providers} />
      </div>
    );
  }

  registerForm() {
    const siteView = this.isoData.siteRes?.site_view;

    return (
      <form
        className="was-validated"
        onSubmit={e => handleRegisterSubmit(this, e)}
      >
        <h1 className="h4 mb-2">{this.titleName}</h1>
        {this.creatorSwitch()}

        <div className="mb-3 row">
          <label
            className="col-sm-2 col-form-label"
            htmlFor="register-username"
          >
            {I18NextService.i18n.t("username")}
          </label>

          <div className="col-sm-10">
            <input
              type="text"
              id="register-username"
              className="form-control"
              value={this.state.form.username}
              onInput={e => handleRegisterUsernameChange(this, e)}
              required
              minLength={2}
              pattern={validActorRegexPattern}
              title={I18NextService.i18n.t("community_reqs")}
            />
          </div>
        </div>

        {/* audioprn: no email field (no email: recovery codes instead) */}
        <div className="mb-3">
          <PasswordInput
            id="register-password"
            value={this.state.form.password}
            onInput={e => handleRegisterPasswordChange(this, e)}
            showStrength
            label={I18NextService.i18n.t("password")}
            isNew
          />
        </div>
        <div className="mb-3">
          <PasswordInput
            id="register-verify-password"
            value={this.state.form.password_verify}
            onInput={e => handleRegisterPasswordVerifyChange(this, e)}
            label={I18NextService.i18n.t("verify_password")}
            isNew
          />
        </div>

        {this.isCreator && this.creatorLinks()}
        <RegistrationApplicationInput
          getSiteRes={this.isoData.siteRes}
          onAnswerChange={answer => handleAnswerChange(this, answer)}
        />
        {this.renderInviteTokenInput(siteView)}
        {this.renderCaptcha()}
        <RegistrationLegalInfo siteView={siteView} />
        <RegistrationCheckboxes
          form={this.state.form}
          onRegisterShowNsfwChange={e => handleRegisterShowNsfwChange(this, e)}
          onStayLoggedInChange={e => handleStayLoggedInChange(this, e)}
          onHoneyPotChange={e => handleHoneyPotChange(this, e)}
        />
        <div className="mb-3 row">
          <div className="col-sm-10">
            <button type="submit" className="btn btn-light border-light-subtle">
              {this.state.registerRes.state === "loading" ? (
                <Spinner />
              ) : (
                signupTitleName(siteView)
              )}
            </button>
          </div>
        </div>
      </form>
    );
  }

  renderCaptcha(): InfernoNode | void {
    switch (this.state.captchaRes.state) {
      case "loading":
        return <Spinner large centered />;
      case "success": {
        const res = this.state.captchaRes.data;
        return (
          <div className="mb-3 row">
            <label className="col-sm-2" htmlFor="register-captcha">
              <span className="me-2">
                {I18NextService.i18n.t("enter_code")}
              </span>
              <button
                type="button"
                className="btn btn-light border-light-subtle"
                onClick={() => handleRegenCaptcha(this)}
                aria-label={I18NextService.i18n.t("captcha")}
              >
                <Icon icon="refresh-cw" classes="icon-refresh-cw" />
              </button>
            </label>
            {this.showCaptcha(res)}
            <div className="col-sm-6">
              <input
                type="text"
                className="form-control"
                id="register-captcha"
                value={this.state.form.captcha_answer}
                onInput={e => handleRegisterCaptchaAnswerChange(this, e)}
                required
              />
            </div>
          </div>
        );
      }
    }
  }

  renderInviteTokenInput(siteView?: SiteView) {
    const isRequireInvitation =
      siteView?.local_site.registration_mode === "require_invitation";
    const hasTokenInState = !!this.state.form.token;

    return isRequireInvitation || hasTokenInState ? (
      <div className="mb-3 row">
        <label
          className="col-sm-2 col-form-label"
          htmlFor="register-invite-token"
        >
          {I18NextService.i18n.t("invite_token")}
        </label>
        <div className="col-sm-10">
          <input
            type="text"
            id="register-invite-token"
            className="form-control font-monospace"
            value={this.state.form.token ?? ""}
            onInput={e => handleInviteTokenChange(this, e)}
            required={isRequireInvitation}
          />
        </div>
      </div>
    ) : undefined;
  }

  showCaptcha(res: GetCaptchaResponse) {
    const captchaRes = res?.ok;
    return captchaRes ? (
      <div className="col-sm-4">
        <>
          <img
            className="rounded-top img-fluid"
            src={captchaPngSrc(captchaRes)}
            style="border-bottom-right-radius: 0; border-bottom-left-radius: 0;"
            alt={I18NextService.i18n.t("captcha")}
          />
          {captchaRes.wav && (
            <button
              className="rounded-bottom btn btn-sm btn-light border-light-subtle d-block"
              style="border-top-right-radius: 0; border-top-left-radius: 0;"
              title={I18NextService.i18n.t("play_captcha_audio")}
              onClick={() => handleCaptchaPlay(this)}
              type="button"
              disabled={this.state.captchaPlaying}
            >
              <Icon icon="play" classes="icon-play" />
            </button>
          )}
        </>
      </div>
    ) : (
      <></>
    );
  }
}

async function handleRegisterSubmit(
  i: Signup,
  event: FormEvent<HTMLFormElement>,
) {
  event.preventDefault();
  const {
    show_nsfw,
    answer,
    captcha_answer,
    captcha_uuid,
    email,
    honeypot,
    password,
    password_verify,
    username,
    stay_logged_in,
  } = i.state.form;

  // audioprn: creator signup sends the links along, after a quick check here.
  const creatorFields = i.isCreator
    ? {
        creator_content_links: i.state.form.content_links.map(l => l.trim()),
        creator_social_links: i.state.form.social_links
          .map(l => l.trim())
          .filter(l => l !== ""),
      }
    : {};
  if (
    i.isCreator &&
    new Set(creatorFields.creator_content_links).size !== CONTENT_LINKS_REQUIRED
  ) {
    toast(
      creatorErrorMessage("creator_content_links_must_be_different"),
      "danger",
    );
    return;
  }

  // normal registration
  if (username && password && password_verify) {
    i.setState({ registerRes: LOADING_REQUEST });

    const registerRes = await HttpService.client.register({
      username,
      password,
      password_verify,
      email,
      show_nsfw,
      captcha_uuid,
      captcha_answer,
      honeypot,
      answer,
      stay_logged_in,
      token: i.state.form.token,
      // Not in lemmy-js-client's Register type, but sent as JSON all the same.
      ...creatorFields,
    } as Register);
    switch (registerRes.state) {
      case "failed": {
        toast(
          registerErrorMessage(registerRes.err) ??
            I18NextService.i18n.t(registerRes.err.name as NoOptionI18nKeys),
          "danger",
        );
        i.setState({ registerRes: EMPTY_REQUEST });
        break;
      }

      case "success": {
        const data = registerRes.data;
        // Only log them in if a jwt was set
        if (data.jwt) {
          UserService.Instance.login({ res: data });

          const myUserRes = await HttpService.client.getMyUser();

          if (myUserRes.state === "success") {
            removeLocalStorageMarkdown();

            updateMyUserInfo(myUserRes.data);
            refreshTheme();
            await I18NextService.reconfigure(
              window.navigator.languages,
              myUserRes.data.local_user_view.local_user.interface_language,
            );
          }

          // audioprn: new accounts get their recovery code first (no email).
          i.props.history.replace("/recovery_code");
        } else {
          if (data.verify_email_sent) {
            toast(I18NextService.i18n.t("verify_email_sent"));
          }
          if (i.isCreator) {
            toast(
              "Your creator application was sent. An admin will review your links.",
            );
          }
          if (data.registration_created) {
            toast(I18NextService.i18n.t("registration_application_sent"));
          }
          i.props.history.push("/");
        }
        break;
      }
    }
  }
}

function handleRegisterUsernameChange(
  i: Signup,
  event: FormEvent<HTMLInputElement>,
) {
  i.state.form.username = event.target.value.trim();
  i.setState(i.state);
}

function handleRegisterPasswordChange(
  i: Signup,
  event: FormEvent<HTMLInputElement>,
) {
  i.state.form.password = event.target.value;
  i.setState(i.state);
}

function handleRegisterPasswordVerifyChange(
  i: Signup,
  event: FormEvent<HTMLInputElement>,
) {
  i.state.form.password_verify = event.target.value;
  i.setState(i.state);
}

function handleRegisterShowNsfwChange(i: Signup, checked: boolean) {
  i.state.form.show_nsfw = checked;
  i.setState(i.state);
}

function handleStayLoggedInChange(i: Signup, checked: boolean) {
  i.state.form.stay_logged_in = checked;
  i.setState(i.state);
}

function handleRegisterCaptchaAnswerChange(
  i: Signup,
  event: FormEvent<HTMLInputElement>,
) {
  i.state.form.captcha_answer = event.target.value;
  i.setState(i.state);
}

function handleAnswerChange(i: Signup, val: string) {
  i.setState(s => ((s.form.answer = val), s));
}

function handleHoneyPotChange(i: Signup, value: string) {
  i.state.form.honeypot = value;
  i.setState(i.state);
}

function handleInviteTokenChange(
  i: Signup,
  event: FormEvent<HTMLInputElement>,
) {
  i.state.form.token = event.target.value.trim();
  i.setState(i.state);
}

async function handleRegenCaptcha(i: Signup) {
  i.audio = undefined;
  i.setState({ captchaPlaying: false });
  await i.fetchCaptcha();
}

async function handleCaptchaPlay(i: Signup) {
  // This was a bad bug, it should only build the new audio on a new file.
  // Replays would stop prematurely if this was rebuilt every time.

  if (i.state.captchaRes.state === "success" && i.state.captchaRes.data.ok) {
    const captchaRes = i.state.captchaRes.data.ok;
    if (!i.audio) {
      const base64 = `data:audio/wav;base64,${captchaRes.wav}`;
      i.audio = new Audio(base64);
      await i.audio.play();

      i.setState({ captchaPlaying: true });

      i.audio.addEventListener("ended", () => {
        if (i.audio) {
          i.audio.currentTime = 0;
          i.setState({ captchaPlaying: false });
        }
      });
    }
  }
}

function captchaPngSrc(captcha: CaptchaResponse) {
  return `data:image/png;base64,${captcha.png}`;
}

export function signupTitleName(siteView?: SiteView): string {
  return I18NextService.i18n.t(
    siteView?.local_site.private_instance ? "apply_to_join" : "sign_up",
  );
}

function handleContentLinkChange(
  i: Signup,
  idx: number,
  event: FormEvent<HTMLInputElement>,
) {
  i.state.form.content_links[idx] = event.target.value;
  i.setState(i.state);
}

function handleSocialLinkChange(
  i: Signup,
  idx: number,
  event: FormEvent<HTMLInputElement>,
) {
  i.state.form.social_links[idx] = event.target.value;
  i.setState(i.state);
}

function handleAddSocialLink(i: Signup) {
  if (i.state.form.social_links.length < MAX_SOCIAL_LINKS) {
    i.state.form.social_links.push("");
    i.setState(i.state);
  }
}

function handleRemoveSocialLink(i: Signup, idx: number) {
  i.state.form.social_links.splice(idx, 1);
  i.setState(i.state);
}

function extractInviteToken(i: Signup) {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token") ?? undefined;
  if (token && i.state.form.token !== token) {
    i.state.form.token = token;
    i.setState(i.state);
  }
}
