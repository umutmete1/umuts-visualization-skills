# Add login to the app

## Goal
Let users sign in with email + password so their saved trades sync across devices. Guests keep working without an account.

## Phases
| Phase | What | Estimate |
|---|---|---|
| 1 | Users table, password hashing (argon2), sign-up endpoint | 2 days |
| 2 | Login endpoint, session cookies, logout | 2 days |
| 3 | Login / sign-up screens, "remember me" | 3 days |
| 4 | Move guest data into the new account on first login | 2 days |

## Login flow
User enters email + password → server checks the hash → server sets an HttpOnly session cookie → app loads the user's saved trades.

## Risks
- **Guest data migration** could duplicate trades if a user logs in on two devices at once.
- **Password reset** is not in scope yet; users who forget their password are stuck until phase 5.
- **Rate limiting** on the login endpoint is needed to stop password guessing.

## Open questions
- Do we need Google sign-in in the first version?
- How long should "remember me" last — 30 days or 90?

## Full task list
1. Create `users` table (id, email unique, password_hash, created_at).
2. Add argon2 hashing helper with tests.
3. `POST /signup` — validate email, hash password, create user.
4. `POST /login` — verify hash, create session, set cookie.
5. `POST /logout` — delete session, clear cookie.
6. Session middleware that loads the user on each request.
7. Login and sign-up screens with validation messages.
8. "Remember me" checkbox → longer cookie lifetime.
9. Guest-data migration on first login, idempotent.
10. Rate limit `/login` to 5 attempts per minute per IP.
