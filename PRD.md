# FD ABRANTE3 SPOT 2 – Daily Stock Keeper
**Product Requirements Document (PRD)** · Version 1.0 · Status: Draft

---

## 1. Overview

**FD ABRANTE3 SPOT 2** is a store that needs a **simple, fast way to record and keep its stock every day**. This product is a small stock-keeping app that gives the store one stock sheet per day, shows the opening stock, purchases, balance and value of every item, and adds everything up into a **total stock amount for the day**.

The guiding principle is **simplicity**: a shop attendant should be able to open the app, see today's sheet, type in the numbers, and be done.

---

## 2. Goals and Non-Goals

### Goals
* Record stock for every item, every day, in one clear table following the spot bookkeeping system.
* Show Opening Stock, Receipt, Total stock available, Stock Balance, Stock Sold, Price, and Amount divided into GH₵ and GHp.
* Start every day on a **new, blank page**.
* Provide a **Carry Forward** button that copies all of today's stock balances into the next day's opening stock.
* Provide an **All Days** view that lets the owner slide through every day's stock, from day one onward, on one continuous page.
* Automatically calculate the **daily total sales amount** for each day.

### Non-Goals (Version 1)
* No customer management, invoicing or point-of-sale receipts.
* No multi-branch or multi-store support.
* No supplier accounting or tax handling.
* No barcode scanning.

---

## 3. Users

| User | Description | Main Needs |
| :--- | :--- | :--- |
| **Owner / Manager** | Owns FD ABRANTE3 SPOT 2 | See daily totals, review past days, trust the numbers |
| **Store Attendant** | Records the stock day to day | Fast entry, no complicated screens |

*Version 1 can run with a single login (or no login on a private device). Separate roles can be added later.*

---

## 4. Core Concepts

* **Item:** A product the store keeps in stock (e.g. Club Beer, Guinness, Sugar, Soap).
* **Daily Sheet:** One page per calendar day containing one row per item.
* **Opening Stock:** The quantity of an item at the start of the day.
* **Receipt:** Quantity bought or added to stock during the day.
* **Total:** Total stock available to sell (`Opening Stock + Receipt`).
* **Stock Balance:** Physical stock quantity left at closing.
* **Stock Sold:** Quantity sold during the day (`Total − Stock Balance`).
* **Price:** Selling/unit price in Ghana Cedis.
* **Amount:** Sales value of the item (`Stock Sold × Price`), divided into **GH₵** and **GHp**.
* **Daily Total:** The sum of all item sales amounts for that day's sheet.

---

## 5. Functional Requirements

### 5.1 Daily Stock Sheet
Each day has its own sheet, shown as a table with these columns:

| Column | Type | Entered or Calculated | Notes |
| :--- | :--- | :--- | :--- |
| **No.** | Number | Auto | Row number |
| **Item Name** | Text | Entered | Required |
| **Opening Stock** | Number | Entered, or filled by Carry Forward | Quantity at start of day |
| **Receipt** | Number | Entered | Stock added/received today, defaults to 0 |
| **Total** | Number | **Calculated** | `Opening Stock + Receipt` (total stock available) |
| **Stock Balance** | Number | Entered | Physical count left at close |
| **Stock Sold** | Number | **Calculated** | `Total − Stock Balance` (or entered to auto-calc balance) |
| **Price** | Money | Entered | Unit price in GH₵ |
| **Amount (GH₵ \| GHp)** | Money | **Calculated** | `Stock Sold × Price`, divided equally into Cedis & Pesewas |

#### Requirements
* **FR-1:** The user can add, edit and delete items (item names are listed down the first column, one per row, and stay fixed on screen when scrolling sideways) on the day's sheet.
* **FR-2:** Total available, Stock Sold, and Amount (GH₵ / GHp) update instantly as the user types.
* **FR-3:** Quantities must be zero or more. Price must be zero or more. Invalid entries are rejected with a clear message.
* **FR-4:** The sheet header shows the store name **FD ABRANTE3 SPOT 2** and the date of the sheet.
* **FR-5:** Changes are saved automatically so nothing is lost if the app is closed.

