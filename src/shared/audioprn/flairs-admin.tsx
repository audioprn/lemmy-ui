// audioprn: admins' Flairs page (/admin/flairs): the Content page's post flairs (wording, colour,
// new ones). Creator page posts have no flairs (user, 2026-11-18). A flair's name (used in links
// and by the site) can't change; its display name can. Cummunity mods manage their own flairs in
// their cummunity's settings (Flairs tab).
import { CommunityTagForm } from "@components/community/community-tag-form";
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, toast, WithHead } from "@utils/app";
import { amAdmin } from "@utils/roles";
import { Component } from "inferno";
import { RouterContext } from "inferno-router";
import { CommunityView } from "lemmy-js-client";
import { HttpService } from "../services";

export class FlairsAdmin extends Component<WithHead, { main?: CommunityView }> {
  private isoData = setIsoData(this.context);
  state: { main?: CommunityView } = {};

  componentDidMount() {
    void this.load();
  }

  async load() {
    const res = await HttpService.client.getCommunity({ name: "main" });
    if (res.state === "success") {
      this.setState({ main: res.data.community_view });
    }
  }

  async done(result: { state: string }, message: string) {
    if (result.state === "success") toast(message);
    else toast("That didn't work, try again.", "danger");
    await this.load();
  }

  render() {
    htmlTags({
      head: this.props.head,
      title: `Flairs - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    if (!amAdmin(this.isoData.myUserInfo)) {
      return <div className="container-lg">Only admins can see this page.</div>;
    }
    const { main } = this.state;
    const myUserInfo = this.isoData.myUserInfo;
    return (
      <div className="container-lg">
        <h1 className="h4 mb-1">Flairs</h1>
        <p className="small text-muted mb-3">
          The post flairs on the Content page. Change the display name (the
          wording people see) and the colour. Cummunity moderators manage their
          own cummunity's flairs in its settings.
        </p>
        {/* Deleted flairs last (they can be restored). */}
        {[...(main?.tags ?? [])]
          .sort((a, b) => Number(a.deleted) - Number(b.deleted))
          .map(tag => (
            <CommunityTagForm
              key={`${tag.id}-${tag.display_name}-${tag.color}-${tag.deleted}`}
              tag={tag}
              createOrEditLoading={false}
              myUserInfo={myUserInfo}
              onEdit={async form =>
                this.done(
                  await HttpService.client.editCommunityTag(form),
                  "Flair saved.",
                )
              }
              onDeleteOrRestore={async form =>
                this.done(
                  await HttpService.client.deleteCommunityTag(form),
                  form.delete ? "Flair deleted." : "Flair restored.",
                )
              }
            />
          ))}
        {main && (
          <>
            <h2 className="h5 mt-4">New flair</h2>
            <CommunityTagForm
              key={main.tags.length}
              communityId={main.community.id}
              createOrEditLoading={false}
              myUserInfo={myUserInfo}
              onCreate={async form =>
                this.done(
                  await HttpService.client.createCommunityTag(form),
                  "Flair created.",
                )
              }
            />
          </>
        )}
      </div>
    );
  }
}
