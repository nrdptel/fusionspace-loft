/** The front door: bring a design in, or pick one back up.
 *
 *  The import screen itself is rendered by the shell in `layout.tsx`, which is where the design and
 *  its solver live — see the note there for why the workspaces are mounted above their routes
 *  rather than inside them. This file is the root route's identity in the static export.
 *
 *  The root's title and description are the site's own, set in `app/layout.tsx`, so nothing is
 *  overridden here: a front page that renamed itself "Import" would be the first thing a search
 *  result showed for the whole tool. */
export default function Home() {
  return null;
}
