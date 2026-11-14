// audioprn: on your own profile, who you blocked and who blocked you (only you see this), with
// Unblock and Block back. Blocks work both ways: people who blocked you don't exist for you.
import { setIsoData, toast, updatePersonBlock } from "@utils/app";
import { Component } from "inferno";
import { HttpService } from "../services";
import { call } from "./creator-api";

interface Blocked {
  id: number;
  name: string;
  display_name: string | null;
  blocked_by_me: boolean;
  blocked_me: boolean;
}

export class MyBlocks extends Component<object, { people: Blocked[] }> {
  private isoData = setIsoData(this.context);
  state = { people: [] as Blocked[] };

  componentDidMount() {
    this.load();
  }

  async load() {
    const { people } = await call<{ people: Blocked[] }>(
      "GET",
      "/blocks",
    ).catch(() => ({ people: [] }));
    this.setState({ people });
  }

  async setBlock(p: Blocked, block: boolean) {
    const res = await HttpService.client.blockPerson({
      person_id: p.id,
      block,
    });
    if (res.state !== "success") {
      return toast("That didn't work, try again.", "danger");
    }
    updatePersonBlock(res.data, block, this.isoData.myUserInfo);
    this.load();
  }

  list(people: Blocked[], empty: string, button: (p: Blocked) => JSX.Element) {
    if (people.length === 0)
      return <div className="small text-muted">{empty}</div>;
    return (
      <ul className="list-unstyled mb-0">
        {people.map(p => (
          <li className="d-flex align-items-center gap-2 mb-1">
            <span>
              {p.display_name ?? p.name}{" "}
              <span className="small text-muted">@{p.name}</span>
            </span>
            <span className="ms-auto">{button(p)}</span>
          </li>
        ))}
      </ul>
    );
  }

  render() {
    const { people } = this.state;
    const btn = "btn btn-sm btn-light border-light-subtle";
    return (
      <div className="card mb-3">
        <div className="card-body">
          <h2 className="h5 mb-1">Blocks</h2>
          <div className="small text-muted mb-2">
            Only you can see this. You and anyone you block can't see each
            other's posts, comments or pages.
          </div>
          <h3 className="h6">You blocked</h3>
          {this.list(
            people.filter(p => p.blocked_by_me),
            "No one.",
            p => (
              <button
                type="button"
                className={btn}
                onClick={() => this.setBlock(p, false)}
              >
                Unblock
              </button>
            ),
          )}
          <h3 className="h6 mt-3">Blocked you</h3>
          {this.list(
            people.filter(p => p.blocked_me),
            "No one.",
            p =>
              p.blocked_by_me ? (
                <span className="small text-muted">Blocked back</span>
              ) : (
                <button
                  type="button"
                  className={btn}
                  onClick={() => this.setBlock(p, true)}
                >
                  Block back
                </button>
              ),
          )}
        </div>
      </div>
    );
  }
}
