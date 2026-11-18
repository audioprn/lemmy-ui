// audioprn: the "Online now" line, under the news box on Content and My audioprn (user, 2026-11-18).
// Calling the backend also counts this tab as online, so the top bar keeps a hidden one on every
// page, calling every minute while the site is open (in the browser only, never server-side).
import { Component } from "inferno";
import { call } from "./creator-api";

interface Online {
  creators: number;
  members: number;
  guests: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export class OnlineNow extends Component<
  { show?: boolean },
  { online?: Online }
> {
  state: { online?: Online } = {};
  private timer?: ReturnType<typeof setInterval>;

  componentDidMount() {
    const load = () => {
      call<Online>("GET", "/online")
        .then(online => this.setState({ online }))
        .catch(() => {});
    };
    load();
    this.timer = setInterval(load, 60_000);
  }

  componentWillUnmount() {
    clearInterval(this.timer);
  }

  render() {
    const o = this.state.online;
    if (!o || !this.props.show) return null;
    return (
      <div className="small text-muted mb-3">
        Online now: {plural(o.creators, "creator")} ·{" "}
        {plural(o.members, "member")} · {plural(o.guests, "guest")}
      </div>
    );
  }
}
