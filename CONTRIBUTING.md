# Contributing

This project uses [changesets](https://github.com/changesets/changesets) to manage versions and generate changelogs.

## Making Changes

1. Fork the repository and create a new branch for your changes
2. Make your changes to the codebase
3. Add a changeset to describe your changes:

```bash
pnpm changeset
```

This will prompt you to:

- Select the type of change (patch, minor, or major)
- Write a summary of the changes (this will appear in the changelog)

4. Commit the changeset along with your changes
5. Create a pull request
