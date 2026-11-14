// audioprn: admins' Awards page (/admin/awards): how many awards people get, and the award types
// (rename, hide, or make a new one from an uploaded picture).
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, toast, WithHead } from "@utils/app";
import { amAdmin } from "@utils/roles";
import { Component } from "inferno";
import { RouterContext } from "inferno-router";
import { call } from "./creator-api";
import { AwardIcon, AwardType, loadAwardTypes } from "./post-reactions";

export interface AwardSettings {
  start_awards: number;
  every_days: number;
  window_days: number;
  min_comments: number;
  min_reactions: number;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The rules in words, e.g. for the "Awards to give" hint. */
export function awardRulesText(s: AwardSettings): string {
  const active = [
    s.min_comments > 0 && plural(s.min_comments, "comment"),
    s.min_reactions > 0 && `reactions to ${plural(s.min_reactions, "post")}`,
  ].filter(Boolean);
  const more = active.length
    ? `Active people (${active.join(" or ")} in the past ${plural(s.window_days, "day")}) get one more every ${plural(s.every_days, "day")}.`
    : `Everyone gets one more every ${plural(s.every_days, "day")}.`;
  return `Everyone starts with ${plural(s.start_awards, "award")}. ${more} Awards never expire.`;
}

const SETTINGS: { key: keyof AwardSettings; label: string; min: number }[] = [
  { key: "start_awards", label: "Awards new users start with", min: 0 },
  { key: "every_days", label: "One more award every (days)", min: 1 },
  { key: "window_days", label: "Active means, in the past (days)", min: 1 },
  { key: "min_comments", label: "…this many comments (0 = off)", min: 0 },
  {
    key: "min_reactions",
    label: "…or reactions to this many posts (0 = off)",
    min: 0,
  },
];

/** Uploaded pictures: up to 100 KB, stored with the award. */
const MAX_IMAGE_BYTES = 100_000;

interface State {
  settings?: AwardSettings;
  types: AwardType[];
  newName: string;
  newImage?: string;
}

export class AwardsAdmin extends Component<WithHead, State> {
  private isoData = setIsoData(this.context);
  state: State = { types: [], newName: "" };

  async componentDidMount() {
    const [settings, res] = await Promise.all([
      call<AwardSettings>("GET", "/award_settings"),
      call<{ award_types: AwardType[] }>("GET", "/award_types"),
    ]);
    this.setState({ settings, types: res.award_types });
  }

  async saveSettings(event: Event) {
    event.preventDefault();
    try {
      const settings = await call<AwardSettings>(
        "PUT",
        "/award_settings",
        this.state.settings,
      );
      this.setState({ settings });
      toast("Saved.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  async saveType(type: AwardType) {
    try {
      const saved = await call<AwardType>("PUT", "/award_type", {
        kind: type.kind,
        name: type.name,
        hidden: type.hidden,
      });
      this.setState({
        types: this.state.types.map(t => (t.kind === saved.kind ? saved : t)),
      });
      loadAwardTypes(true);
      toast("Saved.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  editType(kind: string, change: Partial<AwardType>) {
    this.setState({
      types: this.state.types.map(t =>
        t.kind === kind ? { ...t, ...change } : t,
      ),
    });
  }

  pickImage(file?: File) {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast("Pick a picture of 100 KB or less.", "danger");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => this.setState({ newImage: reader.result as string });
    reader.readAsDataURL(file);
  }

  async create(event: Event) {
    event.preventDefault();
    try {
      const created = await call<AwardType>("POST", "/award_type", {
        name: this.state.newName,
        image: this.state.newImage,
      });
      this.setState({
        types: [...this.state.types, created],
        newName: "",
        newImage: undefined,
      });
      loadAwardTypes(true);
      toast("Award created.");
    } catch (e) {
      toast((e as Error).message, "danger");
    }
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: `Awards - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    if (!amAdmin(this.isoData.myUserInfo)) {
      return <div className="container-lg">Only admins can see this page.</div>;
    }
    const { settings, types, newName, newImage } = this.state;
    return (
      <div className="container-lg" style="max-width: 48rem">
        <h1 className="h4 mb-3">Awards</h1>
        <h2 className="h5">How many awards people get</h2>
        {settings && (
          <form className="mb-4" onSubmit={e => this.saveSettings(e)}>
            {SETTINGS.map(({ key, label, min }) => (
              <div className="row mb-2 align-items-center">
                <label className="col-8 col-form-label" htmlFor={key}>
                  {label}
                </label>
                <div className="col-4">
                  <input
                    id={key}
                    type="number"
                    className="form-control"
                    min={min}
                    max={key.endsWith("days") ? 365 : 1000}
                    value={settings[key]}
                    onInput={e =>
                      this.setState({
                        settings: {
                          ...settings,
                          [key]: Number(e.target.value),
                        },
                      })
                    }
                  />
                </div>
              </div>
            ))}
            <p className="small text-muted">{awardRulesText(settings)}</p>
            <button type="submit" className="btn btn-primary">
              Save
            </button>
          </form>
        )}
        <h2 className="h5">Award types</h2>
        <p className="small text-muted">
          Hidden awards can't be given any more; ones already given still show.
        </p>
        {types.map(t => (
          <div className="d-flex align-items-center gap-2 mb-2">
            <span className="fs-4" style="width: 2.5rem">
              <AwardIcon type={t} />
            </span>
            <input
              className="form-control"
              aria-label="Award name"
              maxLength={40}
              value={t.name}
              onInput={e => this.editType(t.kind, { name: e.target.value })}
            />
            <div className="form-check text-nowrap">
              <input
                className="form-check-input"
                type="checkbox"
                id={`hidden-${t.kind}`}
                checked={t.hidden}
                onChange={() => this.editType(t.kind, { hidden: !t.hidden })}
              />
              <label className="form-check-label" htmlFor={`hidden-${t.kind}`}>
                Hidden
              </label>
            </div>
            <button
              type="button"
              className="btn btn-light border-light-subtle"
              onClick={() => this.saveType(t)}
            >
              Save
            </button>
          </div>
        ))}
        <h2 className="h5 mt-4">New award</h2>
        <form onSubmit={e => this.create(e)}>
          <input
            className="form-control mb-2"
            placeholder="Name"
            aria-label="New award name"
            maxLength={40}
            value={newName}
            onInput={e => this.setState({ newName: e.target.value })}
          />
          <label className="form-label small" htmlFor="award-image">
            Picture (PNG, JPEG, GIF or WebP, up to 100 KB; shown about as big as
            an emoji)
          </label>
          <input
            id="award-image"
            type="file"
            className="form-control mb-2"
            accept="image/png,image/jpeg,image/gif,image/webp"
            onChange={e => this.pickImage(e.target.files?.[0])}
          />
          {newImage && (
            <p>
              Preview:{" "}
              <span className="badge text-bg-light border fw-normal fs-6">
                <img
                  src={newImage}
                  alt=""
                  style="height: 1.2em; width: auto; vertical-align: -0.2em"
                />{" "}
                1
              </span>
            </p>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!newName.trim() || !newImage}
          >
            Create award
          </button>
        </form>
      </div>
    );
  }
}
