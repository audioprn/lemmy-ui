// audioprn: the top bar's "Online now" line. Calling the backend also counts this tab as online,
// so it's called every minute while the site is open (in the browser only, never server-side).
import { Component } from "inferno";
import { call } from "./creator-api";

interface Online {
  creators: number;
  members: number;
  guests: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export class OnlineNow extends Component<object, { online?: Online }> {
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
    if (!o) return null;
    return (
      <span className="small text-muted text-nowrap me-md-3">
        Online now: {plural(o.creators, "creator")} ·{" "}
        {plural(o.members, "member")} · {plural(o.guests, "guest")}
      </span>
    );
  }
}
