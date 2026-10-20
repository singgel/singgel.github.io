# AI intelligence page

[ai.html](https://singgel.github.io/ai.html) combines three independent views: Arena model rankings, public Codex reset clues, and official news/tool releases. It uses public source data, not a model-generated ranking or a copy of another aggregator.

## Sources and meaning

- Rankings: [Arena's official dataset](https://huggingface.co/datasets/lmarena-ai/leaderboard-dataset), licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Text/vision use the style-controlled configurations; web development has its own configuration. Show source ranks 1–20, rating intervals, votes and publication dates. Scores across configurations are not comparable. The collector requires complete ranks 1–20 from one publication date; upstream schema changes fail closed.
- News: official OpenAI, Google AI and DeepMind RSS; Codex, Kimi Code and Claude Code release Atom feeds. Only titles, URLs and dates are republished. Tool releases may be prereleases. Source content and release decisions remain with their publishers.
- Resets: the public [Tibo timeline](https://x.com/thsottiaux). The collector reads top-level recent posts, verifies the author, and marks reset-keyword matches as unconfirmed clues. It never interprets a keyword as an account balance change, predicts an unannounced reset, or publishes private usage. The current public HTML format is unsupported and may change; successful parsing still provides only partial coverage.
- AIHOT links are reference entrypoints. Its continuously collected rankings, summaries and reset database are not mirrored.

## Refresh and publication

```sh
python3 scripts/update_ai_hub.py
python3 scripts/version_assets.py
python3 scripts/version_assets.py --page ai.html
make test
make test-coverage
```

The collector uses only the Python standard library. Each source has checked_at, last_success_at and its own status. A source failure retains that source's last good data as stale; an unreadable timeline is never treated as no announcement. Inputs and gzip expansion are bounded. Partial failure does not erase successful sources; an entirely unsuccessful run exits nonzero. Output is replaced atomically.

The Refresh AI data workflow is scheduled at minute 23 of each UTC hour and supports manual dispatch. GitHub scheduling may be delayed. A single concurrency group queues refreshes without cancelling healthy work. The workflow reads the previous checkpoint (or seeds from the bundled snapshot on its first run) and publishes only data/ai.json on the dedicated data/ai branch, using the repository's GITHUB_TOKEN; no personal token is required.

The browser reads that branch's public raw JSON and falls back to the bundled data/ai.json. Consequently data refreshes do not depend on GITHUB_TOKEN commits triggering Pages, and do not add hourly commits to master. A snapshot older than three hours is labelled overdue; source publication dates remain separate. Browser refresh is a data read, not a request to rerun collection.

To investigate a failure, inspect the workflow run, per-source statuses and the last success time. Do not reset a success timestamp merely because a request was attempted. Check an original source when its structure changes; add a fixture before changing the parser. Never add cookies, private usage, API keys or raw authentication responses to this public branch.

To pause collection, disable the Refresh AI data workflow; the page continues to show a timestamped snapshot. To roll back the feature, revert its source PR and retain the data branch until any readers have migrated. Removing the page does not require changing account permissions or deleting source data.

## Validation boundaries

Unit tests use synthetic feeds, timeline HTML and leaderboard responses, including source failures and quoted/foreign posts. Browser checks cover filters, both themes and narrow screens. Deployment validation must separately confirm Pages, the published HTML/assets and a real manually dispatched refresh, then read its exact data-branch commit back.

No Kimi API credential is needed for these three public-data views. A visitor chat powered by Kimi API is a separate capability; it is not enabled by this page or by the local coding-membership login.
