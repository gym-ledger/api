# Contributing

Thanks for helping out. This project is split across three repositories:
[`gym-ledger/api`](https://github.com/gym-ledger/api) (Express + Postgres API),
[`gym-ledger/web`](https://github.com/gym-ledger/web) (user web app / PWA) and
[`gym-ledger/admin`](https://github.com/gym-ledger/admin) (admin panel).

## Before you start

- **Small fixes** (typos, an obvious bug, a missing check): open a pull request directly.
- **Features or bigger changes**: open an issue first and describe what you want to change and why,
  so we can agree on the approach before you spend time on it.
- **Security problems**: don't open an issue. See [SECURITY.md](./SECURITY.md).

## Running it locally

The quickest way to run everything (Postgres, Redis, the API and both front-ends) is the stack in the
API repository. Clone all three repositories side by side, then follow
[Run the whole stack](https://github.com/gym-ledger/api#run-the-whole-stack).

To work on this repository alone:

```bash
npm install
cp .env.development.example .env   # then fill in the values
npm run migrate
npm run dev
```

## Making a change

1. Fork the repository and create a branch from `main`.
2. Keep the change focused: one fix or feature per pull request.
3. Match the code around you: naming, file layout and comment style.
4. Never commit secrets or real `.env` files. Add new settings to the `.env*.example` file instead.
5. Make sure these pass:

   ```bash
   npm run typecheck
   npm run lint
   npm run build
   ```

6. Describe what changed and how you tested it in the pull request. Add screenshots for UI changes.

## Commit messages

Use the short Conventional Commits style the history already follows:

```
feat(workout): rest timer vibrates when done
fix(auth): expired tokens return 401 instead of 500
```

`feat` for new behaviour, `fix` for something broken, with an optional scope naming the area.
Add a `!` and a `BREAKING CHANGE:` line in the body when an API response or schema changes shape.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
