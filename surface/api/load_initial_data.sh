#!/bin/bash
set -euo pipefail
python manage.py migrate
python manage.py seed_production_baseline --fixtures /surface/fixtures --apply
