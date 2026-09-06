#!/usr/bin/env python
# -*- coding: utf-8 -*-
#
# Capture raw Sutron logger responses from /dev/ttyS1 on the legacy PC.
#
# Runs on the legacy machine's own Python 2 + pyserial. No new dependencies.
# Compatible with Python 2.7 and Python 3.
#
# This script OPENS THE SERIAL PORT, so it can collide with the legacy poller.
# It refuses to run unless it is confident legacy is idle:
#
#   * legacy must not appear in the process table
#   * the current minute must sit inside a gap window
#   * the port must open cleanly
#
# Legacy's cron opens the port 23 times an hour at irregular minutes (see
# LEGACY_SERIAL_MINUTES below), not the 6 that reading its code suggests. Safe
# minutes are computed from that list rather than assumed.
#
# Usage:
#   ./capture-serial.py /media/usb/sutron-capture
#   ./capture-serial.py /media/usb/sutron-capture --count 5
#   ./capture-serial.py /media/usb/sutron-capture --port /dev/ttyS0
#   ./capture-serial.py /media/usb/sutron-capture --force   # legacy stopped
#
# It only reads from the logger ("show /tag /c"). It writes nothing to the
# station and nothing into the legacy tree.

from __future__ import print_function

import errno
import os
import subprocess
import sys
import time
from datetime import datetime

try:
    import serial
except ImportError:
    print("FATAL: pyserial is not installed for this interpreter.", file=sys.stderr)
    print("       Try the interpreter legacy uses: /usr/bin/python", file=sys.stderr)
    sys.exit(1)

PORT = "/dev/ttyS1"
BAUD = 9600
TIMEOUT = 5
MAX_BYTES = 5000
WAKE = b"\r\n"
COMMAND = b"show /tag /c\r\n"

# Minutes at which legacy's cron opens the serial port. Taken verbatim from
# `crontab -l` on ppcr-maurice (2026-08-15):
#
#   00,02,05,09,10,12,15,19,20,22,25,29,30,35,40,44,45,49,50,52,54,56,58
#
# Note this is 23 polls an hour, not the 6 a reading of the code alone
# suggests: most runs only refresh local files, and only :00 :10 :20 :30 :40
# :50 also write a .asc and a database row.
#
# The other two cron jobs (sendCIMH1.sh at :01..:51, sendunsent.py at :57)
# transfer over the network and never touch the serial port, so they are
# irrelevant here.
LEGACY_SERIAL_MINUTES = frozenset(
    {0, 2, 5, 9, 10, 12, 15, 19, 20, 22, 25, 29, 30, 35, 40, 44, 45, 49, 50,
     52, 54, 56, 58}
)


# The legacy poller's actual script name. Matching the bare directory name
# "Sutron_Linux" is too loose -- it also matches this script's own shell, an
# editor with the file open, or anything else merely mentioning the path.
LEGACY_PROCESS = "Sutron_Linux_V_5_3"


def legacy_is_running():
    """Return the matching ps line if the legacy poller is running.

    Returns None if the process table could not be read, and False if the
    poller is definitely absent.
    """
    try:
        output = subprocess.Popen(
            ["ps", "-ef"], stdout=subprocess.PIPE, stderr=subprocess.PIPE
        ).communicate()[0]
    except OSError:
        return None  # cannot tell

    if not isinstance(output, str):
        output = output.decode("ascii", "replace")

    # Ignore this process and its parent shell, whose command lines may well
    # mention the legacy paths without holding the port.
    own_pids = set()
    for pid in (os.getpid(), os.getppid()):
        own_pids.add(str(pid))

    for line in output.splitlines():
        if LEGACY_PROCESS not in line:
            continue
        if "grep" in line:
            continue

        fields = line.split()
        if len(fields) > 1 and fields[1] in own_pids:
            continue

        return line.strip()

    return False


def is_safe_minute(minute):
    """True if neither this minute nor the next belongs to legacy.

    The next minute is checked too so a capture started at :06:59 cannot run
    into a legacy poll beginning at :07.
    """
    return (
        minute % 60 not in LEGACY_SERIAL_MINUTES
        and (minute + 1) % 60 not in LEGACY_SERIAL_MINUTES
    )


def in_safe_window():
    """True if the current minute is clear of a legacy poll."""
    return is_safe_minute(datetime.now().minute)


def safe_minutes():
    """Every minute of the hour in which it is safe to open the port."""
    return [m for m in range(60) if is_safe_minute(m)]


def seconds_until_safe():
    now = datetime.now()
    for ahead in range(1, 61):
        if is_safe_minute((now.minute + ahead) % 60):
            return ahead * 60 - now.second
    return 0


def open_port(port=None):
    """Open /dev/ttyS1 with legacy's 8N1 settings, exclusively if possible.

    Linux does not lock a tty by default: two processes can both open it and
    interleave reads, corrupting data for both. pyserial >= 3.3 can request
    exclusive access, which turns a collision into a clean failure instead.
    Older pyserial (as on the legacy box) has no such parameter, so fall back.
    """
    settings = dict(
        port=port or PORT,
        baudrate=BAUD,
        bytesize=serial.EIGHTBITS,
        parity=serial.PARITY_NONE,
        stopbits=serial.STOPBITS_ONE,
        timeout=TIMEOUT,
        xonxoff=False,
        rtscts=False,
        dsrdtr=False,
    )

    # writeTimeout was renamed write_timeout in pyserial 3.x; the old name is
    # still accepted there, so it is the portable choice.
    settings["writeTimeout"] = TIMEOUT

    try:
        return serial.Serial(exclusive=True, **settings)
    except TypeError:
        # pyserial too old to support exclusive access.
        return serial.Serial(**settings)


