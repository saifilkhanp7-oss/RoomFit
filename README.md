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
