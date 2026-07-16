# Role

Act as a senior Product Manager, Business Analyst, UX Architect, Solution Architect, and Senior Software Engineer specializing in desktop business applications, property management systems, accounting software, and enterprise UX.

Your objective is to produce an implementation-ready **Software Requirements Specification (SRS)** and **Product Specification** for a modern offline desktop application.

The specification should be detailed enough that an AI coding assistant (GitHub Copilot, Claude Code, Cursor, Windsurf, Cline, Roo Code, etc.) can implement the entire application with minimal ambiguity.

The specification **must be written entirely in English**.

---

# Project Overview

Design a professional, enterprise-grade Offline Desktop Property & Lease Management System (PLMS) for single-user operation, emphasizing maintainability, extensibility, modular architecture, and exceptional user experience. The resulting specification should be comprehensive enough to serve as the single source of truth for implementation.

The application should focus on:

- simplicity
- speed
- usability
- long-term maintainability
- modular architecture
- future scalability

The target users are non-technical property owners.

---

# General Requirements

The application shall be:

- Fully offline.
- Desktop-based.
- Lightweight.
- Fast.
- Stable.
- Easy to learn.
- Easy to maintain.

All data shall be stored locally.

The architecture shall be modular to support future expansion.

---

# Localization

The application interface shall be:

- Arabic only
- RTL only
- Professionally localized
- Proper Arabic typography
- Responsive RTL layouts

Internally, however, the specification must be written entirely in English.

---

# Multi-Country Property Management

The application must support managing properties located in multiple countries simultaneously.

Example countries:

- Jordan
- Qatar
- Turkey
- UAE
- Saudi Arabia

Each property shall store:

- Country
- City
- Address
- Currency
- Time zone (optional)

Properties from different countries must coexist within the same database.

---

# Multi-Currency Management

Every property may use its own rental currency.

Examples:

- Turkish Lira (TRY)
- Jordanian Dinar (JOD)
- Qatari Riyal (QAR)
- USD
- EUR

The application shall include a Currency Manager.

Requirements:

- Maintain exchange rates.
- Support manual editing.
- Support one-click online exchange rate update using a public exchange-rate API whenever Internet access is available.
- Cache the last downloaded exchange rates for offline usage.
- Allow manual override.

Whenever the user enters a payment amount, the application shall instantly calculate its equivalent in selected currencies.

Example:

Input

12,500 TRY

Output

- USD
- JOD
- QAR

The conversion should occur with a single button click.

The specification should define:

- exchange-rate storage
- update workflow
- offline behavior
- API abstraction layer

---

# Property Management

Support:

- Buildings
- Villas
- Apartments
- Commercial stores
- Offices

Each property should include:

- unique ID
- name
- type
- country
- city
- address
- floor
- unit number
- area
- monthly rent
- current status
- notes
- optional images

---

# Tenant Management

Maintain:

- Full name
- Nationality
- Preferred communication language
- Phone numbers
- WhatsApp number
- Email
- National ID / Passport
- Notes

Allow document attachments.

---

# Contract Management

Support complete lease lifecycle management.

Each contract shall include:

- Start date
- End date
- Deposit
- Currency
- Payment frequency
- Payment method
- Grace period
- Renewal settings

---

# Dynamic Contract Renewals

This is a major feature.

The application shall support automatic contract renewals for multiple years.

Example

Original rent

1000 USD/month

Renewal rules

Year 2

+5%

Year 3

+8%

Year 4

+3%

The application should automatically calculate the new rent based on configurable increment rules.

Supported increment types:

- Percentage
- Fixed amount
- Manual adjustment

The system shall maintain a complete renewal history.

History should include:

- renewal date
- previous rent
- increment
- increment type
- new rent
- notes

Users must be able to review all historical rent changes.

---

# Income Management

Support:

- Rent collection
- Partial payments
- Advance payments
- Late payments
- Other income

Each payment shall include:

- amount
- currency
- exchange rate used
- equivalent values
- payment method
- receipt number
- notes

---

# Expense Management

Support:

- Maintenance
- Utilities
- Municipality
- Insurance
- Taxes
- Cleaning
- Repairs
- Administration
- Custom categories

Each expense shall record:

- currency
- exchange rate
- converted values

---

# WhatsApp Notifications

The application shall support sending WhatsApp notifications.

Requirements:

- Support multiple languages.
- Every tenant shall have a preferred communication language.
- Notifications should automatically use the tenant's preferred language.

Examples:

Arabic

English

Turkish

The application should include:

- default notification templates
- editable templates
- template categories

Examples:

Rent Due

Payment Received

Late Payment Reminder

Contract Renewal Reminder

Contract Expired

Custom Notification

Users shall be able to customize every notification template.

The specification should define:

- template placeholders
- variables
- localization strategy

---

# Dashboard

Design a modern dashboard showing:

- Monthly income
- Monthly expenses
- Net income
- Currency summaries
- Upcoming renewals
- Outstanding balances
- Vacant properties
- Occupied properties
- Recent payments
- Recent expenses

---

# Reports

Support reports for any date range.

Examples:

Daily

Weekly

Monthly

Quarterly

Yearly

Custom

Reports include:

- Income
- Expenses
- Net Profit
- Property Profitability
- Currency Summary
- Tenant Ledger
- Payment History
- Outstanding Balances
- Renewal History
- Contract Expiration
- Vacancy Report

---

# HTML Report Export

In addition to Excel export, the application shall export reports as standalone HTML files.

Requirements:

