# CoachHub

CoachHub is the football operating system for grassroots coaches.

Core loop: **Plan → Communicate → Availability → Train → Match → Feedback → Develop**.

## Current build
- Coach dashboard for the Caversham Falcons U10s demo team
- Persistent Prisma data model for teams, players, events, availability, feedback and messages
- API-backed dashboard rather than hard-coded squad state
- Match availability tracking with Available / Unavailable / Maybe / Awaiting states
- Development focus and recent feedback
- Squad messaging endpoint
- Seed-on-first-use demo data for local development

## Database

The project uses Prisma with SQLite by default. Set `DATABASE_URL` to a writable SQLite URL, for example:

`DATABASE_URL="file:./dev.db"`

Run migrations with `npx prisma migrate deploy` after setting the database URL. The build runs `prisma generate` automatically.

## Product direction

The next layers are coach/player/parent accounts, team management, event creation, parent-facing availability, squad selection, match reports, richer development analytics and notifications.
