# Database Seeding Guide

This guide explains how to use the improved database seeding scripts.

## 📋 Overview

You now have two scripts for managing seed data:

1. **`seed_data.py`** - Create test users and items (with many options)
2. **`clear_seed_data.py`** - Remove all test data from database

## 🚀 Quick Start

### Basic Usage (Default)

```bash
python scripts/seed_data.py
```

**What it does:**
- Creates 5 test users (testuser0@barrels.gd through testuser4@barrels.gd)
- Creates 3 items for each user (15 items total)
- Password for all users: `testpass123`

**Result:**
- 5 users
- 15 items

---

## 📖 Step-by-Step Usage

### Step 1: First Time Setup

If this is your first time seeding, or you want a fresh start:

```bash
# Option A: Reset and seed in one command
python scripts/seed_data.py --reset

# Option B: Clear first, then seed
python scripts/clear_seed_data.py
python scripts/seed_data.py
```

**What happens:**
1. Removes all existing test users (testuser0-4@barrels.gd) and their items
2. Creates fresh test data

---

### Step 2: Customize the Amount of Data

#### Create More Users

```bash
# Create 10 users instead of 5
python scripts/seed_data.py --count 10
```

**Result:** 10 users with 3 items each = 30 items total

#### Create More Items Per User

```bash
# Create 5 items per user instead of 3
python scripts/seed_data.py --items-per-user 5
```

**Result:** 5 users with 5 items each = 25 items total

#### Combine Options

```bash
# Create 10 users with 5 items each
python scripts/seed_data.py --count 10 --items-per-user 5
```

**Result:** 10 users with 5 items each = 50 items total

---

### Step 3: Reset and Reseed

If you want to start fresh:

```bash
# Clear old data and create new data in one command
python scripts/seed_data.py --reset --count 10
```

**What happens:**
1. Deletes all existing test users and their items
2. Creates 10 new users with 3 items each

---

### Step 4: View Detailed Logs

To see more information about what's happening:

```bash
python scripts/seed_data.py --verbose
# or short form
python scripts/seed_data.py -v
```

**What you'll see:**
- Detailed debug information
- Which users already existed
- Which items were skipped

---

### Step 5: Clear Seed Data Only

If you just want to remove test data without creating new:

```bash
python scripts/clear_seed_data.py
```

**What it does:**
- Finds all users with email pattern `testuser*@barrels.gd`
- Deletes those users and all their items
- Shows summary of what was deleted

---

## 🎯 Common Use Cases

### Scenario 1: Fresh Development Environment

```bash
# Start completely fresh
python scripts/seed_data.py --reset
```

### Scenario 2: Add More Test Data

```bash
# Add 5 more users (won't duplicate existing ones)
python scripts/seed_data.py --count 10
```

**Note:** If users already exist, they won't be duplicated. Only new users will be created.

### Scenario 3: Testing with Lots of Data

```bash
# Create 20 users with 10 items each
python scripts/seed_data.py --count 20 --items-per-user 10 --reset
```

**Result:** 20 users, 200 items total

### Scenario 4: Quick Cleanup

```bash
# Just remove test data
python scripts/clear_seed_data.py
```

---

## 📊 Understanding the Output

### Normal Run Output

```
============================================================
Starting database seeding...
Configuration: 5 users, 3 items each
============================================================
Creating 5 test users...
Created user: testuser0@barrels.gd
Created user: testuser1@barrels.gd
...
Users: 5 created, 0 already existed
Creating 3 items per user...
============================================================
Database seeding completed!
Users: 5 total
Items: 15 created, 0 skipped (already existed)
============================================================
Test credentials: testuser0@barrels.gd / testpass123
```

### With Existing Data

```
============================================================
Starting database seeding...
Configuration: 5 users, 3 items each
============================================================
Creating 5 test users...
Users: 0 created, 5 already existed
Creating 3 items per user...
============================================================
Database seeding completed!
Users: 5 total
Items: 0 created, 15 skipped (already existed)
============================================================
```

**What this means:**
- Users already existed, so none were created
- Items already existed, so none were created
- Script is **idempotent** - safe to run multiple times!

---

## 🔧 Command-Line Options

### `seed_data.py` Options

| Option | Short | Description | Default |
|--------|-------|-------------|---------|
| `--count` | | Number of test users to create | 5 |
| `--items-per-user` | | Number of items per user | 3 |
| `--reset` | | Clear existing seed data first | False |
| `--verbose` | `-v` | Enable detailed logging | False |

### Examples

```bash
# Show help
python scripts/seed_data.py --help

# All options combined
python scripts/seed_data.py --count 10 --items-per-user 5 --reset --verbose
```

---

## 🛡️ Safety Features

### 1. **Idempotent**
- Safe to run multiple times
- Won't create duplicates
- Checks before creating

### 2. **Transaction Safety**
- All changes commit together
- If something fails, nothing is saved

### 3. **Smart Duplicate Detection**
- Checks if users exist before creating
- Checks if items exist before creating
- Only creates what's missing

### 4. **Clear Logging**
- Shows what was created
- Shows what was skipped
- Shows what was cleared (if using --reset)

---

## 🎓 How It Works

### The Seeding Process

1. **Check for existing data** (if `--reset` is used)
   - Finds all test users
   - Deletes their items
   - Deletes the users

2. **Create users**
   - For each user (0 to count-1):
     - Check if user exists
     - If not, create new user
     - If yes, use existing user

3. **Create items**
   - For each user:
     - Check how many items they have
     - Only create missing items
     - Skip if user already has enough

4. **Commit everything**
   - All changes saved to database
   - Summary displayed

---

## 🐛 Troubleshooting

### Error: "Database connection failed"

**Solution:** Make sure your database is running
```bash
# If using Docker
docker compose up -d db

# Check connection
python scripts/backend_pre_start.py
```

### Error: "User already exists"

**This is normal!** The script handles this automatically. If you want fresh data:
```bash
python scripts/seed_data.py --reset
```

### Want to see what's happening?

Use verbose mode:
```bash
python scripts/seed_data.py --verbose
```

---

## 📝 Summary

**Basic commands:**
- `python scripts/seed_data.py` - Create default test data
- `python scripts/seed_data.py --reset` - Fresh start
- `python scripts/clear_seed_data.py` - Remove test data

**Advanced usage:**
- `python scripts/seed_data.py --count 10` - More users
- `python scripts/seed_data.py --items-per-user 5` - More items
- `python scripts/seed_data.py --verbose` - Detailed logs

**Test credentials:**
- Email: `testuser0@barrels.gd`
- Password: `testpass123`

---

## 💡 Tips

1. **Run with `--reset`** when you want a completely fresh database
2. **Run without `--reset`** to add more data to existing seed data
3. **Use `--verbose`** to debug issues or see what's happening
4. **The script is safe** - it won't delete your admin user or other non-test data
5. **Idempotent** - you can run it multiple times without issues

