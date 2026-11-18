// audioprn: rich text (WYSIWYG) mode for post bodies, next to Lemmy's markdown editor.
// The box shows the body formatted; every change is turned back into markdown, so posts are
// always stored as markdown. Only what the toolbar makes (and plain pasted text) is kept;
// spoilers, tables, sub/superscript and footnotes need markdown mode.
import { Icon } from "@components/common/icon";
import { mdToHtml } from "@utils/markdown";
import { Component, createRef } from "inferno";

const BUTTONS = [
  { icon: "bold", title: "Bold", cmd: "bold" },
  { icon: "italic", title: "Italic", cmd: "italic" },
  { icon: "strikethrough", title: "Strikethrough", cmd: "strikeThrough" },
  { icon: "header", title: "Heading", cmd: "formatBlock", arg: "<h3>" },
  { text: "¶", title: "Normal text", cmd: "formatBlock", arg: "<p>" },
  {
    icon: "format_quote",
    title: "Quote",
    cmd: "formatBlock",
    arg: "<blockquote>",
  },
  { icon: "list", title: "Bulleted list", cmd: "insertUnorderedList" },
  { text: "1.", title: "Numbered list", cmd: "insertOrderedList" },
  { icon: "link", title: "Link", cmd: "createLink" },
];

// Escapes markdown characters in typed text. Square brackets are kept, for tags like [F4M], and
// underscores inside words (u/some_name, URLs), which markdown doesn't read as italics.
const escape = (text: string) =>
  text.replace(/[\\`*~]|(?<!\w)_|_(?!\w)/g, "\\$&");

/** Wraps text in a marker, keeping surrounding spaces outside: " a " -> " **a** ". */
function wrap(marker: string, text: string) {
  const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text)!;
  return m[2] ? `${m[1]}${marker}${m[2]}${marker}${m[3]}` : text;
}

/** The editor's HTML as markdown. */
function toMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return escape((node.textContent ?? "").replace(/\s+/g, " "));
  }
  if (!(node instanceof HTMLElement)) return "";
  const inner = () => [...node.childNodes].map(toMarkdown).join("");
  const block = (text: string) => `\n\n${text.trim()}\n\n`;
  switch (node.tagName) {
    case "B":
    case "STRONG":
      return wrap("**", inner());
    case "I":
    case "EM":
      return wrap("*", inner());
    case "S":
    case "STRIKE":
    case "DEL":
      return wrap("~~", inner());
    case "CODE":
      return `\`${node.textContent}\``;
    case "A": {
      const href = node.getAttribute("href") ?? "";
      return node.textContent === href ? href : `[${inner()}](${href})`;
    }
    case "BR":
      return "  \n";
    case "H1":
    case "H2":
    case "H3":
    case "H4":
    case "H5":
    case "H6":
      return block(`${"#".repeat(Number(node.tagName[1]))} ${inner().trim()}`);
    case "BLOCKQUOTE":
      return block(
        inner()
          .trim()
          .split("\n")
          .map(line => `> ${line}`)
          .join("\n"),
      );
    case "UL":
    case "OL":
      return block(
        [...node.children]
          .map(
            (li, n) =>
              (node.tagName === "OL" ? `${n + 1}. ` : "- ") +
              toMarkdown(li).trim().replace(/\n+/g, "\n   "),
          )
          .join("\n"),
      );
    case "PRE":
      return block(`\`\`\`\n${node.textContent}\n\`\`\``);
    case "P":
    case "DIV":
      return block(inner());
    default:
      return inner();
  }
}

interface Props {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
  /** Grey text shown while the box is empty. */
  placeholder?: string;
}

export class RichTextEditor extends Component<Props, object> {
  private box = createRef<HTMLDivElement>();

  componentDidMount() {
    this.box.current!.innerHTML = mdToHtml(
      this.props.initialMarkdown,
      () => {},
    ).__html;
    document.execCommand("defaultParagraphSeparator", false, "p");
    this.markEmpty(this.props.initialMarkdown);
  }

  markEmpty(md: string) {
    this.box.current!.toggleAttribute("data-empty", !md.trim());
  }

  // The box is edited by the browser; re-rendering would reset it.
  shouldComponentUpdate() {
    return false;
  }

  emit() {
    // Blank lines between blocks: drop whitespace-only lines, then at most one blank line.
    const md = toMarkdown(this.box.current!)
      .replace(/\n[ \t]+\n/g, "\n\n")
      .replace(/\n{3,}/g, "\n\n");
    this.markEmpty(md);
    this.props.onChange(md.trim());
  }

  run(cmd: string, arg?: string) {
    if (cmd === "createLink") {
      arg = window.prompt("Link address (https://…)")?.trim();
      if (!arg) return;
    }
    document.execCommand(cmd, false, arg);
    this.emit();
  }

  render() {
    return (
      <div className="rounded bg-light border">
        <div className="d-flex flex-wrap border-bottom">
          {BUTTONS.map(b => (
            <button
              type="button"
              className="btn btn-sm btn-link rounded-0 text-muted"
              title={b.title}
              aria-label={b.title}
              // Keep the text selection while clicking.
              onMouseDown={e => e.preventDefault()}
              onClick={() => this.run(b.cmd, b.arg)}
            >
              {b.icon ? <Icon icon={b.icon} classes="icon-inline" /> : b.text}
            </button>
          ))}
        </div>
        <div
          ref={this.box}
          className="form-control border-0 rounded-top-0 md-div rte-box"
          style="min-height: 8rem"
          data-placeholder={this.props.placeholder}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label="Body"
          onInput={() => this.emit()}
        />
      </div>
    );
  }
}
