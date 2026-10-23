# singgel.github.io

Personal website of [singgel](https://github.com/singgel), also known as 阿拉斯加大闸蟹.

Live site: **https://singgel.github.io/**

Built with plain HTML, CSS, and JavaScript. No build step, external fonts, analytics, or network-hosted runtime dependencies. Chart.js 4.5.1 is bundled locally with its MIT license. Project links and biography are drawn from the public GitHub profile and repository READMEs. The crab artwork is drawn specifically for this site.

## Development

Development scripts require Python 3.9 or newer.

```sh
python3 -m http.server 8080
python3 scripts/version_assets.py
make test
make test-coverage
```

Open http://localhost:8080. Edit index.html for content, assets/style.css for presentation, and assets/app.js for theme selection and project filtering. The site remains readable with JavaScript disabled. Images and links are relative to the site root where appropriate.

## Publishing

GitHub Pages publishes the root of master. A push to master triggers a Pages build. Check the Pages build and the public URL after updates. Keep local tooling, private files, and credentials outside tracked files.

## Maintenance

Use repository links as the source of truth for project descriptions. Test filters, both themes, keyboard navigation, and a narrow mobile viewport after changes. Keep a single maintainer editing the same checkout. New project categories must be added to both the filters and the card data-category values.

Verify public repository links against the current public owner listing and an anonymous web request. A 404 means the target is unavailable to visitors; it does not establish whether a repository was deleted or made private. Remove unavailable references from both index.html and docs/profile.md until a public replacement is verified.

The homepage introduces cloud networking, backend and reliability engineering, then leads into the growth adventure and three representative public code repositories. Writing precedes the reference library and bookmark collection. Keep the source claims traceable to public READMEs and code; a learning library or direction-only README is not a released implementation or evidence of production results. Earlier examples remain available in the reference library.

The mobile header uses a second row for navigation, and the decorative crab becomes a small frame beside the introduction. Check 320px and 390px widths as well as desktop after layout changes, including long chapter labels and all primary touch controls.

## Profile content

Career history, technical interests, infrastructure repositories, and community links are consolidated in this repository. The [detailed profile](docs/profile.md) preserves the publicly published biography. Keep its career dates and repository links consistent with index.html when updating the profile. The standalone website is the public entrypoint; a separate GitHub profile README repository is no longer maintained.

Before retiring a content repository, preserve its complete Git history, migrate its unique public content and links, and verify the deployed destination before deletion. GitHub's profile README panel depends on a repository named exactly after the account; the website repository does not replace that panel.

The social-account cards display owner-provided Douyin and Xiaohongshu account numbers, with clipboard buttons and manual-copy fallback. Platform links open the official homepages until a shareable profile URL is verified; an account number must not be guessed into a profile URL. Keep the visible number, copy-button data, and docs/profile.md consistent when updating these accounts.

## AI intelligence

The [AI page](https://singgel.github.io/ai.html) uses interactive cost-versus-success scatter charts, a reset observation ring and event timeline, with Arena rankings and official news/tool releases as supporting views. See [operation and source boundaries](docs/ai-hub.md) for refresh, attribution, failure handling and rollback. Update asset fingerprints for both index.html and ai.html after changing shared assets.

## Growth adventure

The journey section replays six chapters from docs/profile.md as a small crab adventure. Its levels and skill lighting are narrative playback, not a measurement of proficiency; the current Data DCS chapter remains an ongoing exploration. The original career timeline stays open and readable without JavaScript.

The game displays the owner's favorite companies, Xueqiu and ByteDance, as personal preferences. Keep favoriteCompany chapter metadata, visible route markers and docs/profile.md aligned.

After changing a local stylesheet or script, run `python3 scripts/version_assets.py` and commit the updated index.html with the asset. The script sets each local CSS/JavaScript URL's v query to the first 12 characters of its file's SHA-256. `make test` and CI check these versions without rewriting files, and fail if a reference is missing, stale or leaves the page directory. This prevents the same URL from serving an older cached asset after its content changes; it does not prove a Pages deployment has finished. After publishing, verify the HTML references and the returned asset bytes as well as the page's interactions. Icons are outside this check.

assets/growth.js owns the chapter data, pure state transitions and one cancellable timer. A first visible visit starts one replay; pause preserves the remaining phase time, and leaving the scene, hiding the page or requesting reduced motion pauses it. Manual input takes precedence over first-view autoplay. Reduced motion uses immediate manual skill lighting. Selecting a chapter pauses playback, and restarting clears only this visit's progress. Keep the battle delay in growth.js and the animation duration in growth.css synchronized when changing pacing.

Technology badges are local assets. Ten original Devicon v2.17.0 icons retain their MIT license in assets/icons/devicon/LICENSE; assets/icons/NOTICE.md documents the source revision and the site's generic symbols. Keep branded assets unchanged and preserve their notices. Update the chapter controls, skill registry, original timeline and public profile together when adding a new chapter.

The six chapter cards use local company logos, with ByteDance reused for its two chapters. [Company asset sources](assets/companies/NOTICE.md) records the original files and display crops. Preserve the source bytes and accessible company names when updating them; these trademarks are separate from the Devicon license.

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
