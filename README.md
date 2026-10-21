# RoomFit

Plan your hostel room, flat or house on screen before you shift. Everything is to real scale.

- **Frontend:** React + Vite (in `src/`), hosted on **Vercel**
- **Backend:** Vercel Functions (in `api/`, shared code in `server/`)
- **Database:** Postgres on **Supabase** (tables in `server/schema.sql`)

See [spec.md](spec.md) for the full feature list.

## What's in it

- **Accounts:** sign up with a unique name + password, a one-time recovery code, stay logged in on the device for good, plans synced across devices
- Homes and layouts ("Layout A", "Layout B") to compare arrangements
- Single-floor or multi-floor homes, **basements / underground parking**
- Rooms to scale in feet or meters, side by side with walls between them
- **Hall / lobby:** the whole home's size with rooms inside; the space left over is the hall (shown as e.g. `6′ × 10′ + 6′ × 2′`)
- **Room types:** room, hall, bathroom (also inside a bedroom), kitchen, balcony (railing), parking, store room
- Doors (single, double, sliding, **shutter**, opening) with swing area, and windows
- 36 furniture items incl. bathroom fittings and **vehicles** (hatchback, sedan, SUV, motorbike, scooter, bicycle) + custom items
- Drag, rotate, snap, colour, label, lock, undo/redo, duplicate
- Warnings: overlap, outside the room, in a wall, on stairs, blocking a door, tight walking space, **no space to open car doors, gate narrower than the car**, and height checks
- **Building cost** (bricks, cement, paint, tiles): brick size, mortar gap and price → bricks for walls (doors/windows taken out, shared walls counted once), inner walls, stairs and ceilings; cement bags for mortar, plaster and tile bed; paint litres from wall faces (coats, coverage, ceilings, outside); tile size and price for all rooms or per room (or no tiles). Saved per layout, editable any time
- **Plug points & switchboards** on walls; warnings when a study table, TV, fridge, AC or geyser is too far from a plug, with the extension cord length to buy
- **Floor over the stairs**: drag floor over part of the stair opening; warning when head room on the stairs under it is below 6 ft
- **Walls inside a room**: any length/angle, full, half or "from the ceiling down" (a cupboard fits under), counted in all costs
- **Will it get in?**: carries a sofa/fridge from the main door (or up the stairs) to its spot — straight, turned, on its side or flat — and shows the way or where it gets stuck
- **My things**: your own furniture kept for every home; put it all into a plan, and see which home fits it
- **Roommates**: people with colours, their own spaces, "belongs to" on furniture, warnings for things in someone else's space, and a link round-trip so a roommate adds their own things
- **Open stairs**: use the space under the stairs; things that are too tall there get a warning
- **Add things in 3D**: Add → pick → tap the floor; tap a thing to turn, raise/lower or delete it
- **Wall colours**: per room, or one wall different; inner walls too; shown in 2D and 3D
- **3D for every home**: single rooms, or all floors stacked (basements below the ground) with a floor picker, "space between floors" slider, real stairs going up through the stair opening and a floor-to-floor height per floor
- **Over the stair opening**: anything can go there (stairs above stairs, a landing, furniture); you get a yellow warning and can *Let it be*. Hanging lamps and fans never warn
- **Stacking and height from floor**: put a suitcase on top of a cupboard, boxes under an open cot. Beds and tables are *open (on legs)* or *closed* underneath, with the open space height. Things in the air get a warning; shelves and mirrors can be *fixed to the wall*. Every warning has a one-tap fix where possible and **Let it be**
- Stairs (straight, L, U) with stair openings on the floor above, measuring, 3D view
- Share link, PNG export, backup file, installable app (PWA), light/dark mode, iPhone friendly

## How the parts fit

```
Phone / laptop ──► Vercel ── website (dist/)            ← built from src/
                         └── /api/* functions (backend) ← api/ + server/
                                     │
                                     ▼
                        Supabase Postgres (database)
```

- Passwords are hashed with scrypt. The recovery code is stored only as a hash and works once.
- Each device gets its own login token in a secure, HttpOnly cookie. It renews every time the app opens, so the device stays logged in.
- Plans are saved on the device first (works offline), then synced to the account in the background. If the same plan is changed on two devices, the newest change wins.
- The tables are locked against Supabase's public API (Row Level Security on, no policies). Only the backend, which uses the database password, can read them.

## Run on your computer

You need Node.js 20 or newer.

```bash
npm install
npm run dev
```

This runs the **whole app**: website, backend and a local database (saved in the `.localdb` folder). You don't need a Supabase account for this. To try it on your phone, connect the phone to the same Wi-Fi and open the "Network" address it prints.

