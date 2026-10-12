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
