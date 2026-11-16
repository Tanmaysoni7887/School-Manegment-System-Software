# SHIKSHA – Large Demo Dataset & Test Kit

Standalone testing suite for generating and validating large, synthetic school management databases for `MDConvent_App`.

## Current Dataset Details
- **Filename**: `demo_school_data_large.json`
- **Total Students**: 1,476 (randomly generated between 1,000 and 1,500)
- **Active Students**: 1,359
- **Inactive / Left School Students**: 117
- **Students with Photos**: 292
- **Students with Unique SR Numbers**: 1,090
- **Students without SR Numbers**: 386
- **Fee Payment Receipts**: 5,977
- **Transport Assigned Students**: 451
- **Transport Payment Receipts**: 262
- **File Size**: 10.41 MB (10,920,879 bytes)

## Generation Instructions
To generate a new randomized dataset (minimum 1,000 students):
```bash
node DEMO_TEST_KIT/generate_demo_data.js
```
Or specify an exact count:
```bash
node DEMO_TEST_KIT/generate_demo_data.js --count=1250 --output=demo_school_data_large.json
```

## Validation Instructions
To validate the generated dataset for schema adherence, relational integrity, and uniqueness:
```bash
node DEMO_TEST_KIT/test_demo_dataset.js
```

## Production Safety Notice
Never import demo data into the production database located in `%USERPROFILE%\Documents\MDConvent_SMS\school_data.json`. Always test within an isolated development or staging environment.