### 5.2 Daily Total
* **FR-6:** At the bottom of every sheet, the app shows the **Daily Total**, which is the sum of the Amount column for that day, split into GH₵ and GHp.
* **FR-7:** The Daily Total is calculated automatically and recalculates whenever any row changes.
* **FR-8:** The Daily Total is shown prominently (large, bold) and is also displayed at the end of each day in the All Days view.
* **FR-9:** The footer also shows the total number of items and total physical quantity in stock.

### 5.3 New Day = New Blank Page
* **FR-10:** Every day has its own separate sheet.
* **FR-11:** A **New Day** action creates the next day's sheet as a **blank page** (no rows, or empty quantities), so nothing from the previous day is accidentally edited.
* **FR-12:** If the user opens a date with no sheet, the app offers to create one.
* **FR-13:** Past sheets remain stored and can be reopened at any time using a date picker or previous / next arrows.

### 5.4 Carry Forward Button (Copy Balances to Next Day)
* **FR-14:** Each sheet has a **Carry Forward** button.
* **FR-15:** When pressed, the app creates (or opens) the next day's sheet and fills it as follows:
  * **Item Name:** Copied.
  * **Opening Stock:** Set to today's **Stock Balance** for each item.
  * **Purchase Price:** Copied (can be edited on the new day).
  * **Purchased and Sold / Used:** Reset to 0.
* **FR-16:** Carry Forward shows a short confirmation (*"Copy all balances to [next date]?"*) before it runs.
* **FR-17:** If the next day's sheet already has data, the app warns the user and asks whether to **overwrite** or **cancel**. It never overwrites silently.
* **FR-18:** Carry Forward never changes the source day. Past days stay exactly as they were.
* **FR-19:** Items with a balance of zero are still carried forward (so the item list is preserved) unless the user removes them.

### 5.5 All Days View (Continuous Slide Page)
* **FR-20:** A button labelled **View All Stock** opens a single continuous page that shows every day's stock sheet, with its date and Daily Total, one after another.
* **FR-21:** The user can **slide / scroll through the days** from **Day 1 onward**, with no fixed end. New days appear automatically as they are created.
* **FR-22:** Each day appears as a clear section: date heading, the full table, and the Daily Total at the bottom.
* **FR-23:** The view loads days progressively (for example, 30 days at a time) so it stays fast even after years of records.
* **FR-24:** A **Jump to Date** control lets the user go straight to any day.
* **FR-25:** The All Days view is read-only. To edit a day, the user taps the date to open that day's sheet.
* **FR-26:** A **Back to Today** button returns to the current day's sheet.

### 5.6 Item List Management
* **FR-27:** Items typed on any day become part of the store's item list, so they can be picked from a drop-down on later days.
* **FR-28:** Duplicate item names on the same sheet are blocked.
* **FR-29:** Deleting an item from today's sheet does not remove it from past sheets.

---

## 6. Screens

1. **Today's Sheet (Home):** Header with store name and date, the stock table, **Add Item** button, **Carry Forward** button, **View All Stock** button, Daily Total at the bottom.
2. **All Days View:** A continuous, scrollable / slidable page of every day, with Jump to Date and Back to Today.
3. **Date Picker / Day Navigator:** Previous and next day arrows plus a calendar.

### Suggested Layout of a Daily Sheet (Ghanaian Spot Ledger)

| No. | Item | Opening Stock | Receipt | Total | Stock Balance | Stock Sold | Price (GH₵) | Amount (GH₵) | Amount (GHp) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | Club Mini | 20 | 10 | 30 | 22 | 8 | 15.00 | 120 | 00 |
| 2 | Guinness | 50 | 0 | 50 | 38 | 12 | 25.00 | 300 | 00 |
| | | | | | | | **Daily Total** | **420** | **00** |

