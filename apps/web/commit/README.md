# Commit

The Barrels Grenada engineering blog at `commit.barrels.gd`: a weekly post on how
the platform was built (release notes ship with every release). See `AGENTS.md` for content and code rules.

```bash
pnpm dev:web:commit  # http://localhost:3019
pnpm --filter @barrelsgd/web-commit test
pnpm --filter @barrelsgd/web-commit build  # static site in out/
```

Add a post as `content/posts/v<major>-<minor>-<patch>.mdx`.
