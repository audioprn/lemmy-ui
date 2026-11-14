// audioprn: /report, linked as "Report it!" in the sidebar. How to report a post, comment or
// creator, and a form that files the report from a pasted link. Reports on posts and comments
// go to the moderators (/reports); reports on creators to the admins.
import { htmlTags } from "@components/common/html-tags";
import { reportToast, setIsoData, toast, WithHead } from "@utils/app";
import { Component } from "inferno";
import { Link, RouterContext } from "inferno-router";
import { HttpService } from "../services";
import { reportCreator } from "./creators";

type Target =
  | { kind: "post"; id: number }
  | { kind: "comment"; id: number }
  | { kind: "creator"; name: string };

/** What a pasted link points to: a post, a comment, or a creator's page. */
function target(link: string): Target | undefined {
  const path = link.trim().replace(/^https?:\/\/[^/]+/, "");
  const comment =
    path.match(/^\/comment\/(\d+)/) ?? path.match(/^\/post\/\d+\/(\d+)/);
  if (comment) return { kind: "comment", id: Number(comment[1]) };
  const post = path.match(/^\/post\/(\d+)/);
  if (post) return { kind: "post", id: Number(post[1]) };
  const creator = path.match(/^\/u\/([\w.-]+)/);
  if (creator) return { kind: "creator", name: creator[1] };
  return undefined;
}

interface State {
  link: string;
  reason: string;
  sending: boolean;
}

export class ReportPage extends Component<WithHead, State> {
  private isoData = setIsoData(this.context);
  state: State = { link: "", reason: "", sending: false };

  async send() {
    const { link, reason } = this.state;
    const t = target(link);
    if (!t) {
      return toast(
        "Paste the link of a post, a comment or a creator's page here.",
        "danger",
      );
    }
    if (!reason.trim()) {
      return toast("Say which rule it breaks.", "danger");
    }
    this.setState({ sending: true });
    if (t.kind === "creator") {
      await reportCreator(t.name, reason);
    } else {
      reportToast(
        t.kind === "post"
          ? await HttpService.client.createPostReport({
              post_id: t.id,
              reason: reason.trim(),
            })
          : await HttpService.client.createCommentReport({
              comment_id: t.id,
              reason: reason.trim(),
            }),
      );
    }
    this.setState({ link: "", reason: "", sending: false });
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: `Report - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    const loggedIn = !!this.isoData.myUserInfo;
    return (
      <div className="container-lg" style="max-width: 48rem">
        <h1 className="h4 mb-3">Report something</h1>
        <p>
          Seen something that breaks the rules? Tell us. Moderators review every
          report; reports about a creator go to the admins.
        </p>
        <h2 className="h6">From the post, comment or creator</h2>
        <ul>
          <li>
            <strong>A post or comment:</strong> click <strong>More</strong>{" "}
            under it and choose <strong>Create report</strong>.
          </li>
          <li>
            <strong>A creator:</strong> on their page, click{" "}
            <strong>Report creator</strong>.
          </li>
        </ul>
        <h2 className="h6 mt-4">Or paste its link here</h2>
        {!loggedIn ? (
          <p>
            <Link to="/login">Log in</Link> to send a report.
          </p>
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault();
              this.send();
            }}
          >
            <label className="form-label small" htmlFor="report-link">
              Link to the post, comment or creator's page
            </label>
            <input
              id="report-link"
              className="form-control mb-2"
              placeholder="https://…/post/123"
              value={this.state.link}
              onInput={e => this.setState({ link: e.target.value })}
            />
            <label className="form-label small" htmlFor="report-reason">
              Which rule does it break?
            </label>
            <textarea
              id="report-reason"
              className="form-control mb-2"
              rows={3}
              maxLength={1000}
              value={this.state.reason}
              onInput={e => this.setState({ reason: e.target.value })}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={this.state.sending}
            >
              Send report
            </button>
          </form>
        )}
      </div>
    );
  }
}