```bash
npm test          # unit + backend tests (uses a temporary local database)
npm run build     # type-check + production build
```

## Put it online: Supabase + Vercel

### 1. Create the database on Supabase
1. Go to **supabase.com**, sign up, and click **New project**.
2. Choose a name (e.g. `roomfit`), set a **database password** and **write it down**. A region near you (e.g. Mumbai) is best.
3. When the project is ready, click **Connect** at the top. Under **Transaction pooler**, copy the connection string. It looks like:
   `postgresql://postgres.xxxx:[YOUR-PASSWORD]@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`
4. Replace `[YOUR-PASSWORD]` with your database password.
5. Optional: open **SQL Editor**, paste everything from `server/schema.sql`, and click **Run**. The backend also creates the tables by itself on its first request.

### 2. Put the code on GitHub
Same as before: push this folder to a GitHub repository (GitHub Desktop → *Add local repository* → *Publish*, or `git push`).

### 3. Deploy on Vercel
1. On **vercel.com**: **Add New → Project**, then import the GitHub repo.
2. Before clicking Deploy, open **Environment Variables** and add:
   - Name: `DATABASE_URL`
   - Value: the connection string from step 1 (with your password)
3. Click **Deploy**. Vercel builds the website and the `api/` functions together.
4. Open your link and sign up. You're done.

If you already deployed before adding the variable, add it under **Settings → Environment Variables**, then **Deployments → ⋯ → Redeploy**.

### If something doesn't work
- **"The server had a problem"** when signing up: check that `DATABASE_URL` is set in Vercel, that the password inside it is correct, and that it's the **Transaction pooler** string (port **6543**). Then redeploy.
- In Vercel, **Logs** shows backend errors.
- In Supabase, **Table Editor** shows `rf_users`, `rf_sessions`, `rf_homes` and `rf_user_state` once someone has signed up.

## API (backend)

| Method | Path | Body | What it does |
|---|---|---|---|
| GET | `/api/auth/name?name=…` | – | Is the name free? |
| POST | `/api/auth/signup` | `{ name, password }` | Create account, log this device in, return recovery code |
| POST | `/api/auth/login` | `{ name, password }` | Log this device in |
| POST | `/api/auth/recover` | `{ name, code, newPassword }` | Log in with recovery code, set new password, return new code |
| GET | `/api/auth/me` | – | Who is logged in on this device (renews the login) |
| POST | `/api/auth/logout` | `{}` | Log this device out |
| POST | `/api/auth/recovery-code` | `{ password }` | Make a new recovery code |
| POST | `/api/account` | `{ password }` | Delete account and all plans |
| POST | `/api/sync` | `{ since, homes, templates? }` | Send changed plans, get changes from other devices |

POST requests must send the header `x-roomfit: 1`. Browsers don't let other websites add it, so it blocks cross-site form attacks. After 8 wrong passwords, a name is locked for 15 minutes.

## iPhone / iPad test checklist

Open the Vercel link in **Safari**:

- [ ] Sign up: a taken name shows the red message above the box. Password boxes appear for a free name. The eye button shows and hides the password.
- [ ] The recovery code shows once. Continue works only after ticking the box.
- [ ] Close Safari and open again: still logged in. Log in on a second device: the same plans are there.
- [ ] Log out, then "Forgot password?" with the recovery code: it logs in and gives a new code.
- [ ] Rooms → Add hall: the leftover space shows its sizes. Add a bathroom inside a room, and a balcony.
- [ ] Add a cupboard and a suitcase → warning → "Put Suitcase on top of Cupboard". Add a chair at the study table → "Let it be".
- [ ] Multi-floor home with stairs on both floors → yellow warning on the upper stairs → Let it be. Open 3D → All floors → drag Space between floors.
- [ ] More → Bricks & tiles cost: change brick price → total changes. Tiles → Own tile for one room, No tiles for another.
- [ ] Wall tool: draw a wall, set "From the ceiling down", put a cupboard under it (no warning).
- [ ] Add a door on an outside wall, select a cupboard → route button → "Yes, it gets in".
- [ ] Roommates: add two people, draw a space, mark a thing as the other person's → yellow warning.
- [ ] Plug tool: tap a wall, add a study table far away → yellow warning with a cord length.
- [ ] Upstairs: Rooms → Add floor over the stairs, drag over the top of the stairs → head room warning.
- [ ] Rooms → Add a floor or basement → basement: add a car. Make the garage door narrow: yellow warning.
- [ ] One finger drags furniture and moves the plan. Two fingers pinch. The page never scrolls or zooms by itself.
- [ ] More → 3D view turns smoothly. Save as image and Download backup open the share sheet.
- [ ] Share → Add to Home Screen. It opens full screen and still works in airplane mode (changes sync when back online).