---

## 7. Data Model

### Store
* `name` (FD ABRANTE3 SPOT 2), `currency`

### Item
* `id`, `name`, `last purchase price`, `created date`

### Daily Sheet
* `id`, `date` (unique), `daily total`, `created at`, `updated at`

### Sheet Row
* `id`, `sheet id`, `item id`, `opening stock`, `receipt`, `total` (Opening + Receipt), `stock balance`, `stock sold`, `price`, `amount` (Stock Sold × Price)
* *Attendants can record closing count (`stock balance`) to auto-calculate `stock sold`, or vice versa. Amount is partitioned into GH₵ (Ghana Cedis) and GHp (Ghana Pesewas).*

---

## 8. Business Rules and Edge Cases

* $\text{Total} = \text{Opening Stock} + \text{Receipt}$.
* $\text{Stock Sold} = \text{Total} - \text{Stock Balance}$ (or $\text{Stock Balance} = \text{Total} - \text{Stock Sold}$).
* $\text{Amount} = \text{Stock Sold} \times \text{Price}$.
* $\text{Daily Total} = \sum \text{Amount rows on that sheet}$, split into Cedis ($\text{GH₵}$) and Pesewas ($\text{GHp}$).
* If **Stock Sold** is greater than **Total** (or **Stock Balance** is negative), the app highlights the row in red and flags the discrepancy.
* **Skipped days:** If the store is closed for a day, the user can carry forward to any chosen date, and the All Days view shows only dates that have sheets.
* **Editing an earlier day after later days exist:** The app automatically cascades updated closing stock forward into subsequent days' opening stock.
* Money values use two decimal places partitioned cleanly into $\text{GH₵}$ and $\text{GHp}$ columns matching official Ghanaian ledger stationery.

---

## 9. Non-Functional Requirements

* **Simplicity:** No more than two taps to reach today's sheet; large, readable text and buttons.
* **Speed:** Calculations are instant; the All Days view stays smooth with several years of data.
* **Reliability:** Automatic saving; no data loss on closing the app or losing connection.
* **Device support:** Works on a phone and on a computer (responsive web app recommended).
* **Offline use:** Nice to have, so the store can keep working without internet.
* **Backup:** Data can be exported to Excel or PDF, and a regular backup is kept.
* **Security:** Simple login (PIN or password) so only authorised people can edit stock.

---

## 10. Acceptance Criteria

1. Entering Opening Stock, Purchased, Sold / Used and Purchase Price automatically produces the correct Stock Balance and Total Value.
2. The Daily Total always equals the sum of that day's Total Value column.
3. Pressing Carry Forward creates the next day's sheet with Opening Stock equal to the previous day's Stock Balance for every item.
4. A new day always begins as its own separate page, and previous days are never changed by the new day.
5. View All Stock shows every day, with its date and Daily Total, on one continuous page that can be scrolled from Day 1 onward.
6. The app warns before overwriting an existing next-day sheet.
7. Closing and reopening the app shows all saved data unchanged.

---

## 11. Open Questions

1. **Sold / Used column:** Should the app track what leaves stock each day? This PRD assumes yes, because the balance otherwise cannot change. Confirm, or tell us how stock reduces.
2. **Selling price:** Should the app also record the selling price and show expected sales value or profit? Not included in V1.
3. **Currency:** Which currency should be shown on prices and totals?
4. **Platform:** Phone app, website on a computer, or both?
5. **Users:** Just one person, or several attendants with separate logins?
6. **Blank page:** Should "blank" mean an empty table with no items, or items listed with empty quantities? This PRD uses a blank page that Carry Forward fills in.

---

## 12. Future Enhancements

* Selling price, sales and profit tracking.
* Low-stock alerts.
* Weekly and monthly summary reports.
* Export to Excel and PDF.
