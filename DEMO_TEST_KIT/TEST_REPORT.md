# Demo Dataset Generation & Validation Report

**Project**: MD Convent Public School – SMS (SHIKSHA)  
**Dataset File**: `demo_school_data.json`  
**Generator Engine**: `generate_demo_data.js`  
**Validation Suite**: `test_demo_dataset.js`  
**Date Validated**: 22 November 2026

---

## 1. Overview & Dataset Profile

A fresh, clean demo dataset was created specifically targeting **Previous-Session Arrears** scenarios and overall system ledger verification.

- **Total Students**: 250
- **Classes Configured**: 15 classes (Nursery to 12th) across Sections A & B
- **Total Receipts Recorded**: 1099
- **Transport Stops Configured**: 8
- **Database File Size**: 830.7 KB

---

## 2. All 10 Previous-Session Arrears Test Cases Verified

| Case # | Scenario | Student | Formatted Output in Reminders Table | Total Outstanding | Result |
|:---:|:---|:---|:---|:---:|:---:|
| **1** | No previous-session arrears | Aarav Sharma (MDC-1001) | `No Arrears` | ₹0 | **PASS** |
| **2** | Single unpaid School Fee month | Bhavya Gupta (MDC-1002) | `November 2025–26 — ₹350` | ₹350 | **PASS** |
| **3** | Consecutive unpaid months range | Chirag Verma (MDC-1003) | `July–November 2025–26 — ₹1,575` | ₹1,575 | **PASS** |
| **4** | Non-consecutive unpaid months | Diya Patel (MDC-1004) | `April 2025–26 — ₹400`<br>`August 2025–26 — ₹400` | ₹800 | **PASS** |
| **5** | Partially paid historical fee | Eshan Khan (MDC-1005) | `November 2025–26 — ₹250` | ₹250 | **PASS** |
| **6** | Previous-session Exam Fee pending | Farhan Ali (MDC-1006) | `Exam Fee: September 2025–26 — ₹200` | ₹200 | **PASS** |
| **7** | Both School Fee + Exam Fee pending | Gaurav Joshi (MDC-1007) | `April–June 2025–26 — ₹1,050`<br>`Exam Fee: September 2025–26 — ₹200` | ₹1,250 | **PASS** |
| **8** | Previous-session Transport Fee pending | Harshit Yadav (MDC-1008) | `Transport Fee: August–October 2025–26 — ₹900` | ₹900 | **PASS** |
| **9** | School Fee + Exam Fee + Transport Fee arrears | Ishita Mishra (MDC-1009) | `April–May 2025–26 — ₹700`<br>`Exam Fee: September 2025–26 — ₹200`<br>`Transport Fee: July 2025–26 — ₹300` | ₹1,200 | **PASS** |
| **10** | Fallback opening balance (no historical month) | Jayant Dubey (MDC-1010) | `2025–26 — ₹750` | ₹750 | **PASS** |

---

## 3. Formatting Invariants & Integrity Rules

- **Zero Bullets**: No bullet points (`•`) in the Previous Arrears column.
- **Zero Redundant Labels**: No repeated `Previous Session Arrears:` in rows.
- **Zero Redundant Prefixes**: No `Session:` before academic year.
- **No Double Counting**: Detailed fee records in `DB.fees` reconcile perfectly with opening balance `feeConfig.previousArrears`.
- **Honest Fallbacks**: Students with legacy opening balances display `2025–26 — ₹...` without fabricating missing months.
- **Production Database Safety**: Production database `Documents/MDConvent_SMS/school_data.json` remains 100% isolated and untouched.

---
