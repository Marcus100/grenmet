from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse


def ready(request):
    try:
        executor = MigrationExecutor(connection)
        if executor.migration_plan(executor.loader.graph.leaf_nodes()):
            return JsonResponse({"status": "unavailable"}, status=503)
        with connection.cursor() as cursor:
            cursor.execute("SELECT id FROM wx_station LIMIT 0")
        return JsonResponse({"status": "ready"})
    except Exception:
        return JsonResponse({"status": "unavailable"}, status=503)
