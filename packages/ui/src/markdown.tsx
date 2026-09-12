// SPDX-FileCopyrightText: 2026 Hari Srinivasan
// SPDX-License-Identifier: Apache-2.0

import { marked, type Token, type Tokens } from "marked";
import { Fragment, useMemo } from "react";

import { highlightLine, languageForPath } from "./syntax.ts";

function nestedTokens(token: Token): readonly Token[] {
  return "tokens" in token && Array.isArray(token.tokens) ? token.tokens : [];
}

function safeLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    if (url.protocol === "https:") return url.href;
    if (url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      return url.href;
  } catch {
    return undefined;
  }
  return undefined;
}

function Text({ value, query }: { readonly value: string; readonly query?: string | undefined }) {
  const needle = query?.trim();
  if (!needle) return value;
  const expression = new RegExp(`(${needle.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")})`, "giu");
  const normalized = needle.toLocaleLowerCase();
  return <>{value.split(expression).map((part, index) => part.toLocaleLowerCase() === normalized ? <mark key={index}>{part}</mark> : part)}</>;
}

function inline(tokens: readonly Token[], query: string | undefined, keyPrefix: string): React.ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}:${index}`;
    switch (token.type) {
      case "text": {
        const text = token as Tokens.Text;
        return <Fragment key={key}>{text.tokens === undefined ? <Text value={text.text} query={query} /> : inline(text.tokens, query, key)}</Fragment>;
      }
      case "escape":
        return <Text key={key} value={token.text} query={query} />;
      case "codespan":
        return <code key={key}>{token.text}</code>;
      case "strong":
        return <strong key={key}>{inline(nestedTokens(token), query, key)}</strong>;
      case "em":
        return <em key={key}>{inline(nestedTokens(token), query, key)}</em>;
      case "del":
        return <del key={key}>{inline(nestedTokens(token), query, key)}</del>;
      case "link": {
        const link = token as Tokens.Link;
        const href = safeLink(link.href);
        const label = inline(link.tokens, query, key);
        return href === undefined ? <Fragment key={key}>{label} ({link.href})</Fragment> : <a key={key} href={href} target="_blank" rel="noreferrer">{label}</a>;
      }
      case "image": {
        const label = token.text || "image";
        const href = safeLink(token.href);
        return <Fragment key={key}>[image: <Text value={label} query={query} />]{href === undefined ? ` (${token.href})` : <> (<a href={href} target="_blank" rel="noreferrer">source</a>)</>}</Fragment>;
      }
      case "br":
        return <br key={key} />;
      case "checkbox":
        return <input key={key} type="checkbox" checked={token.checked} readOnly aria-label={token.checked ? "Completed" : "Not completed"} />;
      case "html":
        return <Text key={key} value={token.text} query={query} />;
      default: {
        const children = nestedTokens(token);
        return <Fragment key={key}>{children.length > 0 ? inline(children, query, key) : <Text value={token.raw} query={query} />}</Fragment>;
      }
    }
  });
}

function blocks(tokens: readonly Token[], query: string | undefined, keyPrefix = "md"): React.ReactNode[] {
  const output: React.ReactNode[] = [];
  for (const [index, token] of tokens.entries()) {
    const key = `${keyPrefix}:${index}`;
    switch (token.type) {
      case "space":
      case "def":
        break;
      case "paragraph": {
        const paragraph = token as Tokens.Paragraph;
        output.push(<p key={key}>{inline(paragraph.tokens, query, key)}</p>);
        break;
      }
      case "heading": {
        const heading = token as Tokens.Heading;
        const Heading = `h${Math.min(6, Math.max(1, heading.depth))}` as keyof React.JSX.IntrinsicElements;
        output.push(<Heading key={key}>{inline(heading.tokens, query, key)}</Heading>);
        break;
      }
      case "blockquote": {
        const quote = token as Tokens.Blockquote;
        output.push(<blockquote key={key}>{blocks(quote.tokens, query, key)}</blockquote>);
        break;
      }
      case "list": {
        const list = token as Tokens.List;
        const List = list.ordered ? "ol" : "ul";
        output.push(
          <List
            key={key}
            start={list.ordered && typeof list.start === "number" ? list.start : undefined}
          >
            {list.items.map((item, itemIndex) => (
              <li key={`${key}:${itemIndex}`} className={item.task ? "task" : undefined}>
                {item.task && (
                  <input
                    type="checkbox"
                    checked={item.checked === true}
                    readOnly
                    aria-label={item.checked ? "Completed" : "Not completed"}
                  />
                )}
                {item.tokens
                  .filter((child) => child.type !== "checkbox")
                  .map((child, childIndex) =>
                    child.type === "text" ? (
                      <Fragment key={childIndex}>
                        {inline(nestedTokens(child), query, `${key}:${itemIndex}:${childIndex}`)}
                      </Fragment>
                    ) : (
                      <Fragment key={childIndex}>
                        {blocks([child], query, `${key}:${itemIndex}:${childIndex}`)}
                      </Fragment>
                    ),
                  )}
              </li>
            ))}
          </List>,
        );
        break;
      }
      case "code": {
        const code = token as Tokens.Code;
        const language = languageForPath(code.lang?.trim().split(/\s+/u)[0]);
        output.push(<pre className="code-block markdown-code" key={key}>{code.text.split("\n").map((line, lineIndex) => <span key={lineIndex} dangerouslySetInnerHTML={{ __html: highlightLine(line || " ", language) }} />)}</pre>);
        break;
      }
      case "table": {
        const table = token as Tokens.Table;
        output.push(<div className="markdown-table-scroll" key={key}><table><thead><tr>{table.header.map((cell, cellIndex) => <th className={cell.align ? `align-${cell.align}` : undefined} key={cellIndex}>{inline(cell.tokens, query, `${key}:h:${cellIndex}`)}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td className={cell.align ? `align-${cell.align}` : undefined} key={cellIndex}>{inline(cell.tokens, query, `${key}:${rowIndex}:${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>);
        break;
      }
      case "hr":
        output.push(<hr key={key} />);
        break;
      case "html":
        output.push(<p className="markdown-raw" key={key}><Text value={token.text} query={query} /></p>);
        break;
      default: {
        const children = nestedTokens(token);
        output.push(children.length > 0 ? <Fragment key={key}>{blocks(children, query, key)}</Fragment> : <p key={key}><Text value={token.raw} query={query} /></p>);
      }
    }
  }
  return output;
}

export function Markdown({ text, searchQuery }: { readonly text: string; readonly searchQuery?: string | undefined }): React.JSX.Element {
  const tokens = useMemo(() => {
    try {
      return marked.lexer(text, { gfm: true });
    } catch {
      return undefined;
    }
  }, [text]);
  return <div className="markdown">{tokens === undefined ? <p><Text value={text} query={searchQuery} /></p> : blocks(tokens, searchQuery)}</div>;
}
