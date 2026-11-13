// audioprn: post drafts. The post form saves itself as a draft (JSON text) to finish later; the
// create post page lists the user's drafts to open again (`/create_post?draft=ID`) or delete.
import { toast } from "@utils/app";
import { Component } from "inferno";
import { Link } from "inferno-router";
import { call } from "./creator-api";

interface DraftSummary {
  id: number;
  title: string;
  updated_at: string;
}

export const saveDraft = (
  id: number | undefined,
  title: string,
  data: string,
) => call<{ id: number }>("PUT", "/post_draft", { id, title, data });

export const getDraft = (id: number) =>
  call<{ data: string }>("GET", `/post_draft?id=${id}`);

export const deleteDraft = (id: number) =>
  call("DELETE", "/post_draft", { id });

/** The user's drafts, above the post form. */
export class PostDrafts extends Component<
  { current?: number; onDelete: (id: number) => void },
  { drafts: DraftSummary[] }
> {
  state = { drafts: [] as DraftSummary[] };

  async componentDidMount() {
    const { drafts } = await call<{ drafts: DraftSummary[] }>(
      "GET",
      "/post_drafts",
    ).catch(() => ({ drafts: [] }));
    this.setState({ drafts });
  }

  async remove(draft: DraftSummary) {
    if (!confirm(`Delete the draft "${draft.title || "Untitled"}"?`)) return;
    try {
      await deleteDraft(draft.id);
      this.setState({
        drafts: this.state.drafts.filter(d => d.id !== draft.id),
      });
      this.props.onDelete(draft.id);
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    const { drafts } = this.state;
    if (drafts.length === 0) return null;
    return (
      <details className="card card-body mb-3" open={!!this.props.current}>
        <summary className="fw-semibold">
          📝 Your drafts ({drafts.length})
        </summary>
        <ul className="list-unstyled mb-0 mt-2">
          {drafts.map(d => (
            <li className="d-flex align-items-center gap-2 py-1">
              {d.id === this.props.current ? (
                <strong className="text-truncate">
                  {d.title || "Untitled"} (open)
                </strong>
              ) : (
                <Link
                  className="text-truncate"
                  to={`/create_post?draft=${d.id}`}
                >
                  {d.title || "Untitled"}
                </Link>
              )}
              <span className="small text-muted text-nowrap">
                {new Date(d.updated_at).toLocaleDateString(undefined, {
                  dateStyle: "medium",
                })}
              </span>
              <button
                type="button"
                className="btn btn-link btn-sm text-danger p-0 ms-auto"
                onClick={() => this.remove(d)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </details>
    );
  }
}
