# Observation network inventory

Status: open questions. Needed before any hydromet or new-station ingest design
(ADR-0031, phase 5). Fill in as answers arrive; unknowns stay marked.

## Known

| Station | Type | Logger | Link | Receives into |
| --- | --- | --- | --- | --- |
| MBIA (WMO 78958) | Automatic | Sutron | RF, serial modem, edge collector | SURFACE (CSV) |
| MBIA (WMO 78958) | Manual hourly | Observer | eRegister | eRegister, wis2box |

## Planned or unconfirmed

- Carriacou Airport: needs its own WIGOS ID; day observer plus overnight
  automatic station (hybrid). Status of its AWS: unknown.
- Hydromet stations: exist, but how they report is unknown.

## Questions

1. Station list: name, WMO or WIGOS ID, coordinates, owner, status.
2. Per station: logger make and model, sensors, report interval.
3. Link: satellite (DADS today? NOAA LRGS planned?), cellular data, radio, or
   IP. Who holds the account or SIM, and what does it cost?
4. Does the current feed arrive as files, a web service, or a pushed message,
   and in what format?
5. Which stations must be published to WIS2 (GBON), and which are archive only?
6. Who is the observer or maintainer for each station, and what is the
   handover schedule for hybrid stations?
7. Where will the receiving cloud network run, and who can open firewall ports?
8. Free and open-source constraint: which receive options need a licence?