def capture_once(destination, index, port=None):
    """Open the port, query the logger once, write the raw bytes out."""
    connection = open_port(port)

    try:
        connection.flushInput()
        connection.flushOutput()

        connection.write(WAKE)
        connection.flush()
        preamble = connection.read(MAX_BYTES)

        connection.write(COMMAND)
        connection.flush()
        response = connection.read(MAX_BYTES)
    finally:
        connection.close()

    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    name = "raw_%s_%02d" % (stamp, index)

    raw_path = os.path.join(destination, name + ".bin")
    handle = open(raw_path, "wb")
    try:
        handle.write(response)
    finally:
        handle.close()

    meta_path = os.path.join(destination, name + ".meta.txt")
    handle = open(meta_path, "w")
    try:
        handle.write("captured_at   : %s\n" % datetime.now().isoformat())
        handle.write("port          : %s\n" % (port or PORT))
        handle.write("baud          : %d\n" % BAUD)
        handle.write("timeout       : %ds\n" % TIMEOUT)
        handle.write("command       : %r\n" % COMMAND)
        handle.write("preamble_bytes: %d\n" % len(preamble))
        handle.write("response_bytes: %d\n" % len(response))
        handle.write("\n--- preamble (wake response) ---\n")
        handle.write(preamble.decode("ascii", "replace"))
        handle.write("\n--- response ---\n")
        handle.write(response.decode("ascii", "replace"))
    finally:
        handle.close()

    return response, raw_path


def main(argv):
    args = [a for a in argv[1:]]

    if not args:
        print("usage: %s <destination-directory> [--count N] [--port DEV] "
              "[--force]" % argv[0], file=sys.stderr)
        return 2

    destination = args[0]
    force = "--force" in args
    port = None
    if "--port" in args:
        try:
            port = args[args.index("--port") + 1]
        except IndexError:
            print("FATAL: --port needs a device path", file=sys.stderr)
            return 2

    count = 3
    if "--count" in args:
        try:
            count = int(args[args.index("--count") + 1])
        except (IndexError, ValueError):
            print("FATAL: --count needs a number", file=sys.stderr)
            return 2

    # ---- Safety checks -----------------------------------------------------
    running = legacy_is_running()
    if running is None:
        print("WARNING: could not read the process table; cannot confirm legacy "
              "is idle.")
    elif running is not False and not force:
        print("REFUSING: the legacy poller appears to be running.",
              file=sys.stderr)
        print("          matched: %s" % running, file=sys.stderr)
        print("          Wait for it to exit, or pass --force if you have",
              file=sys.stderr)
        print("          deliberately stopped it.", file=sys.stderr)
        return 1

    if not force and not in_safe_window():
        wait = seconds_until_safe()
        print("REFUSING: legacy uses the serial port at or near minute %02d."
              % datetime.now().minute, file=sys.stderr)
        print("          Safe minutes: %s."
              % ", ".join("%02d" % m for m in safe_minutes()), file=sys.stderr)
        print("          Next safe window in about %d seconds." % max(wait, 0),
              file=sys.stderr)
        return 1

    # Never write inside the legacy tree. Checked BEFORE creating anything, so
    # a rejected destination leaves no trace inside the legacy tree.
    legacy_root = os.environ.get("LEGACY_ROOT", "/home/data/Sutron_Linux")
    legacy_abs = os.path.abspath(legacy_root)
    dest_abs = os.path.abspath(destination)

    if dest_abs == legacy_abs or dest_abs.startswith(legacy_abs + os.sep):
        print("FATAL: destination '%s' is inside the legacy tree." % dest_abs,
              file=sys.stderr)
        print("       Refusing to write anything under %s." % legacy_abs,
              file=sys.stderr)
        return 1

    try:
        os.makedirs(dest_abs)
    except OSError as error:
        if error.errno != errno.EEXIST:
            print("FATAL: cannot create '%s': %s" % (dest_abs, error),
                  file=sys.stderr)
            return 1

    destination = dest_abs

    # ---- Capture -----------------------------------------------------------
    print("Capturing %d response(s) from %s" % (count, port or PORT))
    print("Destination: %s" % os.path.abspath(destination))
    print("")

    captured = 0
    for index in range(1, count + 1):
        if not force and not in_safe_window():
            print("Left the safe window; stopping after %d capture(s)." % captured)
            break

        try:
            response, path = capture_once(destination, index, port)
        except serial.SerialException as error:
            print("  capture %d FAILED: %s" % (index, error), file=sys.stderr)
            if "Permission denied" in str(error) or "Device or resource busy" in str(error):
                print("  The port is held by another process. Stopping.",
                      file=sys.stderr)
                break
            continue
        except (IOError, OSError) as error:
            print("  capture %d FAILED: %s" % (index, error), file=sys.stderr)
            continue

        lines = [line for line in response.splitlines() if line.strip()]
        print("  capture %d: %d bytes, %d non-empty lines -> %s"
              % (index, len(response), len(lines), os.path.basename(path)))
        captured += 1

        if index < count:
            time.sleep(2)

    print("")
    print("Captured %d response(s)." % captured)
    if captured == 0:
        print("Nothing captured. Check the serial path and that the station is "
              "responding.")
        return 1

    print("Nothing was written to the station or to the legacy tree.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
