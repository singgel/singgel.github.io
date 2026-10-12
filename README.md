# singgel.github.io

Personal website of [singgel](https://github.com/singgel), also known as 阿拉斯加大闸蟹.

Live site: **https://singgel.github.io/**

Built with plain HTML, CSS, and JavaScript. No build step, external fonts, analytics, or runtime dependencies. Project links and biography are drawn from the public GitHub profile and repository READMEs. The crab artwork is drawn specifically for this site.

## Development

```sh
python3 -m http.server 8080
make test
make test-coverage
```

Open http://localhost:8080. Edit index.html for content, assets/style.css for presentation, and assets/app.js for theme selection and project filtering. The site remains readable with JavaScript disabled. Images and links are relative to the site root where appropriate.

## Publishing

GitHub Pages publishes the root of master. A push to master triggers a Pages build. Check the Pages build and the public URL after updates. Keep local tooling, private files, and credentials outside tracked files.

## Maintenance

Use repository links as the source of truth for project descriptions. Test filters, both themes, keyboard navigation, and a narrow mobile viewport after changes. Keep a single maintainer editing the same checkout. New project categories must be added to both the filters and the card data-category values.

## Profile content

Career history, technical interests, infrastructure repositories, and community links are consolidated in this repository. The [detailed profile](docs/profile.md) preserves the publicly published biography. Keep its career dates and repository links consistent with index.html when updating the profile. The standalone website is the public entrypoint; a separate GitHub profile README repository is no longer maintained.

Before retiring a content repository, preserve its complete Git history, migrate its unique public content and links, and verify the deployed destination before deletion. GitHub's profile README panel depends on a repository named exactly after the account; the website repository does not replace that panel.

The social-account cards display owner-provided Douyin and Xiaohongshu account numbers, with clipboard buttons and manual-copy fallback. Platform links open the official homepages until a shareable profile URL is verified; an account number must not be guessed into a profile URL. Keep the visible number, copy-button data, and docs/profile.md consistent when updating these accounts.

## Growth adventure

The journey section replays six chapters from docs/profile.md as a small crab adventure. Its levels and skill lighting are narrative playback, not a measurement of proficiency; the current Data DCS chapter remains an ongoing exploration. The original career timeline stays open and readable without JavaScript.

assets/growth.js owns the chapter data, pure state transitions and one cancellable timer. A first visible visit starts one replay; pause preserves the remaining phase time, and leaving the scene, hiding the page or requesting reduced motion pauses it. Manual input takes precedence over first-view autoplay. Reduced motion uses immediate manual skill lighting. Selecting a chapter pauses playback, and restarting clears only this visit's progress. Keep the battle delay in growth.js and the animation duration in growth.css synchronized when changing pacing.

Technology badges are local assets. Ten original Devicon v2.17.0 icons retain their MIT license in assets/icons/devicon/LICENSE; assets/icons/NOTICE.md documents the source revision and the site's generic symbols. Keep branded assets unchanged and preserve their notices. Update the chapter controls, skill registry, original timeline and public profile together when adding a new chapter.

## Bookmark collection

Direct bookmark-bar shortcuts are excluded from imports. Bookmark-bar folders are promoted into the public collection without a separate 收藏栏 group.

The homepage's collection preserves Chrome folder hierarchy and duplicate entries. Native folder controls work without JavaScript; assets/bookmarks.js adds title, folder, and URL search. data/bookmarks.json contains only the published names, URLs, and folder tree. The importer renders that same tree into index.html, so visitors need no data request.

For a future import, first verify GitHub repository targets are public and prepare a local JSON proof array with requested and status fields. Then run the importer with explicit paths:

```sh
python3 scripts/import_bookmarks.py /absolute/Chrome/Bookmarks \
  --catalog data/bookmarks.json --page index.html \
  --github-proof /absolute/local/github-public-targets.json \
  --report /absolute/local/import-report.json
make test
make test-coverage
```

The importer excludes the complete 雪球, 京东, and 字节 folder subtrees. It keeps local files, literal IP addresses, internal hosts, credentials, unverified GitHub repository links, and personal analysis results out of the public tree. Only specifically recognized nonessential article or translation parameters are removed; other suspicious URLs are held for local review. Original Chrome files are never modified. Keep source snapshots, reports, visibility proofs, and withheld links outside this public repository and out of assistant review packets. Recheck the import counts, source hash, desktop/mobile layout, search, and deployed HTML before calling an import complete. Old bookmark availability is separate from successful migration.
