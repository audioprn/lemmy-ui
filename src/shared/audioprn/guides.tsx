// audioprn: the Getting Started and Tagging guides, as pages on the site (/guides/<name>).
// Each guide is a markdown file in src/assets/guides, converted from its Word document with
// lemmy/audioprn/setup/guide-from-docx.ps1. It loads when the page opens (it's big, so it isn't
// part of the website code). Its ## headings make the contents list at the top.
import { htmlTags } from "@components/common/html-tags";
import { Spinner } from "@components/common/icon";
import { setIsoData, WithHead } from "@utils/app";
import { getStaticDir } from "@utils/env";
import { mdToHtml } from "@utils/markdown";
import { Component } from "inferno";
import { Link, RouteComponentProps, RouterContext } from "inferno-router";

const GUIDES: Record<string, { title: string; file?: string }> = {
  "getting-started": { title: "Getting Started Guide" },
  tagging: { title: "Tagging Guide", file: "tagging.md" },
  search: { title: "Search Guide", file: "search.md" },
};

// Same as Slug in guide-from-docx.ps1, so links in the guide match the heading ids.
const slug = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "section";

/** The guide as HTML: headings get ids, and the converter's empty links `[](#!id)` become anchors. */
function guideHtml(body: string) {
  return mdToHtml(body, () => {})
    .__html.replace(
      /<h([23])([^>]*)>(.*?)<\/h\1>/g,
      (_, level, attrs, text) =>
        `<h${level}${attrs} id="${slug(text.replace(/<[^>]+>|&[#a-z0-9]+;/g, ""))}">${text}</h${level}>`,
    )
    .replace(/<a href="#!([\w-]+)"[^>]*><\/a>/g, '<span id="$1"></span>');
}

type Props = RouteComponentProps<{ name: string }> & WithHead;
type State = { html?: string; headings?: string[] };

export class Guide extends Component<Props, State> {
  private isoData = setIsoData(this.context);
  state: State = {};

  componentDidMount() {
    this.load();
  }

  componentDidUpdate(prev: Props) {
    if (prev.match.params.name !== this.props.match.params.name) this.load();
  }

  async load() {
    const file = GUIDES[this.props.match.params.name]?.file;
    this.setState({ html: undefined, headings: undefined });
    if (!file) return;
    const res = await fetch(`${getStaticDir()}/assets/guides/${file}`);
    const body = await res.text();
    this.setState(
      {
        html: guideHtml(body),
        headings: [...body.matchAll(/^## (.+)$/gm)].map(m => m[1]),
      },
      // The page was empty when the browser looked for #anchor in the address.
      () => document.getElementById(location.hash.slice(1))?.scrollIntoView(),
    );
  }

  render() {
    const guide = GUIDES[this.props.match.params.name];
    htmlTags({
      head: this.props.head,
      title: `${guide?.title ?? "Guide"} - ${this.isoData.siteRes?.site_view.site.name ?? ""}`,
      context: this.context as RouterContext,
    });
    if (!guide) {
      return <div className="container-lg">Guide not found.</div>;
    }
    const { html, headings } = this.state;
    return (
      <div className="container-lg">
        <h1 className="h3 mb-3">{guide.title}</h1>
        {!guide.file ? (
          <p>
            <em>Coming soon.</em>
          </p>
        ) : !html ? (
          <Spinner large />
        ) : (
          <>
            {headings && headings.length > 0 && (
              <nav className="card card-body mb-4">
                <h2 className="h6">Contents</h2>
                <ul className="mb-0">
                  {headings.map(h => (
                    <li>
                      <a href={`#${slug(h)}`}>{h}</a>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
            <article
              className="md-div"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </>
        )}
      </div>
    );
  }
}

/** Links to the guides, at the bottom of the Content and My audioprn left column. */
export function GuideLinks() {
  return (
    <ul className="list-unstyled small border-top pt-2 mt-3">
      {Object.entries(GUIDES).map(([name, guide]) => (
        <li>
          <Link to={`/guides/${name}`}>{guide.title}</Link>
        </li>
      ))}
    </ul>
  );
}
