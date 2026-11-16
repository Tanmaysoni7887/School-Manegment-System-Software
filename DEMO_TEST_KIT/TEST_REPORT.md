# Demo Dataset Generation & Validation Test Report

**Project**: MD Convent Public School – SMS  
**Generated On**: November 10, 2026  
**Generator Engine**: `DEMO_TEST_KIT/generate_demo_data.js` (v2.0)  
**Dataset Path**: `DEMO_TEST_KIT/demo_school_data_large.json`  

---

## 1. Executive Summary

A completely new synthetic large-scale demo dataset was generated with a randomly selected student count of **1,476 students** (strictly satisfying the requirement of a random count between 1,000 and 1,500). Full relational consistency, schema validity, and cryptographic uniqueness checks were verified using `DEMO_TEST_KIT/test_demo_dataset.js` with **100% success**.

---

## 2. Dataset Core Metrics

| Metric | Value |
|---|---|
| **Filename** | `demo_school_data_large.json` |
| **File Size** | 10.41 MB (10,920,879 bytes) |
| **Total Students** | 1,476 |
| **Active Students** | 1,359 (92.07%) |
| **Inactive / Left School Students** | 117 (7.93%) |
| **Students with Photo** | 292 (19.78%) |
| **Students with Unique SR No.** | 1,090 (73.85%) |
| **Students without SR No.** | 386 (26.15%) |
| **Total Fee Receipts** | 5,977 |
| **Transport Assigned Students** | 451 (30.56%) |
| **Transport Payment Receipts** | 262 |
| **Total Active Bus Stops** | 8 |

---

## 3. Class-wise & Section-wise Distribution

All 15 academic tiers (NC, LKG, UKG, 1 through 12) have balanced enrollments distributed across Sections A, B, and C:

| Class | Total Students | Section A | Section B | Section C |
|---|---|---|---|---|
| **Nursery (NC)** | 99 | 33 | 33 | 33 |
| **LKG** | 99 | 33 | 33 | 33 |
| **UKG** | 99 | 33 | 33 | 33 |
| **Class 1** | 99 | 33 | 33 | 33 |
| **Class 2** | 99 | 33 | 33 | 33 |
| **Class 3** | 99 | 33 | 33 | 33 |
| **Class 4** | 98 | 33 | 33 | 32 |
| **Class 5** | 98 | 33 | 33 | 32 |
| **Class 6** | 98 | 33 | 33 | 32 |
| **Class 7** | 98 | 33 | 33 | 32 |
| **Class 8** | 98 | 33 | 33 | 32 |
| **Class 9** | 98 | 33 | 33 | 32 |
| **Class 10** | 98 | 33 | 33 | 32 |
| **Class 11** | 98 | 33 | 33 | 32 |
| **Class 12** | 98 | 33 | 33 | 32 |
| **Total** | **1,476** | **495** | **495** | **486** |

---

## 4. Financial & Fee Distribution

- **Billing Months Simulated**: April through October 2026.
- **Tuition Fee Rates**: Class-appropriate scales (₹350 to ₹550/mo).
- **Payment Tiers**:
  - ~45% Fully Paid through current month.
  - ~30% Partially Paid or paid up to previous quarter.
  - ~25% Students with outstanding pending fees / arrears.
- **Previous Session Arrears**: Seeded for ~10% of students (₹400, ₹750, ₹1,200, ₹1,850).
- **Payment Modes**: Realistic split among `Cash`, `Online / UPI`, `Bank Transfer`, and `Cheque`.

---

## 5. Transport Distribution

- **Active Pickup Stops**: 8 realistic stops (Kasganj Bypass, Dholna Tiraha, Bilram Gate, Sahawar Bus Stand, Mohanpur Turn, Ganjdundwara Road, Amanpur Station Road, Soron Road Tiraha).
- **Enrolled Transport Users**: 451 students.
- **Generated Transport Payments**: 262 payment receipts with valid month allocations.

---

## 6. Automated Validation Results

Validation executed via: `node DEMO_TEST_KIT/test_demo_dataset.js`

- [x] Total student count >= 1,000 confirmed (1,476).
- [x] 100% Student IDs are unique (1,476/1,476).
- [x] 100% Admission Numbers are unique (`MDC-1001` through `MDC-2476`).
- [x] 100% Assigned SR Numbers are unique (1,090/1,090).
- [x] 100% Payment & Transport Receipt Numbers are unique (6,239 total receipts).
- [x] 0 orphan payments detected; all map to existing students.
- [x] 0 orphan transport records detected; all map to existing students and valid stops.
- [x] Schema structure completely matches `isValidDatabasePayload()` in `Shiksha_App/main.js`.
- [x] Zero validation errors discovered.

---

## 7. Data Safety Confirmation

- Production database at `Documents/MDConvent_SMS/school_data.json` remained completely isolated and untouched.
- All demo data was generated strictly into `DEMO_TEST_KIT/demo_school_data_large.json`.
