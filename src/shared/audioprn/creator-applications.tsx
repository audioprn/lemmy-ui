// audioprn: admin page for reviewing creator applications (/creator_applications).
import { setIsoData, toast, WithHead } from "@utils/app";
import { isBrowser } from "@utils/browser";
import { amAdmin } from "@utils/roles";
import { Component } from "inferno";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";
import { htmlTags } from "@components/common/html-tags";
import { Spinner } from "@components/common/icon";
import { MomentTime } from "@components/common/moment-time";
import {
  approveCreatorApplication,
  CreatorApplicationView,
  listCreatorApplications,
} from "./creator-api";

type Props = RouteComponentProps<Record<string, never>> & WithHead;

interface State {
  loading: boolean;
  pendingOnly: boolean;
  apps: CreatorApplicationView[];
  denyReasons: Record<number, string>;
  busyId?: number;
}

function statusLabel(approved: boolean | null) {
  if (approved === true)
    return <span className="badge text-bg-success">Approved</span>;
  if (approved === false)
    return <span className="badge text-bg-danger">Denied</span>;
  return <span className="badge text-bg-warning">Pending</span>;
}

function linkList(links: string[]) {
  return (
    <ol className="mb-2">
      {links.map(l => (
        <li key={l}>
          <a href={l} target="_blank" rel="noopener noreferrer nofollow">
            {l}
          </a>
        </li>
      ))}
    </ol>
  );
}

export class CreatorApplications extends Component<Props, State> {
  private isoData = setIsoData(this.context);

  state: State = {
    loading: true,
    pendingOnly: true,
    apps: [],
    denyReasons: {},
  };

  async componentDidMount() {
    if (isBrowser() && amAdmin(this.isoData.myUserInfo)) {
      await this.refetch();
    }
  }

  async refetch(pendingOnly = this.state.pendingOnly) {
    this.setState({ loading: true, pendingOnly });
    try {
      const res = await listCreatorApplications(pendingOnly);
      this.setState({ apps: res.creator_applications });
    } catch (e) {
      toast((e as Error).message, "danger");
    }
    this.setState({ loading: false });
  }

  async decide(id: number, approve: boolean) {
    this.setState({ busyId: id });
    try {
      await approveCreatorApplication(id, approve, this.state.denyReasons[id]);
      toast(approve ? "Creator approved." : "Application denied.");
      await this.refetch();
    } catch (e) {
      toast((e as Error).message, "danger");
    }
    this.setState({ busyId: undefined });
  }

  renderApp(view: CreatorApplicationView) {
    const app = view.creator_application;
    const busy = this.state.busyId === app.id;
    return (
      <div className="card mb-3" key={app.id}>
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-start mb-2">
            <div>
              <Link to={`/u/${view.person_name}`} className="fw-semibold">
                {view.person_display_name ?? view.person_name}
              </Link>{" "}
              <span className="text-muted small">@{view.person_name}</span>
              {!view.email_verified && (
                <span className="badge text-bg-secondary ms-2">
                  Email not verified
                </span>
              )}
            </div>
            <div className="text-end small">
              {statusLabel(app.approved)}
              <div className="text-muted">
                <MomentTime published={app.published_at} showAgo />
              </div>
            </div>
          </div>

          <h2 className="h6 mt-3">Work</h2>
          {linkList(app.content_links)}

          {app.social_links.length > 0 && (
            <>
              <h2 className="h6">Social media</h2>
              {linkList(app.social_links)}
            </>
          )}

          {app.approved === false && app.deny_reason && (
            <p className="small text-muted">Deny reason: {app.deny_reason}</p>
          )}

          <div className="d-flex flex-wrap gap-2 align-items-center mt-3">
            {app.approved !== true && (
              <button
                type="button"
                className="btn btn-success"
                disabled={busy}
                onClick={() => this.decide(app.id, true)}
              >
                {busy ? <Spinner /> : "Approve"}
              </button>
            )}
            <input
              type="text"
              className="form-control w-auto flex-grow-1"
              placeholder="Reason (optional, shown if denied)"
              aria-label="Deny reason"
              value={this.state.denyReasons[app.id] ?? ""}
              onInput={e =>
                this.setState(s => ({
                  denyReasons: { ...s.denyReasons, [app.id]: e.target.value },
                }))
              }
            />
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={busy}
              onClick={() => this.decide(app.id, false)}
            >
              {app.approved === true ? "Revoke" : "Deny"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  render() {
    const siteName = this.isoData.siteRes?.site_view.site.name;
    htmlTags({
      head: this.props.head,
      title: `Creator applications - ${siteName}`,
      context: this.context as RouterContext,
    });

    if (!amAdmin(this.isoData.myUserInfo)) {
      return (
        <div className="container-lg">
          <p>Only admins can review creator applications.</p>
        </div>
      );
    }

    return (
      <div className="container-lg">
        <h1 className="h4 mb-3">Creator applications</h1>
        <div className="btn-group mb-3" role="group">
          <button
            type="button"
            className={`btn btn-outline-secondary${this.state.pendingOnly ? " active" : ""}`}
            onClick={() => this.refetch(true)}
          >
            Pending
          </button>
          <button
            type="button"
            className={`btn btn-outline-secondary${this.state.pendingOnly ? "" : " active"}`}
            onClick={() => this.refetch(false)}
          >
            All
          </button>
        </div>
        {this.state.loading ? (
          <div className="text-center">
            <Spinner large />
          </div>
        ) : this.state.apps.length === 0 ? (
          <p className="text-muted">
            {this.state.pendingOnly
              ? "No pending applications."
              : "No applications yet."}
          </p>
        ) : (
          this.state.apps.map(a => this.renderApp(a))
        )}
      </div>
    );
  }
}