- No external dependencies
- Single HTML file
- Embedded CSS
- Embedded JavaScript
- Printable
- Responsive
- RTL support
- Professional styling
- Interactive tables
- Sorting
- Filtering
- Search
- Expandable sections
- Charts where appropriate

The exported HTML report should be fully functional when opened locally in any browser.

---

# Excel Export

Generate professionally formatted Excel reports.

Requirements:

- RTL worksheets
- Filters
- Totals
- Formulas
- Print layout
- Multiple worksheets when appropriate

---

# Search

Provide instant global search across:

- Properties
- Contracts
- Tenants
- Payments
- Expenses
- Reports

---

# Backup

Support:

- Manual backup
- Automatic backup
- Restore
- Backup verification

---

# Financial Ledger

The application shall maintain a complete financial ledger for every monetary transaction.

The ledger shall record:

- Rent payments
- Partial payments
- Advance payments
- Expenses
- Deposits
- Refunds
- Manual financial adjustments

The ledger should never rely solely on calculated balances. Instead, balances shall always be reconstructable from historical transactions.

Each ledger entry shall include:

- Transaction ID
- Date and time
- Property
- Tenant (if applicable)
- Contract
- Transaction type
- Amount
- Currency
- Exchange rate used
- Converted values
- Notes
- Related document or receipt

The specification should define the accounting workflow and relationships between payments, expenses, and ledger entries.

---

# Recurring Expenses

The application shall support recurring expenses.

Examples include:

- Monthly cleaning
- Monthly security services
- Annual insurance
- Municipal taxes
- Property management fees
- Utility subscriptions
- Internet subscriptions
- Building maintenance contracts

Each recurring expense shall include:

- Frequency
- Start date
- End date (optional)
- Amount
- Currency
- Associated property
- Category
- Reminder settings

The system should automatically generate scheduled expense records while allowing users to edit or skip individual occurrences.

---

# Property Documents

The application shall provide a centralized document management module.

Each property may have attached documents such as:

- Ownership deed
- Land title
- Municipality licenses
- Insurance policies
- Utility contracts
- Architectural drawings
- Maintenance manuals
- Warranty documents
- Photos
- Other supporting files

Each document shall include:

- Category
- Upload date
- Description
- Tags
- Related property
- Optional expiration date

The specification should define how documents are organized, searched, filtered, and linked to properties and contracts.

---

# Maintenance Management

The application shall include a maintenance management module.

Users should be able to record:

- Maintenance requests
- Preventive maintenance
- Corrective maintenance
- Emergency repairs

Each maintenance record shall include:

- Property
- Unit
- Request date
- Description
- Priority
- Status
- Assigned contractor
- Estimated cost
- Actual cost
- Completion date
- Photos
- Attached invoices
- Notes

The application should maintain a complete maintenance history for every property.

Dashboard widgets and reports should summarize maintenance costs and outstanding requests.

---

# Occupancy Timeline

Every property shall maintain a complete occupancy history.

The application should visually present:

- Occupied periods
- Vacant periods
- Tenant changes
- Contract renewals
- Rent changes

The timeline should help users quickly understand the historical usage of each property.

Historical occupancy information shall never be deleted and should remain available for reporting and auditing.

---

# Customizable Dashboard

The dashboard shall be fully customizable.

Users should be able to:

- Show or hide dashboard widgets
- Rearrange widgets using drag-and-drop
- Resize widgets
- Save multiple dashboard layouts
- Restore the default layout

The dashboard should support widgets such as:

- Monthly income
- Monthly expenses
- Net profit
- Cash flow
- Upcoming rent payments
- Upcoming contract renewals
- Occupancy rate
- Vacancy rate
- Currency summary
- Maintenance summary
- Recent activities
- Frequently accessed properties

---

# Settings

Include:

- Currency defaults
- Exchange-rate provider
- Backup settings
- Notification templates
- Report defaults
- Date formats

---

# UI/UX Requirements

The application shall follow the latest desktop UI/UX best practices.

Requirements include:

- Minimalist design
- Excellent readability
- Large touch-friendly controls
- Modern icons
- Keyboard shortcuts
- Context menus
- Consistent spacing
- Logical navigation
- Wizard-based workflows where beneficial
- Minimal clicks for common tasks
- Comprehensive empty states
- Helpful validation messages
- Undo support for reversible operations

---

# Performance

The application should comfortably handle:

- thousands of properties
- tens of thousands of contracts
- hundreds of thousands of transactions

without noticeable slowdown.

---

# Future Expansion

Architect the application so future versions can support:

- Cloud synchronization
- Mobile companion app
- Multi-user operation
- OCR for receipts
- AI-generated financial insights
- Accounting software integration
- Digital signatures
- QR-code receipts
- PDF generation
- Email notifications
- SMS notifications

---

# Deliverables

Produce a complete implementation-ready specification including:

1. Executive Summary
2. Scope
3. Assumptions
4. Functional Requirements
5. Non-functional Requirements
6. User Personas
7. User Stories
8. Business Rules
9. Complete Feature List
10. Information Architecture
11. Navigation Map
12. Screen-by-Screen Specifications
13. UI Wireframe Descriptions
14. Database ER Diagram
15. Database Schema
16. State Diagrams
17. Workflow Diagrams
18. Currency Conversion Architecture
19. Contract Renewal Engine Design
20. Notification Template Engine
21. Report Generation Architecture
22. HTML Report Architecture
23. Excel Export Architecture
24. Backup & Restore Design
25. Future Extension Points

For every screen include:

- Purpose
- Components
- User interactions
- Validation rules
- Business logic
- Navigation
- Empty states
- Error states
- Success messages

The final document should be comprehensive, implementation-ready, professionally organized, and written entirely in Markdown.