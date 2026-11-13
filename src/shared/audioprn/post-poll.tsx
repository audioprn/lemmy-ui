// audioprn: polls on creators' page posts. One choice per vote and it can't be changed; results
// show after voting, once the poll has ended, and always to the post's creator.
import { setIsoData, toast } from "@utils/app";
import { Component } from "inferno";
import { batchLoader } from "./batch-loader";
import { call } from "./creator-api";

interface Poll {
  post_id: number;
  question: string;
  options: string[];
  ends_at: string;
  my_vote: number | null;
  /** Votes per option; null until you've voted (or the poll ended). */
  counts: number[] | null;
}

const polls = batchLoader<Poll | null>(async ids => {
  const res = await call<{ polls: Poll[] }>(
    "GET",
    `/post_polls?post_ids=${ids.join(",")}`,
  );
  return new Map(res.polls.map(p => [p.post_id, p]));
}, null);

/** Adds a poll to a creator page post (after the post is created). */
export async function createPostPoll(
  postId: number,
  question: string,
  options: string[],
  endsAt: Date,
) {
  polls.set(
    postId,
    await call<Poll>("PUT", "/post_poll", {
      post_id: postId,
      question,
      options,
      ends_at: endsAt.toISOString(),
    }),
  );
}

export class PostPoll extends Component<
  { postId: number },
  { choice?: number }
> {
  private isoData = setIsoData(this.context);
  private unsubscribe?: () => void;
  state: { choice?: number } = {};

  componentDidMount() {
    this.unsubscribe = polls.subscribe(() => this.forceUpdate());
    polls.request(this.props.postId);
  }

  componentWillUnmount() {
    this.unsubscribe?.();
  }

  async vote(choice: number) {
    try {
      polls.set(
        this.props.postId,
        await call<Poll>("POST", "/post_poll/vote", {
          post_id: this.props.postId,
          choice,
        }),
      );
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    const poll = polls.get(this.props.postId);
    if (!poll) return null;
    const ended = new Date(poll.ends_at) <= new Date();
    const total = poll.counts?.reduce((a, b) => a + b, 0) ?? 0;
    const loggedIn = !!this.isoData.myUserInfo;
    return (
      <div className="card card-body my-2">
        <div className="fw-bold mb-2">📊 {poll.question}</div>
        {poll.counts ? (
          poll.options.map((option, i) => {
            const pct = total ? Math.round((poll.counts![i] / total) * 100) : 0;
            return (
              <div className="mb-1">
                <div className="d-flex justify-content-between small">
                  <span>
                    {option} {poll.my_vote === i && "✓"}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="progress" style="height: 0.5rem">
                  <div className="progress-bar" style={`width: ${pct}%`} />
                </div>
              </div>
            );
          })
        ) : (
          <form
            onSubmit={e => {
              e.preventDefault();
              if (this.state.choice !== undefined) this.vote(this.state.choice);
            }}
          >
            {poll.options.map((option, i) => (
              <div className="form-check">
                <input
                  className="form-check-input"
                  type="radio"
                  name={`poll-${poll.post_id}`}
                  id={`poll-${poll.post_id}-${i}`}
                  disabled={!loggedIn}
                  checked={this.state.choice === i}
                  onChange={() => this.setState({ choice: i })}
                />
                <label
                  className="form-check-label"
                  htmlFor={`poll-${poll.post_id}-${i}`}
                >
                  {option}
                </label>
              </div>
            ))}
            {loggedIn ? (
              <button
                type="submit"
                className="btn btn-sm btn-secondary mt-2"
                disabled={this.state.choice === undefined}
              >
                Vote
              </button>
            ) : (
              <div className="small text-muted mt-2">Log in to vote.</div>
            )}
            <div className="small text-muted mt-1">
              Results show after you vote. Votes can't be changed.
            </div>
          </form>
        )}
        <div className="small text-muted mt-2">
          {poll.counts && `${total} vote${total === 1 ? "" : "s"} · `}
          {ended ? "Poll ended " : "Ends "}
          {new Date(poll.ends_at).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </div>
    );
  }
}
