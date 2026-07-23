# eTail Connect fidelity spec — exact replication of the PDF

The `/staff` console must replicate the eTail Connect meeting engine shown in the workflow PDF, not a redesign. Enterprise/Bootstrap-3 density, navy chrome, dense tables, tabbed modals.

## Global chrome (every screen)
- **Top nav bar** — dark navy. Left: product logo ("WBR CONNECT 2027 / <dates>"). Nav items with ▾: Get Started, Configure, Reports, Activities, Presentations, Meetings, Messaging, Companies, Attendees. Right: user name · Logout.
- **Workflow stepper** — 5 numbered chevron segments: `1 Event Setup` (green) → `2 Preview & Launch` (orange) → `3 Monitor Registration` (gray) → `4 Manage Meetings` (gray, ACTIVE for the engine) → `5 Post-Event Actions` (gray).

## Companies list
- "Number of Companies: N (out of N total)".
- Toolbar: "Select All, None" + "Load report ▾".
- Columns: ☐ · **Company Name · Created · Last Login · Num Logins · Receive Requests · Requests Made · Requests Received · Total Confirmed Meetings · Login · Action**.
- Row: checkbox, green **login** button, **Choose ▾** Action dropdown → menu incl. **Meeting Times** (+ Meeting Requests, Edit Company, Login as).
- Pagination [1][2] at bottom (20/page).

## Meeting Times (schedule) screen
- Header: "Switch company: [company ▾]  Next ▾".
- Sub-tabs: **Request Meeting | Received | Sent | Meeting Times** (Meeting Times active).
- **Left sidebar** collapsible sections: **Misc**, **Already Scheduled**, **Unscheduled**. Entry: `☐ Name, Company (rank/total ; confirmed)` + status badge (`Inbound` = pending, `Approved` = approved, `Deferred`).
- **Right**: "Presentation Info" + buttons `Add Note | Add Meeting | Cancel | Info`. Date tabs `Day 1 | Day 2 | …`. Table columns **Meet As | Time Slot ⓘ | Location | Meeting With**. Every row: `Schedule at …` link (Meet As), time range, location (company or `-`), meeting-with (`Company / Person`), edit ✎ + cancel ✕ icons on filled rows. "Customize" vertical tab far right.

## Edit Meeting modal
- Toolbar: Keywords · Note · Type Tag · Time · Reschedule · Add Attendee.
- **Attendees** (the counterpart). **Include Colleagues** (company + colleague checkboxes). **Meeting Time** `* [time ▾]` grouped by date. **Meeting Location** `Assigned Location [Room: company ▾]`. **Submit**.

## Cancel Meeting modal
- Attendees. **Yes/No radio toggle** (No = clear the slot but preserve the match request → returns to Unscheduled; Yes = remove the request). **Reason** selector. **Notes** textarea. **Submit**.

## Assign Meeting Location modal
- `MM/DD/YY  h:mm-h:mm`. `▸ Company: Attendee`. Location dropdown. Legend: "Asterisk (*) indicates location already being used for this time slot. Bracketed number [#] indicates total number of non-conflicting meetings for location." Submit.

## HUD hover tooltip (bank candidate)
- `Target: Name, Company` · `Interest Level: n/5` · `Source: Company` · `Ranking: n` · `Interest Level: Low/Medium/High`.
- Inline notation next to a candidate: `(rank/total ; confirmed)`.

## Palette (Bootstrap-3 enterprise)
Navy nav `#22406a`; links `#337ab7`; success/login green `#5cb85c`; warning orange `#f0ad4e`; table borders `#ddd`; header fill `#f5f5f5`; body text `#333`, small (12–13px). Stepper: green `#5cb85c`, orange `#f0ad4e`, gray `#e1e1e1`.
