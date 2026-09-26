# Polsia Lead Scout — Validation Run Report
**Scope:** Small-scale smoke test (up to 3 leads). Research and evidence-gathering only. No business was contacted. No outreach, forms, or commitments were made on Polsia's behalf.

---

## LEAD 1: The Cleaning Authority – Chesterfield (Manchester, MO location)

### BUSINESS
- **Name:** The Cleaning Authority – Chesterfield (independently owned franchise location)
- **Location:** 45 Nationalway Shopping Center Drive, Manchester, MO 63011 (also listed at 115 Woods Mill Rd, Manchester, MO on Yelp)
- **Website:** thecleaningauthority.com/chesterfield/
- **Evidence the business is real:** Confirmed via BBB business profile listing a named owner, an "A" rating, and 24 years in business. <cite index="86-2">The business has been operating since 1/1/2001, was incorporated 10/20/2006, and is managed by owner David Woytowitz.</cite> The location and phone number are cross-confirmed on the company's own website and Nextdoor.

### PROBLEM
- **Specific operational problem:** Inconsistent scheduling and lack of a reliable system for tracking recurring appointments, crew assignments, and post-service follow-up on customer issues (e.g., damage claims).
- **Why this is a real problem rather than a generic assumption:** Multiple independent customers describe the *same* pattern over time — different crews each visit, no consistent day/time despite standing arrangements, and unresolved follow-ups on damage — which points to an operational/process gap rather than isolated bad luck.

### EVIDENCE
- **Source:** Yelp reviews for "The Cleaning Authority – Chesterfield" (Manchester, MO)
- **Relevant excerpt/finding:** <cite index="73-1,73-2">"They have scheduling problems and different teams show up each cleaning... The second clean, they broke a china bell... The third time there was another issue which (cost $$$) & they didn't even call to follow through on. It was a different team in my house each time. They showed up today after 10 days without letting me know when they were coming, and I was not even due for a cleaning."</cite> A separate reviewer described a longer-term pattern: <cite index="73-5">"We had morning for what seemed like a year and then all of a sudden we were late morning/lunch or afternoon... After repeatedly cancelling plans or being inconvenienced we decided enough was enough."</cite> Another customer reported a scheduling mix-up that led to a serious incident: <cite index="73-3">"After a scheduling issue, the company rescheduled my cleaning to a day I wasn't home... When I returned home, I found my security gate locked from the inside, requiring a locksmith to get in, and one of my indoor cats had escaped and spent the night outside."</cite>
- **Link:** https://www.yelp.com/brands/the-cleaning-authority (Chesterfield/Manchester, MO listing)

### POLSIA FIT
- **What Polsia could potentially build/automate:** A simple Airtable-based job/crew scheduling tracker synced via Make.com to send automatic day-before confirmation texts/emails to customers (crew name, arrival window), plus an automated "issue log" so damage reports or complaints are timestamped, assigned an owner, and trigger a follow-up reminder if unresolved after X days.
- **Why the proposed solution matches the observed problem:** The evidence shows the core failures are (a) inconsistent scheduling communication and (b) no tracking mechanism ensuring follow-up on reported issues — both are structured, repetitive admin tasks well suited to a lightweight Airtable + Make automation rather than a new large software purchase.
- **What Polsia cannot determine from public information:** Whether the franchise's current scheduling is done via the corporate franchisor's software (which may already offer some of this) or manually at the local office; actual crew count and daily job volume; whether the franchisee has authority/budget to adopt a local automation layer independent of corporate systems.

### IMPLEMENTATION
- **Estimated difficulty:** Low–Medium
- **Why:** The described workflow (jobs, crews, customers, recurring schedule, issue tracking) maps cleanly onto an Airtable base with Make.com automations for reminders and follow-ups. Complexity depends on whether it needs to integrate with an existing franchise scheduling system.
- **Likely systems/data involved:** Customer list with recurring schedule preferences, crew roster, job calendar, an issue/damage log; SMS or email channel for confirmations (e.g., Twilio via Make, or simple email automation).
- **Major unknowns:** Existing software stack (franchise-provided vs. ad hoc), decision-making authority of the local franchisee vs. corporate, and current call/booking volume.

### OPPORTUNITY
- **Why this could potentially be worth investigating:** The complaints are specific, recurring, and tied directly to lost repeat business (customers explicitly say they left because of scheduling problems) — a clear, quantifiable pain point.
- **What would need to be confirmed with the business before proposing anything:** Current scheduling tools/software in use, whether problems are franchise-wide policy or local execution, crew size and job volume, and who has authority to adopt new internal tools.

### CONFIDENCE
- **Evidence confidence:** High (multiple independent, detailed reviews describing a consistent, recurring pattern)
- **Polsia-fit confidence:** Medium (clear fit for scheduling/follow-up automation, but franchise software constraints are unknown)

