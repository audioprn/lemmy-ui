// audioprn: admins' Flairs page (/admin/flairs): the Content page's post flairs (wording, colour,
// new ones). Creators' pages have the same flairs, so every change is made there too. A flair's
// name (used in links and by the site) can't change; its display name can. Cummunity mods manage
// their own flairs in their cummunity's settings (Flairs tab).
import { CommunityTagForm } from "@components/community/community-tag-form";
import { htmlTags } from "@components/common/html-tags";
import { setIsoData, toast, WithHead } from "@utils/app";
import { amAdmin } from "@utils/roles";
import { Component } from "inferno";
import { RouterContext } from "inferno-router";
import { CommunityView, CommunityTag } from "lemmy-js-client";
import { HttpService } from "../services";

type Communities = Partial<Record<"main" | "creators", CommunityView>>;

export class FlairsAdmin extends Component<WithHead, Communities> {
  private isoData = setIsoData(this.context);
  state: Communities = {};

  componentDidMount() {
    this.load();
  }

  async load() {
    for (const name of ["main", "creators"] as const) {
      const res = await HttpService.client.getCommunity({ name });
      if (res.state === "success") {
        this.setState({ [name]: res.data.community_view });
      }
    }
  }

  /** The creators' page flair with the same name. */
  twin(tag: CommunityTag) {
    return this.state.creators?.tags.find(t => t.name === tag.name);
  }

  async done(results: { state: string }[], message: string) {
    if (results.every(r => r.state === "success")) toast(message);
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
    const { main, creators } = this.state;
    const myUserInfo = this.isoData.myUserInfo;
    return (
      <div className="container-lg">
        <h1 className="h4 mb-1">Flairs</h1>
        <p className="small text-muted mb-3">
          The post flairs on the Content page and creators' pages. Change the
          display name (the wording people see) and the colour. Cummunity
          moderators manage their own cummunity's flairs in its settings.
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
              onEdit={async form => {
                const twin = this.twin(tag);
                const results = await Promise.all([
                  HttpService.client.editCommunityTag(form),
                  ...(twin
                    ? [
                        HttpService.client.editCommunityTag({
                          ...form,
                          tag_id: twin.id,
                        }),
                      ]
                    : []),
                ]);
                await this.done(results, "Flair saved.");
              }}
              onDeleteOrRestore={async form => {
                const twin = this.twin(tag);
                const results = await Promise.all([
                  HttpService.client.deleteCommunityTag(form),
                  ...(twin
                    ? [
                        HttpService.client.deleteCommunityTag({
                          ...form,
                          tag_id: twin.id,
                        }),
                      ]
                    : []),
                ]);
                await this.done(
                  results,
                  form.delete ? "Flair deleted." : "Flair restored.",
                );
              }}
            />
          ))}
        {main && creators && (
          <>
            <h2 className="h5 mt-4">New flair</h2>
            <CommunityTagForm
              key={main.tags.length}
              communityId={main.community.id}
              createOrEditLoading={false}
              myUserInfo={myUserInfo}
              onCreate={async form => {
                const results = await Promise.all([
                  HttpService.client.createCommunityTag(form),
                  HttpService.client.createCommunityTag({
                    ...form,
                    community_id: creators.community.id,
                  }),
                ]);
                await this.done(results, "Flair created.");
              }}
            />
          </>
        )}
      </div>
    );
  }
}
