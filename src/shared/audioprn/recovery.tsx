// audioprn: no email (user, 2026-11-18), so no password reset emails. Everyone keeps a recovery
// code, shown once, to set a new password at /login_reset. A creator who lost the code too asks
// an admin (the backup), who sets a temporary password from their profile. Admins don't use
// codes. The wording is placeholder.
import { setIsoData, toast, WithHead } from "@utils/app";
import { Component } from "inferno";
import { Link, RouterContext } from "inferno-router";
import { htmlTags } from "@components/common/html-tags";
import { call } from "./creator-api";

/** The code, big, with a copy button. */
function ShowCode({ code }: { code: string }) {
  return (
    <div className="alert alert-success">
      <p className="mb-2">
        Your recovery code. Save it somewhere safe now (a password manager, or a
        note): it won't be shown again.
      </p>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <code className="fs-4 user-select-all" aria-label="Recovery code">
          {code}
        </code>
        <button
          type="button"
          className="btn btn-sm btn-secondary"
          onClick={() =>
            void navigator.clipboard
              .writeText(code)
              .then(() => toast("Copied."))
          }
        >
          Copy
        </button>
      </div>
    </div>
  );
}

const message = (e: unknown) => (e as Error).message;

/** /recovery_code: after signing up, and from Settings: make a (new) recovery code. */
export class RecoveryCodePage extends Component<
  WithHead,
  { code?: string; busy: boolean }
> {
  private isoData = setIsoData(this.context);
  state: { code?: string; busy: boolean } = { busy: false };

  async make() {
    this.setState({ busy: true });
    try {
      const { code } = await call<{ code: string }>("POST", "/recovery_code");
      this.setState({ code });
    } catch (e) {
      toast(message(e), "danger");
    }
    this.setState({ busy: false });
  }

  render() {
    const mui = this.isoData.myUserInfo;
    htmlTags({
      head: this.props.head,
      title: `Recovery code - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    return (
      <div className="container-lg" style="max-width: 40rem">
        <h1 className="h4 mb-3">Recovery code</h1>
        {!mui ? (
          <p>
            <Link to="/login">Log in</Link> first.
          </p>
        ) : mui.local_user_view.local_user.admin ? (
          <p>
            Admins don't use recovery codes: a lost admin password is reset on
            the server.
          </p>
        ) : this.state.code ? (
          <>
            <ShowCode code={this.state.code} />
            <Link className="btn btn-primary" to="/">
              I've saved it
            </Link>
          </>
        ) : (
          <>
            <p>
              audioprn doesn't use email. If you forget your password, your
              recovery code is the way back into your account: with your
              username and the code, you can set a new password.
            </p>
            <p className="small text-muted">
              Listeners who lose both can't get back in. Creators who lose both
              can, as a last resort, ask an admin to reset their password.
            </p>
            <p className="small text-muted">
              Making a code replaces any code you had before.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              disabled={this.state.busy}
              onClick={() => void this.make()}
            >
              Make my recovery code
            </button>
          </>
        )}
      </div>
    );
  }
}

interface RecoverState {
  username: string;
  code: string;
  password: string;
  password2: string;
  newCode?: string;
  busy: boolean;
}

/** /login_reset ("Forgot password?"): a new password with the recovery code. */
export class AccountRecovery extends Component<WithHead, RecoverState> {
  private isoData = setIsoData(this.context);
  state: RecoverState = {
    username: "",
    code: "",
    password: "",
    password2: "",
    busy: false,
  };

  async submit(e: Event) {
    e.preventDefault();
    if (this.state.password !== this.state.password2) {
      toast("The two passwords don't match.", "danger");
      return;
    }
    this.setState({ busy: true });
    try {
      const { code } = await call<{ code: string }>("POST", "/recover", {
        username: this.state.username,
        code: this.state.code,
        new_password: this.state.password,
      });
      this.setState({ newCode: code, password: "", password2: "" });
    } catch (err) {
      toast(message(err), "danger");
    }
    this.setState({ busy: false });
  }

  render() {
    const { newCode } = this.state;
    const field = (
      key: "username" | "code" | "password" | "password2",
      label: string,
      type = "text",
    ) => (
      <label className="form-label d-block mb-3">
        {label}
        <input
          className="form-control"
          type={type}
          required
          autoComplete={type === "password" ? "new-password" : "off"}
          minLength={type === "password" ? 10 : undefined}
          maxLength={type === "password" ? 60 : undefined}
          value={this.state[key]}
          onInput={e =>
            this.setState({ [key]: e.target.value } as Pick<
              RecoverState,
              typeof key
            >)
          }
        />
      </label>
    );
    htmlTags({
      head: this.props.head,
      title: `Forgot password - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    return (
      <div className="container-lg" style="max-width: 40rem">
        <h1 className="h4 mb-3">Forgot your password?</h1>
        {newCode ? (
          <>
            <p>Your password is changed. Your old code no longer works.</p>
            <ShowCode code={newCode} />
            <Link className="btn btn-primary" to="/login">
              Log in
            </Link>
          </>
        ) : (
          <form onSubmit={e => void this.submit(e)}>
            <p>
              Enter your username and the recovery code you saved when you
              signed up, and choose a new password.
            </p>
            <p className="small text-muted">
              Creators who've lost their recovery code too: ask an admin to
              reset your password.
            </p>
            {field("username", "Username")}
            {field("code", "Recovery code")}
            {field(
              "password",
              "New password (10 to 60 characters)",
              "password",
            )}
            {field("password2", "New password again", "password")}
            <button
              type="submit"
              className="btn btn-primary"
              disabled={this.state.busy}
            >
              Set new password
            </button>
          </form>
        )}
      </div>
    );
  }
}

/** On a profile, for admins: a temporary password for someone who lost theirs. */
export class AdminResetPassword extends Component<
  { personId: number; name: string },
  { password?: string }
> {
  state: { password?: string } = {};

  async reset() {
    if (
      !confirm(
        `Set a temporary password for ${this.props.name}? Their current password stops working and they're logged out everywhere. Only do this once you're sure it's really them asking.`,
      )
    ) {
      return;
    }
    try {
      const { password } = await call<{ password: string }>(
        "POST",
        "/admin_reset_password",
        { person_id: this.props.personId },
      );
      this.setState({ password });
    } catch (e) {
      toast(message(e), "danger");
    }
  }

  render() {
    const { password } = this.state;
    return password ? (
      <div className="alert alert-warning small mb-0 me-2">
        Temporary password for {this.props.name}:{" "}
        <code className="user-select-all">{password}</code>. Pass it on
        privately; they should change it in Settings after logging in.
      </div>
    ) : (
      <button
        type="button"
        className="d-flex align-self-start btn btn-light border-light-subtle me-2"
        onClick={() => void this.reset()}
      >
        Reset password
      </button>
    );
  }
}
