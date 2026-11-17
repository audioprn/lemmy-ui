// audioprn: scripts on Script Offer posts. The writer can add the script's text (a backup of
// scriptbin.works or another site, so readers can stay here), a link to where else it's hosted,
// and fill terms. Reading the text needs an account (and is limited per hour); the writer can
// update it any time. A reader view helps voice actors read while recording.
// Readers' copies carry an invisible watermark; admins can paste a leaked copy to see whose it was.
import { setIsoData, toast } from "@utils/app";
import { relTags } from "@utils/config";
import { mdToHtml } from "@utils/markdown";
import { Component } from "inferno";
import { Link } from "inferno-router";
import { PostView } from "lemmy-js-client";
import { Popup } from "./accessibility";
import { call } from "./creator-api";

export const FILL_TERMS: Record<string, string> = {
  ask_first: "Ask first",
  paywall_ok: "Fine to paywall with credit given and copy sent",
  temporary_paywall: "Temporary paywalling only",
  no_paywall: "No paywalled fills",
};

export interface ScriptInput {
  body: string;
  link: string;
  fill_terms: string;
}
export const NO_SCRIPT: ScriptInput = { body: "", link: "", fill_terms: "" };

interface Script {
  link: string | null;
  fill_terms: string | null;
  updated_at: string;
  words: number;
  body: string | null;
}

const message = (e: unknown) => (e as Error).message;

/** Adds, updates or (when empty) removes a post's script. */
export function savePostScript(postId: number, script: ScriptInput) {
  return call<{ script: Script | null }>("PUT", "/post_script", {
    post_id: postId,
    body: script.body,
    link: script.link || null,
    fill_terms: script.fill_terms || null,
  });
}

/** The script fields, on the post form and in the writer's update box. */
export function ScriptFields({
  value,
  onChange,
}: {
  value: ScriptInput;
  onChange: (value: ScriptInput) => void;
}) {
  return (
    <>
      <textarea
        className="form-control mb-2 font-monospace"
        rows={10}
        aria-label="Script text"
        placeholder="Paste the full script here (optional). Markdown works: **bold**, *italic*, [sound cues]."
        value={value.body}
        onInput={e => onChange({ ...value, body: e.target.value })}
      />
      <input
        type="url"
        className="form-control mb-2"
        aria-label="Script link"
        placeholder="Link to the script elsewhere, e.g. scriptbin.works (optional)"
        value={value.link}
        onInput={e => onChange({ ...value, link: e.target.value })}
      />
      <select
        className="form-select"
        aria-label="Fill terms"
        value={value.fill_terms}
        onChange={e => onChange({ ...value, fill_terms: e.target.value })}
      >
        <option value="">Fill terms (optional)</option>
        {Object.entries(FILL_TERMS).map(([key, label]) => (
          <option value={key}>{label}</option>
        ))}
      </select>
    </>
  );
}

const hostname = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

interface State {
  script?: Script | null;
  reader: boolean;
  draft?: ScriptInput;
  /// Admins: a pasted leaked copy, and whose watermark it carries.
  leak?: string;
  leakReaders?: string[];
}

/** On the post page of a Script Offer post: the script box. */
export class ScriptBox extends Component<{ postView: PostView }, State> {
  private isoData = setIsoData(this.context);
  state: State = { reader: false };

  async componentDidMount() {
    const { script } = await call<{ script: Script | null }>(
      "GET",
      `/post_script?post_id=${this.props.postView.post.id}`,
    ).catch(() => ({ script: null }));
    this.setState({ script });
  }

  async read() {
    try {
      const { script } = await call<{ script: Script | null }>(
        "GET",
        `/post_script?post_id=${this.props.postView.post.id}&text=true`,
      );
      this.setState({ script });
    } catch (e) {
      toast(message(e), "danger");
    }
  }

  async save(draft: ScriptInput) {
    try {
      const { script } = await savePostScript(
        this.props.postView.post.id,
        draft,
      );
      this.setState({ script, draft: undefined });
      toast("Script saved.");
    } catch (e) {
      toast(message(e), "danger");
    }
  }

  async checkLeak() {
    try {
      const { readers } = await call<{ readers: string[] }>(
        "POST",
        "/script_watermark",
        { text: this.state.leak },
      );
      this.setState({ leakReaders: readers });
    } catch (e) {
      toast(message(e), "danger");
    }
  }

  get isWriter() {
    const mui = this.isoData.myUserInfo;
    return (
      mui?.local_user_view.person.id === this.props.postView.creator.id ||
      !!mui?.local_user_view.local_user.admin
    );
  }

