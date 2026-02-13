#!/bin/bash
# Development helper script for FastAPI project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

function print_help() {
    echo "FastAPI Development Helper"
    echo ""
    echo "Usage: ./scripts/dev.sh [command]"
    echo ""
    echo "Commands:"
    echo "  start         Start all services with watch mode"
    echo "  stop          Stop all services"
    echo "  restart       Restart all services"
    echo "  logs          Show logs from all services"
    echo "  logs-api      Show API logs"
    echo "  logs-db       Show database logs"
    echo "  shell         Open shell in API container"
    echo "  db-shell      Open PostgreSQL shell"
    echo "  migrate       Run database migrations"
    echo "  migration     Create new migration (requires message)"
    echo "  test          Run tests"
    echo "  test-cov      Run tests with coverage"
    echo "  clean         Stop and remove all containers and volumes"
    echo "  rebuild       Rebuild containers from scratch"
    echo "  status        Show status of all services"
    echo ""
}

function start() {
    echo -e "${GREEN}Starting development environment with watch mode...${NC}"
    docker compose watch
}

function stop() {
    echo -e "${YELLOW}Stopping all services...${NC}"
    docker compose stop
}

function restart() {
    echo -e "${YELLOW}Restarting all services...${NC}"
    docker compose restart
}

function logs() {
    docker compose logs -f
}

function logs_api() {
    docker compose logs -f api
}

function logs_db() {
    docker compose logs -f db
}

function shell() {
    echo -e "${GREEN}Opening shell in API container...${NC}"
    docker compose exec api bash
}

function db_shell() {
    echo -e "${GREEN}Opening PostgreSQL shell...${NC}"
    docker compose exec db psql -U ${POSTGRES_USER:-app} -d ${POSTGRES_DB:-app}
}

function migrate() {
    echo -e "${GREEN}Running database migrations...${NC}"
    docker compose exec api uv run alembic upgrade head
}

function migration() {
    if [ -z "$2" ]; then
        echo -e "${RED}Error: Migration message required${NC}"
        echo "Usage: ./scripts/dev.sh migration \"your message here\""
        exit 1
    fi
    echo -e "${GREEN}Creating new migration: $2${NC}"
    docker compose exec api uv run alembic revision --autogenerate -m "$2"
}

function test() {
    echo -e "${GREEN}Running tests...${NC}"
    docker compose exec api uv run pytest tests/
}

function test_cov() {
    echo -e "${GREEN}Running tests with coverage...${NC}"
    docker compose exec api uv run pytest tests/ --cov=src --cov-report=html --cov-report=term
    echo -e "${GREEN}Coverage report generated in htmlcov/index.html${NC}"
}

function clean() {
    echo -e "${RED}Stopping and removing all containers and volumes...${NC}"
    read -p "Are you sure? This will delete all data. (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose down -v
        echo -e "${GREEN}Cleanup complete${NC}"
    fi
}

function rebuild() {
    echo -e "${YELLOW}Rebuilding containers...${NC}"
    docker compose down
    docker compose build --no-cache
    echo -e "${GREEN}Rebuild complete. Run './scripts/dev.sh start' to start services${NC}"
}

function status() {
    echo -e "${GREEN}Service Status:${NC}"
    docker compose ps
}

# Main command router
case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        restart
        ;;
    logs)
        logs
        ;;
    logs-api)
        logs_api
        ;;
    logs-db)
        logs_db
        ;;
    shell)
        shell
        ;;
    db-shell)
        db_shell
        ;;
    migrate)
        migrate
        ;;
    migration)
        migration "$@"
        ;;
    test)
        test
        ;;
    test-cov)
        test_cov
        ;;
    clean)
        clean
        ;;
    rebuild)
        rebuild
        ;;
    status)
        status
        ;;
    help|--help|-h|"")
        print_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        print_help
        exit 1
        ;;
esac
