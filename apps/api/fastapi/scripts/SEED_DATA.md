# Database Seeding Guide

This guide explains how to use the database seeding scripts.

## Overview

You have two scripts for managing seed data:

1. **`seed_data.py`** - Create custom users from the CUSTOM_USERS list
2. **`clear_seed_data.py`** - Remove test users (testuser*@weather.gd)

## Quick Start

### Basic Usage

```bash
python scripts/seed_data.py
```

Creates all custom users defined in CUSTOM_USERS at the top of `seed_data.py`.

### Clear Seed Data

```bash
python scripts/clear_seed_data.py
```

Removes all users matching `testuser*@weather.gd`.

### Reset and Reseed

```bash
python scripts/seed_data.py --reset
```

Clears existing test users first, then creates custom users.

## Command-Line Options (seed_data.py)

| Option      | Description                                          | Default |
| ----------- | ---------------------------------------------------- | ------- |
| `--count`   | Number of custom users to create from CUSTOM_USERS   | All     |
| `--reset`   | Clear existing test users before creating            | False   |
| `--verbose` | `-v` Enable detailed logging                         | False   |

## Examples

```bash
# Create first 2 custom users only
python scripts/seed_data.py --count 2

# Fresh start: clear test users then create custom users
python scripts/seed_data.py --reset

# Verbose output
python scripts/seed_data.py --verbose
```

## Custom Users

Edit the `CUSTOM_USERS` list at the top of `scripts/seed_data.py` to define which users to create. Only users in that list are created; there are no automatic generic users.

## Troubleshooting

**Database connection failed:** Ensure the database is running (e.g. `docker compose up -d db`).

**User already exists:** The script skips existing users. Use `--reset` to clear test users first if you want a clean slate.