  render() {
    const { postView } = this.props;
    const { script, reader, draft } = this.state;
    const scriptOffer = postView.tags.some(t => t.name === "script_offer");
    if (script === undefined || (!script && !(scriptOffer && this.isWriter))) {
      return null;
    }
    const loggedIn = !!this.isoData.myUserInfo;
    const creator = postView.creator.display_name ?? postView.creator.name;
    const text = script?.body && (
      <>
        <div
          className="md-div"
          dangerouslySetInnerHTML={mdToHtml(script.body, () => {})}
        />
        <p className="small text-muted border-top pt-2 mt-3">
          © {creator}. All rights reserved. Don't repost or copy this script, or
          use it for AI training. Copies are marked with the reader's account.
          {script.fill_terms &&
            ` Fill terms: ${FILL_TERMS[script.fill_terms]}.`}
        </p>
      </>
    );
    return (
      <div className="card card-body my-2">
        <div className="d-flex flex-wrap align-items-center gap-2">
          <h2 className="h6 mb-0">📜 Script</h2>
          {script?.fill_terms && (
            <span className="badge text-bg-light border">
              Fill terms: {FILL_TERMS[script.fill_terms]}
            </span>
          )}
          {script && (
            <span className="small text-muted">
              {script.words > 0 && `~${script.words} words · `}
              Updated{" "}
              {new Date(script.updated_at).toLocaleDateString(undefined, {
                dateStyle: "medium",
              })}
            </span>
          )}
        </div>
        {script && !draft && (
          <div className="d-flex flex-wrap gap-2 mt-2">
            {script.words > 0 &&
              !script.body &&
              (loggedIn ? (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  onClick={() => this.read()}
                >
                  Read script here
                </button>
              ) : (
                <Link className="btn btn-sm btn-primary" to="/login">
                  Log in to read the script (free)
                </Link>
              ))}
            {script.body && (
              <button
                type="button"
                className="btn btn-sm btn-light border-light-subtle"
                onClick={() => this.setState({ reader: true })}
              >
                Reader view
              </button>
            )}
            {script.link && (
              <a
                className="btn btn-sm btn-light border-light-subtle"
                href={script.link}
                rel={relTags}
              >
                Read on {hostname(script.link)}
              </a>
            )}
          </div>
        )}
        {this.isWriter && !draft && (
          <button
            type="button"
            className="btn btn-link btn-sm p-0 mt-2 align-self-start"
            onClick={() => this.loadDraft()}
          >
            {script ? "Update script" : "Add script"}
          </button>
        )}
        {this.isoData.myUserInfo?.local_user_view.local_user.admin &&
          !!script?.words &&
          !draft &&
          (this.state.leak === undefined ? (
            <button
              type="button"
              className="btn btn-link btn-sm p-0 mt-1 align-self-start"
              onClick={() => this.setState({ leak: "" })}
            >
              Check a leaked copy
            </button>
          ) : (
            <div className="mt-2">
              <textarea
                className="form-control mb-2"
                rows={4}
                aria-label="Leaked copy"
                placeholder="Paste the leaked text, copied straight from where it was posted"
                value={this.state.leak}
                onInput={e => this.setState({ leak: e.target.value })}
              />
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => this.checkLeak()}
              >
                Check
              </button>
              {this.state.leakReaders && (
                <p className="small mt-2 mb-0">
                  {this.state.leakReaders.length
                    ? `Copied from the account of: ${this.state.leakReaders.map(n => `u/${n}`).join(", ")}`
                    : "No watermark found (it may have been retyped, or copied from the writer's own copy or another site)."}
                </p>
              )}
            </div>
          ))}
        {draft && (
          <div className="mt-2">
            <ScriptFields
              value={draft}
              onChange={value => this.setState({ draft: value })}
            />
            <div className="d-flex gap-2 mt-2">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => this.save(draft)}
              >
                Save script
              </button>
              <button
                type="button"
                className="btn btn-sm btn-light border-light-subtle"
                onClick={() => this.setState({ draft: undefined })}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        {text && !draft && !reader && <div className="mt-3">{text}</div>}
        {text && !draft && reader && (
          <Popup
            label="Reader view"
            onClose={() => this.setState({ reader: false })}
            className="position-fixed top-0 start-0 w-100 h-100 bg-body overflow-auto p-4"
            style="z-index: 2000"
          >
            <div
              className="mx-auto"
              style="max-width: 42rem; font-size: 1.3rem; line-height: 1.7"
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm mb-3"
                onClick={() => this.setState({ reader: false })}
              >
                Close reader view
              </button>
              {text}
            </div>
          </Popup>
        )}
      </div>
    );
  }

  /** The writer's update box starts from the current script (its text loads first). */
  async loadDraft() {
    let script = this.state.script;
    if (script && script.words > 0 && !script.body) {
      await this.read();
      script = this.state.script;
    }
    this.setState({
      draft: {
        body: script?.body ?? "",
        link: script?.link ?? "",
        fill_terms: script?.fill_terms ?? "",
      },
    });
  }
}
