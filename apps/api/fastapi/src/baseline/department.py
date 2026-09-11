"""Known GMS identities from the imported catalogue and existing deployments."""

GMS_DEPARTMENT_IDS = frozenset({"gms", "meteorological_department"})


def is_gms_department(department_id: str) -> bool:
    return department_id in GMS_DEPARTMENT_IDS
