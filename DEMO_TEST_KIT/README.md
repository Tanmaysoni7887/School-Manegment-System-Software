# SHIKSHA — Previous-Session Arrears Demo Dataset & Test Kit

Standalone testing suite for generating and validating synthetic school management databases for `Shiksha_App`, enriched specifically for **Previous-Session Arrears** verification across the Fee Due Reminders and Student Fee Ledger modules.

## Current Dataset Details
- **Filename**: `demo_school_data.json`
- **Total Students**: 250 (10 targeted test cases + 240 realistic general cohort)
- **Active Classes**: 15 classes (Nursery to 12th) with Sections A & B
- **Fee Payment Receipts**: 1,099+ realistic transactions
- **Transport System**: 8 active bus stops with student assignments
- **Targeted Test Cases**: 10 comprehensive previous-arrears scenarios
- **File Size**: ~830 KB

## 10 Targeted Previous-Arrears Scenarios
1. **Case 1 (MDC-1001)**: No previous-session arrears -> displays `No Arrears` (₹0).
2. **Case 2 (MDC-1002)**: Single unpaid School Fee month -> displays `November 2025–26 — ₹350`.
3. **Case 3 (MDC-1003)**: Consecutive unpaid months range -> displays `July–November 2025–26 — ₹1,575`.
4. **Case 4 (MDC-1004)**: Non-consecutive unpaid months -> displays separate rows (`April 2025–26 — ₹400` and `August 2025–26 — ₹400`).
5. **Case 5 (MDC-1005)**: Partially paid historical fees -> displays remaining unpaid balance only (`November 2025–26 — ₹250`).
6. **Case 6 (MDC-1006)**: Previous-session Exam Fee pending -> displays `Exam Fee: September 2025–26 — ₹200`.
7. **Case 7 (MDC-1007)**: Both School Fee + Exam Fee pending -> displays stacked rows (`April–June 2025–26 — ₹1,050` and `Exam Fee: September 2025–26 — ₹200`).
8. **Case 8 (MDC-1008)**: Previous-session Transport Fee pending -> displays `Transport Fee: August–October 2025–26 — ₹900`.
9. **Case 9 (MDC-1009)**: School Fee + Exam Fee + Transport Fee arrears together -> displays all three categories clearly identified.
10. **Case 10 (MDC-1010)**: Fallback opening balance where historical month info is genuinely unavailable -> displays honest `2025–26 — ₹750` without fabricating months.

## Generation Instructions
To regenerate the dataset:
```bash
node DEMO_TEST_KIT/generate_demo_data.js
```

## Validation Instructions
To run full schema compliance, uniqueness, and previous-arrears test validation:
```bash
node DEMO_TEST_KIT/test_demo_dataset.js
```

## Production Safety Notice
Never import demo data into the production database located in `%USERPROFILE%\Documents\MDConvent_SMS\school_data.json`.
The generator and test kit operate in 100% isolation from the production database.