---

## LEAD 2: Done Right Landscapes

### BUSINESS
- **Name:** Done Right Landscapes, LLC
- **Location:** 148 N Gatty Dr, St. Peters/Cottleville, MO 63376
- **Website:** donerightlandscapes.com
- **Evidence the business is real:** <cite index="121-1,121-2">Done Right Landscapes is a BBB Accredited Business with an A rating, located at 148 N Gatty Dr, Cottleville, MO 63376-5603, phone (636) 373-3902.</cite> <cite index="121-5">The company's president is Adam Callison</cite>, and its founding history is corroborated on Yellowpages: <cite index="124-3">Adam Callison started Done Right Lawn Care in 2006 and renamed it Done Right Landscapes in 2013.</cite>

### PROBLEM
- **Specific operational problem:** No reliable system for tracking outstanding punch-list items, warranty repairs, and promised follow-up visits/dates across jobs — leading to repeated dropped commitments and customers left without status updates.
- **Why this is a real problem rather than a generic assumption:** This is not a one-off customer complaint; several separate BBB complaints describe the identical failure mode (promised dates pass with no update, repeat crew visits fail to close out the same issue).

### EVIDENCE
- **Source:** BBB Complaints page for Done Right Landscapes
- **Relevant excerpt/finding:** <cite index="106-5">"I was told to wait a couple weeks to see exactly how many plants they need, but they would reach back out to schedule a day. Despite being told that they would reach back out to honor their guarantee, I have not heard back from any of them."</cite> Another complaint describes repeated incomplete fixes: <cite index="106-3">"Done Right has sent out crews three times this year to resolve the grout issues. Each time, only doing patch work resulting in them having to repeatedly come back... Patch work is not acceptable."</cite> A separate, larger complaint documents missed dates and lack of updates over months: <cite index="126-1">"They have sent crews out twice and have not been able to remove the issues. They have not sent a crew out again in months. We have been receiving the run around and have been given multiplate dates that have come and gone on when issues would be resolved and the company continues to not show up and not provide updates."</cite>
- **Link:** https://www.bbb.org/us/mo/cottleville/profile/landscape-contractors/done-right-landscapes-0734-310443827/complaints

### POLSIA FIT
- **What Polsia could potentially build/automate:** An Airtable-based punch-list/warranty tracker per job, with each open item assigned an owner and due date; Make.com automation to send the crew/office a reminder before a promised date arrives, and to auto-notify the customer with a status update if a date is about to pass without closure — preventing the "date comes and goes silently" pattern seen repeatedly in complaints.
- **Why the proposed solution matches the observed problem:** The complaints consistently point to a communication and tracking gap (promises made, not systematically tracked or escalated) rather than a quality-of-work issue alone — this is a structured admin workflow Polsia's toolset (Airtable + Make) directly addresses.
- **What Polsia cannot determine from public information:** Current internal tools (if any) used for job/warranty tracking, team size, and how many active jobs are typically open at once.

### IMPLEMENTATION
- **Estimated difficulty:** Medium
- **Why:** Punch-list tracking across in-progress construction/landscape jobs is more variable (photos, site conditions, subcontractors) than simple appointment scheduling, but the core tracker-plus-reminder pattern is still standard Airtable/Make territory.
- **Likely systems/data involved:** Job/project records, punch-list items with due dates and owners, customer contact info, possibly photo attachments for documentation; SMS/email automation for status updates.
- **Major unknowns:** Whether the business already uses a CRM or project-management tool that a lightweight system would need to complement or replace; team size and how follow-ups are currently (if at all) tracked internally.

### OPPORTUNITY
- **Why this could potentially be worth investigating:** Multiple BBB complaints describe near-identical failure patterns over an extended period, suggesting a systemic (not one-off) internal process gap that is actively costing the company reputation and repeat/referral business.
- **What would need to be confirmed with the business before proposing anything:** How punch-list and warranty items are currently tracked (spreadsheet, paper, memory), team size, and whether the owner sees this as a priority versus a crew-capacity/staffing issue.

