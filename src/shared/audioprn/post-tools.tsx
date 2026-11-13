// audioprn: Save and Share buttons under each post. Saved posts are on My audioprn (/my/saved).
// Share: copy the link, or share to Bluesky or X. Discord has no share link, so "Discord" copies
// a ready-to-paste message.
import { setIsoData, toast } from "@utils/app";
import { Component } from "inferno";
import { PostView } from "lemmy-js-client";
import { HttpService } from "../services";

const buttonClass = "btn btn-sm py-0 px-2 btn-light border-light-subtle";

async function copy(text: string, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    toast("Couldn't copy. Copy the link from the address bar.", "danger");
  }
}

export class PostTools extends Component<
  { postView: PostView },
  { saved: boolean }
> {
  private isoData = setIsoData(this.context);
  state = { saved: !!this.props.postView.post_actions?.saved_at };

  async toggleSave() {
    const res = await HttpService.client.savePost({
      post_id: this.props.postView.post.id,
      save: !this.state.saved,
    });
    if (res.state === "success") {
      this.setState({ saved: !!res.data.post_view.post_actions?.saved_at });
    } else {
      toast("Couldn't save the post.", "danger");
    }
  }

  render() {
    const { post } = this.props.postView;
    const loggedIn = !!this.isoData.myUserInfo;
    // Only used on click, in the browser.
    const url = () => `${location.origin}/post/${post.id}`;
    const share = (label: string, href: () => string) => (
      <button
        type="button"
        className="dropdown-item"
        onClick={() => window.open(href(), "_blank", "noopener")}
      >
        {label}
      </button>
    );
    return (
      <div className="d-flex gap-1">
        <button
          type="button"
          className={buttonClass}
          disabled={!loggedIn}
          title={loggedIn ? undefined : "Log in to save posts"}
          aria-pressed={this.state.saved}
          onClick={() => this.toggleSave()}
        >
          🔖 {this.state.saved ? "Saved" : "Save"}
        </button>
        <details className="position-relative">
          <summary className={buttonClass}>↗ Share</summary>
          <div
            className="position-absolute bg-body border rounded shadow py-1"
            style="z-index: 10; min-width: 12rem"
          >
            <button
              type="button"
              className="dropdown-item"
              onClick={() => copy(url(), "Link copied.")}
            >
              Copy link
            </button>
            {share(
              "Bluesky",
              () =>
                `https://bsky.app/intent/compose?text=${encodeURIComponent(`${post.name} ${url()}`)}`,
            )}
            {share(
              "X",
              () =>
                `https://x.com/intent/post?text=${encodeURIComponent(post.name)}&url=${encodeURIComponent(url())}`,
            )}
            <button
              type="button"
              className="dropdown-item"
              onClick={() =>
                copy(
                  `**${post.name}**\n${url()}`,
                  "Copied. Paste it into a Discord chat.",
                )
              }
            >
              Discord (copy message)
            </button>
          </div>
        </details>
      </div>
    );
  }
}