### CONFIDENCE
- **Evidence confidence:** High (multiple, detailed, dated BBB complaints with consistent pattern and business responses acknowledging delays)
- **Polsia-fit confidence:** Medium (strong fit for tracking/reminders; work-quality issues are outside Polsia's scope and evidence mixes both)

---

## LEAD 3: Any Garment Cleaners (East Brunswick, NJ)

### BUSINESS
- **Name:** Any Garment Cleaners 1.99
- **Location:** 395B Rt 18 South, East Brunswick, NJ 08816
- **Website:** anygarmentcleaner.com
- **Evidence the business is real:** <cite index="168-1,168-2">Any Garment Cleaners 1.99 is listed at 395B Rt 18 South, East Brunswick, NJ 08816, with a BBB file opened 11/5/2013.</cite> This is corroborated by its Yelp listing at the same address and phone (732) 387-8371, and its own website and Facebook page describe it as <cite index="173-1,173-2">"your local family owned community dry cleaner store, with quality and reliable service."</cite>

### PROBLEM
- **Specific operational problem:** No reliable way to track which garment belongs to which customer once it leaves the counter, resulting in items being handed to the wrong customer and becoming untraceable/lost.
- **Why this is a real problem rather than a generic assumption:** This is a first-hand, dated, detailed account of a specific garment being misidentified, handed to the wrong customer, and then becoming permanently unrecoverable — a direct description of a tracking failure, not a vague dissatisfaction.

### EVIDENCE
- **Source:** BBB Complaints page for Any Garment Cleaners 1.99
- **Relevant excerpt/finding:** <cite index="158-1">"One of my jackets was clearly missing. After I repeatedly refused to take the wrong item, it took him 20 minutes to look for mine and he was unable to find it. He told me he would call me Monday. Monday came and I received no call. When I followed up, a staff member informed me they had given my jacket to another customer and were unable to track down who had it or how to contact them."</cite> A second, separate complaint on the same profile describes a related breakdown in the pickup process: <cite index="158-2">"As noted, I have been to this dry cleaners a couple times and in all cases, the garment was available on the date the printed ticket/receipt indicated. It is not my fault that a newly trained employee would not inform me of the potential delay in getting the garment back... my coat was not even on the premises to give it back to me immediately."</cite>
- **Link:** https://www.bbb.org/us/nj/east-brunswick/profile/dry-cleaners/any-garment-cleaners-199-0221-90161969/complaints

### POLSIA FIT
- **What Polsia could potentially build/automate:** A simple digital claim-ticket/garment-tracking system (e.g., Airtable with a scannable ticket ID or barcode, or a structured intake form) replacing manual paper-ticket matching, so each garment is logged against a customer record with pickup status, reducing the chance of items being handed to the wrong person. Automated SMS/email notification via Make.com when an order is ready, reducing miscommunication about pickup timing.
- **Why the proposed solution matches the observed problem:** The evidence shows the failure occurs specifically at the "match garment to customer" and "notify customer of status" steps — both are manual, repetitive, error-prone processes that a lightweight tracking/notification system is designed to fix.
- **What Polsia cannot determine from public information:** Current in-store process for tagging and organizing garments (e.g., whether they use any POS/tagging software already), order volume per day, and staff turnover/training practices that may be contributing to errors.

### IMPLEMENTATION
- **Estimated difficulty:** Low–Medium
- **Why:** A pickup/tracking log with automated ready-for-pickup notifications is a well-scoped Airtable + Make project; the main complexity is physical tagging/barcode integration if the shop wants to move beyond a purely digital log to physical scan verification.
- **Likely systems/data involved:** Customer contact info, garment/order log with unique ticket IDs, order status field, notification automation (SMS/email); optionally barcode/QR labels for physical tags.
- **Major unknowns:** Whether the shop already uses any point-of-sale or tagging system, order volume, and staff processes for tagging items at intake.

### OPPORTUNITY
- **Why this could potentially be worth investigating:** Lost/misdelivered garments are a direct, tangible financial and reputational cost (reimbursement disputes, BBB complaints, customer churn) for a small, single-location, family-owned business — a clear pain point that a modest tracking fix could measurably reduce.
- **What would need to be confirmed with the business before proposing anything:** Current intake/tagging process, daily order volume, whether staff turnover is a contributing factor, and owner's appetite for a low-cost digital tracking layer.

### CONFIDENCE
- **Evidence confidence:** Medium–High (a detailed, dated first-hand account plus a second corroborating complaint on the same profile describing related process breakdowns)
- **Polsia-fit confidence:** High (garment tracking and pickup notifications are a clean match for Airtable/Make-based small business automation)

---

## SUMMARY

| Lead | Problem Category | Evidence Confidence | Polsia-Fit Confidence |
|---|---|---|---|
| The Cleaning Authority – Chesterfield | Scheduling/communication/follow-up tracking | High | Medium |
| Done Right Landscapes | Punch-list/warranty follow-up tracking | High | Medium |
| Any Garment Cleaners | Order/garment tracking & pickup notification | Medium–High | High |

All three leads are verified real, operating small businesses with specific, dated, first-hand public evidence of an operational problem plausibly addressable with Polsia's demonstrated toolset (Airtable, Make, automated notifications). No business was contacted as part of this research. Before any proposal is made, each business's current tools, decision-maker, and appetite for a lightweight automation solution would need to be confirmed directly.
